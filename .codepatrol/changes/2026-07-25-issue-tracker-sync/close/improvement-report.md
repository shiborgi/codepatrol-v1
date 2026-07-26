# Improvement report

## Summary
Change `2026-07-25-issue-tracker-sync` recorded 128 trace entries, 1 stage return, and 4 unique error codes.

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
| review | 1 | fix-first: spec is contract-complete and verified, but plan.md carries two bounded execution defects. (1) T1 red unit-test assertion is inverted — upsertBacklogItem with {kind:github-issue} (no workId) throws CHANGE_INVALID today (invalid kind) yet becomes valid after T1, so the assertion is green-before/red-after and can never reach the documented green; correct it to assert that PROVIDING workId to a github-issue source throws. (2) T2 NodeGhAdapter does not anchor gh to workspace — spec mandates mirroring NodeGitAdapter exactly (constructor takes workspace, run passes cwd:this.workspace per git.ts:33-36), but the T2 code sample uses a no-arg constructor and omits cwd, so gh runs against process.cwd() and silently misbehaves for any --workspace invocation; FakeGhAdapter-only tests cannot detect this. Corrections are plan-only; no AC, interface, scope, or spec change. | 2026-07-25T22:02:04.754Z |

## Top errors
| Code | Count | Sample message |
|---|---|---|
| CHANGE_CONFLICT | 2 | Checkpoint has undeclared worktree paths: .codepatrol/changes/2026-07-25-issue-tracker-sync/review/report.md. |
| INVALID_ARGUMENT | 2 | Only Apply may declare production changes. |
| CHANGE_DRIFT | 1 | Create path existed at the recorded baseline: .codepatrol/changes/2026-07-25-issue-tracker-sync/plan/spec.md
Create path existed at the recorded baseline: .codepatrol/changes/2026-07-25-issue-tracker-sync/plan/plan.md
Create path existed at the recorded baseline: .codepatrol/changes/2026-07-25-issue-tracker-sync/plan/evidence/investigation.md |
| INVALID_WORKSPACE | 1 | Path must be workspace-relative: /var/folders/_8/2y0gm8p54w9dmh539_0cq2x80000gn/T/opencode/checkpoint-input.json |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 2823332 |
| review | 1939124 |
| apply | 853612 |
| verify | 220119 |
| close | 7878 |

## Artifact stats
- Files: 8
- Total bytes: 115106

## Recommendations
- Top error code: CHANGE_CONFLICT (2). Investigate the first occurrence's args and stage context.
- Command "change.session" was invoked 37 times — consider caching or batching repeated invocations.
