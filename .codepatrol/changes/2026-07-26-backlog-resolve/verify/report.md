# Verification — Add a CLI command to mark a backlog item done/dismissed directly

- Change: `2026-07-26-backlog-resolve`
- Verified revision: 1
- Verifier: opencode
- Base ref: `f51ced83efbb8b5a8e53830177e475f3d339d154`
- Head ref: `codepatrol/2026-07-26-backlog-resolve`
- Evidence date: 2026-07-26T02:22:00.000Z

## Scope and instruments

- Read `.codepatrol/changes/2026-07-26-backlog-resolve/plan/plan.md` and `apply/journal.md`.
- Diffed production files against base (`f51ced83efbb8b5a8e53830177e475f3d339d154`).
- Executed `npm run verify` and `codepatrol graph impact`.

## Plan conformance

- T1: Implemented logic matches `plan.md` helper strictly. `resolveBacklogItem` properly changes `status` and `lastSeenAt`. Added tests perfectly verified these.
- T2: Created correct `backlog.resolve` case in `src/cli/commands.ts`. Updated CLI boundaries (`args.ts`, `output.ts`) strictly according to constraints without introducing new options to parsing logic. 
- T3: Final Verification accurately tested all changes and verified no deviations beyond planned boundaries occurred.

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of the journal |
|---|---|---|---|
| AC-1 | `npm run test` (test: resolveBacklogItem marks a candidate done or dismissed...) | pass | yes |
| AC-2 | `npm run test` (test: resolveBacklogItem accepts dismissed and preserves...) | pass | yes |
| AC-3 | `npm run test` (test: CLI backlog resolve marks an item done or dismissed, rejects bad status...) | pass | yes |
| AC-4 | `npm run test` (test: CLI backlog resolve... rejects bad id...) | pass | yes |
| AC-5 | `npm run test` (test: CLI backlog resolve... rejects already-terminal...) | pass | yes |
| AC-6 | `npm run test` (test: AC-6... push closes the GitHub issue for an item resolved via resolveBacklogItem...) | pass | yes |

## Wider suite

Executed `npm run verify` covering `typecheck`, `test`, `build`, `smoke:cli`, and `lint:skills`.
- Result: 212/212 tests passed successfully. No type errors. 

## Blast radius

Executed `node bin/codepatrol.js graph impact --since-ref f51ced83efbb8b5a8e53830177e475f3d339d154`
- Affected files: 47 total paths hit up to depth 2 (including CLI boundaries like `src/cli/main.ts` and core like `src/change/orchestrator.ts`).
- All possibly affected boundaries successfully exercised via testing suite (`npm run test`), resulting in zero regressions. The test map confirms `src/change/issue-sync.test.ts` naturally verified its paths. No impacted seams beyond planned boundaries.

## Regressions

Executed `npm run test` over entire tree (212 tests). No side-effects onto `issue-sync.ts` pipelines or unmodified backlog invariants (`candidate`/`scheduled`) detected. The unchanged `issue-sync.ts` successfully handled the terminal conditions newly pushed by `resolveBacklogItem`.

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| `src/change/backlog.ts` | yes | accepted |
| `src/change/backlog.test.ts` | yes | accepted |
| `src/change/issue-sync.test.ts` | yes | accepted |
| `src/cli/args.ts` | yes | accepted |
| `src/cli/commands.ts` | yes | accepted |
| `src/cli/output.ts` | yes | accepted |
| `src/cli/cli.test.ts` | yes | accepted |

## Findings

None. 

## Residual risks and evidence gaps

None.

## Verdict

`commit`

The implemented branch explicitly satisfied all acceptance criteria with rigorous unit testing on boundaries. Regression tests validated existing pipelines. Proceed to Close.