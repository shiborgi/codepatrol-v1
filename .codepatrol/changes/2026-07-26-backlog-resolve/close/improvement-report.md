# Improvement report

## Summary
Change `2026-07-26-backlog-resolve` recorded 62 trace entries, 0 stage returns, and 0 unique error codes.

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
| plan | 252023 |
| review | 10108 |
| apply | 299897 |
| verify | 10711 |
| close | 14567 |

## Artifact stats
- Files: 8
- Total bytes: 61641

## Recommendations
- Command "change.session" was invoked 14 times — consider caching or batching repeated invocations.
