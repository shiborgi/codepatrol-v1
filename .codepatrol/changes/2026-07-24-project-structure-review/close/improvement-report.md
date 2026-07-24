# Improvement report

## Summary
Change `2026-07-24-project-structure-review` recorded 53 trace entries, 0 stage returns, and 2 unique error codes.

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
| CHANGE_INVALID | 1 | Run timestamps and elapsed_ms must agree. |
| INVALID_ARGUMENT | 1 | Only Apply may declare production changes. |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 593917 |
| review | 53913 |
| apply | 1212529 |
| verify | 144094 |
| close | 15869 |

## Artifact stats
- Files: 8
- Total bytes: 85622

## Recommendations
- Top error code: CHANGE_INVALID (1). Investigate the first occurrence's args and stage context.
- Command "change.transition" was invoked 15 times — consider caching or batching repeated invocations.
