# Review — Document transition and close payload shapes

- Change: `2026-07-26-document-transition-close-payloads`
- Incoming revision: 3
- Reviewed revision: 3
- Reviewer: opencode
- Evidence date: 2026-07-27T00:17:15Z

## Scope and evidence

- Read the complete revision-3 specification, plan, and investigation evidence, including both returned-review corrections.
- Re-checked `TransitionIntent` and `CloseInput` in `src/change/types.ts:45-54` and the exact allowed fields and stage constraints in `src/change/orchestrator.ts:49-79`.
- Ran `npm run lint:skills`, which passed.
- Executed the proposed T3 fence-check logic against an eight-fence representative section; it exited 0.
- `codepatrol graph impact --file skills/_shared/CODEPATROL-CLI.md --format json` reports no affected source or tests; the documentation path is graph-unknown.

## Findings

None. The revision resolves prior placement, optional-field, fence-structure, and line-count findings.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none | field coverage and line forecast are now consistent | n/a |
| `plan.md` | none | top-level target Markdown and structural verification are executable | n/a |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T1 | yes — source comparison and field table | covered |
| AC-2 | yes | T1 | yes — checkpoint prose versus validator | covered |
| AC-3 | yes | T2 | yes — `CloseInput` comparison | covered |
| AC-4 | yes | T3 | yes — `npm run lint:skills` | covered |
| AC-5 | yes | T3 | yes — field/value comparison plus fence check | covered |

## Simplicity axis

- Selected rung: confirmed direct local documentation change.
- Safety floor: field names, optionality, enum values, stage-locked results, and valid Markdown fence structure are all verified against source or a red-capable structural check.
- Surface delta: one existing documentation file only; the field table and eighth JSON fence are necessary to document stage-dependent and optional payload fields accurately.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| simplify | T1/T2 target content | no outer Markdown fence around independent JSON examples | AC-1, AC-3 usability | already sufficient |

DC-1 and DC-2 retain concrete ceilings, observable triggers, and bounded upgrade paths.

## Executability audit

T1 and T2 now explicitly direct the implementer to write top-level Markdown, eliminating same-length nested fence ambiguity. T3 validates the exact inserted region has no outer `markdown` fence and exactly eight independently balanced JSON fences; the command syntax was executed successfully against a representative section. The source comparison, lint, one-file diff, rollback, and context-independent instructions are executable. No unresolved assumption remains.

## Verdict

`approve`

The Plan is decision-complete and executable. It correctly documents all required and optional transition fields without suggesting invalid stage combinations, and it guards against the prior Markdown rendering defect. The next permitted transition is `codepatrol-apply 2026-07-26-document-transition-close-payloads on codepatrol/2026-07-26-document-transition-close-payloads`.

## External evidence sufficiency

not required (the governing contracts are local types, validators, and existing documentation structure).

## Residual concerns and evidence gaps

No blocker remains. `lint:skills` does not render Markdown, but the Plan's explicit structural check covers the fence failure mode that prompted the prior return; visual rendering remains a normal Apply/Verify inspection item.
