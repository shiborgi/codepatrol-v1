# Implementation — Scope every lifecycle bookkeeping commit to its own intended paths

- Package revision: 2
- Approval: `review/report.md` verdict `approve`
- Target start ref: `4e6f47254ada00635b6e4eec1b6267affddc7ef8`
- Actor: `minimax-m3`
- Status: implemented

## Baseline reconciliation

`codepatrol change inspect --id 2026-07-25-commit-scoping --workspace "$PWD" --format json` validated the accepted Plan attempt 2 and Review attempt 2 artifact hashes with no warnings. The checkout is `codepatrol/2026-07-25-commit-scoping`, target `main` remains at the recorded base `bcaa3c2bc5055cd5daa70f54210197adcc130f6b`, Review result is `approve`, Apply attempt 1 is active, and the working tree was clean before Apply began.

## Task journal

### T1 — `GitAdapter.commit()` gains an optional pathspec

- Claim/workflow item: T1
- Started: 2026-07-25T15:53:26.547Z
- Completed: 2026-07-25T15:54:39Z
- Files changed: `src/change/git.ts`
- Simplicity check: Direct local change retained; the optional fourth parameter and conditional `-- <paths...>` tail reuse the adjacent `add()`/`unstage()` convention with no new abstraction or dependency.
- Surface delta: One additive `GitAdapter` method parameter and its `NodeGitAdapter` implementation; no configuration or runtime-state change.
- Characterization evidence: `node --test --import jiti/register src/change/git.test.ts` passed 14/14 before the adapter edit.
- Green evidence: `npm run typecheck` exited 0; `node --test --import jiti/register src/change/git.test.ts` passed 14/14 after the edit.
- Assessment: Omitted or empty `paths` preserves the prior argument list; non-empty `paths` appends the approved pathspec after the commit message and composes with `--allow-empty`.
- Result: complete

### T2 — Pass each call site's already-known paths to `commit()`

- Claim/workflow item: T2
- Started: 2026-07-25T15:55:37.821Z
- Files changed: `src/change/orchestrator.ts`
- Simplicity check: The approved mechanical threading remains intact; each call site reuses the exact array already supplied to its adjacent `git.add()`.
- Surface delta: Four commit invocations now pass `paths`, `committedPaths`, `[receiptPath]`, or `pathsToCommit`; checkpoint pre/post validation remains unmodified.
- Characterization evidence: The accepted T2 lifecycle command passed 50/50 tests before the call-site edits.
- Green evidence: `npm run typecheck` exited 0; the accepted T2 lifecycle command passed 50/50 tests after the edits.
- Assessment: `commitMetadata`, checkpoint, Close receipt, and Close terminal commits now scope their Git commits without adding path computation or control-flow changes.
- Result: complete

### T3 — Regression test reproducing the incident class

- Claim/workflow item: T3
- Started: 2026-07-25T15:57:10.129Z
- Files changed: `src/change/git.test.ts`, `src/change/close-integration.test.ts`
- Simplicity check: Existing raw-Git helpers and lifecycle fixtures were reused; no production control flow, dependency, or helper abstraction was added.
- Surface delta: One usage-transition regression and one live Close regression covering receipt and terminal commits.
- Red evidence: Temporarily removing `commitMetadata`'s fourth argument made `node --test --import jiti/register --test-name-pattern="an unrelated file staged outside Codepatrol" src/change/git.test.ts` fail because `unrelated.txt` was present in the bookkeeping commit. Temporarily removing the Close receipt argument made the scoped Close test fail because `.codepatrol/runtime/unrelated.txt` was present in the receipt commit. Temporarily removing the Close terminal argument made the same test fail because that path was present in the terminal commit. Each approved argument was restored immediately after its expected failure.
- Green evidence: `node --test --import jiti/register src/change/git.test.ts src/change/close-integration.test.ts src/change/close-push.test.ts` passed 18/18; `git diff --check` exited 0.
- Assessment: The usage transition records its intended run while preserving unrelated staged content. The live Close test force-stages an ignored runtime path immediately before Close so the existing clean-tree filter permits the lifecycle to proceed; both Close commits exclude it and it remains staged afterward without changing Close validation.
- Result: complete

