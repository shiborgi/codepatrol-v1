# Improvement report

## Summary
Change `2026-07-24-backlog-subsystem` recorded 165 trace entries, 3 stage returns, and 5 unique error codes.

## Per-stage attempts
| Stage | Attempts | Returns | Checkpoints |
|---|---|---|---|
| plan | 2 | 0 | 2 |
| review | 2 | 1 | 2 |
| apply | 3 | 0 | 3 |
| verify | 3 | 2 | 3 |
| close | 1 | 0 | 0 |

## Returns
| Stage | Attempt | Reason | At |
|---|---|---|---|
| review | 1 | fix-first (major plan/executability): the Kanban has two production render paths — codepatrol status (src/cli/commands.ts:54, projectKanban+renderKanbanMarkdown) and scripts/render-kanban.mjs — but AC-6 (spec.md:135) names only the script, and T7 (plan.md:207-212) declares only board.ts/board.test.ts and falsely claims 'disjoint from T3-T6 files'. To keep projectKanban pure, BOTH callers must pass readBacklog(workspace).items; the status call site is src/cli/commands.ts, which T6 (next case) also edits, so T7 must add commands.ts to its Files and depend on T6 (not disjoint). Literal execution would ship the primary codepatrol-status Kanban with an empty/absent Backlog column and collide T6/T7 on commands.ts. Fix: widen AC-6 to assert both render paths; add the status case to T7's files; make T7 depend on T6. Kanban architecture (KanbanRow.backlog cell, workId linkage, backlog-only rows) needs no re-derivation; AC-1..AC-5 and AC-7 are red-capable and the governing-doc amendment (T1) resolves the prior rework. See review/report.md. | 2026-07-25T01:22:43.771Z |
| verify | 1 | Implementation defect (major, conformance): .codepatrol/backlog/items.yaml is written by writeBacklog() via atomicWriteFile only and is never git-added/committed by any code path (backlog add CLI, the Close hook at orchestrator.ts:405-411, or change start's linkBacklogItem call at orchestrator.ts:185). This directly contradicts the T1-amended governing docs' explicit claim that the file is "tracked" (AGENTS.md:17-18, docs/runtime-state.md:27-31), which deliberately contrasts it with the gitignored, rebuildable .codepatrol/runtime/. Worse, orchestrator.ts:25's parseStatusPaths -- the single choke point every clean-worktree pre/postcondition uses (change start's check at :169, Close's postcondition at :439) -- was edited to add !path.startsWith(".codepatrol/backlog/"), so the tooling actively hides the resulting untracked/dirty state instead of committing it. Reproduced live in two scratch repos: `backlog add` leaves `?? .codepatrol/` in `git status`; a full `change start --backlogItemId` (which does commit the change record via commitMetadata) still leaves `?? .codepatrol/backlog/` afterward. Risk: an operator trusting Codepatrol's own clean-tree signals could run `git clean -fd` and permanently lose the backlog, and no clone/worktree/CI ever receives any backlog item across the life of the repo. Required correction: make at least one write path (most naturally Close's existing terminal commit at orchestrator.ts:412's pathsToCommit, mirroring how reportPath is conditionally added) actually stage and commit .codepatrol/backlog/items.yaml, instead of only teaching parseStatusPaths to ignore it. Minor secondary note (non-blocking, optional to fold in): spec.md AC-6 says `codepatrol status --format markdown`, but the CLI's global --format only accepts text|json (src/cli/args.ts:95); the AC's substance is already satisfied because status's default/text output is markdown-shaped and matches scripts/render-kanban.mjs's output, verified live -- this is pre-existing spec phrasing, not something Apply introduced, and only needs a wording fix. Full detail, re-executed AC-1..AC-8 evidence, and blast-radius audit in verify/report.md. | 2026-07-25T02:37:44.391Z |
| verify | 2 | Regression (critical, newly introduced by this attempt's Finding-1 fix): reverting parseStatusPaths' .codepatrol/backlog/ exemption (correctly, to fix Close's silent-untracked-file bug) was not paired with equivalent commit handling for the other two backlog write paths -- change start's linkBacklogItem call (orchestrator.ts:185, used by AC-5's backlogItemId flow) and the standalone `backlog add` CLI (the exact command skills/codepatrol-plan/SKILL.md:33's own T8 instruction tells Plan to run for split follow-ups). apply/journal.md's T1B section claims 'every other code path that calls parseStatusPaths is unaffected' -- this is false for these two paths. Reproduced live in two throwaway scratch repos whose .gitignore matches this project's real .gitignore (does not exempt .codepatrol/backlog/): (1) committed a candidate item, ran `change start --backlogItemId <id>`, then submitted a Plan checkpoint transition -> failed with `CHANGE_CONFLICT: Checkpoint has undeclared worktree paths: .codepatrol/backlog/items.yaml`; (2) started a fresh Change, called `codepatrol backlog add` with source.kind=plan-followup (T8's own instructed workflow), then submitted the same Plan checkpoint -> identical failure. Root cause of the test-suite blind spot: src/change/start-backlog-link.test.ts's initRepo helper gitignores .codepatrol/backlog/ in its scratch repo (unlike the real project), so none of its 4 cases nor any of the 173 passing tests exercises a Plan checkpoint after a real non-gitignored backlog write -- the exact interaction this attempt's parseStatusPaths revert reintroduced. Full transcripts and both exact error strings are in verify/report.md. | 2026-07-25T03:03:29.348Z |

## Top errors
| Code | Count | Sample message |
|---|---|---|
| INVALID_ARGUMENT | 8 | Transition input is not valid JSON. |
| CHANGE_CONFLICT | 6 | Checkpoint has undeclared worktree paths: .codepatrol/changes/2026-07-24-backlog-subsystem/review/report.md. |
| CHANGE_DRIFT | 3 | Artifact is not owned by apply: .codepatrol/changes/2026-07-24-backlog-subsystem/verify/report.md |
| CHANGE_INVALID | 2 | CHANGE_INVALID: Run is not for the current active attempt. |
| CHANGE_NOT_FOUND | 1 | Change not found: 2026-07-24-backlog-subsystem. |

## Elapsed per stage
| Stage | Elapsed (ms) |
|---|---|
| plan | 1790278 |
| review | 1395636 |
| apply | 14665874 |
| verify | 28522140 |
| close | 23737 |

## Artifact stats
- Files: 8
- Total bytes: 123013

## Recommendations
- Top error code: INVALID_ARGUMENT (8). Investigate the first occurrence's args and stage context.
- Command "change.transition" was invoked 52 times — consider caching or batching repeated invocations.
