# Improvement report

## Summary
Change `2026-07-27-persona-checkpoint-artifact-validation` recorded 106 trace entries, 2 stage returns, and 0 unique error codes.

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
| review | 1 | fix-first: replace Plan baseline 5698a92330832ecf0b991892dd5c9a82c897bff4 with immutable Change base 08a43e5e85f5c617ba4d4b0d7abc89e6f7f03d85; reconcile spec/plan expected surface and T3 diff assertion to consistently declare src/change/change.test.ts alongside validation.ts, orchestrator.ts, and orchestrator-parallel.test.ts. | 2026-07-27T20:20:03.420Z |
| review | 2 | fix-first: move validateWorkspaceArtifacts signature/threading from validation.ts instructions to its actual owner src/change/orchestrator.ts; revise T1/T2 file ownership and dependency order while retaining validation.ts changes only for shared validator functions. | 2026-07-27T20:48:14.427Z |

## Top errors
None.

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 3047948 |
| review | 2631016 |
| apply | 389184 |
| verify | 100576 |
| close | 15587 |

## Artifact stats
- Files: 8
- Total bytes: 74774

## Recommendations
- Review stage returned 2+ times — surface the top review defects to the next Plan and consider a pre-Review `assess-change` precondition.
- Command "change.transition" was invoked 25 times — consider caching or batching repeated invocations.
- Session item(s) claimed but never closed: plan/1/evidence. A harness stopped mid-stage; re-prime the session to resume.
