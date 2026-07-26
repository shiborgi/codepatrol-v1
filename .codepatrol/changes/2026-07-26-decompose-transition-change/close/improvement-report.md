# Improvement report

## Summary
Change `2026-07-26-decompose-transition-change` recorded 87 trace entries, 0 stage returns, and 2 unique error codes.

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
| CHANGE_INVALID | 1 | Run timestamps and elapsed_ms must agree. |
| CHANGE_CONFLICT | 1 | Checkpoint has undeclared worktree paths: .codepatrol/changes/.codepatrol/runtime/traces/2026-07-26-decompose-transition-change.jsonl. |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 433297 |
| review | 44172 |
| apply | 673310 |
| verify | 103530 |
| close | 22497 |

## Artifact stats
- Files: 8
- Total bytes: 69893

## Recommendations
- Top error code: CHANGE_INVALID (1). Investigate the first occurrence's args and stage context.
- Command "change.session" was invoked 25 times — consider caching or batching repeated invocations.
