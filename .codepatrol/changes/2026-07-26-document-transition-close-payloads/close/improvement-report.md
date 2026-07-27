# Improvement report

## Summary
Change `2026-07-26-document-transition-close-payloads` recorded 161 trace entries, 2 stage returns, and 2 unique error codes.

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
| review | 1 | fix-first: T1 omits accepted optional checkpoint/return fields despite AC-1 field-completeness, and Scope conflicts with T1/T2 on insertion location; see review/report.md. | 2026-07-26T23:35:29.599Z |
| review | 2 | fix-first: T1/T2's outer ```markdown wrapper around nested same-length ```json fences self-terminates early under CommonMark (a bare closing ``` line closes the length-3 outer fence at the first inner example, not at the intended end), shipping broken/garbled Markdown in skills/_shared/CODEPATROL-CLI.md -- contradicts the real session.json precedent (no wrapper, verified by direct read of lines 23-38) and is uncaught by AC-4 (lint:skills checks catalog/frontmatter/links only) or AC-5 (field-text presence only, not render structure). Both of attempt 1's findings are confirmed genuinely fixed; design unaffected. Fix: remove the outer wrapper in T1 and T2, present prose/table/JSON examples flat at top level matching session.json's real structure; also reconcile spec.md's stale ~70 vs ~90 line-count inconsistency (minor). See review/report.md. | 2026-07-27T00:02:13.743Z |

## Top errors
| Code | Count | Sample message |
|---|---|---|
| CHANGE_INVALID | 1 | CHANGE_INVALID: Cannot begin plan attempt 1. |
| CHANGE_CONFLICT | 1 | Checkpoint has undeclared worktree paths: .codepatrol/changes/2026-07-26-document-transition-close-payloads/review/report.md. |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 2741443 |
| review | 2612946 |
| apply | 174945 |
| verify | 101622 |
| close | 15009 |

## Artifact stats
- Files: 8
- Total bytes: 62299

## Recommendations
- Review stage returned 2+ times — surface the top review defects to the next Plan and consider a pre-Review `assess-change` precondition.
- Top error code: CHANGE_INVALID (1). Investigate the first occurrence's args and stage context.
- Command "change.session" was invoked 49 times — consider caching or batching repeated invocations.
- Session item(s) claimed but never closed: review/2/report. A harness stopped mid-stage; re-prime the session to resume.
