# Specification — Fix checkpoint git-add failure when a delete-intent artifact was already `git rm`'d

## Intent

- Origin: improve-codebase
- Mode: bug
- Target baseline: `main` @ `61fa981` (branch `codepatrol/2026-07-27-checkpoint-delete-artifact-add-fix`), clean tree, `npm run verify` green
- Governing constraints: `skills/_shared/CHANGE.md` (checkpoint owns declaring every durable artifact by path/hash/intent; the orchestrator validates and creates checkpoint commits); byte-identical-behavior discipline for internal fixes established by this backlog's prior architecture Changes
- Substrate state: graph synced not required for this fix (touches `src/change/orchestrator.ts`, already indexed; no new symbol, only a body change inside one function)
- Improvement signals (from `.codepatrol/docs/improvement-reports/2026-07-27-plan-self-consistency-check.md`, most recent by mtime, only 2 recommendations present): "Top error code: CHANGE_CONFLICT (5)... `Session item is not claimed: T2.`" (a single-Change stage-session usage sequencing issue — a harness read a stale session status before claiming; not a recurring cross-Change pattern like the `OPERATION_FAILED` item this Change addresses, and not independently actionable without further evidence of recurrence); "Command `change.session` was invoked 27 times..." (workflow/tooling concern, unrelated file, independently tracked backlog item, not actionable here).
- Problem: `buildCheckpointEvent` (the function sealing every Plan/Review/Apply/Verify checkpoint) stages every declared artifact — including `intent: "delete"` ones — with a single `git add -- <all paths>` call. `git add` cannot re-stage a path that was already fully removed via `git rm` (both working tree and index) ahead of the checkpoint transition: it fails with `fatal: pathspec '<path>' did not match any files` (exit 128). Because `git add` is atomic across its whole pathspec list, this single bad path fails the *entire* checkpoint's staging step, blocking every other artifact in the same checkpoint too. This is not hypothetical: it happened in `2026-07-25-docs-consolidation` (closed), whose own Apply journal documents running `git rm` on two files ahead of declaring them `intent: "delete"`, producing 6 `OPERATION_FAILED` trace entries (the historical `top-error-code-operation-failed` backlog item's evidence) — independently reproduced in a scratch git repo with the exact same error text and exit code.
- Outcome: `buildCheckpointEvent` stages `intent: "delete"` artifacts via the existing, already-idempotent `GitAdapter.unstage()` (`git rm --cached --ignore-unmatch`) instead of folding them into the same `git add` call as create/modify artifacts. A checkpoint declaring a delete-intent artifact whose file was already removed via `git rm` before the transition now succeeds; behavior for the currently-working case (file removed via plain `rm`, still tracked at transition time) is unchanged.

## Scope

### In scope

- Modify `buildCheckpointEvent` in `src/change/orchestrator.ts`: split the staging step into `git.add(paths, ...)` for non-delete artifact paths + declared `changes`, and `git.unstage(deletePaths, ...)` for `intent: "delete"` artifact paths, replacing the single combined `git.add(committedPaths, ...)` call. `committedPaths` (used for the final `git commit -- <paths>` pathspec) is unchanged — only the staging step splits.
- Add two regression tests to `src/change/git.test.ts` (the file already testing checkpoint/delete-intent interactions, see Current evidence): (a) a checkpoint declaring an optional `intent: "delete"` artifact whose file was removed via plain `rm` ahead of the transition, asserting it succeeds (characterizing the already-working case, unaffected by the fix); (b) the same shape but removed via `git rm` ahead of the transition, asserting it succeeds and that the resulting commit correctly reflects the file's absence (this is the previously-failing case).

### Out of scope

- Any change to `git.add()`, `git.commit()`, or `git.unstage()` themselves in `src/change/git.ts` — all three are already correct for their respective jobs; only their *call pattern* in `buildCheckpointEvent` needs to change.
- The other three `git.add()` call sites in `orchestrator.ts` (`commitMetadata` line 98, Close's receipt commit line 416, Close's terminal commit line 443) — none of them is ever passed a caller-declared `intent: "delete"` artifact path (confirmed in evidence); no defect exists there.
- Changing whether `intent: "delete"` artifacts require the caller to have already removed the file, or requiring a specific removal method (`rm` vs `git rm`) — out of scope; the fix makes the checkpoint robust to *either* method transparently, without imposing a new constraint on callers.
- The `CHANGE_CONFLICT (5): Session item is not claimed: T2.` and `command "change.session" invocation count` Recommendations surfaced by the most recent improvement report — the first is a single-Change stale-session-read incident with no cross-Change recurrence pattern yet (insufficient evidence for its own Change); the second is an unrelated file, independently tracked backlog item.
- Any new validation rejecting delete-intent artifacts whose file still exists at checkpoint time, or any other correctness rule beyond the staging mechanism itself — not evidenced by the historical incident, would be speculative scope creep.

