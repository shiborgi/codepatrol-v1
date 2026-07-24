# Improvement report

## Summary
Change `2026-07-24-architecture-assessment` recorded 76 trace entries, 0 stage returns, and 4 unique error codes.

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
| INVALID_ARGUMENT | 6 | Unknown command: change.begin |
| CHANGE_INVALID | 2 | CHANGE_INVALID: A checkpoint requires at least one finished run record. |
| CHANGE_CONFLICT | 2 | Session apply/undefined is not the current attempt. |
| INVALID_WORKSPACE | 1 | Path must be workspace-relative: /tmp/review-transition.json |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 1198822 |
| review | 266504 |
| apply | 53998 |
| verify | 245139 |
| close | 15005 |

## Artifact stats
- Files: 8
- Total bytes: 68209

## Recommendations
- Top error code: INVALID_ARGUMENT (6). Investigate the first occurrence's args and stage context.
- Command "change.transition" was invoked 20 times — consider caching or batching repeated invocations.
