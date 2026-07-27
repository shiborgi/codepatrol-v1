# Improvement report

## Summary
Change `2026-07-27-plan-self-consistency-check` recorded 112 trace entries, 1 stage return, and 2 unique error codes.

## Per-stage attempts
| Stage | Attempts | Returns | Checkpoints |
|---|---|---|---|
| plan | 1 | 0 | 1 |
| review | 1 | 0 | 1 |
| apply | 2 | 0 | 2 |
| verify | 2 | 1 | 2 |
| close | 1 | 0 | 0 |

## Returns
| Stage | Attempt | Reason | At |
|---|---|---|---|
| verify | 1 | Candidate fails git diff --check: apply/journal.md line 19 has trailing whitespace. Remove it, rerun git diff --check and focused skill lint, then checkpoint a clean candidate. | 2026-07-27T00:50:16.549Z |

## Top errors
| Code | Count | Sample message |
|---|---|---|
| CHANGE_CONFLICT | 5 | Session item is not claimed: T2. |
| CHANGE_DRIFT | 1 | Create path existed at the recorded baseline: .codepatrol/changes/2026-07-27-plan-self-consistency-check/apply/journal.md |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 201929 |
| review | 57472 |
| apply | 1011970 |
| verify | 852597 |
| close | 14786 |

## Artifact stats
- Files: 8
- Total bytes: 42009

## Recommendations
- Top error code: CHANGE_CONFLICT (5). Investigate the first occurrence's args and stage context.
- Command "change.session" was invoked 27 times — consider caching or batching repeated invocations.
