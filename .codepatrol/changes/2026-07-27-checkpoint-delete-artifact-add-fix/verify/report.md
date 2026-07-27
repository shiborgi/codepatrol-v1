# Verification - Fix checkpoint git-add failure when a `changes[]` path was already removed

- Change: `2026-07-27-checkpoint-delete-artifact-add-fix`
- Verified revision: 3
- Verifier: `openai/gpt-5.6-terra`
- Base ref: `61fa981b9d393ecc451c940edc11914937645c39`
- Head ref: Apply candidate `36e1d28be2507d59a5beb853a490762186759669`, tree `e98f3a820c90a379d41e0fed049f57c1200cdd03`
- Evidence date: 2026-07-27T02:04:39Z

## Scope and instruments

Read the complete Plan specification and plan, Review report, and Apply journal. Independently read the candidate diff, `buildCheckpointEvent` at `src/change/orchestrator.ts:254-295`, `resolveInside` at `src/shared/workspace.ts:25-57`, and the complete changed test fixture in `src/change/git.test.ts`. Rechecked the Apply checkpoint/tree against `change inspect`: both match the recorded commit/tree. The candidate is followed only by expected lifecycle metadata (`change.yaml`); the worktree was clean before creating this Verify artifact.

## Plan conformance

- T1: implemented `advanceThroughApplyWithChangesPath` and two end-to-end Apply `changes[]` tests. Independently observed both pass in the focused suite.
- T2: replaced exactly one unconditional staging call with an on-disk existence partition and `git.add`/`git.unstage` calls. No adapter, interface, or import surface was added beyond the test's `rmSync` import.
- T3: independently reran the full verification gate successfully. The production diff is exactly `src/change/orchestrator.ts` and `src/change/git.test.ts`; no downstream commit or reconciliation line changed.

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of the journal |
|---|---|---|---|
| AC-1 | `git diff --unified=0 61fa981..36e1d28 -- src/change/orchestrator.ts` | pass - four-line existence partition replaces the sole `git.add(committedPaths, ...)` call | yes |
| AC-2 | `node --test --import jiti/register src/change/git.test.ts` | pass - `apply checkpoint succeeds when a changes[] path was already removed with git rm` | yes |
| AC-3 | `node --test --import jiti/register src/change/git.test.ts` | pass - `apply checkpoint succeeds when a changes[] path was removed with plain rm` | yes |
| AC-4 | `git diff --name-status 61fa981..36e1d28 -- ':!.codepatrol'` | pass - only the declared source and test paths changed; source diff confirms reconciliation is untouched | yes |
| AC-5 | `npm run verify` | pass - 217 tests, 0 failures; build, CLI smoke, and skill lint passed | yes |

## Wider suite

- `node --test --import jiti/register src/change/git.test.ts`: 17 passed, 0 failed.
- `npm run verify`: typecheck passed; 217 tests passed; build passed; `Compiled CLI smoke passed (0.1.0).`; skill catalog lint passed.
- `git diff --check 61fa981..36e1d28 -- src/change/orchestrator.ts src/change/git.test.ts`: passed with no output.

## Blast radius

`codepatrol graph impact --since-ref 61fa981 --format json` identifies `src/change/git.test.ts` plus lifecycle/CLI/Close integration suites as direct or transitive tests of the orchestrator seam. The focused `git.test.ts` run exercised the changed transition path; `npm run verify` exercised the graph-reported full suite. No production caller outside the staged checkpoint path changed.

## Regressions

The focused lifecycle run exercised both index states: plain filesystem deletion and prior `git rm`. The full suite also exercised checkpoint delta validation, artifact validation, Apply-gate enforcement, lifecycle close safety, CLI dispatch, graph tooling, and workspace symlink containment. The candidate and current branch differ only by lifecycle metadata after the candidate; no source drift exists.

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| `src/change/orchestrator.ts` | yes | accepted |
| `src/change/git.test.ts` | yes | accepted |
| `.codepatrol/changes/2026-07-27-checkpoint-delete-artifact-add-fix/apply/journal.md` | yes | Apply-owned artifact |
| `.codepatrol/changes/2026-07-27-checkpoint-delete-artifact-add-fix/change.yaml` | lifecycle metadata | expected checkpoint events |

## Findings

No findings.

## Residual risks and evidence gaps

DC-2 remains: there is no dedicated accepted-baseline fixture for an `artifacts[intent="delete"]` path. The same existence partition covers it, and no historical incident implicates that path. No external dependency or protocol evidence is required. The candidate is clean and bound to the recorded Apply tree; Close authority has not been exercised.

## Verdict

`commit`

The exact Apply candidate meets every acceptance criterion with independent focused and broad evidence, has no unplanned production delta, and is eligible for Close. Next permitted action: `codepatrol-close 2026-07-27-checkpoint-delete-artifact-add-fix commit|rollback on codepatrol/2026-07-27-checkpoint-delete-artifact-add-fix`.
