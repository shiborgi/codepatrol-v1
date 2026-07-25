# Investigation — Scope every lifecycle bookkeeping commit to its own intended paths

- Work id: `2026-07-25-commit-scoping`
- Baseline: `main` @ `bcaa3c2bc5055cd5daa70f54210197adcc130f6b`; clean worktree; graph synced (70 files, 1814 symbols).
- Origin: backlog item `top-error-code-operation-failed-investigate-the-first-occurrence-s-args-and-stage-context` (p1, workflow), auto-fed by `2026-07-25-docs-consolidation`'s Close (`close-trace`).

## The backlog item's literal ask, and why it can't be answered literally

`.codepatrol/docs/improvement-reports/2026-07-25-docs-consolidation.md`'s Top errors table: `OPERATION_FAILED` count 6, sample message `fatal: pathspec 'docs/codepatrol/assessments/2026-07-24-architecture-v2.md' did not match any files`. The recommendation asks to "investigate the first occurrence's args and stage context." The underlying per-event trace (`.codepatrol/runtime/traces/2026-07-25-docs-consolidation.jsonl`) that would carry that detail is deleted by Close by design (`trace.close(workspace, workId)`, `orchestrator.ts:420`, confirmed ephemeral/rebuildable per `docs/runtime-state.md`) — so for an already-closed Change, per-occurrence args/stage context are **not recoverable** from any durable artifact. This investigation instead root-causes the error from first-hand evidence: this session was the actor that produced it (documented in `.codepatrol/changes/2026-07-25-docs-consolidation/apply/journal.md`'s Notes section and `verify/report.md`'s Git/ref safety section, both git-tracked and durable).

## First-hand incident reconstruction

During `2026-07-25-docs-consolidation`'s Apply, T3 deleted two tracked files via `git rm` (a command that both deletes on disk **and stages the deletion**), run directly via the shell rather than through any Codepatrol command. The very next `codepatrol change transition` call (a `"usage"` event, unrelated to those files) triggered `commitMetadata()` (`src/change/orchestrator.ts:95-98`), which runs a bare `git commit` with no path restriction — the two already-staged file deletions were silently swept into that unrelated "usage apply" bookkeeping commit. The subsequent Apply checkpoint transition's own `git.add([...changes])` step (`orchestrator.ts:289`) then failed with exactly the recorded `OPERATION_FAILED`/pathspec error, because those two paths were by then already fully committed and absent — `git add` had nothing left to stage for them. Confidence: high (git history read directly: `git log --oneline` on the closed branch's history via `git show --stat <commit>` showed the two deletions bundled into a `"usage apply"` commit; the durable journal documents the same root cause; reproduced and fixed live in that session before Verify/Close).

## Exhaustive site audit — every commit call site in the codebase

`grep -rn "\.commit(" src/ scripts/ --include="*.ts" --include="*.mjs"` excluding `*.test.ts` → exactly 4 production call sites, all in `src/change/orchestrator.ts`, all in `NodeGitAdapter.commit()`'s single implementation:

| Site | Line | Pre-commit guard against unrelated staged content? |
|---|---|---|
| `commitMetadata()` (shared by `begin`/`usage`/`return`/`block`/`resume` transitions via `:305`, `change start` via `:190`, and transition-recovery via `:227`) | `:95-98` | **No**, for `begin`/`usage`/`return`/`block`/`resume` — the `"checkpoint"` intent type has an extensive pre-commit dirty-path audit (`:264-270`), but the sibling `else if` branches for every other transition type (`:294` onward) build their event and fall straight through to `commitMetadata()` with no equivalent check. This is the exact gap the incident exploited. |
| Close receipt commit | `:400` | Partial — `:395`'s `if (statusPaths.some((path) => path !== receiptPath)) throw CHANGE_CONFLICT` runs immediately before, so an already-dirty tree is caught **before** this specific commit — but nothing prevents something becoming staged in the narrow window between that check and the `git.add`+`git.commit` two lines later (defense-in-depth gap, not the exploited one). |
| Close terminal commit | `:418` | No direct guard on `pathsToCommit` beyond it being a locally-curated array; anything else staged at commit time would still be silently included. |
| Checkpoint commit (Plan/Review/Apply/Verify) | `:289-290` | **Self-defending already**: `:266-270` computes `unexpected`/`actualProduction` vs `declaredProduction` **before** committing and throws `CHANGE_CONFLICT` on any undeclared dirty/committed path; **and** `:291-292` re-validates **after** committing (`finalDelta`/`unexpectedFinal`/`finalProduction`) and throws if the commit doesn't match. A leak here would be caught, not silently accepted — this path was never the one that failed in the incident. |

`GitAdapter` interface (`src/change/git.ts:7-30`) has exactly one production implementation, `NodeGitAdapter` (`:32`); test doubles (`FailAfterCheckoutGit`, `FailAfterMergeGit`, `FailInitialCommitGit`, `CoordinatedStartGit` in `git.test.ts:32-`) all `extend NodeGitAdapter`, overriding unrelated methods (or, for `FailInitialCommitGit`, overriding `commit()` with a zero-argument stub that ignores all parameters and always throws) — none declares an incompatible `commit()` signature, so adding an optional parameter to the interface is backward-compatible with every existing override. Confidence: high (read in full).

`NodeGitAdapter.add()` (`git.ts:75`) already uses the pathspec-restricted form `["add", "--", ...paths]`; `unstage()` (`:76`) uses `["rm", "--cached", "--ignore-unmatch", "--", ...paths]`. `commit()` (`:77-80`) is the one method in this file that does **not** follow this existing pathspec convention: `["-c", ..., "commit", ...(allowEmpty ? [...] : []), "-m", message]` — no `-- <paths>` tail. Confidence: high (read).

## Design precedent: `git commit -- <pathspec>` semantics

`git commit [options] [--] [<pathspec>...]`, when given a pathspec, commits **only** the currently-staged changes matching that pathspec; changes staged outside it remain staged, untouched, available for a later commit — the file is neither lost nor silently included. This is standard, documented Git behavior, not a Codepatrol-specific mechanism. Combined with `--allow-empty` (used by the checkpoint commit for personas with zero staged content), the two compose correctly: `git commit --allow-empty -m <msg> -- <paths>` commits only `<paths>`' staged changes, or an empty commit if none exist, regardless of what else is staged elsewhere in the index.

## Regression-test precedent already in the codebase

`git.test.ts:185-194`'s `"repeating an interrupted transition commits the pending event exactly once"` already exercises `commitMetadata()`'s recovery path with `run(workspace, ["status", "--porcelain"])` assertions before/after a transition — the exact helper shape (`run()`, `startChange`, `transitionChange`, `at()`) this Change's new regression test reuses to reproduce the incident class directly (stage an unrelated file, trigger a `commitMetadata`-driven transition, assert the unrelated file is excluded from the resulting commit and remains staged).

## Alternatives considered and rejected during investigation

- **Add an explicit "assert clean before commit" pre-check at each vulnerable call site** (mirroring the existing `:395` receipt-commit guard) — rejected as the chosen fix: more invasive (new throw paths, new error messages to design and test at 3+ sites), and any *future* call site added to this codebase wouldn't automatically inherit the protection. Pathspec-restriction fixes the vulnerability class at its single source (`NodeGitAdapter.commit()`), immune to future call sites forgetting a guard.
- **`git reset` (unstage everything) immediately before each intended `git add`+`git commit` pair** — rejected: destructive to any *other* legitimately-staged-but-not-yet-committed content (worse than the bug being fixed, since pathspec-restriction preserves such content for a later commit instead of discarding it).
