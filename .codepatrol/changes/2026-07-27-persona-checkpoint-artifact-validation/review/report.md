# Review - Validate artifact ownership and hash for persona Review/Verify checkpoints

- Change: `2026-07-27-persona-checkpoint-artifact-validation`
- Incoming revision: 3
- Reviewed revision: 3
- Reviewer: opencode
- Evidence date: 2026-07-27T21:00:18Z

## Scope and evidence

Read all revision-3 Plan artifacts and recomputed their SHA-256 values; they
match checkpoint `6cd03d2f47f9ed4dd5542c5e8e5b5baa102d2d7b`. Confirmed the
recorded branch and base `08a43e5e85f5c617ba4d4b0d7abc89e6f7f03d85`, clean
tree, whitespace check, current validator/orchestrator interfaces, and graph
impact for the changed seam.

## Findings

None. Revision 3 correctly distinguishes the three functions owned by
`src/change/validation.ts` from the private
`validateWorkspaceArtifacts` helper in `src/change/orchestrator.ts`. T1 makes
helper and enables persona validation.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none | revision 3 binds the exact base and correct module ownership | none |
| `plan.md` | none | T1/T2 ownership, interfaces, dependency order, and four-file delta are executable | none |
| `investigation.md` | none | local exploit evidence remains sufficient | none |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T1, T2 | yes - cross-stage persona artifact rejection | covered |
| AC-2 | yes | T1, T2 | yes - forged hash rejection | covered |
| AC-3 | yes | T2 | yes - correct owned artifact succeeds with sibling present | covered |
| AC-4 | yes | T2 | yes - existing consolidation workflow remains green | covered |
| AC-5 | yes | T1, T2 | yes - default completeness remains required for non-persona flows | covered |
| AC-6 | yes | T3 | yes - full gate and exact four-file diff inspection | covered |

## Simplicity axis

- Selected rung: confirmed local reuse. The fix reuses the existing per-binding validator and adds only a defaulted completeness control.
- Safety floor: persona ownership/hash checks run before commit; sibling persona files remain tolerated; non-persona completeness and production-boundary checks stay unchanged.
- Surface delta: exactly `validation.ts`, `orchestrator.ts`, `change.test.ts`, and `orchestrator-parallel.test.ts`; no dependency, configuration, or durable-schema change.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| reuse | validator and orchestrator helper | existing validation chain with explicit completeness switch | AC-1 through AC-5 | already sufficient |

DC-1 and DC-2 retain known ceilings, observable triggers, and bounded upgrade
paths.

## Executability audit

T1's direct validator characterization precedes its implementation; T2's
orchestrator exploit tests precede its two required production edits; T3 runs
focused tests, the full gate, and exact-base path reconciliation. The Plan
names the actual local helper, its parameter order, unchanged FromReader
behavior, rollback scope, and expected red/green signals. No unresolved
assumption blocks independent Apply.

## Verdict

`approve`

Revision 3 is decision-complete and correctly scopes the persona checkpoint
integrity fix. The permitted next action is
`codepatrol-apply 2026-07-27-persona-checkpoint-artifact-validation on
codepatrol/2026-07-27-persona-checkpoint-artifact-validation`.

## External evidence sufficiency

not required - governing claims are local Git lineage, reproduced local
orchestrator behavior, and repository-owned contracts.

## Residual concerns and evidence gaps

DC-2 intentionally leaves a correct-hash sibling-artifact attestation ceiling
outside this Change; its trigger and narrow follow-up are documented. No
production files were edited during Review.
