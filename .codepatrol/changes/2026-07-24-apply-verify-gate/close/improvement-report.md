# Improvement report

## Summary
Change `2026-07-24-apply-verify-gate` recorded 66 trace entries, 0 stage returns, and 3 unique error codes.

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
| INVALID_WORKSPACE | 2 | Path does not exist in the workspace: {"action":"prime","stage":"apply","attempt":1} |
| CHANGE_INVALID | 2 | Run contains unknown field tokens. |
| CHANGE_CONFLICT | 1 | Checkpoint has undeclared worktree paths: begin.json, checkpoint.json, usage.json. |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 315820 |
| review | 66206 |
| apply | 3167137 |
| verify | 510402 |
| close | 251830 |

## Artifact stats
- Files: 7
- Total bytes: 57714

## Recommendations
- Top error code: INVALID_WORKSPACE (2). Investigate the first occurrence's args and stage context.
- Command "change.session" was invoked 18 times — consider caching or batching repeated invocations.