## Current evidence

See `plan/evidence/investigation.md` for the full trace: the historical
incident's exact sample message and step sequence (from
`2026-07-25-docs-consolidation`'s own closed `apply/journal.md`), a direct,
independent reproduction of both the single-path failure and the
whole-batch atomicity hazard in a scratch git repo, confirmation that
`git commit` (unlike `git add`) has no equivalent hazard, confirmation that
no other `git.add()` call site is exposed to this class of path, and
confirmation that the fix primitive (`GitAdapter.unstage()`) already exists,
is already exported, and is already exercised by other tests — it simply
isn't yet reused for this call site.

Key facts restated:

- `src/change/orchestrator.ts`'s `buildCheckpointEvent`
  (`committedPaths`/`git.add(committedPaths, ...)`) is the sole affected
  call site.
- `git add -- <paths>` fails its *entire* invocation (not just the bad
  path) if any one pathspec matches nothing — reproduced directly.
- `GitAdapter.unstage()` (`git.ts:76`, `git rm --cached --ignore-unmatch`)
  already exists, is a no-op success on an already-removed path, and is
  correct for both removal methods (plain `rm` or prior `git rm`).
- No existing test exercises a valid delete-intent artifact removed via
  `git rm` before the checkpoint transition.

## Proposed design

In `buildCheckpointEvent`, replace:

```typescript
const committedPaths = [...new Set([...paths, ...intent.artifacts.map((item) => item.path)])];
await git.add(committedPaths, options.signal);
```

with:

```typescript
const deletePaths = intent.artifacts.filter((item) => item.intent === "delete").map((item) => item.path);
const committedPaths = [...new Set([...paths, ...intent.artifacts.map((item) => item.path)])];
await git.add(paths, options.signal);
if (deletePaths.length) await git.unstage(deletePaths, options.signal);
```

`committedPaths` itself is unchanged (still used unmodified for the
subsequent `git commit -- <committedPaths>` call and for the final delta
reconciliation checks later in the same function, both of which are
unaffected by this fix per Current evidence). `paths` (already computed one
line above as the non-delete artifact paths plus `intent.changes`) is
reused as-is for the `git add` call, now excluding delete-intent paths;
`deletePaths` is the new, small addition, staged via the already-idempotent
`unstage()`.

## Alternatives

- **Catch and swallow the specific `OPERATION_FAILED`/"did not match any
  files" error from `git.add()` around the existing combined call,
  retrying without the offending path(s)**: rejected — more complex than
  the direct fix (requires parsing git's stderr to identify which
  path(s) failed, itself a fragile string-matching exercise), and the
  atomicity hazard means even non-offending paths get caught in the
  retry logic; splitting the call cleanly avoids the problem instead of
  working around its symptom.
- **Always use `git.unstage()` for every artifact, delete or not**:
  rejected — `unstage()` (`git rm --cached`) only removes a path from the
  index; it cannot stage a *new or modified* file's actual content the way
  `git add` does. The two operations are not interchangeable; each is
  correct only for its own intent.
- **Require callers to never use `git rm` themselves, only plain `rm`, and
  document this instead of changing code**: rejected — this Change's own
  scope (see Out of scope) explicitly avoids imposing a new constraint on
  callers; the whole point of the fix is that the checkpoint mechanism
  should be robust to either removal method a harness might reasonably use,
  not to police which shell command an Apply/Verify/Close step happens to
  run.

## Simplicity decision

- Selected rung: direct local change (one function body edit, reusing an
  existing, already-correct primitive)
- Earlier rungs: not applicable — `unstage()` already exists and is exactly
  the right tool; no new dependency, helper, or abstraction is needed.
- Irreducible complexity: staging an addition/modification and staging a
  removal are genuinely different git operations (`add` vs `rm --cached`);
  splitting the call by intent reflects that real distinction, not
  speculative generality.
