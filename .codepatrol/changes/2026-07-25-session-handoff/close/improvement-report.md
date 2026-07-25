# Improvement report

## Summary
Change `2026-07-25-session-handoff` recorded 137 trace entries, 2 stage returns, and 5 unique error codes.

## Per-stage attempts
| Stage | Attempts | Returns | Checkpoints |
|---|---|---|---|
| plan | 3 | 0 | 3 |
| review | 3 | 0 | 3 |
| apply | 3 | 2 | 3 |
| verify | 1 | 0 | 1 |
| close | 1 | 0 | 0 |

## Returns
| Stage | Attempt | Reason | At |
|---|---|---|---|
| apply | 1 | Contract defect (blocking, found before any mutation): the accepted plan.md cannot be consumed by the shipped Apply-session derivation, so Apply cannot even prime its Stage Session. `codepatrol change session --action prime` fails with `CHANGE_INVALID: Session item T3 has invalid dependency T3`. Root cause is deriveItems' dependency parser at src/change/session.ts:58, which extracts every /\bT\d+\b/ token from the `**Depends on:**` line, and TWO plan.md lines trip it. (1) BLOCKING, plan.md:122 -- T3's line reads `T2 (same file, session.ts; sequenced. trace.ts and improvement-report.ts are T3-exclusive.)`; the trailing phrase `T3-exclusive` parses as a dependency, giving T3 a self-dependency, which validate() correctly rejects. (2) SILENT AND WORSE, plan.md:155 -- T4's line reads `None (docs/skills only; file-disjoint from T1-T3)`; the None-guard on the same line tests /^(none|nothing)$/i against the whole trimmed line, which is not exactly `None`, so the guard misses and T1 plus T3 are extracted as dependencies. T4 is declared file-disjoint and runnable at any point, but would derive as blocked until T1 and T3 close. That produces no error at all -- just a silently wrong todo list, which is precisely the failure class this Change exists to eliminate. Verified by reproducing both parses directly against the two literal lines. No production code was touched; the tree is clean. Apply must not edit plan/ artifacts, and the fix involves a design decision that belongs to Plan: whether to (a) only reword the two prose lines so they parse correctly, or (b) additionally harden deriveItems -- filter self-references (dep !== item.id) and anchor the None-guard to the leading token rather than the whole line -- as declared scope. Recommendation: do both, and fold (b) into T1/T2, which already own src/change/session.ts and already own this exact function; the parser fragility is in scope by construction, it is a live example of the defect class in spec.md's Problem statement, and it should carry its own AC plus a red-capable test using these two literal lines as the fixture. Also update plan.md's own prose so the plan is self-consistently parseable by the mechanism it ships. | 2026-07-25T16:47:02.410Z |
| apply | 2 | Contract defect (blocking, found before production mutation): T6 step 3 hardcodes a Stage Session rebuild for apply attempt 1, but the current accepted Apply attempt is 2 after Apply attempt 1 returned. The literal accepted input fails with CHANGE_CONFLICT: Session apply/1 is not the current attempt. Required correction: change the rehearsal input to attempt 2 (or explicitly use the projected current Apply attempt) and keep the rehearsal scoped to that current attempt. No source or stage artifact was edited; the tracked tree is clean. | 2026-07-25T17:10:09.933Z |

## Top errors
| Code | Count | Sample message |
|---|---|---|
| INVALID_ARGUMENT | 3 | type must be a non-empty string. |
| INVALID_WORKSPACE | 1 | Path must be workspace-relative: /var/folders/_8/2y0gm8p54w9dmh539_0cq2x80000gn/T/opencode/transition.json |
| CHANGE_INVALID | 1 | Session item T3 has invalid dependency T3. |
| CHANGE_DRIFT | 1 | Create path existed at the recorded baseline: .codepatrol/changes/2026-07-25-session-handoff/review/report.md |
| CHANGE_CONFLICT | 1 | Session apply/1 is not the current attempt. |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 2791561 |
| review | 2246699 |
| apply | 4638840 |
| verify | 317471 |
| close | 20269 |

## Artifact stats
- Files: 8
- Total bytes: 124348

## Recommendations
- Top error code: INVALID_ARGUMENT (3). Investigate the first occurrence's args and stage context.
- Command "change.transition" was invoked 36 times — consider caching or batching repeated invocations.
