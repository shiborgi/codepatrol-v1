# Improvement report

## Summary
Change `2026-07-26-src-structure-revalidation` recorded 69 trace entries, 0 stage returns, and 1 unique error code.

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
| CHANGE_INVALID | 1 | CHANGE_INVALID: Cannot begin verify attempt 1. |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 440055 |
| review | 53074 |
| apply | 167150 |
| verify | 378595 |
| close | 24946 |

## Artifact stats
- Files: 8
- Total bytes: 54202

## Recommendations
- Top error code: CHANGE_INVALID (1). Investigate the first occurrence's args and stage context.
- Command "change.session" was invoked 17 times — consider caching or batching repeated invocations.
