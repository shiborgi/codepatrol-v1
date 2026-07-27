# Apply journal

## T1 — regression characterization

- Added two Apply `changes[]` regression tests in `src/change/git.test.ts` for plain `rm` and prior `git rm` removal.
- `node --test --import jiti/register src/change/git.test.ts` passed 16/17 tests: plain `rm` succeeded; `git rm` failed with `OPERATION_FAILED` and `fatal: pathspec 'CHANGE.txt' did not match any files`, reproducing the defect before the production fix.

## T2 — existence-based checkpoint staging

- Updated `buildCheckpointEvent` in `src/change/orchestrator.ts` to partition committed paths by `existsSync(resolveInside(workspace, path))`, using `git.add` for present paths and `git.unstage` for absent paths.
- `npm run typecheck` passed.
- `node --test --import jiti/register src/change/git.test.ts` passed 17/17 tests, including both deletion modes and the resulting tree assertion.

## T3 — final verification

- `npm run verify` passed: typecheck, 217/217 tests, build, CLI smoke test, and skill lint.
- Diff review: only `src/change/orchestrator.ts` staging logic and `src/change/git.test.ts` regression coverage are production/test changes; downstream commit and reconciliation logic is unchanged.
- Residual risk: no dedicated `artifacts[intent="delete"]` fixture was added; the same existence-based routing covers it, as bounded by plan DC-2.


