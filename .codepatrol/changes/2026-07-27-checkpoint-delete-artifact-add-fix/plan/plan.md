# Plan — Fix checkpoint git-add failure when a delete-intent artifact was already `git rm`'d

- Work id: `2026-07-27-checkpoint-delete-artifact-add-fix`
- Governing spec: `spec.md`
- Target baseline: `main` @ `61fa981` (branch `codepatrol/2026-07-27-checkpoint-delete-artifact-add-fix`)

## Goal and approach

`buildCheckpointEvent` stages every checkpoint artifact — including
`intent: "delete"` ones — via one combined `git add`. `git add` cannot
re-stage a path already fully removed via a prior `git rm`, and its
pathspec-list failure is atomic (one bad path blocks the whole call).
Reproduced live against the historical `2026-07-25-docs-consolidation`
incident (6 `OPERATION_FAILED` trace entries). Fix: stage delete-intent
paths via the existing, idempotent `GitAdapter.unstage()`
(`git rm --cached --ignore-unmatch`) instead of folding them into `git
add`. Zero behavior change for non-delete paths or the currently-working
"plain `rm`" delete case.

## Global constraints

- `committedPaths`'s value, the `git commit -- <committedPaths>` call, and
  every downstream delta-reconciliation check in `buildCheckpointEvent`
  must stay byte-identical — only the staging step (currently one `git.add`
  call) changes.
- `npm run verify` must show 217/217 (baseline 215 plus the two new
  regression test cases) with 0 failures after the change.
- No change to `git.ts`'s `add()`, `commit()`, or `unstage()` themselves.
- The `git rm` regression test must be proven genuinely red against the
  unfixed code before the fix is applied — no local revert/reapply of
  production code mid-task.

## Simplicity proof

- Selected rung: direct local change (reuse an existing primitive)
- Reused capabilities: `GitAdapter.unstage()` (`git.ts:76`), already
  implemented, exported, and exercised by other tests — no new git-adapter
  surface.
- Forbidden speculative surface: no new validation on delete-intent
  artifacts (DC-1 covers the three other `git.add()` call sites, left
  untouched — no evidence implicates them).
- Expected surface delta: `src/change/orchestrator.ts` ~3 changed lines;
  `src/change/git.test.ts` +2 test cases (~30-40 lines: a `git rm` case and
  a plain-`rm` case).

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T2 | Read `buildCheckpointEvent`'s new staging step |
| AC-2 | T1, T2 | New `git rm` regression test: red against unfixed code (T1), green after the fix (T2) |
| AC-3 | T1, T2 | New plain-`rm` regression test: green against unfixed code (T1, characterizing current behavior), stays green after the fix (T2) |
| AC-4 | T2, T3 | `git diff` on `orchestrator.ts` touches only the staging step; downstream checks unchanged |
| AC-5 | T3 | `npm run verify` |

## Dependency order

`T1 → T2 → T3` (write both regression tests first against the still-unfixed
code to prove the `git rm` case is genuinely red and the plain-`rm` case is
already green; then apply the fix and confirm both go/stay green; then
final full-gate verification). This order avoids ever reverting or
re-applying a production edit mid-task.

### T1 — Add both removal-mode regression tests (red-before-fix)

**Purpose:** Characterize both the currently-working case (plain `rm`) and
the currently-broken case (`git rm`) with executable tests, against the
still-unfixed code, before any production edit exists to bias the result.
Satisfies AC-2 (red half), AC-3 (green-baseline half).

**Depends on:** None

**Files:**

- Modify: `src/change/git.test.ts`

**Steps:**

1. Re-read `src/change/git.test.ts` in full (256 lines), specifically its
   `run()`/`binding()`/`at()`/`initialize()` helpers (lines 13-18) and the
   existing delete-intent test at line 157-163 ("checkpoint cannot satisfy
   required artifacts with delete bindings" — confirmed this test only
   asserts a `CHANGE_INVALID` rejection for required artifacts, unrelated
   to either removal-mode scenario; no existing test needs to change).
2. Add a shared setup helper (or inline, matching the file's existing
   style) that: starts a Change, advances it to a stage where an optional
   (non-required) artifact can be declared, creates and checkpoints a
   scratch file as `intent: "create"` in an earlier accepted checkpoint
   (so it is genuinely tracked at HEAD before the deletion is attempted).
