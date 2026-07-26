# Improvement report

## Summary
Change `2026-07-26-close-resolves-backlog` recorded 57 trace entries, 0 stage returns, and 0 unique error codes.

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
| plan | 191604 |
| review | 11775 |
| apply | 264288 |
| verify | 12925 |
| close | 17880 |

## Artifact stats
- Files: 8
- Total bytes: 55998

## Recommendations
- Command "change.transition" was invoked 13 times — consider caching or batching repeated invocations.
