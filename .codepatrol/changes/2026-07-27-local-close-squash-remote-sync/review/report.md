# Review — Close squash-merges and retains the branch locally; new `sync` command owns every remote action

- Change: `2026-07-27-local-close-squash-remote-sync`
- Incoming revision: 5
- Reviewed revision: 5
- Reviewer: openai/gpt-5.6-terra
- Evidence date: 2026-07-27T03:21:16.000Z

## Scope and evidence

Reviewed the complete Plan artifacts and their SHA-256 bindings on `codepatrol/2026-07-27-local-close-squash-remote-sync` at Plan checkpoint `5a2d484dde07c96e876cab4f2709d6a6e61f4e16` (tree `d70468ae1012dce680abb71a420dae86fdf48d38`). Re-ran graph impact and source searches for the Close UI, `CommandOverrides`, `GitAdapter`, and target-branch substrate. `npm test` passed: 217 tests, 0 failures.

The prior findings are resolved: T5 removes every listed Close `commit+push` affordance; T7 introduces and wires the Git adapter override; T8 updates the shared Close documentation.

## Findings

### major — plan

T6 says `syncRemote` "resolves the target branch from the workspace's Changes (or falls back to the current branch's configured target)" but provides no deterministic selection rule. `ChangeIdentity.target_branch` is stored per Change (`src/change/types.ts:26`); the only Git branch lookup is `GitAdapter.currentBranch()` (`src/change/git.ts:10,69`), and no current-branch target configuration exists. A workspace can contain several Changes with different targets, while `sync --target` has neither a work ID nor target flag. Consequently target-only sync and its adapter-double test have no single correct ref to push.

Required correction: define the exact target selection algorithm and red-capable tests. For example, use the current branch when it is a target branch; when it is `codepatrol/<work-id>`, resolve that Change's `identity.target_branch`; and reject or require an explicit selector if no unambiguous match exists. Thread this decision through AC-6, T6, T7, and the evidence.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none; return to Plan | Define which target `sync --target` pushes | AC-6 |
| `plan.md` | none; return to Plan | Make target selection and its tests executable | AC-6, AC-11 |
| `plan/evidence/investigation.md` | none; return to Plan | Record the absent current-branch target configuration and chosen selection rule | AC-6 |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T2, T3 | yes | covered |
| AC-2 | yes | T2, T3 | yes | covered |
| AC-3 | yes | T3 | yes | covered |
| AC-4 | yes | T4 | yes | covered |
| AC-5 | yes | T5 | yes | covered |
| AC-6 | no | T6, T7 | no - target ref is unspecified | blocked |
| AC-7 | yes | T8 | yes | covered |
| AC-8 | yes | T9 | yes | covered |
| AC-9 | yes | T2, T3 | yes | covered |
| AC-10 | yes | T6, T7 | yes | covered |
| AC-11 | yes | T7 | yes | covered |

## Simplicity axis

- Selected rung: confirmed. The existing Change identity and Git adapter should determine target selection; no new remote mechanism or dependency is warranted.
- Safety floor: tree identity, lineage validation, local-only Close, dry-run mutation suppression, and post-push-only pruning remain retained.
- Surface delta: the corrected Close/UI/doc and adapter-test seams are necessary. Target selection is a missing decision inside the planned `sync` module, not a reason for extra surface.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| reuse | `ChangeIdentity.target_branch`, `GitAdapter.currentBranch` | Define their selection order rather than invent configuration | AC-6 | required correction |

All deferred constraints retain a known ceiling, observable trigger, and bounded upgrade path.

## Executability audit

T1-T5 and T7-T9 are dependency-ordered and red-capable. T6 cannot be independently implemented or tested until its target-ref algorithm is specified. No unresolved external assumption remains.

## Verdict

`fix-first`

Return to Plan to define target selection for `sync --target` and test all supported invocation contexts. The next permitted transition is `codepatrol-plan 2026-07-27-local-close-squash-remote-sync on codepatrol/2026-07-27-local-close-squash-remote-sync`.

## External evidence sufficiency

`not required` — local source and Plan artifacts establish the absent configuration and required behavior.

## Residual concerns and evidence gaps

No production implementation or external service was exercised. The baseline suite passes but cannot validate the proposed sync behavior before the target-selection contract exists.
