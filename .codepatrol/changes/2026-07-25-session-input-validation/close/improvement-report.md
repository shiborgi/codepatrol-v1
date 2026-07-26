# Improvement report

## Summary
Change `2026-07-25-session-input-validation` recorded 73 trace entries, 0 stage returns, and 4 unique error codes.

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
| INVALID_ARGUMENT | 1 | type must be a non-empty string. |
| CHANGE_INVALID | 1 | Run contains unknown field startedAt. |
| CHANGE_CONFLICT | 1 | Checkpoint has undeclared worktree paths: review-begin.json, review-checkpoint.json, review-transition.json, review-usage.json. |
| INVALID_WORKSPACE | 1 | Path must be workspace-relative: /tmp/review-checkpoint.json |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 312574 |
| review | 33310 |
| apply | 326237 |
| verify | 79336 |
| close | 13741 |

## Artifact stats
- Files: 8
- Total bytes: 59188

## Recommendations
- Top error code: INVALID_ARGUMENT (1). Investigate the first occurrence's args and stage context.
- Command "change.transition" was invoked 17 times — consider caching or batching repeated invocations.