### T4 — Final verification and reconciliation

- Claim/workflow item: T4
- Started: 2026-07-25T16:00:55.978Z
- Files changed: `.codepatrol/changes/2026-07-25-commit-scoping/apply/journal.md`
- Simplicity check: The approved bounded surface remains sufficient; no deferred enhancement or dependency was activated.
- Surface delta: Production delta is exactly `src/change/git.ts`, `src/change/orchestrator.ts`, `src/change/git.test.ts`, and `src/change/close-integration.test.ts`; the fourth path is the approved companion Close-lifecycle test forecast.
- Red evidence: T3's three temporary-reversion failures cover the changed behavior; T4 is verification-only.
- Green evidence: `npm run verify` exited 0 with 177/177 tests passing, followed by successful build, CLI smoke, and skill lint; `git diff --check bcaa3c2bc5055cd5daa70f54210197adcc130f6b` exited 0.
- Assessment: AC-1 through AC-5 pass. `codepatrol graph sync --workspace "$PWD" --format json` refreshed 70 files and 1,826 symbols. DC-1 did not trigger. Rollback is a branch revert with no migration. The residual risk remains that a future caller may omit the optional path argument and degrade only that new call site to the prior behavior.
- Result: complete

## Deviations

None.

## Acceptance evidence

| Criterion | Implementation | Verification | Result |
|---|---|---|---|
| AC-1 | `src/change/git.ts`: optional `paths` parameter and conditional Git pathspec tail | Pre/post focused Git suite, typecheck, full gate | pass |
| AC-2 | `commitMetadata` passes its staged path array; `src/change/git.test.ts` reproduces an externally staged file | Expected red under temporary reversion; focused green; full gate | pass |
| AC-3 | Close receipt and terminal commits pass their intended path arrays; live Close regression preserves unrelated staged runtime content | Expected red for each temporary call-site reversion; focused green; full gate | pass |
| AC-4 | Checkpoint captures and reuses `committedPaths`; existing pre/post validation is unchanged | T2 lifecycle suite passed 50/50; full gate | pass |
| AC-5 | Candidate passes the configured Apply gate | `npm run verify` exited 0 with 177/177 tests | pass |

## Surface delta

The actual production delta matches the approved forecast: `src/change/git.ts`, `src/change/orchestrator.ts`, `src/change/git.test.ts`, and the forecast companion `src/change/close-integration.test.ts`. The public adapter interface gains one optional parameter; no dependency, configuration, durable runtime state, schema, migration, or production control-flow change was added. The Apply-owned durable delta is this journal. DC-1 did not trigger; the unrelated backlog items remain untouched.

## Final verification

- `npm run typecheck` — passed after T1 and T2.
- `node --test --import jiti/register src/change/git.test.ts` — 14/14 characterization and green after T1.
- Accepted T2 lifecycle command — 50/50 before and after the four call-site edits.
- Three T3 temporary-reversion runs — failed at the intended unrelated-path inclusion assertions.
- `node --test --import jiti/register src/change/git.test.ts src/change/close-integration.test.ts src/change/close-push.test.ts` — 18/18 passed.
- `npm run verify` — exited 0; typecheck, 177/177 tests, build, CLI smoke, and skill lint passed.
- `git diff --check bcaa3c2bc5055cd5daa70f54210197adcc130f6b` — passed.
- `codepatrol graph sync --workspace "$PWD" --format json` — 70 files, 1,826 symbols, 4 extracted, 66 unchanged.
- Residual risk: because `paths` is optional for backward compatibility, a future call site that omits it would retain the prior unscoped behavior only at that new site.
- Rollback: revert the branch; no migration is required.

## Apply run metrics

- Run: `apply-20260725T155315Z`
- Started: `2026-07-25T15:53:15.265Z`
- Finished: `2026-07-25T16:03:46.511Z`
- Elapsed: 631246 ms
- Provider usage: unavailable — harness exposes no authoritative provider usage hook
- Measured-run coverage: 0/1
- Model: `minimax/MiniMax-M3`
- Harness: `opencode`