3. Add test `"checkpoint succeeds when an optional delete-intent artifact
   was removed with plain rm"`: remove the scratch file via `rmSync`/
   `unlinkSync` (Node's plain filesystem removal, not a `git` command,
   mirroring the currently-working case) or `run(workspace, ["rm",
   "--"])` is NOT used here — the file must be gone from the working tree
   but still tracked in the index at removal time; submit a checkpoint
   `transitionChange(...)` declaring that path `intent: "delete"`. Expected
   against today's unfixed code: **already succeeds** — this test exists to
   characterize and lock in that existing behavior, not to find a new bug.
4. Add test `"checkpoint fails today when an optional delete-intent
   artifact was already removed with git rm"` (or a name that will need
   renaming after T2 fixes it — acceptable, the test's assertion changes in
   T2, not its existence): remove the scratch file via
   `run(workspace, ["rm", "<path>"])` (the file's own `run()` helper,
   exactly mirroring the real `2026-07-25-docs-consolidation` incident's
   `git rm`); submit the same shape of checkpoint transition declaring
   `intent: "delete"` for that path. Expected against today's unfixed code:
   **rejects** with `error instanceof CodepatrolError && error.code ===
   "OPERATION_FAILED"` — assert this explicitly (`assert.rejects(...)`),
   proving the bug is genuinely reproduced through the real
   `transitionChange` API, not just the scratch-repo experiment in
   `plan/evidence/investigation.md`.
5. Run `npm test` for just these two new tests (e.g. via
   `--test-name-pattern`). Expected: the plain-`rm` test passes; the
   `git rm` test's `assert.rejects` passes (i.e., it correctly observes
   today's failure) — both green *as written*, because step 4's assertion
   is deliberately checking for the *current* failure, not the fixed
   behavior yet.
6. Run `npm test` for the full suite. Expected: 217/217, 0 failures (215
   baseline + 2 new tests, both passing against unfixed code as specified
   above).

**Task result:** diff, the full test output showing both new tests passing
against unfixed code (the `git rm` test passing *because* it correctly
asserts today's `OPERATION_FAILED` failure), appended to `apply/journal.md`.

### T2 — Split checkpoint staging by artifact intent, then flip the `git rm` test's assertion to green

**Purpose:** Fix the root cause, then update the `git rm` test (written in
T1 to assert today's failure) to assert success instead — proving the fix
closes exactly the gap T1 characterized. Satisfies AC-1, AC-2 (green half),
AC-4 (partial).

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
   	const deletePaths = intent.artifacts.filter((item) => item.intent === "delete").map((item) => item.path);
   	const committedPaths = [...new Set([...paths, ...intent.artifacts.map((item) => item.path)])];
   	await git.add(paths, options.signal);
   	if (deletePaths.length) await git.unstage(deletePaths, options.signal);
   ```

   (`committedPaths` itself is unchanged — still computed the same way,
   still used unmodified by the subsequent `git.commit(..., committedPaths)`
   call and every later reconciliation check in the same function.)
3. In `git.test.ts`, update T1's `git rm` test: replace its
   `assert.rejects(...)` expectation with a direct `await
   transitionChange(...)` call expected to resolve successfully (mirroring
   the plain-`rm` test's shape), and rename the test to something like
   `"checkpoint succeeds when an optional delete-intent artifact was
   already removed with git rm"`. Add an assertion that the resulting
   checkpoint commit's tree omits the deleted path (e.g. via
   `run(workspace, ["ls-tree", "-r", "--name-only", "<checkpoint-sha>"])`
   not including it).
4. Run `npm run typecheck`. Expected: 0 errors.
5. Run `npm test` for the full suite. Expected: 217/217, 0 failures — both
   T1's tests now pass against the fixed code (plain-`rm` still green,
   unchanged; `git rm` now green for the right reason, the fix, not a
   stale rejection assertion).
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
4. Confirm no `DC-1` trigger fired (no evidence surfaced implicating the
   other three `git.add()` call sites beyond what's already deferred).
5. Rollback check: confirm `git revert` of the resulting commit(s) would
   cleanly restore the original combined `git.add(committedPaths, ...)`
   call and remove both new test cases.

**Task result:** the `git diff` output, final `npm run verify` output, and
residual-risk statement are appended to `apply/journal.md`.
