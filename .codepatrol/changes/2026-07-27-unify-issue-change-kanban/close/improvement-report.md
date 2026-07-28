# Improvement report

## Summary
Change `2026-07-27-unify-issue-change-kanban` recorded 92 trace entries, 0 stage returns, and 3 unique error codes.

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
| INVALID_ARGUMENT | 3 | Missing required option: --input |
| CHANGE_CONFLICT | 2 | Session item is not claimed: T3. |
| CHANGE_INVALID | 1 | Run timestamps and elapsed_ms must agree. |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 2166787 |
| review | 276067 |
| apply | 2920307 |
| verify | 271018 |
| close | 16452 |

## Artifact stats
- Files: 8
- Total bytes: 82739

## Recommendations
- Top error code: INVALID_ARGUMENT (3). Investigate the first occurrence's args and stage context.
- Command "change.session" was invoked 27 times — consider caching or batching repeated invocations.
