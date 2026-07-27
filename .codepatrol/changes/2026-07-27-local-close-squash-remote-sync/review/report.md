# Review — Close squash-merges and retains the branch locally; new `sync` command owns every remote action

- Change: `2026-07-27-local-close-squash-remote-sync`
- Incoming revision: 6
- Reviewed revision: 6
- Reviewer: openai/gpt-5.6-terra
- Evidence date: 2026-07-27T03:30:51.000Z

## Scope and evidence

Reviewed the complete Plan artifacts and SHA-256 bindings on `codepatrol/2026-07-27-local-close-squash-remote-sync` at Plan checkpoint `10236b6926c70d2dd7cfbce3a82e81111de7b617` (tree `174dbd392152b45cd3bad85cdea4602040377b12`). Re-ran graph impact, checked the Change identity/Git interfaces, and ran `npm test`: 217 tests passed, 0 failures.

## Findings

### major — plan

T6's step-4 target resolution says to push the current branch only if **exactly one** Change has `identity.target_branch === current` (`plan.md:333-337`). Its evidence immediately establishes that this workspace has many Change records with the same target, `main` (`plan/evidence/investigation.md:432-438`). Thus the normal post-Close invocation on `main` cannot satisfy the stated exactly-one rule, despite AC-6 requiring it to push `main`.

Required correction: accept one or more matching Changes because the ref being pushed is the same current branch, and add a red-capable test with multiple records targeting `main`. Alternatively use an equivalent unambiguous predicate, but remove the contradictory cardinality condition.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none; return to Plan | Align target resolution with shared targets | AC-6 |
| `plan.md` | none; return to Plan | Correct step-4 cardinality and add multi-Change coverage | AC-6 |
| `plan/evidence/investigation.md` | none; return to Plan | Reconcile the measured shared `main` target with the algorithm | AC-6 |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T2, T3 | yes | covered |
| AC-2 | yes | T2, T3 | yes | covered |
| AC-3 | yes | T3 | yes | covered |
| AC-4 | yes | T4 | yes | covered |
| AC-5 | yes | T5 | yes | covered |
| AC-6 | no | T6, T7 | no - shared target cardinality conflicts | blocked |
| AC-7 | yes | T8 | yes | covered |
| AC-8 | yes | T9 | yes | covered |
| AC-9 | yes | T2, T3 | yes | covered |
| AC-10 | yes | T6, T7 | yes | covered |
| AC-11 | yes | T7 | yes | covered |

## Simplicity axis

- Selected rung: confirmed. The existing Change identity provides sufficient target evidence; accepting a shared target needs no new surface.
- Safety floor: tree identity, lineage validation, local-only Close, dry-run mutation suppression, and post-push-only pruning remain retained.
- Surface delta: no additional module, dependency, or protocol is required.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| simplify | T6 target resolution | Replace exactly-one match with at-least-one match | AC-6 | required correction |

All deferred constraints retain a known ceiling, observable trigger, and bounded upgrade path.

## Executability audit

The target resolution is otherwise explicit, including the override and unresolved-branch failure. The shared-target path contradicts the measured repository state and must be corrected before independent implementation.

## Verdict

`fix-first`

Return to Plan to make the target resolution accept shared target branches and test that normal `main` use case. The next permitted transition is `codepatrol-plan 2026-07-27-local-close-squash-remote-sync on codepatrol/2026-07-27-local-close-squash-remote-sync`.

## External evidence sufficiency

`not required` — the contradiction is established by local Plan evidence and source contracts.

## Residual concerns and evidence gaps

No production implementation or external service was exercised. The baseline suite passes but cannot validate the proposed sync command before it exists.
