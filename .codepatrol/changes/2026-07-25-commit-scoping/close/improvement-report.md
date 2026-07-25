# Improvement report

## Summary
Change `2026-07-25-commit-scoping` recorded 78 trace entries, 1 stage return, and 2 unique error codes.

## Per-stage attempts
| Stage | Attempts | Returns | Checkpoints |
|---|---|---|---|
| plan | 2 | 0 | 2 |
| review | 2 | 1 | 2 |
| apply | 1 | 0 | 1 |
| verify | 1 | 0 | 1 |
| close | 1 | 0 | 0 |

## Returns
| Stage | Attempt | Reason | At |
|---|---|---|---|
| review | 1 | fix-first: spec.md and plan/evidence/investigation.md systematically cite the originating closed Change as 2026-07-24-docs-consolidation; the actual id (and the one used by its improvement report, terminal tag codepatrol/committed/2026-07-25-docs-consolidation, and all durable artifacts) is 2026-07-25-docs-consolidation. Cited evidence paths therefore do not resolve. Required correction: replace every 2026-07-24-docs-consolidation with 2026-07-25-docs-consolidation in spec.md and investigation.md. Technical diagnosis, scope, simplicity choice, ACs, and the red-capable test plan are independently verified and unaffected; no design change. | 2026-07-25T15:34:33.718Z |

## Top errors
| Code | Count | Sample message |
|---|---|---|
| CHANGE_CONFLICT | 3 | Session review/undefined is not the current attempt. |
| INVALID_ARGUMENT | 1 | Transition contains unknown field attempt. |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 860555 |
| review | 698506 |
| apply | 695164 |
| verify | 338062 |
| close | 16708 |

## Artifact stats
- Files: 8
- Total bytes: 73740

## Recommendations
- Top error code: CHANGE_CONFLICT (3). Investigate the first occurrence's args and stage context.
- Command "change.transition" was invoked 21 times — consider caching or batching repeated invocations.
