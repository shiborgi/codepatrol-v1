# Improvement report

## Summary
Change `2026-07-27-src-architecture-audit` recorded 107 trace entries, 0 stage returns, and 2 unique error codes.

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
| INVALID_ARGUMENT | 8 | Session stage must be one of plan, review, apply, verify, close; got (missing). Run `codepatrol change inspect --id 2026-07-27-src-architecture-audit` to read the current stage and attempt. |
| CHANGE_INVALID | 2 | Run contains unknown field startedAt. |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 1139189 |
| review | 510760 |
| apply | 622705 |
| verify | 234747 |
| close | 82579 |

## Artifact stats
- Files: 8
- Total bytes: 70770

## Recommendations
- Top error code: INVALID_ARGUMENT (8). Investigate the first occurrence's args and stage context.
- Command "change.session" was invoked 26 times — consider caching or batching repeated invocations.
- Session item(s) claimed but never closed: close/1/close-work, review/1/report, verify/1/report. A harness stopped mid-stage; re-prime the session to resume.
