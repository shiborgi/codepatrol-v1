# Apply journal

## T1 — squash primitive

- Added `mergeSquash` to `GitAdapter` and `NodeGitAdapter` in `src/change/git.ts`.
- `npm run typecheck` and `npm test` (217/217) pass; no call site changed.

## T2 — squash and retention

- Replaced `closeWork`'s fast-forward with `mergeSquash` followed by a tree-identity assertion; removed the `deleteBranch` call for the commit outcome.
- `completeFinalization`'s commit outcome now treats tree equality against the terminal tag as the completed state.
- The expected regression in `git.test.ts:266` ("commit finalization fast-forwards the unchanged target") failed as planned (its `mergeFf` override no longer fires; assertions need rewriting in T3).

## T3 — close-semantics tests

- Retargeted the recovery test at `mergeSquash` (`FailAfterSquashGit`) and rewrote its post-squash assertions to match the new tree-equality contract (AC-1, AC-2, AC-3, AC-9).
- Added `close commit rejects a corrupted squash whose tree does not match the terminal tag` using `NoOpMergeSquashGit` to deliberately stage different content before the assertion fails.
- `git.test.ts` runs 18/18; the broader suite is re-checked at T9.

## T4 — inspection dedupe

- Added a `validatedHeads` set inside `inspectChanges` that skips `validateCheckpointLineage` + `validateAcceptedRefArtifacts` when the same head SHA was already validated in the current call.
- Added `inspect validates each resolved head at most once when branch and tag share one commit`, a counting `isAncestor` adapter that proves the dedupe runs once for the retained branch + terminal tag pair and continues to validate after pruning.
- `git.test.ts` runs 19/19.

## T5 — remove push from Close

- Removed `push` from `CloseInput`, `pushError`/`pushSuggestion` from `CloseResult`, the push call in `closeChangeLocked`, and the suggestion text in `commands.ts`.
- `closeOptions` and `Close options` text now read `commit, rollback`.
- Repurposed `close-push.test.ts` into `close performs no remote action`: rejects input carrying `push` and asserts `git.push` is never invoked during a commit close.
- All targeted tests pass.

## T6 — sync module

- Created `src/change/sync.ts` with `syncRemote(workspace, options)` implementing target-branch resolution (override / `codepatrol/<id>` / `main` as known target), `branches` push over `refs/heads/codepatrol/*` and `refs/tags/codepatrol/*`, `issues` delegation to `syncIssues`, and opt-in `pruneClosed` after a successful push for terminal Changes only.
- `--target-branch` validates via the existing safe branch grammar before any `git.push`, rejecting refspecs/deletions/unsafe names with `INVALID_ARGUMENT`.
- `dryRun` suppresses every remote mutation (`git.push`, `git.deleteBranch`); the `gh` reads `assertAvailable`/`listIssues` still fire because `syncIssues` is reused unchanged.
- `src/change/sync.test.ts` covers (a) refspec/unsafe rejection, (b) explicit-target push, (c) dry-run mutation suppression, and (d) branch+tag refs under `dryRun`. All 4 cases pass.

## T7 — CLI wiring for sync

- Added the four new boolean flags (`--target`, `--branches`, `--issues`, `--prune-closed`) and `--target-branch` to `args.ts`, plus the `sync` entry in `COMMAND_OPTIONS`; threaded them through `ParsedArgs`.
- Added `git?: GitAdapter` to `CommandOverrides` and imported `GitAdapter` from `../change/git.js`; the new `sync` case threads `overrides.git` and `overrides.gh` exactly like `issues.sync` already threads `overrides.gh`.
- Default-row behavior implemented in the CLI layer (any selector true or none selects all three).
- Added `renderRemoteSyncResult` to `output.ts` and a new help line for `sync`.
- `npm run typecheck` passes; CLI tests still green.

## T8 — skills and docs

- Created `skills/codepatrol-sync/SKILL.md`, removed `skills/codepatrol-git/SKILL.md`, and renamed the catalog entry. Updated `skills/codepatrol-close/SKILL.md` (Close actions now `commit`/`rollback`; explicit "Close performs no remote action" statement).
- `skills/_shared/STAGE-IO.md` and `skills/_shared/CODEPATROL-CLI.md` no longer mention `commit+push`/`push`; added a `sync` line to the CLI reference.
- `npm run lint:skills` passes; `grep -rln "commit+push" skills/ src/ scripts/` and `grep -rln "codepatrol-git" skills/ src/ scripts/` both return zero hits.

## T9 — final verification

