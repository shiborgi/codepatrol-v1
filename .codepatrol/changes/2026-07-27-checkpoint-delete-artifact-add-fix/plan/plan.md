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
- `npm run verify` must show 215+1/215+1 (baseline 215 plus the one new
  regression test) with 0 failures after the change.
- No change to `git.ts`'s `add()`, `commit()`, or `unstage()` themselves.

## Simplicity proof

- Selected rung: direct local change (reuse an existing primitive)
- Reused capabilities: `GitAdapter.unstage()` (`git.ts:76`), already
  implemented, exported, and exercised by other tests — no new git-adapter
  surface.
- Forbidden speculative surface: no new validation on delete-intent
  artifacts (DC-1 covers the three other `git.add()` call sites, left
  untouched — no evidence implicates them).
- Expected surface delta: `src/change/orchestrator.ts` ~3 changed lines;
  `src/change/git.test.ts` +1 test (~15-20 lines).

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T1 | Read `buildCheckpointEvent`'s new staging step |
| AC-2 | T2 | New regression test: checkpoint with a `git rm`'d delete-intent artifact succeeds |
| AC-3 | T2 | Existing `git.test.ts` delete-intent/checkpoint tests still pass unchanged |
| AC-4 | T1, T3 | `git diff` on `orchestrator.ts` touches only the staging step; downstream checks unchanged |
| AC-5 | T3 | `npm run verify` |

## Dependency order

`T1 → T2 → T3` (fix the function, add the regression test proving it,
final full-gate verification).

### T1 — Split checkpoint staging by artifact intent

**Purpose:** Fix the root cause. Satisfies AC-1.

**Depends on:** None

**Files:**

- Modify: `src/change/orchestrator.ts`

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
3. Run `npm run typecheck`. Expected: 0 errors.
4. Run `npm test`. Expected: 215/215 (no new test yet; this step only
   proves the refactor doesn't break any existing behavior).
5. Confirm via `git diff src/change/orchestrator.ts`: only the two lines
   at 290-291 are replaced by the four lines above; nothing else in
   `buildCheckpointEvent` or the file changed.

**Task result:** diff and `npm test` output appended to `apply/journal.md`.

### T2 — Add the regression test

**Purpose:** Prove the fix against the exact previously-failing scenario,
and prove the previously-working scenario is unaffected. Satisfies AC-2,
AC-3.

**Depends on:** T1

**Files:**

- Modify: `src/change/git.test.ts`

**Steps:**

1. Re-read `src/change/git.test.ts` in full (256 lines), specifically its
   `run()`/`binding()`/`at()`/`initialize()` helpers (lines 13-18) and the
   existing delete-intent test at line 162, to match its exact harness
   pattern (no new helper needed).
2. Add a new test, e.g. `"checkpoint succeeds when a delete-intent
   artifact was already removed via git rm"`:
   - Build a workspace via the existing `initialize()`/`startChange()`
     pattern used elsewhere in the file.
   - Advance to a stage where an optional (non-required) artifact can be
     declared with `intent: "delete"` — e.g. within an `apply` checkpoint,
     declare a scratch file (created and already committed in an earlier
     step) for deletion.
   - Before submitting the checkpoint transition, remove the file from the
     workspace via `run(workspace, ["rm", "<path>"])` (the file's own
     `run()` helper, exactly mirroring the real incident's `git rm`), not
     `unlinkSync`/plain `rm`.
   - Submit the checkpoint `transitionChange(...)` call declaring that path
     with `intent: "delete"`. Expected (red before T1, green after):
     resolves successfully (no `OPERATION_FAILED` thrown).
   - Assert the resulting checkpoint commit's tree no longer contains the
     deleted path (e.g. via `run(workspace, ["ls-tree", "-r", "--name-only",
     "<checkpoint-sha>"])` not including the path).
3. Run this new test alone first against **pre-T1** code (temporarily,
   or reason about it: confirm it would fail with `OPERATION_FAILED`
   given T1 not yet applied — since T1 is already applied at this point
   in the task order, instead confirm by reverting T1 locally, running
   the test to see it fail, then reapplying T1) to prove the test is
   genuinely red-capable, not vacuously passing.
4. Run `npm test` for the full suite. Expected: 216/216 (215 baseline + 1
   new), 0 failures.

**Task result:** diff, the red/green proof, and `npm test` output appended
to `apply/journal.md`.

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
   lint-skills). Expected: all green, 216/216 tests (AC-5).
3. Run `git diff --stat main -- . ':!.codepatrol'`. Expected: exactly two
   files, `src/change/orchestrator.ts` and `src/change/git.test.ts`.
4. Confirm no `DC-1` trigger fired (no evidence surfaced implicating the
   other three `git.add()` call sites beyond what's already deferred).
5. Rollback check: confirm `git revert` of the resulting commit(s) would
   cleanly restore the original combined `git.add(committedPaths, ...)`
   call.

**Task result:** the `git diff` output, final `npm run verify` output, and
residual-risk statement are appended to `apply/journal.md`.
