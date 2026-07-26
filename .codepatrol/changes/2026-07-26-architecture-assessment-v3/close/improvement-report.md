# Improvement report

## Summary
Change `2026-07-26-architecture-assessment-v3` recorded 59 trace entries, 0 stage returns, and 1 unique error code.

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
| CHANGE_CONFLICT | 1 | Apply changes do not match the complete candidate production delta. |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 573212 |
| review | 12251 |
| apply | 177598 |
| verify | 20340 |
| close | 16760 |

## Artifact stats
- Files: 8
- Total bytes: 42614

## Recommendations
- Top error code: CHANGE_CONFLICT (1). Investigate the first occurrence's args and stage context.
- Command "change.transition" was invoked 14 times — consider caching or batching repeated invocations.