- `npm run verify` passes: typecheck, 224/224 tests, build, CLI smoke, and skill lint. `npm run lint:skills` confirms.
- `git diff --check` is clean; `grep -rn "pushSuggestion\|pushError" src/` returns nothing; `grep -rln "commit+push"` returns nothing.
- Diff scope matches the spec's forecast: `src/change/{git,orchestrator,types,sync}.ts`, `src/cli/{args,commands,output}.ts`, `skills/catalog.yaml`, `skills/_shared/{STAGE-IO,CODEPATROL-CLI}.md`, `skills/codepatrol-close/SKILL.md`, `skills/codepatrol-sync/SKILL.md` (added), `skills/codepatrol-git/SKILL.md` (deleted), plus the four test files (`src/change/{git,close-push,close-integration,sync}.test.ts`), and `scripts/skills-contract.test.mjs`.
- DC-1 (pruning only behind `--prune-closed`), DC-2 (no fetch/rebase/force/PR), DC-3 (no issue annotation), and DC-4 (no remote pruning) all remain unchanged: pruning is opt-in, the only remote writes are `git.push`/the `gh` writes `syncIssues` already governs, and no `gh`-side annotation or remote ref removal is added.
- Rollback of this Change reverts fast-forward Close, branch deletion, the `push` field, and removes `sync` and its flag set; verified by inspection of the diff.
- Token coverage remains at 0/7 (the harness exposes no authoritative per-run usage hook; runs record `unavailable`).

## Attempt 2 — Verify-1 return corrections

Verify-1 returned: "AC-10 fails: sync pruning compares short refs with refs/heads/codepatrol/, so an eligible terminal branch is never deleted. Add pruning, Change-branch target-resolution, and injected CLI sync coverage."

### T6 — prune fix + sync coverage

- Root cause confirmed: `NodeGitAdapter.refs` returns `%(refname:short)` names (`codepatrol/<id>`), while the prune loop matched `refs/heads/codepatrol/`, so no ref ever qualified. Red first: the two new prune tests failed against the unfixed module (8/10 pass), then passed after the fix (10/10).
- Fix (`src/change/sync.ts`): branch short-names collected into a `branchRefs` set during the `branches` push loop; the prune loop now qualifies refs by set membership (never a tag), compares against `codepatrol/<work-id>` short names directly, and passes the short name to `git.deleteBranch` (which prefixes `refs/heads/` itself). Dry-run now records intended names in `prunedBranches` with zero `deleteBranch` calls, per plan T6 step 3.
- New `sync.test.ts` cases (6): Change-branch target resolution (`currentBranch` = `codepatrol/<id>` → pushes `main`), shared-target resolution (two Changes targeting `main` → pushed once), prune after successful push (deletes with the exact head SHA, branch gone, tag kept, `inspectChanges` still resolves the Change terminal/committed — AC-10), failed push blocks prune (branch kept, failure reported), non-terminal never pruned, dry-run records intended prunes without deleting.
- `npm run typecheck` clean; `node --test src/change/sync.test.ts` 10/10 pass.

### T7 — injected CLI sync coverage

- No production change needed: attempt 1 already wired `case "sync"` with `overrides.git`/`overrides.gh` threading (`commands.ts:213-230`). Verify-1 asked for the missing injected coverage.
- Added 6 `cli.test.ts` cases driving the real `parseArgs` + `executeCommand` with a pure `SyncCliGit` double and `SyncCliGh` double (zero real network): default row selects all three and records target+branch+tag pushes plus gh reads; `--branches` narrows (currentBranch rigged to throw if resolution ran; gh untouched); `--prune-closed` without selectors still defaults `branches` true; `--force` rejected by `COMMAND_OPTIONS`; `--target-branch release` pushes exactly the override; `--target-branch :refs/heads/name` rejects `INVALID_ARGUMENT` with zero recorded pushes (AC-11).
- `node --test src/cli/cli.test.ts` 22/22 pass; typecheck clean.

### T9 — final verification (attempt 2)

- `npm run verify` (the configured `applyGate`) passes: typecheck, 236/236 tests (224 baseline-carry + 6 sync + 6 CLI new), build, CLI smoke, skill lint.
- Greps: `pushSuggestion|pushError` in `src/` → none; `git.push` under `closeChange` → none (only array `.push`); `commit+push` in `skills/ src/ scripts/` → zero hits; `codepatrol-git` → zero hits.
- `git diff --stat main` surface is unchanged from attempt 1's forecast — exactly the 19 declared files; attempt 2 touched only `src/change/sync.ts`, `src/change/sync.test.ts`, `src/cli/cli.test.ts` inside that set.
- DC-1..DC-4 hold: pruning stays behind `--prune-closed`, no fetch/rebase/force/PR, no issue annotation, no remote pruning.
- Residual risk: none new — the AC-10 ordering (push before prune, delete via `update-ref -d` with expected SHA) is now covered by direct regression tests.