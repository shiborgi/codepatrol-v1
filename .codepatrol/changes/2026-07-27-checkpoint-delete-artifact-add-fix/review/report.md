# Review - Fix checkpoint git-add failure when a `changes[]` path was already removed

- Change: `2026-07-27-checkpoint-delete-artifact-add-fix`
- Incoming revision: 3
- Reviewed revision: 3
- Reviewer: `openai/gpt-5.6-terra`
- Evidence date: 2026-07-27T01:52:51Z

## Scope and evidence

Read the complete revision-3 specification, plan, and investigation evidence. Recomputed the three declared Plan SHA-256 values and matched `change.yaml`; verified Plan checkpoint `577beed10d0240508ccf5fc6dc97f99c8b728408`, tree `39ebbf360ad0130b84bf7346402943778a13adb9`, the recorded branch, and a clean checkout before Review began. Read `buildCheckpointEvent` at `src/change/orchestrator.ts:254-295`, `resolveInside` at `src/shared/workspace.ts:25-57`, `NodeGitAdapter.add`/`unstage` at `src/change/git.ts:75-79`, artifact validation at `src/change/validation.ts:23-40`, and the complete `src/change/git.test.ts`. Graph impact identifies `git.test.ts` and the broader orchestrator test suite. `npm test` passed: 215 tests, 0 failures.

## Findings

No blocking findings. Revision 3 correctly identifies Apply's flat `changes[]` list as the historical deletion path, partitions all committed paths by workspace existence, and defines a valid fixture by committing the production scratch path before `startChange()` establishes its base commit.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none | The corrected field, routing rule, and scope are coherent. | AC-1 through AC-5 |
| `plan.md` | none | The Apply fixture is executable and test-first. | AC-2, AC-3, AC-5 |
| `evidence/investigation.md` | none | It directly substantiates the `changes[]` historical payload and existence-based routing. | AC-1, AC-2, AC-4 |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T2 | yes - source-level partition and two routing calls | covered |
| AC-2 | yes | T1, T2 | yes - real Apply `changes[]` transition rejects before and resolves after the fix | covered |
| AC-3 | yes | T1, T2 | yes - plain filesystem removal characterizes existing success before and after the fix | covered |
| AC-4 | yes | T2, T3 | yes - bounded diff excludes commit and reconciliation logic | covered |
| AC-5 | yes | T3 | yes - `npm run verify` with two additional tests | covered |

## Simplicity axis

- Selected rung: confirmed. Existing `existsSync`, `resolveInside`, and `GitAdapter.unstage()` provide the complete local solution.
- Safety floor: `committedPaths`, final commit pathspec, and reconciliation logic remain unchanged; path resolution remains symlink-contained.
- Surface delta: two production files, no dependency or public-interface change; the two tests target the evidenced production-delta field.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| reuse | `src/change/orchestrator.ts`, `src/change/git.ts:76` | Existing resolver, existence check, and unstage adapter replace a new staging abstraction. | Preserves AC-1 through AC-3. | required |
| simplify | `src/change/git.test.ts` | One shared Apply fixture covers both removal modes. | Preserves red capability without multi-attempt artifact setup. | required |

DC-1 and DC-2 each state a ceiling, observable trigger, and bounded upgrade path.

## Executability audit

The pre-committed scratch path becomes part of the Change base before the Plan and Review checkpoints, so its later deletion is the complete Apply production delta and validly belongs in `changes[]`. The `git rm` assertion fails through the actual `transitionChange` path before T2, then is flipped to success after the implementation change; the plain-`rm` case remains a characterization test. `resolveInside` accepts missing workspace-relative paths while validating their existing ancestors, so it is valid for partitioning deleted paths. Rollback is a single revert of the implementation commit.

## Verdict

`approve`

The Plan is decision-complete, constrained to the actual defect surface, and gives an independent Apply agent executable red/green tests plus a full verification gate. Next permitted action: `codepatrol-apply 2026-07-27-checkpoint-delete-artifact-add-fix on codepatrol/2026-07-27-checkpoint-delete-artifact-add-fix`.

## External evidence sufficiency

`not required` - the governing facts are the local lifecycle payload, source implementation, and reproduced Git behavior; no external protocol or dependency claim controls this design.

## Residual concerns and evidence gaps

No production diff exists yet. `git diff --check` reports only whitespace in the Plan's illustrative TypeScript indentation, not an executable path. The final `npm run verify` remains Apply's required implementation gate.
