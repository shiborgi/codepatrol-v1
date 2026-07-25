# Improvement report

## Summary
Change `2026-07-25-docs-consolidation` recorded 116 trace entries, 0 stage returns, and 6 unique error codes.

## Per-stage attempts
| Stage | Attempts | Returns | Checkpoints |
|---|---|---|---|
| plan | 1 | 0 | 1 |
| review | 1 | 0 | 1 |
| apply | 1 | 0 | 1 |
| verify | 1 | 0 | 1 |
| close | 1 | 0 | 0 |

## Returns
None.

## Top errors
| Code | Count | Sample message |
|---|---|---|
| OPERATION_FAILED | 6 | fatal: pathspec 'docs/codepatrol/assessments/2026-07-24-architecture-v2.md' did not match any files |
| CHANGE_CONFLICT | 4 | Session item is not ready: verify-work — no such item. |
| CHANGE_DRIFT | 4 | Artifact is not owned by apply: docs/codepatrol/assessments/2026-07-24-architecture-v2.md
Artifact is not owned by apply: docs/codepatrol/assessments/2026-07-24-architecture-workflow.md |
| CHANGE_INVALID | 3 | CHANGE_INVALID: Invalid return event. |
| CHANGE_NOT_FOUND | 2 | Change not found: 2026-07-25-docs-consolidation. |
| INVALID_ARGUMENT | 1 | artifact.sha256 must be lowercase SHA-256. |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 606382 |
| review | 63897 |
| apply | 2640294 |
| verify | 235564 |
| close | 17953 |

## Artifact stats
- Files: 8
- Total bytes: 92785

## Recommendations
- Top error code: OPERATION_FAILED (6). Investigate the first occurrence's args and stage context.
- Command "change.transition" was invoked 33 times — consider caching or batching repeated invocations.
