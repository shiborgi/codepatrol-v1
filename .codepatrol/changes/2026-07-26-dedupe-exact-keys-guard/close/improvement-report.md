# Improvement report

## Summary
Change `2026-07-26-dedupe-exact-keys-guard` recorded 141 trace entries, 1 stage return, and 2 unique error codes.

## Per-stage attempts
| Stage | Attempts | Returns | Checkpoints |
|---|---|---|---|
| plan | 2 | 0 | 2 |
| review | 2 | 1 | 2 |
| apply | 1 | 0 | 1 |
| verify | 1 | 0 | 1 |
| close | 1 | 0 | 0 |

## Returns
| Stage | Attempt | Reason | At |
|---|---|---|---|
| review | 1 | fix-first: Plan evidence undercounted the duplicated exact-keys idiom (claimed 9 sites/5 files, actual 10 pure sites/5 files) by missing usage.ts:28 and :33, both inside validateRun (the same function T6 already opens). AC-3 as written cannot pass after T6 as scoped -- re-ran the exact AC-3/T7-step-1 grep against the current tree and both missed sites are present. Design, wrapper approach, and DC-1/DC-2 deferrals are unaffected; T6 needs two more assertExactKeys call-site replacements in the same file, and spec.md evidence/AC-3 counts need correcting. | 2026-07-26T16:15:37.296Z |

## Top errors
| Code | Count | Sample message |
|---|---|---|
| INVALID_ARGUMENT | 6 | Session stage must be one of plan, review, apply, verify, close; got (missing). Run `codepatrol change inspect --id 2026-07-26-dedupe-exact-keys-guard` to read the current stage and attempt. |
| CHANGE_CONFLICT | 1 | Checkpoint has undeclared worktree paths: .codepatrol/changes/2026-07-26-dedupe-exact-keys-guard/review/report.md, kanban.md. |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 18428503 |
| review | 17964455 |
| apply | 6389677 |
| verify | 83479 |
| close | 28612 |

## Artifact stats
- Files: 8
- Total bytes: 64215

## Recommendations
- Top error code: INVALID_ARGUMENT (6). Investigate the first occurrence's args and stage context.
- Command "change.session" was invoked 43 times — consider caching or batching repeated invocations.
- Session item(s) claimed but never closed: review/1/report, review/2/report. A harness stopped mid-stage; re-prime the session to resume.
