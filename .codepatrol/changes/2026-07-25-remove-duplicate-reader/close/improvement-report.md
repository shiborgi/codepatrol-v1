# Improvement report

## Summary
Change `2026-07-25-remove-duplicate-reader` recorded 100 trace entries, 0 stage returns, and 2 unique error codes.

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
| CHANGE_CONFLICT | 2 | Session undefined/undefined is not the current attempt. |
| CHANGE_INVALID | 1 | Checkpoint is missing required plan artifacts: .codepatrol/changes/2026-07-25-remove-duplicate-reader/plan/spec.md, .codepatrol/changes/2026-07-25-remove-duplicate-reader/plan/plan.md. |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 269702 |
| review | 14776 |
| apply | 669487 |
| verify | 292427 |
| close | 8853 |

## Artifact stats
- Files: 8
- Total bytes: 55752

## Recommendations
- Top error code: CHANGE_CONFLICT (2). Investigate the first occurrence's args and stage context.
- Command "change.session" was invoked 36 times — consider caching or batching repeated invocations.
