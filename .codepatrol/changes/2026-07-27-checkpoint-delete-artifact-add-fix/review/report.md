# Review - Fix checkpoint git-add failure when a delete-intent artifact was already `git rm`'d

- Change: `2026-07-27-checkpoint-delete-artifact-add-fix`
- Incoming revision: 1
- Reviewed revision: 1
- Reviewer: `openai/gpt-5.6-terra`
- Evidence date: 2026-07-27T01:22:32Z

## Scope and evidence

Read the complete Plan specification, plan, and investigation evidence. Recomputed all three declared Plan artifact SHA-256 values and matched `change.yaml`; verified the Plan checkpoint `ad293ed49c7520a4ad4fc94c8df2c8a2fe27695a`, its tree `601d8bf037a471c29bfee6a166080d30ba3128a3`, the recorded branch, and a clean checkout before Review began. Read `buildCheckpointEvent` at `src/change/orchestrator.ts:254-295`, `NodeGitAdapter.add`/`unstage` at `src/change/git.ts:75-79`, the complete `src/change/git.test.ts`, and the existing delete-binding validation at `src/change/change.test.ts:119-123`. Graph impact identifies `git.test.ts` plus the broader orchestrator test suite as affected. `npm test -- --test-name-pattern="checkpoint cannot satisfy required artifacts with delete bindings"` completed green: 215 tests, 0 failures; this npm script still runs the full suite.

## Findings

### major - plan

`plan/plan.md:100-146` does not provide verification for AC-3. It calls the current delete-intent test at `src/change/git.test.ts:157-163` the existing plain-`rm` coverage, but that test only rejects required Plan artifacts declared with `intent: "delete"`; it never removes a file with plain `rm` or seals a checkpoint. Add an executable test flow that creates and checkpoints an optional artifact, removes it with plain `rm`, seals the later checkpoint, and asserts the resulting tree omits it. Keep the already-`git rm` scenario as a separate case or as a parameterized second case in the same test. Reorder the tasks so the new `git rm` case is run against the old implementation before T1, rather than asking Apply to locally revert and reapply T1 after it has edited production code.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none | Review does not modify Plan-owned artifacts. | AC-1 through AC-5 |
| `plan.md` | required in the next Plan attempt | Add the missing AC-3 verification and a safe test-first ordering. | AC-2, AC-3, AC-5 |
| `evidence/investigation.md` | none | Root-cause evidence and primitive selection remain sufficient. | AC-1, AC-2, AC-4 |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T1 | yes - direct source assertion and typecheck | covered |
| AC-2 | yes | T2 | yes in intent, but task order relies on reverting T1 locally | needs correction |
| AC-3 | yes | T2 | no - no current or planned plain-`rm` checkpoint test | missing |
| AC-4 | yes | T1, T3 | yes - bounded source diff review | covered |
| AC-5 | yes | T3 | yes - full `npm run verify` | covered after AC-3 test is added |

## Simplicity axis

- Selected rung: confirmed. The existing `GitAdapter.unstage()` is the smallest local mechanism for delete-intent paths; no new adapter or interface is necessary.
- Safety floor: retain the unchanged `committedPaths` commit pathspec and final delta reconciliation while separately staging deletions.
- Surface delta: the planned production surface remains two files and is necessary; the missing plain-`rm` assertion can be added within the planned test file.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| reuse | `src/change/git.ts:76` | Reuse `GitAdapter.unstage()` instead of a new deletion API. | Preserves AC-1 and AC-2. | required |
| simplify | `plan/plan.md:T2` | Replace the revert/reapply red proof with test-before-fix ordering. | Makes AC-2 proof safe and deterministic. | required correction |

DC-1 has a known ceiling, observable `OPERATION_FAILED` trigger outside checkpoint staging, and a bounded same-pattern upgrade path.

## Executability audit

The proposed production edit is localized and uses existing interfaces. The cited staging seam and adapter behavior are current. The `git rm` regression can be constructed from the existing test helpers and lifecycle APIs, but T2 must explicitly establish the optional artifact in an earlier accepted checkpoint and test both removal modes. The stated plain-`rm` coverage is otherwise an unresolved and false assumption. Rollback remains a single-commit revert once the plan is corrected.

## Verdict

`fix-first`

The design and root-cause evidence are sufficient, but AC-3 has no executable verification and the requested red proof requires an avoidable local production revert. Return to Plan attempt 2 to add both removal-mode assertions and place the red `git rm` test before the implementation edit. Next permitted action: `codepatrol-plan 2026-07-27-checkpoint-delete-artifact-add-fix on codepatrol/2026-07-27-checkpoint-delete-artifact-add-fix`.

## External evidence sufficiency

`not required` - this is an internal Git adapter and lifecycle staging change; the governing behavior is reproduced in the Plan evidence and verified directly in the repository source.

## Residual concerns and evidence gaps

No production diff exists to inspect because this is Plan review. I did not run `npm run verify`, since Review evaluates the pre-implementation Plan; the focused invocation executed the full current test suite and passed. The only blocking gap is the missing AC-3 behavior test and its test-first sequencing.
