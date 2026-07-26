# Plan — Close auto-resolves the backlog item its Change was linked against on commit

- Work id: `2026-07-26-close-resolves-backlog`
- Governing spec: `spec.md`
- Target baseline: `main` @ `9439c40` (branch `codepatrol/2026-07-26-close-resolves-backlog`)

## Goal and approach

`startChangeLocked` already durably links a Change to a backlog item
(`item.workId`, set to `"scheduled"` via `linkBacklogItem`), but
`closeChangeLocked` never looks that item up or resolves it — it only ever
adds new candidates from the improvement report. Add one best-effort step to
`closeChangeLocked`'s normal Close path: when `outcome === "committed"`, find
backlog items where `item.workId === workId && item.status === "scheduled"`
and resolve each to `"done"` via the already-shipped `resolveBacklogItem`
(from `2026-07-26-backlog-resolve`), wrapped in the same per-item
try/catch-and-stderr pattern already used for the neighboring
`upsertBacklogItem` loop so a resolution failure never blocks Close.
Rollback is explicitly untouched (zero evidence justifies designing that
now — 0 rollbacks in this repo's history).

## Global constraints

- No new dependency; reuses `resolveBacklogItem`/`readBacklog` unmodified.
- `resolveBacklogItem`, `linkBacklogItem`, and `backlog resolve` are not
  modified — this Change is purely a new caller.
- Forbidden: any rollback-side backlog mutation (DC-1); retroactively fixing
  already-stale items from before this ships (DC-2, handled manually via the
  already-shipped `backlog resolve` command, no code).
- Best-effort: a backlog resolution failure must never prevent Close's
  already-produced receipt/tag/commit from completing.

## Simplicity proof

- Selected rung: local reuse
- Reused capabilities: `resolveBacklogItem`/`readBacklog` from
  `src/change/backlog.ts` (shipped in `2026-07-26-backlog-resolve`); the
  exact per-item try/catch-and-stderr pattern already in `closeChangeLocked`
  for `upsertBacklogItem` (`orchestrator.ts:412-413`); the
  `advanceThroughVerify` test helper and `backlog-close-integration.test.ts`
  test shape already established for close+backlog integration tests.
- Forbidden speculative surface: no `ChangeIdentity`/`ChangeRecordV2` schema
  change (the backlog file's `workId` field is reused as the sole source of
  truth for the link); no rollback-side logic (DC-1); no retroactive
  migration (DC-2).
- Expected surface delta: `src/change/orchestrator.ts` (+1 import edit,
  +~8 lines in `closeChangeLocked`); `src/change/backlog-close-integration.test.ts`
  (+~4 new test cases). No new files.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T1 | `node --import jiti/register --test src/change/backlog-close-integration.test.ts` |
| AC-2 | T1 | same file |
| AC-3 | T1 | same file |
| AC-4 | T1 | same file |

## Dependency order

`T1 → T2`. T1 is the only implementation task (small, single-file production
change plus its tests in the sibling integration test file). T2 is final
verification.

### T1 — Auto-resolve the linked backlog item on commit Close

**Purpose:** Satisfies AC-1, AC-2, AC-3, AC-4 — closes the loop between
`startChangeLocked`'s `--backlogItemId` link and Close's terminal outcome.

**Depends on:** None

**Files:**

- Modify: `src/change/orchestrator.ts` — add `readBacklog`/`resolveBacklogItem`
  to the existing `./backlog.js` import; add the resolution step to
  `closeChangeLocked`
- Modify: `src/change/backlog-close-integration.test.ts` — add 4 new test
  cases

**Interfaces:**

- Consumes: `resolveBacklogItem(workspace, itemId, "done"|"dismissed", now?)`
  and `readBacklog(workspace)` from `../backlog.js` (both already exported,
  unmodified)
- Produces: no new exported symbol — the new step is private to
  `closeChangeLocked`
- Invariants/errors: only runs when `outcome === "committed"`; only touches
  items where `item.workId === workId && item.status === "scheduled"`; any
  error from `resolveBacklogItem` for an individual item is caught and
  written to stderr, never rethrown; any error from the outer lookup
  (`readBacklog`) is likewise caught, never rethrown — Close's receipt/tag/
  commit (already produced earlier in the function) are never blocked by
  this step.

**Simplicity proof:** Reuses `resolveBacklogItem`/`readBacklog` verbatim and
mirrors the exact defensive shape already proven for `upsertBacklogItem` in
the same function, three lines above the insertion point.

**Surface delta:** +1 import edit, +~8 lines in `orchestrator.ts`; +4 test
cases in `backlog-close-integration.test.ts`.

**Steps:**

1. Add the following tests to `src/change/backlog-close-integration.test.ts`,
   inside the existing `describe("close integration: backlog feed", ...)`
   block, after the existing `"close with only filler recommendations adds
   nothing"` test (reuse the file's `git`/`at`/`readItems` helpers and its
   `upsertBacklogItem`/`linkBacklogItem` imports — extend the existing
   `import { readBacklog } from "./backlog.js";` to
   `import { linkBacklogItem, readBacklog, upsertBacklogItem } from "./backlog.js";`):

   ```typescript
   test("close commit auto-resolves the linked backlog item to done, committed in the terminal commit", async () => {
     const workspace = mkdtempSync(join(tmpdir(), "codepatrol-close-resolve-"));
     try {
       writeFileSync(join(workspace, ".gitignore"), ".codepatrol/runtime/\n.codepatrol/docs/\n");
       git(workspace, ["init", "-b", "main"]); writeFileSync(join(workspace, "README.md"), "baseline\n"); git(workspace, ["add", "."]); git(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "baseline"]);
       const id = "2026-07-26-close-resolve";
       const linked = upsertBacklogItem(workspace, { title: "Linked item", area: "workflow", evidence: [], source: { kind: "plan-followup", workId: "seed" } });
       linkBacklogItem(workspace, linked.id, id);
       const unrelated = upsertBacklogItem(workspace, { title: "Unrelated item", area: "workflow", evidence: [], source: { kind: "plan-followup", workId: "seed" } });
       linkBacklogItem(workspace, unrelated.id, "some-other-change");
       await advanceThroughVerify(workspace, id);
       await transitionChange(workspace, id, { type: "begin", actor: "trace-test", stage: "close", nextAction: "close" }, at(15));
       await transitionChange(workspace, id, { type: "usage", actor: "trace-test", stage: "close", run: { id: "close-usage", started_at: "2026-07-22T10:00:16Z", finished_at: "2026-07-22T10:00:17Z", elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, at(17));
       const result = await closeChange(workspace, id, { outcome: "commit", actor: "trace-test", authority: "test" }, at(20));
       assert.equal(result.outcome, "committed");
       const items = readBacklog(workspace).items;
       assert.equal(items.find((entry) => entry.id === linked.id)?.status, "done");
       assert.equal(items.find((entry) => entry.id === unrelated.id)?.status, "scheduled");
       const show = git(workspace, ["show", "--name-only", "--format=", result.terminalCommit]);
       assert.match(show, /\.codepatrol\/backlog\/items\.yaml/);
     } finally { rmSync(workspace, { recursive: true, force: true }); }
   });

   test("close rollback does not touch the linked backlog item's status", async () => {
     const workspace = mkdtempSync(join(tmpdir(), "codepatrol-close-resolve-rollback-"));
     try {
       writeFileSync(join(workspace, ".gitignore"), ".codepatrol/runtime/\n.codepatrol/docs/\n");
       git(workspace, ["init", "-b", "main"]); writeFileSync(join(workspace, "README.md"), "baseline\n"); git(workspace, ["add", "."]); git(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "baseline"]);
       const id = "2026-07-26-close-resolve-rollback";
       const linked = upsertBacklogItem(workspace, { title: "Linked item", area: "workflow", evidence: [], source: { kind: "plan-followup", workId: "seed" } });
       linkBacklogItem(workspace, linked.id, id);
       await advanceThroughVerify(workspace, id);
       await transitionChange(workspace, id, { type: "begin", actor: "trace-test", stage: "close", nextAction: "close" }, at(15));
       await transitionChange(workspace, id, { type: "usage", actor: "trace-test", stage: "close", run: { id: "close-usage", started_at: "2026-07-22T10:00:16Z", finished_at: "2026-07-22T10:00:17Z", elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, at(17));
       const result = await closeChange(workspace, id, { outcome: "rollback", actor: "trace-test", authority: "test" }, at(20));
       assert.equal(result.outcome, "rolled-back");
       const items = readBacklog(workspace).items;
       assert.equal(items.find((entry) => entry.id === linked.id)?.status, "scheduled");
     } finally { rmSync(workspace, { recursive: true, force: true }); }
   });

   test("close commit does not fail when the linked item was already manually resolved", async () => {
     const workspace = mkdtempSync(join(tmpdir(), "codepatrol-close-resolve-already-done-"));
     try {
       writeFileSync(join(workspace, ".gitignore"), ".codepatrol/runtime/\n.codepatrol/docs/\n");
       git(workspace, ["init", "-b", "main"]); writeFileSync(join(workspace, "README.md"), "baseline\n"); git(workspace, ["add", "."]); git(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "baseline"]);
       const id = "2026-07-26-close-resolve-already-done";
       const linked = upsertBacklogItem(workspace, { title: "Linked item", area: "workflow", evidence: [], source: { kind: "plan-followup", workId: "seed" } });
       linkBacklogItem(workspace, linked.id, id);
       resolveBacklogItem(workspace, linked.id, "dismissed");
       await advanceThroughVerify(workspace, id);
       await transitionChange(workspace, id, { type: "begin", actor: "trace-test", stage: "close", nextAction: "close" }, at(15));
       await transitionChange(workspace, id, { type: "usage", actor: "trace-test", stage: "close", run: { id: "close-usage", started_at: "2026-07-22T10:00:16Z", finished_at: "2026-07-22T10:00:17Z", elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, at(17));
       const result = await closeChange(workspace, id, { outcome: "commit", actor: "trace-test", authority: "test" }, at(20));
       assert.equal(result.outcome, "committed");
       const items = readBacklog(workspace).items;
       assert.equal(items.find((entry) => entry.id === linked.id)?.status, "dismissed");
     } finally { rmSync(workspace, { recursive: true, force: true }); }
   });
   ```

   Add `resolveBacklogItem` to the file's `./backlog.js` import alongside
   `linkBacklogItem`/`readBacklog`/`upsertBacklogItem`.
2. Run `node --import jiti/register --test src/change/backlog-close-integration.test.ts`.
   Expected red: the first new test fails (`linked` item stays `"scheduled"`
   after commit); the second and third pass trivially before implementation
   (nothing resolves anything yet, so "unchanged"/"still dismissed" are
   already true) — this is expected and will be re-confirmed green after
   implementation, not a sign the tests are wrong.
3. In `src/change/orchestrator.ts`, change the import
   `import { upsertBacklogItem, findBacklogItem, linkBacklogItem, backlogPath } from "./backlog.js";`
   to add `readBacklog, resolveBacklogItem`. Add, immediately after the
   improvement-report `try`/`catch` block (after line 415's closing `}`,
   before the `pathsToCommit` line):

   ```typescript
   if (outcome === "committed") {
   	try {
   		const linkedItems = readBacklog(workspace).items.filter((item) => item.workId === workId && item.status === "scheduled");
   		for (const item of linkedItems) {
   			try { resolveBacklogItem(workspace, item.id, "done", now(options)); }
   			catch (cause) { process.stderr.write(`[close] backlog resolve failed for "${item.id}": ${(cause as Error).message}\n`); }
   		}
   	} catch (cause) { process.stderr.write(`[close] backlog resolution lookup failed: ${(cause as Error).message}\n`); }
   }
   ```

4. Run `node --import jiti/register --test src/change/backlog-close-integration.test.ts`.
   Expected green: all tests in the file pass, including the two
   pre-existing tests (no regression to the improvement-report-driven
   candidate-upsert behavior).
5. Run `npm run typecheck`.
   Expected: no new errors.

**Task result:** changed paths, red/green evidence, deviations, and
assessment are appended to `apply/journal.md`.

### T2 — Final verification

**Purpose:** Confirms all four acceptance criteria hold together, the full
gate is green, and the actual surface delta matches the spec forecast.

**Depends on:** T1

**Files:** None (verification only)

**Steps:**

1. Run `npm run verify` (typecheck + full test suite + build + smoke-cli +
   lint-skills). Expected: all steps pass, 0 failures, no new warnings.
2. Run `git status --porcelain` and confirm the changed-file set is exactly:
   `src/change/orchestrator.ts`, `src/change/backlog-close-integration.test.ts`
   — no undeclared work.
3. Re-read AC-1 through AC-4 against the new tests; confirm each is
   satisfied by name and by the actual red/green evidence recorded in T1.
4. Confirm actual surface delta matches the spec's forecast; reconcile any
   difference.
5. Confirm no `DC-1`/`DC-2` trigger fired (no evidence surfaced a need for
   rollback-side handling or retroactive migration beyond what was already
   deferred).
6. Graph sync: not required — no exported symbol removed or renamed, only
   two additional imports into an already-imported module and a private
   in-function addition; state this explicitly rather than running
   `codepatrol graph sync` needlessly.
7. Rollback check: confirm `git revert` of the resulting commit would
   cleanly remove the auto-resolve step with no migration or data
   dependency — items already resolved by this feature before a hypothetical
   revert remain valid `done` items (no un-resolution needed; reverting only
   stops *future* auto-resolution).
8. As a real-world validation beyond the test suite (not a substitute for
   it): note that this very Change was itself started with
   `--backlogItemId close-does-not-auto-resolve-...`, so its own Close (once
   reached, after Review/Apply/Verify) will be the first live exercise of
   this exact fix — record the observed outcome in the journal when it
   happens (informational, not a blocking check for this task).

**Task result:** final gate output, diff reconciliation, and residual-risk
statement are appended to `apply/journal.md`.
