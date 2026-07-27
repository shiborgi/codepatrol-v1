# Improvement report

## Summary
Change `2026-07-27-trace-path-workspace-containment` recorded 121 trace entries, 2 stage returns, and 3 unique error codes.

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
| review | 1 | fix-first: T1 uses resolveInside(workspace, RUNTIME_DIR/traces/workId.jsonl), which enforces only workspace containment and accepts the Plan AC-1 input ../../escape-marker as .codepatrol/escape-marker.jsonl. Re-plan tracePath to prove containment relative to the traces root and correct plan/plan.md line 101 whitespace. | 2026-07-27T18:21:16.333Z |
| review | 2 | fix-first: revision 2 only compares lexical tracesRoot/candidate paths. A workId traversing an existing symlink inside runtime/traces to another workspace-contained directory passes resolveInside and relative(), then writes outside the traces subtree. Re-plan canonical traces-root containment or reject nested workId path segments, and add a symlink red/green fixture. | 2026-07-27T18:45:20.633Z |

## Top errors
| Code | Count | Sample message |
|---|---|---|
| CHANGE_INVALID | 2 | CHANGE_INVALID: Cannot begin plan attempt 1. |
| CHANGE_CONFLICT | 1 | Checkpoint has undeclared worktree paths: .codepatrol/changes/2026-07-27-trace-path-workspace-containment/review/report.md. |
| INVALID_ARGUMENT | 1 | Close contains unknown field action. |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 3014847 |
| review | 3332025 |
| apply | 397871 |
| verify | 173220 |
| close | 38458 |

## Artifact stats
- Files: 8
- Total bytes: 76787

## Recommendations
- Review stage returned 2+ times — surface the top review defects to the next Plan and consider a pre-Review `assess-change` precondition.
- Top error code: CHANGE_INVALID (2). Investigate the first occurrence's args and stage context.
- Command "change.transition" was invoked 28 times — consider caching or batching repeated invocations.
- Session item(s) claimed but never closed: plan/1/evidence. A harness stopped mid-stage; re-prime the session to resume.