- Safety floor: `committedPaths`, the final commit's pathspec, and every
  downstream delta-reconciliation check in `buildCheckpointEvent` remain
  byte-identical to today; only the staging mechanism for delete-intent
  paths changes. Proven by the existing test suite continuing to pass
  unchanged (215/215 today) plus two new regression tests: one
  characterizing the already-working plain-`rm` case (proven green before
  and after the fix), one proving the previously-failing `git rm` case now
  succeeds (proven red before, green after).
- Expected surface delta: `src/change/orchestrator.ts` (~3 lines changed:
  one new `const deletePaths`, the `git.add` call narrowed to `paths`, one
  new conditional `git.unstage` call); `src/change/git.test.ts` (+2 tests,
  ~30-40 lines). No new files, no new dependency, no public interface
  change (`GitAdapter.unstage` already exists and is already exported).

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | Only `buildCheckpointEvent`'s staging step is fixed; the other three `git.add()` call sites are left as-is since none is evidenced to accept a caller-declared delete-intent path | If a future code change routes a delete-intent-style path through `commitMetadata`, Close's receipt commit, or Close's terminal commit, the same class of failure could recur there | A future improvement-report shows an `OPERATION_FAILED` "pathspec did not match" sample whose stage/command is not a Plan/Review/Apply/Verify checkpoint | Apply the same `add`/`unstage` split at the newly-implicated call site, informed by that occurrence's actual evidence |

## Compatibility and rollout

- No migration, no config/schema/event/checkpoint-shape change — `intent:
  "delete"` artifacts are declared and validated exactly as before; only
  how they get staged internally changes.
- No behavior change for the currently-working case (delete-intent file
  removed via plain `rm`, still tracked): `git rm --cached --ignore-unmatch`
  produces the identical index state as `git add` did for that case.
- Rollback: revert the single commit; the prior combined `git.add(
  committedPaths, ...)` call is restored byte-for-byte.
- Observability: not applicable — internal git-staging mechanism only, no
  runtime-visible behavior change for the success path; the fix path
  (previously-failing case) becomes newly observable as "succeeds" rather
  than "throws OPERATION_FAILED".

## Risks and mitigations

- Risk: `git.unstage()`'s `--cached` flag could theoretically leave a
  still-on-disk file untracked-but-present if a delete-intent artifact's
  file was never actually removed from the working tree before checkpoint
  (a caller misuse, not this fix's concern). Mitigation: this is identical
  to today's behavior for that same misuse case under `git add` (an
  existing-but-un-deleted file passed as `intent: "delete"` is a caller
  error either way, not newly introduced or newly hidden by this fix); not
  a regression.
- Risk: splitting one `git add` call into two separate git invocations
  (`add` + `unstage`) increases checkpoint latency slightly (one more
  subprocess spawn) when delete-intent artifacts are present. Mitigation:
  negligible — delete-intent artifacts are rare (evidenced: only 2 Changes
  across 20+ closed ones ever used them), and the added subprocess only
  runs when `deletePaths.length > 0`.

## Acceptance criteria

- AC-1: `buildCheckpointEvent` in `src/change/orchestrator.ts` stages non-delete artifact paths (plus declared `changes`) via `git.add(paths, ...)` and, only when at least one `intent: "delete"` artifact is declared, stages those paths separately via `git.unstage(deletePaths, ...)`.
- AC-2: A checkpoint transition declaring an `intent: "delete"` artifact whose file was already removed via `git rm` (index and working tree both already reflect the deletion) before the transition succeeds, where it previously threw `OPERATION_FAILED`.
- AC-3: A checkpoint transition declaring an `intent: "delete"` artifact whose file was removed via plain `rm` (still tracked in the index, missing from the working tree) continues to succeed exactly as before — no behavior change for the currently-working case.
- AC-4: `committedPaths`'s value, the final `git commit -- <committedPaths>` call, and every downstream delta-reconciliation check in `buildCheckpointEvent` are unchanged (confirmed by `git diff` showing no line touched in that logic beyond the staging step itself).
- AC-5: `npm run verify` (typecheck + full test suite including the two new regression test cases + build + smoke-cli + lint-skills) passes, with the total test count two higher than baseline (one test for each removal mode: plain `rm` and `git rm`) and zero failures.

## Decisions and open questions

- Decision: reuse the existing `GitAdapter.unstage()` rather than adding
  new git-adapter surface — it is already exactly the right primitive.
- Decision: fix scoped to `buildCheckpointEvent` only (the sole evidenced
  call site); the other three `git.add()` sites are explicitly out of
  scope, tracked as DC-1.
- No open questions remain that could change scope, interfaces, or
  acceptance.
