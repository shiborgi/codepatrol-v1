# Improvement report

## Summary
Change `2026-07-27-checkpoint-delete-artifact-add-fix` recorded 163 trace entries, 2 stage returns, and 2 unique error codes.

## Per-stage attempts
| Stage | Attempts | Returns | Checkpoints |
|---|---|---|---|
| plan | 3 | 0 | 3 |
| review | 3 | 2 | 3 |
| apply | 1 | 0 | 1 |
| verify | 1 | 0 | 1 |
| close | 1 | 0 | 0 |

## Returns
| Stage | Attempt | Reason | At |
|---|---|---|---|
| review | 1 | fix-first: plan/plan.md T2 does not test AC-3 plain-rm checkpoint behavior and its red proof asks Apply to revert/reapply T1; add both deletion-mode scenarios and run the git-rm case before T1. | 2026-07-27T01:24:01.115Z |
| review | 2 | fix-first: plan T1 does not establish the immutable baseline required by delete-intent artifact validation; specify a baseline-seeded Plan fixture or an explicit prior-attempt lifecycle. | 2026-07-27T01:41:43.085Z |

## Top errors
| Code | Count | Sample message |
|---|---|---|
| INVALID_ARGUMENT | 4 | actor must be a non-empty string. |
| CHANGE_CONFLICT | 1 | Checkpoint has undeclared worktree paths: .codepatrol/changes/2026-07-27-checkpoint-delete-artifact-add-fix/review/report.md. |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 2217273 |
| review | 1949603 |
| apply | 346646 |
| verify | 177912 |
| close | 25970 |

## Artifact stats
- Files: 8
- Total bytes: 71171

## Recommendations
- Review stage returned 2+ times — surface the top review defects to the next Plan and consider a pre-Review `assess-change` precondition.
- Top error code: INVALID_ARGUMENT (4). Investigate the first occurrence's args and stage context.
- Command "change.session" was invoked 49 times — consider caching or batching repeated invocations.
