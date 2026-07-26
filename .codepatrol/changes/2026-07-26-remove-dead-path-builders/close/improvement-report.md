# Improvement report

## Summary
Change `2026-07-26-remove-dead-path-builders` recorded 79 trace entries, 0 stage returns, and 2 unique error codes.

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
| INVALID_ARGUMENT | 9 | Unknown command: session.begin. Known commands: status, next, graph sync, graph overview, graph outline, graph find, graph neighbors, graph impact, change start, change inspect, change transition, change session, change doctor, change close, change summary, backlog add, backlog list, backlog resolve, issues sync. |
| CHANGE_CONFLICT | 1 | Checkpoint has undeclared worktree paths: apply-checkpoint.json. |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 156491 |
| review | 37345 |
| apply | 171374 |
| verify | 118619 |
| close | 15383 |

## Artifact stats
- Files: 8
- Total bytes: 39683

## Recommendations
- Top error code: INVALID_ARGUMENT (9). Investigate the first occurrence's args and stage context.
- Command "change.session" was invoked 19 times — consider caching or batching repeated invocations.
