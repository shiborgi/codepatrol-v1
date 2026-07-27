# Improvement report

## Summary
Change `2026-07-27-local-close-squash-remote-sync` recorded 432 trace entries, 8 stage returns, and 2 unique error codes.

## Per-stage attempts
| Stage | Attempts | Returns | Checkpoints |
|---|---|---|---|
| plan | 8 | 0 | 8 |
| review | 8 | 7 | 8 |
| apply | 2 | 0 | 2 |
| verify | 2 | 1 | 2 |
| close | 1 | 0 | 0 |

## Returns
| Stage | Attempt | Reason | At |
|---|---|---|---|
| review | 1 | fix-first: (major) T2 step 2 keeps closeWork's `else if (checkedOutHead !== terminalCommit) throw TARGET_ADVANCED` guard, which is correct for fast-forward but wrong for squash -- after a squash the target head is neither base_commit nor terminalCommit, so a recovery re-run throws TARGET_ADVANCED, the exact outcome the instruction's own rationale claims to prevent. Verified by simulation; T2 step 3 already applies the correct tree-equality fix to completeFinalization, so the plan contradicts itself. No AC covers Close re-entrancy, and the shipped test git.test.ts:266 already exercises that re-run path. (major) T3 omits three assertion updates that same test requires: FailAfterMergeGit overrides mergeFf which closeWork no longer calls, the `HEAD === terminalCommit` assertion is false under squash, and the branch-deleted equality assertion must be inverted; T3's predicted 219 count cannot hold. (minor) spec Outcome justifies branch retention as a lineage anchor while evidence section 3 states the tag alone already suffices -- Alternatives reveals the real purpose is checkout-ability, and DC-1's cost/benefit is unassessable until that is stated. Design, scope and DC-2/DC-3 are sound; corrections are mechanical and confined to T2, T3 and two spec sections. See review/report.md, whose Residual concerns also record the verified constraint for the user's newly stated local-branch-deletion requirement. | 2026-07-27T02:40:46.276Z |
| review | 2 | fix-first: Plan both forbids and requires sync --prune-closed, and leaves the sync target/branches/issues selector flags and defaults undecided; define one executable CLI contract. | 2026-07-27T02:53:06.541Z |
| review | 3 | fix-first: AC-6 promises zero remote calls for sync --dry-run, but the required unchanged syncIssues delegation always performs gh availability/list reads; choose and test one compatible contract. | 2026-07-27T03:02:04.838Z |
| review | 4 | fix-first: remove stale commit+push Close affordances and add/wire the GitAdapter override required for deterministic sync CLI tests. | 2026-07-27T03:11:40.442Z |
| review | 5 | fix-first: define deterministic target selection for sync --target and test each supported invocation context. | 2026-07-27T03:22:16.761Z |
| review | 6 | fix-first: target resolution must accept shared target branches and test normal main use with multiple Change records. | 2026-07-27T03:32:02.853Z |
| review | 7 | fix-first: validate --target-branch as a safe branch name and reject refspec/deletion syntax before git.push. | 2026-07-27T03:38:21.127Z |
| verify | 1 | AC-10 fails: sync pruning compares short refs with refs/heads/codepatrol/, so an eligible terminal branch is never deleted. Add pruning, Change-branch target-resolution, and injected CLI sync coverage. | 2026-07-27T10:52:46.019Z |

## Top errors
| Code | Count | Sample message |
|---|---|---|
| CHANGE_CONFLICT | 8 | Session item is not ready: plan — blocked by spec (open). |
| CHANGE_INVALID | 2 | Run timestamps and elapsed_ms must agree. |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 5245425 |
| review | 4563903 |
| apply | 31672577 |
| verify | 13092350 |
| close | 22321 |

## Artifact stats
- Files: 8
- Total bytes: 149986

## Recommendations
- Review stage returned 2+ times — surface the top review defects to the next Plan and consider a pre-Review `assess-change` precondition.
- Top error code: CHANGE_CONFLICT (8). Investigate the first occurrence's args and stage context.
- Command "change.session" was invoked 133 times — consider caching or batching repeated invocations.
- Session item(s) claimed but never closed: review/1/report, verify/2/report. A harness stopped mid-stage; re-prime the session to resume.
