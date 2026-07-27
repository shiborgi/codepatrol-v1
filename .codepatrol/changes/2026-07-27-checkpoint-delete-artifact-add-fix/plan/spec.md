# Specification — Fix checkpoint git-add failure when a `changes[]`/delete-intent path was already removed

## Intent

- Origin: improve-codebase
- Mode: bug
- Target baseline: `main` @ `61fa981` (branch `codepatrol/2026-07-27-checkpoint-delete-artifact-add-fix`), clean tree, `npm run verify` green
- Governing constraints: `skills/_shared/CHANGE.md` (checkpoint owns declaring every durable artifact by path/hash/intent; Apply additionally declares every production `changes` path); byte-identical-behavior discipline for internal fixes established by this backlog's prior architecture Changes
- Substrate state: graph synced not required for this fix (touches `src/change/orchestrator.ts`, already indexed; no new symbol, only a body change inside one function)
- Improvement signals (from `.codepatrol/docs/improvement-reports/2026-07-27-plan-self-consistency-check.md`, most recent by mtime, only 2 recommendations present): "Top error code: CHANGE_CONFLICT (5)... `Session item is not claimed: T2.`" (a single-Change stale-session-read incident, no cross-Change recurrence pattern yet, not independently actionable here); "Command `change.session` was invoked 27 times..." (workflow/tooling concern, unrelated file, independently tracked backlog item).
- Problem: `buildCheckpointEvent` (the function sealing every Plan/Review/Apply/Verify checkpoint) stages every declared path — every non-delete `artifacts[]` binding, every `intent:"delete"` `artifacts[]` binding, and every entry of Apply's `changes[]` (the flat, un-typed list of every production path touched, including deletions) — with a single `git add -- <all paths>` call. `git add` cannot re-stage a path already fully removed via `git rm` (both working tree and index): it fails with `fatal: pathspec '<path>' did not match any files` (exit 128), and because `git add` is atomic across its whole pathspec list, this single bad path fails the *entire* staging step, blocking every other path in the same checkpoint too. This is not hypothetical: it happened in `2026-07-25-docs-consolidation` (closed) — its own Apply checkpoint declared two deleted doc files in `changes[]` (confirmed directly from `change.yaml`, not `artifacts[]`) after removing them via `git rm` (per its own Apply journal), producing 6 `OPERATION_FAILED` trace entries (the historical `top-error-code-operation-failed` backlog item's evidence) — independently reproduced in a scratch git repo with the exact same error text and exit code.
- Outcome: `buildCheckpointEvent` routes each path to stage by whether it currently exists in the workspace, not by its declared `intent` (which `changes[]` entries don't even have): paths that exist go through `git.add()`; paths that don't exist go through the existing, idempotent `GitAdapter.unstage()` (`git rm --cached --ignore-unmatch`). A checkpoint declaring a `changes[]` path (or a delete-intent artifact) that was already removed via `git rm` before the transition now succeeds; behavior for the currently-working case (file removed via plain `rm`, still tracked at transition time) is unchanged.

## Scope

### In scope

- Modify `buildCheckpointEvent` in `src/change/orchestrator.ts`: replace the single `git.add(committedPaths, ...)` call with an existence-based partition of `committedPaths` into `toAdd` (paths that exist on disk, via `existsSync(resolveInside(workspace, path))`) and `toUnstage` (paths that don't) — `git.add(toAdd, ...)` and, when non-empty, `git.unstage(toUnstage, ...)`. `committedPaths` itself (used for the final `git commit -- <paths>` pathspec) is unchanged — only the staging step's routing logic changes.
- Add two regression tests to `src/change/git.test.ts` targeting the actually-evidenced defect surface, Apply's `changes[]` field: (a) an Apply checkpoint declaring a pre-existing (pre-committed-to-branch) file in `changes[]` that was removed via plain `rm` ahead of the transition, asserting it succeeds (characterizing the already-working case); (b) the same shape but removed via `git rm` ahead of the transition, asserting it succeeds where it previously threw `OPERATION_FAILED`, and that the resulting commit correctly reflects the file's absence.

### Out of scope

- Any change to `git.add()`, `git.commit()`, or `git.unstage()` themselves in `src/change/git.ts` — all three are already correct for their respective jobs; only their *call pattern* in `buildCheckpointEvent` needs to change.
- The other three `git.add()` call sites in `orchestrator.ts` (`commitMetadata` line 98, Close's receipt commit line 416, Close's terminal commit line 443) — none of them is ever passed a caller-declared delete-style path (confirmed in evidence); no defect exists there. Tracked as DC-1 if this ever changes.
- A dedicated regression test for `artifacts[intent="delete"]` routing through the corrected staging code: not evidenced as broken by any historical incident (it could never have been the mechanism behind the actual `2026-07-25-docs-consolidation` incident, since that Change's deleted paths lived outside the Apply stage's own artifact-prefix and therefore could only have been declared via `changes[]`); the corrected fix's existence-based routing handles both `artifacts[]` and `changes[]` paths via the identical mechanism already proven for `changes[]`; constructing a *valid* optional (non-required) delete-intent artifact fixture requires a multi-attempt accepted-baseline lifecycle disproportionate to the actual evidence. Tracked as DC-2.
- Changing whether a caller must have already removed a `changes[]`/delete-intent path, or requiring a specific removal method (`rm` vs `git rm`) — out of scope; the fix makes staging robust to *either* method transparently, without imposing a new constraint on callers.
- The `CHANGE_CONFLICT (5): Session item is not claimed: T2.` and `command "change.session" invocation count` Recommendations surfaced by the most recent improvement report — unrelated/insufficiently evidenced for their own Change, see Intent.
- Any new validation rejecting a `changes[]`/delete-intent path whose file still exists at checkpoint time, or any other correctness rule beyond the staging mechanism itself — not evidenced, would be speculative scope creep.

## Current evidence

See `plan/evidence/investigation.md` for the full trace: the historical
incident's exact declared checkpoint payload (`changes[]`, confirmed
directly from `change.yaml`, not `artifacts[]`), the exact sample message
and step sequence from `2026-07-25-docs-consolidation`'s own closed
`apply/journal.md`, a direct independent reproduction of both the
single-path failure and the whole-batch atomicity hazard, a direct
reproduction of the corrected existence-based routing correctly staging a
mixed create/modify/delete batch in one pass, confirmation that `git
commit` (unlike `git add`) has no equivalent hazard, confirmation that no
other `git.add()` call site is exposed to this class of path, and
confirmation that the fix primitive (`GitAdapter.unstage()`) already
exists, is already exported, and is already exercised by other tests.

Key facts restated:

- The historical incident's deleted paths
  (`docs/codepatrol/assessments/*.md`) were declared via Apply's
  `changes[]` field, not `artifacts[]` — confirmed directly from that
  Change's own `change.yaml` checkpoint event. `changes[]` entries carry no
  `intent` field at all (they represent the complete flat production delta,
  create/modify/delete all mixed).
- `src/change/validation.ts:24`'s `validateWithReader` requires every
  `artifacts[]` binding's path to start with the checkpointing stage's own
  directory prefix — a path like `docs/codepatrol/assessments/...` could
  never have been validly declared as an `artifacts[]` binding for an
  Apply checkpoint in the first place.
- `git add -- <paths>` fails its *entire* invocation (not just the bad
  path) if any one pathspec matches nothing — reproduced directly.
- `GitAdapter.unstage()` (`git.ts:76`, `git rm --cached --ignore-unmatch`)
  already exists, is a no-op success on an already-removed path, and is
  correct for both removal methods (plain `rm` or prior `git rm`) —
  reproduced directly staging a mixed create/modify/delete batch
  correctly in one pass.
- No existing test exercises a checkpoint declaring, in `changes[]`, a
  path already removed via `git rm` before the transition.

## Proposed design

In `buildCheckpointEvent`, replace:

```typescript
const committedPaths = [...new Set([...paths, ...intent.artifacts.map((item) => item.path)])];
await git.add(committedPaths, options.signal);
```

with:

```typescript
const committedPaths = [...new Set([...paths, ...intent.artifacts.map((item) => item.path)])];
const toAdd = committedPaths.filter((path) => existsSync(resolveInside(workspace, path)));
const toUnstage = committedPaths.filter((path) => !existsSync(resolveInside(workspace, path)));
if (toAdd.length) await git.add(toAdd, options.signal);
if (toUnstage.length) await git.unstage(toUnstage, options.signal);
```

`committedPaths` itself is unchanged (still used unmodified for the
subsequent `git commit -- <committedPaths>` call and for the final delta
reconciliation checks later in the same function, both of which are
unaffected by this fix per Current evidence). Routing keys off
`existsSync`, not `item.intent`: this uniformly and correctly handles
`artifacts[]` bindings (`create`/`modify` always exist per
`validateWithReader`'s own requirement; `delete` never does) *and*
`changes[]` entries (no intent field, but a deleted path is, by
definition, absent from the workspace by checkpoint time regardless of
which command removed it). `existsSync` and `resolveInside` are already
imported in `src/change/orchestrator.ts` — no new imports needed.

## Alternatives

- **Split staging by `item.intent` on `artifacts[]` only, leaving
  `changes[]` entries folded into the "add" side unconditionally** (this
  Change's own attempt-2 design, returned by Review): rejected —
  independently re-derived that this does not fix the actual historical
  incident at all, since the incident's deleted paths were declared via
  `changes[]`, which has no `intent` field for an intent-based split to key
  off. Superseded by the existence-based design, which covers both fields
  uniformly.
- **Catch and swallow the specific `OPERATION_FAILED`/"did not match any
  files" error from `git.add()` around the existing combined call,
  retrying without the offending path(s)**: rejected — requires parsing
  git's stderr to identify which path(s) failed (fragile string-matching),
  and the atomicity hazard means even non-offending paths get caught in
  the retry logic; the existence-based partition avoids the problem
  entirely instead of working around its symptom.
- **Always use `git.unstage()` for every path, staged or not**: rejected —
  `unstage()` (`git rm --cached`) only removes a path from the index; it
  cannot stage a *new or modified* file's actual content the way `git add`
  does. The two operations are not interchangeable.
- **Require callers to never use `git rm` themselves, only plain `rm`, and
  document this instead of changing code**: rejected — the whole point of
  the fix is that checkpoint staging should be robust to either removal
  method a harness might reasonably use, not to police which shell command
  an Apply/Verify/Close step happens to run.

## Simplicity decision

- Selected rung: direct local change (one function body edit, reusing an
  existing, already-correct primitive)
- Earlier rungs: not applicable — `unstage()` already exists and is exactly
  the right tool; no new dependency, helper, or abstraction is needed.
- Irreducible complexity: staging an addition/modification and staging a
  removal are genuinely different git operations (`add` vs `rm --cached`);
  partitioning by on-disk existence reflects the real, uniform signal that
  distinguishes them for *every* path type this function handles
  (`artifacts[]` and `changes[]` alike), not speculative generality.
- Safety floor: `committedPaths`, the final commit's pathspec, and every
  downstream delta-reconciliation check in `buildCheckpointEvent` remain
  byte-identical to today; only the staging mechanism changes. Proven by
  the existing test suite continuing to pass unchanged (215/215 today)
  plus two new regression tests targeting `changes[]` (the evidenced
  defect surface): one characterizing the already-working plain-`rm` case
  (green before and after the fix), one proving the previously-failing
  `git rm` case now succeeds (red before, green after).
- Expected surface delta: `src/change/orchestrator.ts` (~4 lines changed:
  the single `git.add(committedPaths, ...)` line replaced by a
  `toAdd`/`toUnstage` partition plus two conditional calls);
  `src/change/git.test.ts` (+2 tests, ~30-40 lines). No new files, no new
  dependency, no public interface change (`GitAdapter.unstage` already
  exists and is already exported).

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | Only `buildCheckpointEvent`'s staging step is fixed; the other three `git.add()` call sites are left as-is since none is evidenced to accept a caller-declared delete-style path | If a future code change routes a delete-style path through `commitMetadata`, Close's receipt commit, or Close's terminal commit, the same class of failure could recur there | A future improvement-report shows an `OPERATION_FAILED` "pathspec did not match" sample whose stage/command is not a Plan/Review/Apply/Verify checkpoint | Apply the same existence-based partition at the newly-implicated call site, informed by that occurrence's actual evidence |
| DC-2 | No dedicated regression test for `artifacts[intent="delete"]` routing through the corrected staging code (only `changes[]` is directly tested) | If a future refactor changes how `existsSync`-based routing interacts with `artifacts[]` bindings specifically, no test would catch a regression there | A future improvement-report or code review finds an `artifacts[intent="delete"]` checkpoint failing despite this fix | Add the multi-attempt accepted-baseline fixture this Change's own evidence describes as disproportionate today, once a real occurrence justifies the setup cost |

## Compatibility and rollout

- No migration, no config/schema/event/checkpoint-shape change — declared
  artifacts and `changes[]` are validated exactly as before; only how
  paths get staged internally changes.
- No behavior change for the currently-working case (a path removed via
  plain `rm`, still tracked at transition time): `existsSync` returns
  `false` for it exactly as before, and `git rm --cached --ignore-unmatch`
  produces the identical index state as `git add` did for that case.
- Rollback: revert the single commit; the prior combined `git.add(
  committedPaths, ...)` call is restored byte-for-byte.
- Observability: not applicable — internal git-staging mechanism only, no
  runtime-visible behavior change for the success path; the fix path
  (previously-failing case) becomes newly observable as "succeeds" rather
  than "throws OPERATION_FAILED".

## Risks and mitigations

- Risk: `existsSync` is called once per path at staging time; a
  time-of-check/time-of-use race (the path's existence changes between the
  check and the `git add`/`git rm --cached` call) is theoretically
  possible in a concurrent environment. Mitigation: `buildCheckpointEvent`
  already runs inside `withWorkspaceLock` (the same lock every other
  Change mutation uses), so no concurrent process can alter the working
  tree between the check and the git call within one checkpoint.
- Risk: `git.unstage()`'s `--cached` flag could theoretically leave a
  still-on-disk file untracked-but-present if a path's existence check ran
  before an unrelated concurrent process created it. Mitigation: same lock
  argument as above; not a new risk relative to today's single `git add`
  call, which has an identical implicit assumption that the working tree
  is stable during staging.
- Risk: partitioning into two separate git invocations (`add` +
  `unstage`) increases checkpoint latency slightly when both existing and
  non-existing paths are present. Mitigation: negligible — one additional
  subprocess spawn only when `toUnstage` is non-empty, which is rare
  (evidenced: only 2 Changes across 20+ closed ones ever declared a
  deletion in `changes[]` or `artifacts[]`).

## Acceptance criteria

- AC-1: `buildCheckpointEvent` in `src/change/orchestrator.ts` partitions `committedPaths` by `existsSync(resolveInside(workspace, path))` into `toAdd`/`toUnstage`, staging `toAdd` via `git.add(...)` and, only when non-empty, `toUnstage` via `git.unstage(...)`.
- AC-2: An Apply checkpoint declaring, in `changes[]`, a path that was already removed via `git rm` (index and working tree both already reflect the deletion) before the transition succeeds, where it previously threw `OPERATION_FAILED`.
- AC-3: An Apply checkpoint declaring, in `changes[]`, a path removed via plain `rm` (still tracked in the index, missing from the working tree) continues to succeed exactly as before — no behavior change for the currently-working case.
- AC-4: `committedPaths`'s value, the final `git commit -- <committedPaths>` call, and every downstream delta-reconciliation check in `buildCheckpointEvent` are unchanged (confirmed by `git diff` showing no line touched in that logic beyond the staging step itself).
- AC-5: `npm run verify` (typecheck + full test suite including the two new regression test cases + build + smoke-cli + lint-skills) passes, with the total test count two higher than baseline (one test for each removal mode: plain `rm` and `git rm`, both targeting `changes[]`) and zero failures.

## Decisions and open questions

- Decision: route staging by on-disk existence rather than by declared
  `intent` — the only signal available and correct for both `artifacts[]`
  and `changes[]` paths uniformly; supersedes attempt 2's intent-based
  design, which would not have fixed the actual evidenced incident.
- Decision: regression tests target `changes[]` (the evidenced defect
  surface), not `artifacts[intent="delete"]` (never evidenced as broken,
  disproportionate fixture cost) — tracked as DC-2.
- Decision: fix scoped to `buildCheckpointEvent` only (the sole evidenced
  call site); the other three `git.add()` sites are explicitly out of
  scope, tracked as DC-1.
- No open questions remain that could change scope, interfaces, or
  acceptance.
