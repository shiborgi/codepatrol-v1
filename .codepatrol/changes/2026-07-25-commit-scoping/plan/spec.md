# Specification — Scope every lifecycle bookkeeping commit to its own intended paths

## Intent

- Origin: improve-codebase
- Mode: bug
- Target baseline: `main` @ `bcaa3c2bc5055cd5daa70f54210197adcc130f6b`; clean worktree; graph synced (70 files, 1814 symbols).
- Governing constraints: `AGENTS.md`'s "Preserve unrelated user changes. Never reset, force, rebase, fetch/push or resolve integration conflicts automatically" governs the choice of fix (pathspec-restriction over an index reset). No `CONTEXT.md` term or ADR is directly implicated; `docs/adr/` remains absent (no durable decision to record beyond this bounded bug fix).
- Substrate state: graph synced at baseline (70 files, 1814 symbols).
- Improvement signals (most recent report `.codepatrol/docs/improvement-reports/2026-07-25-docs-consolidation.md`):
  - "Top error code: OPERATION_FAILED (6). Investigate the first occurrence's args and stage context." (This Change's own origin — see Problem below.)
  - "Command \"change.transition\" was invoked 33 times — consider caching or batching repeated invocations." (Recurring, pre-existing, unrelated to this Change's scope — not actioned here.)
- Problem: `NodeGitAdapter.commit()` (`src/change/git.ts:77-80`) and its one caller pattern in `src/change/orchestrator.ts` (4 call sites: `commitMetadata` shared by 5 transition types, the Close receipt commit, the Close terminal commit, and the Plan/Review/Apply/Verify checkpoint commit) run a bare `git commit` with no path restriction. Whatever happens to be staged in the Git index at commit time — not just what that call site's own preceding `git.add()` staged — becomes part of the resulting commit. For the `begin`/`usage`/`return`/`block`/`resume` transition family (routed through `commitMetadata`), there is no guard at all against this: if any file is staged externally to Codepatrol's own flow (confirmed reproducible: a plain `git rm` before a `codepatrol change transition` call), it is silently swept into the next unrelated lifecycle bookkeeping commit. This both corrupts the intended "one atomic checkpoint commit per stage" model and, when the swept content is a file deletion, causes a **later** legitimate `git add` on that now-already-committed-and-absent path to fail with `OPERATION_FAILED: fatal: pathspec '<path>' did not match any files` — reproduced and documented first-hand in `2026-07-25-docs-consolidation`'s Apply stage (`plan/evidence/investigation.md` has the full incident reconstruction).
- Outcome: `git.commit()` accepts an optional pathspec; every one of the 4 production call sites passes its own already-locally-known intended path(s), so each lifecycle bookkeeping commit contains **only** what that call site staged — anything else present in the index at commit time remains staged, untouched, available for a later legitimate commit, never silently absorbed and never lost.

## Scope

### In scope

- **`GitAdapter` interface + `NodeGitAdapter` implementation (T1):** `commit(message, allowEmpty?, signal?, paths?)` gains an optional 4th parameter; when provided and non-empty, the underlying `git commit` call appends `-- <paths...>`, restricting the commit to exactly those paths' staged changes (composing correctly with `--allow-empty`).
- **All 4 orchestrator.ts call sites (T2):** `commitMetadata` (`:95-98`), the checkpoint commit (`:289-290`), the Close receipt commit (`:400`), and the Close terminal commit (`:418`) each pass the same path array already locally computed for their immediately-preceding `git.add()` call — no new path computation, purely closing the gap between "what was added" and "what gets committed."
- **Regression coverage (T3):** a new test reproducing the exact incident class — stage an unrelated file directly via Git (bypassing Codepatrol), trigger a `commitMetadata`-routed transition (`"usage"`, matching the real incident), assert the unrelated file is excluded from the resulting commit and remains staged afterward. Companion assertions for the receipt and terminal commit paths for completeness, reusing the existing Close-lifecycle test fixtures.
- **Final verification (T4).**

### Out of scope

- Adding an explicit "assert clean before commit" pre-check at each vulnerable call site (rejected alternative, `investigation.md`) — the pathspec-restriction fix supersedes it and is the chosen design.
- Fixing any of the other three open backlog items (`core-module-test-coverage-gaps…`, `orchestrator-transitionchangelocked-is-dense…`, `dead-taxonomy-unused-error-codes…`) or the recurring `change.transition`-invocation-count recommendation — each is an independent, already-backlogged, unrelated concern (DC-1).
- Retroactively investigating or correcting the specific commits from the `2026-07-25-docs-consolidation` incident itself — that Change is already closed and terminal; its history is immutable and the incident's effects were already fully resolved within that Change's own Apply/Verify before Close (confirmed: final diff matched forecast exactly, full gate green, Verify commit verdict). This Change only prevents recurrence going forward.
- Any change to `parseStatusPaths`, the checkpoint pre/post-commit validation logic (`:264-270`, `:291-292`), or any other orchestrator control flow beyond the 4 named commit call sites — the checkpoint commit's existing validation is already self-defending (see investigation.md) and is preserved unchanged as an additional, now-redundant-but-still-valuable safety layer.

## Current evidence

(All read this investigation on the working tree at base `bcaa3c2`; full detail and line citations in `plan/evidence/investigation.md`.)

- `.codepatrol/docs/improvement-reports/2026-07-25-docs-consolidation.md`'s Top errors table: `OPERATION_FAILED` ×6, sample `fatal: pathspec 'docs/codepatrol/assessments/2026-07-24-architecture-v2.md' did not match any files`. Confidence: high (durable artifact, git-tracked source at `.codepatrol/changes/2026-07-25-docs-consolidation/close/improvement-report.md`).
- The per-event trace that would show per-occurrence args/stage context is deleted at Close by design (ephemeral, `docs/runtime-state.md`) — unrecoverable for a closed Change; root-caused instead from the durable, git-tracked `apply/journal.md` and `verify/report.md` of that same Change, both of which document the exact incident. Confidence: high (first-hand, durable artifacts).
- `grep -rn "\.commit(" src/ scripts/` excluding tests → exactly 4 production call sites, all in `orchestrator.ts`, all routing through `NodeGitAdapter.commit()` (`git.ts:77-80`), which has no pathspec restriction unlike its sibling `add()`/`unstage()` (`git.ts:75-76`), which already use `["<verb>", "--", ...paths]`. Confidence: high (grep + read).
- `commitMetadata`'s only pre-commit guard (the "checkpoint" intent's `:264-270` dirty-path audit) does not apply to `begin`/`usage`/`return`/`block`/`resume` transitions, which fall straight through to `commitMetadata()` with zero equivalent check (`:294` onward). This is the exact gap the incident exploited. Confidence: high (read the full `transitionChangeLocked` function).
- The checkpoint commit path is already self-defending via pre- and post-commit validation (`:264-270`, `:291-292`) — not the vulnerable path, but included in the fix for uniformity per the Simplicity decision below. Confidence: high (read).
- `GitAdapter`'s one implementation (`NodeGitAdapter`) and all 4 test-double subclasses in `git.test.ts` are backward-compatible with an added optional interface parameter (none declares an incompatible `commit()` override). Confidence: high (read all subclasses in full).

## Proposed design

**`GitAdapter.commit`:** signature becomes `commit(message: string, allowEmpty?: boolean, signal?: AbortSignal, paths?: string[]): Promise<string>`. `NodeGitAdapter.commit()`'s git-args array gains a conditional tail: `...(paths?.length ? ["--", ...paths] : [])`, appended after the existing `-m message` (and after `--allow-empty` when present) — matching the exact `["<verb>", "--", ...paths]` shape `add()`/`unstage()` already use in the same file, so the pattern is not new to this codebase, only newly applied to `commit()`.

**Call-site updates (mechanical, no new path computation):**
- `commitMetadata(git, workId, message, signal, extraPaths)`: the function already builds `const paths = [relativeRecord(workId), ...extraPaths]` before calling `git.add(paths, signal)` — the very next line's `git.commit(message, false, signal)` becomes `git.commit(message, false, signal, paths)`.
- Checkpoint commit (`:289-290`): the exact array passed to `git.add(...)` at `:289` is captured in a local `const committedPaths = [...new Set([...paths, ...intent.artifacts.map((item) => item.path)])]`; `git.add(committedPaths, options.signal)` then `git.commit(<message>, true, options.signal, committedPaths)`.
- Close receipt commit (`:400`): `git.add([receiptPath], options.signal)` then `git.commit(<message>, false, options.signal, [receiptPath])`.
- Close terminal commit (`:418`): `git.add(pathsToCommit, options.signal)` then `git.commit(<message>, false, options.signal, pathsToCommit)`.

**Invariant:** after this Change, every commit created by Codepatrol's own lifecycle code contains exactly the paths that call site explicitly intended — provably, by construction — regardless of what else may be staged in the Git index at that moment. Anything else staged remains staged and untouched; nothing is silently absorbed, nothing is discarded.

## Alternatives

- **Explicit "assert clean before commit" guard at each vulnerable call site**, mirroring the Close receipt commit's existing `:395` check. Rejected: three or more new throw paths to design/name/test, versus one interface parameter reused four times; does not protect any future call site added later without the same guard being remembered.
- **`git reset` before each intended `add`+`commit` pair.** Rejected: destroys any other legitimately-staged-but-uncommitted content instead of preserving it — strictly worse than pathspec-restriction, which is non-destructive by design.
- **Leave the checkpoint commit path unchanged** (since it's already self-defending). Considered and rejected for the final design: the fix is a one-line, zero-new-path-computation change reusing an array that already exists locally; leaving one of four call sites inconsistent for no cost savings would be an arbitrary partial fix, not a simplicity win.

## Simplicity decision

- Selected rung: direct local change — one interface parameter addition, reused at 4 already-existing call sites with paths each site already computes; no new abstraction, no new module, no new dependency. Reuses `git.ts`'s own existing `["<verb>", "--", ...paths]` convention from `add()`/`unstage()`.
- Earlier rungs: no existing capability already scopes a Codepatrol-issued commit to specific paths; this is the smallest change that closes the gap at its single root (the shared `NodeGitAdapter.commit()` method) rather than at each of N current-and-future call sites individually.
- Irreducible complexity: none — this is a pure hardening of an existing method's git-args construction, hidden entirely inside `NodeGitAdapter.commit()`.
- Safety floor: no existing validation is weakened or removed (the checkpoint commit's pre/post-commit checks stay exactly as they are, now redundant-but-harmless defense-in-depth); the fix is strictly non-destructive (unrelated staged content is preserved, never discarded); `AGENTS.md`'s "preserve unrelated user changes" directive is honored more strictly than before, not less.
- Expected surface delta: modify `src/change/git.ts` (interface + `NodeGitAdapter.commit()`), `src/change/orchestrator.ts` (4 call-site updates), `src/change/git.test.ts` (new regression test(s)); no new files, no new dependencies, no config change, no runtime state change.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | The other 3 open backlog items and the recurring transition-count recommendation stay backlogged, not addressed here | Independent, unrelated concerns remain open | Maintainer picks one via `next --stage plan` / Kanban Backlog column | Start a new Change scoped to the chosen item |

## Compatibility and rollout

Additive, optional interface parameter — no breaking change to any caller that doesn't pass it (none currently exist outside the 4 sites this Change updates; all test-double subclasses remain valid without modification). No migration needed: the new pathspec restriction only changes behavior in the previously-buggy scenario (extra staged content present at commit time), which has no currently-passing test depending on the old (buggy) sweep-everything behavior — confirmed by reading every existing commit-adjacent test in `git.test.ts`, `close-integration.test.ts`, `close-push.test.ts`, and the persona/parallel orchestrator tests, none of which stages unrelated content before a lifecycle transition. Rollback = revert the branch. No security/privacy/performance/accessibility impact — this is a same-process Git argument-list change.

## Risks and mitigations

- **A future call site is added to `orchestrator.ts` without passing `paths`.** Mitigation: the parameter is optional (backward-compatible), so an omission degrades to today's status quo rather than breaking — not a regression, but a residual gap; noted as a residual risk below rather than solved by this bounded Change (solving it exhaustively for all future code would require a lint rule or a mandatory-parameter breaking change, out of scope for this bug fix).
- **The checkpoint commit's `committedPaths` local capture diverges from the exact array actually passed to `git.add()` due to a future edit.** Mitigation: T2's step for that call site captures the array **once** into a named local and reuses the same reference for both `git.add()` and `git.commit()`, making divergence a same-line diff rather than two independently-maintained literals.

## Acceptance criteria

- AC-1: `git.commit()` accepts an optional `paths?: string[]` 4th parameter; when provided, the underlying `git commit` invocation includes `-- <paths...>`; when omitted, behavior is byte-identical to today (no pathspec tail).
- AC-2: With an unrelated file staged directly via Git (bypassing Codepatrol) before a `commitMetadata`-routed `"usage"` transition, the resulting commit's `git show --name-only <commit>` does **not** include that unrelated file, and `git status --porcelain` immediately afterward still reports it as staged (untouched, not lost, not silently committed).
- AC-3: The Close receipt commit and Close terminal commit each pass their own already-computed path array to `git.commit()`; a live Close run with the same "unrelated staged file" precondition as AC-2 shows the unrelated file excluded from both the receipt and terminal commits and still staged afterward.
- AC-4: The checkpoint commit (Plan/Review/Apply/Verify) passes its own already-computed `committedPaths` array; the full existing checkpoint test suite (all 5 stage types) passes unchanged, and the checkpoint commit's existing pre/post-commit validation (`:264-270`, `:291-292`) remains present and unmodified in the diff.
- AC-5: `npm run verify` exits 0 on the candidate (enforced at Apply seal by `.codepatrol/config.json`'s `applyGate`).

## Decisions and open questions

- Decided: pathspec-restriction at the single `NodeGitAdapter.commit()` root, over per-call-site pre-checks or index resets (Alternatives).
- Decided: the checkpoint commit is included in the fix for uniformity even though it was never the vulnerable path, since the change is zero-cost (reuses an already-computed local array).
- Decided: no retroactive action on the already-closed `2026-07-25-docs-consolidation` Change; this Change only prevents recurrence.
- No open question can materially change scope, interfaces, or acceptance.
