# Review - Fix checkpoint git-add failure when a delete-intent artifact was already `git rm`'d

- Change: `2026-07-27-checkpoint-delete-artifact-add-fix`
- Incoming revision: 2
- Reviewed revision: 2
- Reviewer: `openai/gpt-5.6-terra`
- Evidence date: 2026-07-27T01:39:37Z

## Scope and evidence

Read the complete revision-2 specification, plan, and investigation evidence. Recomputed every declared SHA-256 and matched `change.yaml`; verified Plan checkpoint `7879d5b9bca96e2e12cf78f99c9a5763d518c66c`, tree `e211dfe6f081a88bb544ad2c3269287d62e26615`, the recorded branch, and a clean checkout before Review began. Read `buildCheckpointEvent` at `src/change/orchestrator.ts:254-295`, artifact validation at `src/change/validation.ts:23-40`, `NodeGitAdapter.add`/`unstage` at `src/change/git.ts:75-79`, and the complete `src/change/git.test.ts`. Graph impact identifies `git.test.ts` and the orchestrator test suite. `npm test -- --test-name-pattern="checkpoint cannot satisfy required artifacts with delete bindings"` completed green: 215 tests, 0 failures; this npm script runs the full suite.

## Findings

### major - plan

`plan/plan.md:85-120` does not specify a fixture that can pass delete-intent validation. `validateWithReader` requires every delete binding to exist at the checkpoint's immutable baseline (`src/change/validation.ts:31-38`). A scratch artifact created after `startChange()` and only then deleted cannot satisfy that condition: Plan/review baselines predate it, and an Apply artifact cannot have existed at the prior Review checkpoint. Specify one executable setup before writing either test: seed an optional file at `.codepatrol/changes/<test-id>/plan/<name>` in the repository baseline before `startChange()`, then delete it in the Plan checkpoint; or explicitly create it in accepted Plan attempt 1, advance through Review, return to Plan attempt 2, and delete it there. The test must assert the Plan checkpoint succeeds for plain `rm`, and fails then succeeds for `git rm` as currently planned.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none | The intended two-mode behavior is complete and unambiguous. | AC-1 through AC-5 |
| `plan.md` | required in the next Plan attempt | Define a lifecycle-valid baseline for each delete-intent test fixture. | AC-2, AC-3, AC-5 |
| `evidence/investigation.md` | none | The root-cause and returned-review evidence remain sufficient. | AC-1, AC-2, AC-4 |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T2 | yes - direct staging-step assertion | covered |
| AC-2 | yes | T1, T2 | not until T1 uses a valid delete baseline | needs correction |
| AC-3 | yes | T1, T2 | not until T1 uses a valid delete baseline | needs correction |
| AC-4 | yes | T2, T3 | yes - bounded source diff review | covered |
| AC-5 | yes | T3 | yes - full `npm run verify` after executable tests exist | conditional |

## Simplicity axis

- Selected rung: confirmed. Reusing `GitAdapter.unstage()` remains the smallest local correction.
- Safety floor: retain `committedPaths`, the final commit pathspec, and delta reconciliation; test both index states explicitly.
- Surface delta: production remains two necessary files; baseline seeding can stay inside the existing test file without adding an abstraction.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| reuse | `src/change/git.ts:76` | Reuse `GitAdapter.unstage()` rather than add adapter surface. | Preserves AC-1 and AC-2. | required |
| simplify | `plan/plan.md:T1` | Seed the optional artifact in the test repository baseline rather than construct a multi-attempt lifecycle unless that lifecycle is itself under test. | Produces a minimal valid fixture for AC-2 and AC-3. | required correction |

DC-1 retains a known ceiling, observable trigger, and bounded upgrade path.

## Executability audit

The production edit, red-before-fix sequencing, and two behavior cases are now correctly scoped. However, the stated shared setup does not establish the required immutable baseline for a delete binding, so both new tests would fail with `CHANGE_DRIFT` before exercising `git.add`. The baseline-seeded Plan-checkpoint fixture is the earliest sufficient correction. Rollback remains a single-commit revert.

## Verdict

`fix-first`

The returned findings were addressed, but the new fixture omits a lifecycle requirement enforced by validation. Return to Plan attempt 3 to make T1 executable with a baseline-existing optional stage artifact; then Apply can demonstrate the intended red and green behavior without an unrelated validation failure. Next permitted action: `codepatrol-plan 2026-07-27-checkpoint-delete-artifact-add-fix on codepatrol/2026-07-27-checkpoint-delete-artifact-add-fix`.

## External evidence sufficiency

`not required` - this is an internal lifecycle and Git adapter change; repository source and local evidence govern the design.

## Residual concerns and evidence gaps

No production diff exists at Plan review. I did not run `npm run verify`; the focused command ran the current full suite and passed. The only blocking gap is the missing lifecycle-valid test baseline.
