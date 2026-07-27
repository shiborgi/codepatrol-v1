# Plan — Fix checkpoint git-add failure when a `changes[]` path was already removed

- Work id: `2026-07-27-checkpoint-delete-artifact-add-fix`
- Governing spec: `spec.md`
- Target baseline: `main` @ `61fa981` (branch `codepatrol/2026-07-27-checkpoint-delete-artifact-add-fix`)

## Goal and approach

`buildCheckpointEvent` stages every checkpoint path — `artifacts[]` and
Apply's flat, un-typed `changes[]` alike — via one combined `git add`.
`git add` cannot re-stage a path already fully removed via a prior
`git rm`, and its pathspec-list failure is atomic (one bad path blocks the
whole call). The real historical incident (`2026-07-25-docs-consolidation`)
declared its deleted paths via `changes[]` (confirmed directly from that
Change's own `change.yaml`), not `artifacts[intent="delete"]` — a path
outside the checkpointing stage's own directory could never have been a
valid `artifacts[]` binding in the first place. Fix: partition every
staged path by whether it currently exists on disk (`existsSync`), not by
its declared `intent` (which `changes[]` entries don't have); existing
paths go through `git.add()`, missing ones through the existing, idempotent
`GitAdapter.unstage()`. Zero behavior change for the currently-working
case.

## Global constraints

- `committedPaths`'s value, the `git commit -- <committedPaths>` call, and
  every downstream delta-reconciliation check in `buildCheckpointEvent`
  must stay byte-identical — only the staging step's routing changes.
- `npm run verify` must show 217/217 (baseline 215 plus the two new
  regression test cases) with 0 failures after the change.
- No change to `git.ts`'s `add()`, `commit()`, or `unstage()` themselves.
- Both regression tests must exercise Apply's `changes[]` field
  specifically (the evidenced defect surface) — not
  `artifacts[intent="delete"]` (see spec's DC-2).
- The `git rm` regression test must be proven genuinely red against the
  unfixed code before the fix is applied — no local revert/reapply of
  production code mid-task.

## Simplicity proof

- Selected rung: direct local change (reuse an existing primitive)
- Reused capabilities: `GitAdapter.unstage()` (`git.ts:76`); `existsSync`
  and `resolveInside`, both already imported in `orchestrator.ts` — no new
  git-adapter surface, no new imports.
- Forbidden speculative surface: no new validation on delete-style paths;
  DC-1 (other `git.add()` call sites) and DC-2 (no dedicated
  `artifacts[intent="delete"]` test) both left explicitly deferred.
- Expected surface delta: `src/change/orchestrator.ts` ~4 changed lines;
  `src/change/git.test.ts` +2 test cases (~50-70 lines, including one
  shared setup helper for the Apply-with-`changes[]` fixture).

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T2 | Read `buildCheckpointEvent`'s new `toAdd`/`toUnstage` partition |
| AC-2 | T1, T2 | `changes[]` `git rm` test: red against unfixed code (T1), green after the fix (T2) |
| AC-3 | T1, T2 | `changes[]` plain-`rm` test: green against unfixed code (T1, characterizing current behavior), stays green after the fix (T2) |
| AC-4 | T2, T3 | `git diff` on `orchestrator.ts` touches only the staging step; downstream checks unchanged |
| AC-5 | T3 | `npm run verify` |

## Dependency order

`T1 → T2 → T3` (write both regression tests first against the still-unfixed
code to prove the `git rm` case is genuinely red and the plain-`rm` case is
already green; then apply the fix and confirm both go/stay green; then
final full-gate verification). This order avoids ever reverting or
re-applying a production edit mid-task.

### T1 — Add both `changes[]` removal-mode regression tests (red-before-fix)

**Purpose:** Characterize both the currently-working case (plain `rm`) and
the currently-broken case (`git rm`) for Apply's `changes[]` field, with
executable tests, against the still-unfixed code. Satisfies AC-2 (red
half), AC-3 (green-baseline half).

**Depends on:** None

**Files:**

- Modify: `src/change/git.test.ts`

**Steps:**

1. Re-read `src/change/git.test.ts` in full (256 lines): its
   `run()`/`binding()`/`at()`/`initialize()` helpers (lines 13-18), the
   `advanceThroughVerify` helper (lines 19-30, the pattern for driving a
   Change through plan→review→apply→verify with `changes: []`), and the
   existing delete-intent test at line 157-163 (confirmed unrelated —
   asserts `CHANGE_INVALID` for required-artifact deletions, not a
   `changes[]` scenario).
2. Add `rmSync` to the existing `node:fs` import line (needed for the
   plain-`rm` case; `unlinkSync` would also work, `rmSync` matches the
   file's own style of preferring one general-purpose fs function).
3. Add a shared helper, e.g. `advanceThroughApplyWithChangesPath(workspace,
   id, changePath, removeVia)`, modeled on `advanceThroughVerify` but
   stopping after the Apply checkpoint and accepting one extra pre-existing
   production path to declare in `changes[]`:
   - Caller pre-commits `changePath` directly to the branch (via `writeFileSync`
     + `run(workspace, ["add", changePath])` + a raw commit, exactly like
     the existing `"checkpoint rejects a production path..."` test's
     `EARLY.txt` setup) *before* calling this helper, so the path is
     genuinely part of the branch's history before Apply begins.
   - `startChange(...)`, then drive `plan` and `review` to accepted
     checkpoints exactly as `advanceThroughVerify` does (spec.md/plan.md
     for plan; report.md for review; `result: "ready"`/`"approve"`).
   - `begin` apply; write `apply/journal.md` (required artifact,
     `intent: "create"`).
   - Remove `changePath` from the workspace: if `removeVia === "gitRm"`,
     `run(workspace, ["rm", changePath])`; if `removeVia === "plainRm"`,
     `rmSync(join(workspace, changePath))`.
   - Submit the `usage` transition for `apply`.
   - Submit the `checkpoint` transition: `stage: "apply"`, `result:
     "implemented"`, `artifacts: [binding(workspace, journalPath)]`,
     `changes: [changePath]`, `nextAction: "continue"`. Return the promise
     (do not `await` inside the helper if the caller needs to assert on
     it) or accept an `expectSuccess: boolean` style split — whichever
     matches the file's existing helper conventions most closely; simplest
     is to have the helper itself `return
     transitionChange(workspace, id, {...})` un-awaited so the caller can
     `await` or `assert.rejects` it directly.
4. Add test `"apply checkpoint succeeds when a changes[] path was removed
   with plain rm"`: set up a pre-committed scratch path (e.g.
   `docs/scratch-changes-test.md`), call the helper with
   `removeVia: "plainRm"`, `await` the returned promise directly. Expected
   against today's unfixed code: **already succeeds** (characterizes
   existing behavior).
5. Add test `"apply checkpoint fails today when a changes[] path was
   already removed with git rm"` (name will be updated in T2 once fixed):
   same setup, `removeVia: "gitRm"`, wrap in `assert.rejects(...,
   (error: unknown) => error instanceof CodepatrolError && error.code ===
   "OPERATION_FAILED")`. Expected against today's unfixed code: the
   rejection assertion passes (i.e., it correctly observes today's
   failure).
6. Run `npm test` for the full suite. Expected: 217/217, 0 failures — both
   new tests pass *as written* (the `git rm` test passing because it
   correctly asserts today's failure).

**Task result:** diff, full test output showing both new tests passing
against unfixed code, appended to `apply/journal.md`.

### T2 — Route checkpoint staging by on-disk existence, then flip the `git rm` test's assertion to green

**Purpose:** Fix the root cause, then update the `git rm` test (written in
T1 to assert today's failure) to assert success instead. Satisfies AC-1,
AC-2 (green half), AC-4 (partial).

**Depends on:** T1

**Files:**

- Modify: `src/change/orchestrator.ts`
- Modify: `src/change/git.test.ts`

**Steps:**

1. Re-read `buildCheckpointEvent` (`src/change/orchestrator.ts:254-295`)
   fresh, immediately before editing, to confirm current line numbers and
   surrounding context have not shifted.
2. Replace (currently lines 290-291):

   ```typescript
   	const committedPaths = [...new Set([...paths, ...intent.artifacts.map((item) => item.path)])];
   	await git.add(committedPaths, options.signal);
   ```

   with:

   ```typescript
   	const committedPaths = [...new Set([...paths, ...intent.artifacts.map((item) => item.path)])];
   	const toAdd = committedPaths.filter((path) => existsSync(resolveInside(workspace, path)));
   	const toUnstage = committedPaths.filter((path) => !existsSync(resolveInside(workspace, path)));
   	if (toAdd.length) await git.add(toAdd, options.signal);
   	if (toUnstage.length) await git.unstage(toUnstage, options.signal);
   ```

   (`committedPaths` itself is unchanged — still computed the same way,
   still used unmodified by the subsequent `git.commit(..., committedPaths)`
   call and every later reconciliation check in the same function. No new
   imports needed: `existsSync` and `resolveInside` are already imported
   at the top of `orchestrator.ts`.)
3. In `git.test.ts`, update T1's `git rm` test: replace its
   `assert.rejects(...)` expectation with a direct `await` on the helper's
   returned promise, expected to resolve successfully; rename the test to
   `"apply checkpoint succeeds when a changes[] path was already removed
   with git rm"`. Add an assertion that the resulting checkpoint commit's
   tree omits the removed path (e.g. via `run(workspace, ["ls-tree", "-r",
   "--name-only", "<checkpoint-sha>"])` not including it) — capture the
   commit sha from the resolved `ChangeView`/inspect the branch head via
   `run(workspace, ["rev-parse", "HEAD"])` immediately after, matching
   whichever the file's existing tests already use to get a checkpoint sha.
4. Run `npm run typecheck`. Expected: 0 errors.
5. Run `npm test` for the full suite. Expected: 217/217, 0 failures — both
   T1's tests now pass against the fixed code for the right reason (the
   plain-`rm` test unchanged; the `git rm` test now green because of the
   fix, not a stale rejection assertion).
6. Confirm via `git diff src/change/orchestrator.ts`: only the staging-step
   lines changed; nothing else in `buildCheckpointEvent` or the file
   changed.

**Task result:** diff (both files), full `npm test` output, appended to
`apply/journal.md`.

### T3 — Final verification

**Purpose:** Confirm the complete diff satisfies every AC together.
Satisfies AC-4, AC-5.

**Depends on:** T1, T2

**Files:** None (verification only)

**Steps:**

1. Run `git diff main -- src/change/orchestrator.ts`. Expected: only the
   staging-step lines changed (AC-4) — no line in the delta-reconciliation
   logic (`unexpected`, `actualProduction`, `declaredProduction`,
   `finalDelta`, `unexpectedFinal`, `finalProduction` checks) differs.
2. Run `npm run verify` (typecheck + full test suite + build + smoke-cli +
   lint-skills). Expected: all green, 217/217 tests (AC-5).
3. Run `git diff --stat main -- . ':!.codepatrol'`. Expected: exactly two
   files, `src/change/orchestrator.ts` and `src/change/git.test.ts`.
4. Confirm no `DC-1`/`DC-2` trigger fired (no evidence surfaced
   implicating the other three `git.add()` call sites, and no evidence
   surfaced that `artifacts[intent="delete"]` behaves differently under
   the corrected routing than `changes[]` does).
5. Rollback check: confirm `git revert` of the resulting commit(s) would
   cleanly restore the original combined `git.add(committedPaths, ...)`
   call and remove both new test cases.

**Task result:** the `git diff` output, final `npm run verify` output, and
residual-risk statement are appended to `apply/journal.md`.
