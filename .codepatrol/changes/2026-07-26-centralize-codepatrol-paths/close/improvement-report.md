# Improvement report

## Summary
Change `2026-07-26-centralize-codepatrol-paths` recorded 79 trace entries, 0 stage returns, and 0 unique error codes.

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
None.

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 533540 |
| review | 214703 |
| apply | 763958 |
| verify | 205410 |
| close | 16161 |

## Artifact stats
- Files: 8
- Total bytes: 78977

## Recommendations
- Command "change.session" was invoked 24 times — consider caching or batching repeated invocations.
- Session item(s) claimed but never closed: review/1/report, verify/1/report. A harness stopped mid-stage; re-prime the session to resume.
