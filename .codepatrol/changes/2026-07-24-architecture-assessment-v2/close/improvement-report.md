# Improvement report

## Summary
Change `2026-07-24-architecture-assessment-v2` recorded 44 trace entries, 0 stage returns, and 0 unique error codes.

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
None.

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 222552 |
| review | 45993 |
| apply | 252058 |
| verify | 44963 |
| close | 17277 |

## Artifact stats
- Files: 8
- Total bytes: 61804

## Recommendations
- Command "change.transition" was invoked 13 times — consider caching or batching repeated invocations.
