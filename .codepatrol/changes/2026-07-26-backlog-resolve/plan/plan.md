# Plan — Add a CLI command to mark a backlog item done/dismissed directly

- Work id: `2026-07-26-backlog-resolve`
- Governing spec: `spec.md`
- Target baseline: `main` @ `f51ced8` (branch `codepatrol/2026-07-26-backlog-resolve`)

## Goal and approach

`BacklogStatus`'s `"done"`/`"dismissed"` values and every consumer of them
(`linkBacklogItem`'s terminal guard, `issue-sync.ts`'s close-on-resolve logic)
already exist and are already tested — no function anywhere ever writes those
two values, so the only way to resolve an item today is a hand-edit of
`.codepatrol/backlog/items.yaml`. Add `resolveBacklogItem` to
`src/change/backlog.ts` (the missing producer, mirroring `linkBacklogItem`'s
validation shape exactly) and a thin `codepatrol backlog resolve --id
<item-id> --status done|dismissed` CLI case reusing the already-known `id`/
`status` flags. Prove with a regression test that `issue-sync.ts` needs zero
changes to react to the newly-reachable status.

## Global constraints

- No new dependency; no new CLI flag (`id`/`status` are already registered
  option names).
- `issue-sync.ts` is not modified — AC-6 proves its existing logic already
  handles the new status correctly.
- `upsertBacklogItem`/`linkBacklogItem` are not modified — `candidate`/
  `scheduled` remain reachable only through their existing invariants.
- Forbidden: auto-resolving the backlog item a Change was started against on
  Close — filed as a separate backlog follow-up, out of scope per spec.

## Simplicity proof

- Selected rung: local reuse
- Reused capabilities: `writeBacklog`/`readBacklog` and the
  `CodepatrolError("CHANGE_INVALID"/"CHANGE_CONFLICT", ...)` validation shape
  already in `src/change/backlog.ts` (`linkBacklogItem`); the two-layer
  CLI-boundary-then-module validation pattern already in
  `src/cli/commands.ts` (`backlog.add`); the already-known `id`/`status` CLI
  flags in `src/cli/args.ts`; the `FakeGhAdapter`/`seed`/`itemAt` test harness
  already in `src/change/issue-sync.test.ts`.
- Forbidden speculative surface: no `reason`/audit field (DC-1); no generic
  set-status-to-anything command (rejected in spec Alternatives); no
  auto-resolve-on-close logic (DC-2, filed separately).
- Expected surface delta: `src/change/backlog.ts` (+~10 lines),
  `src/cli/commands.ts` (+~6 lines), `src/cli/args.ts` (+1 line),
  `src/cli/output.ts` (+1 line), plus test additions in
  `src/change/backlog.test.ts`, `src/change/issue-sync.test.ts`, and
  `src/cli/cli.test.ts`. No new files.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T1 | `node --import jiti/register --test src/change/backlog.test.ts` |
| AC-2 | T1 | same file |
| AC-3 | T2 | `node --import jiti/register --test src/cli/cli.test.ts` |
| AC-4 | T1, T2 | both files (unit-level in T1, CLI exit-code propagation in T2) |
| AC-5 | T1, T2 | both files |
| AC-6 | T1 | `node --import jiti/register --test src/change/issue-sync.test.ts` |

## Dependency order

`T1 → T2 → T3`. T1 owns `src/change/backlog.ts` and its tests plus
`issue-sync.test.ts` (module-level, no CLI dependency). T2 owns the CLI
plumbing (`args.ts`, `commands.ts`, `output.ts`, `cli.test.ts`) and imports
`resolveBacklogItem` from T1, so it must land after. T3 is final verification.

### T1 — Add `resolveBacklogItem` and prove `issue-sync.ts` needs no change

**Purpose:** Satisfies AC-1, AC-2, AC-4, AC-5 (module level) and AC-6 — the
missing producer for `done`/`dismissed`, plus proof the existing consumer
(`issue-sync.ts`) already reacts correctly.

**Depends on:** None

**Files:**

- Modify: `src/change/backlog.ts` — add `resolveBacklogItem`
- Modify: `src/change/backlog.test.ts` — add unit tests (AC-1, AC-2, AC-4, AC-5)
- Modify: `src/change/issue-sync.test.ts` — add regression test (AC-6)

**Interfaces:**

- Produces: `export function resolveBacklogItem(workspace: string, itemId: string, status: "done" | "dismissed", now: Date = new Date()): BacklogItem`
- Invariants/errors: throws `CodepatrolError("CHANGE_INVALID", \`CHANGE_INVALID: Backlog item not found: ${itemId}.\`, 4)` if no item matches `itemId`; throws `CodepatrolError("CHANGE_CONFLICT", \`CHANGE_CONFLICT: Backlog item ${itemId} is already ${existing.status}.\`, 4)` if `existing.status` is already `"done"` or `"dismissed"`; otherwise returns the item with `status` and `lastSeenAt` updated, all other fields unchanged, persisted via `writeBacklog`.

**Simplicity proof:** Mirrors `linkBacklogItem`'s exact validation shape
(`backlog.ts:162-173`) — not-found check, terminal-status guard, targeted
field update, `writeBacklog` call — reusing the same error codes and message
style for the same class of failure.

**Surface delta:** +1 function (~10 lines) in `backlog.ts`; +2 test cases in
`backlog.test.ts`; +1 test case in `issue-sync.test.ts`.

**Steps:**

1. Add the following tests to `src/change/backlog.test.ts`, after the
   existing `"linkBacklogItem sets workId and status, throws on missing or
   dismissed"` test (reuse the file's `workspace()`/`SOURCE` helpers already
   imported):

   ```typescript
   test("resolveBacklogItem marks a candidate done or dismissed, throws on missing or already-terminal", () => {
     const root = workspace();
     try {
       const created = upsertBacklogItem(root, { title: "Z", area: "workflow", evidence: [], source: SOURCE });
       const resolved = resolveBacklogItem(root, created.id, "done");
       assert.equal(resolved.status, "done");
       assert.equal(resolved.id, created.id);
       assert.equal(resolved.priority, created.priority);
       assert.equal(resolved.title, created.title);
       assert.notEqual(resolved.lastSeenAt, created.lastSeenAt);
       const persisted = readBacklog(root).items[0]!;
       assert.equal(persisted.status, "done");

       assert.throws(() => resolveBacklogItem(root, "does-not-exist", "done"), /CHANGE_INVALID/);
       assert.throws(() => resolveBacklogItem(root, created.id, "dismissed"), /CHANGE_CONFLICT/);
     } finally { rmSync(root, { recursive: true, force: true }); }
   });

   test("resolveBacklogItem accepts dismissed and preserves a scheduled item's workId", () => {
     const root = workspace();
     try {
       const created = upsertBacklogItem(root, { title: "W", area: "workflow", evidence: [], source: SOURCE });
       const linked = linkBacklogItem(root, created.id, "2026-07-26-linked");
       const resolved = resolveBacklogItem(root, linked.id, "dismissed");
       assert.equal(resolved.status, "dismissed");
       assert.equal(resolved.workId, "2026-07-26-linked");
     } finally { rmSync(root, { recursive: true, force: true }); }
   });
   ```

2. Add `resolveBacklogItem` to the import at the top of
   `src/change/backlog.test.ts` (extend the existing
   `import { classifyPriority, dedupKey, findBacklogItem, linkBacklogItem, listBacklog, readBacklog, upsertBacklogItem } from "./backlog.js";` to include it).
3. Run `node --import jiti/register --test src/change/backlog.test.ts`.
   Expected red: both new tests fail — `resolveBacklogItem` does not exist
   yet (import/reference error, not a setup typo).
4. In `src/change/backlog.ts`, add after `linkBacklogItem` (before the
   `ListOptions`/`listBacklog` block):

   ```typescript
   export function resolveBacklogItem(workspace: string, itemId: string, status: "done" | "dismissed", now: Date = new Date()): BacklogItem {
   	if (typeof itemId !== "string" || !itemId.trim()) throw new CodepatrolError("CHANGE_INVALID", "Backlog item id must be a non-empty string.", 4);
   	const current = readBacklog(workspace);
   	const existing = current.items.find((entry) => entry.id === itemId);
   	if (!existing) throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Backlog item not found: ${itemId}.`, 4);
   	if (existing.status === "done" || existing.status === "dismissed") throw new CodepatrolError("CHANGE_CONFLICT", `CHANGE_CONFLICT: Backlog item ${itemId} is already ${existing.status}.`, 4);
   	const updated: BacklogItem = { ...existing, status, lastSeenAt: now.toISOString() };
   	const items = current.items.map((entry) => entry.id === itemId ? updated : entry);
   	writeBacklog(workspace, { schema_version: 1, items });
   	return updated;
   }
   ```

5. Run `node --import jiti/register --test src/change/backlog.test.ts`.
   Expected green: all tests in the file pass, including every pre-existing
   test (no regression to `upsertBacklogItem`/`linkBacklogItem`/`listBacklog`).
6. Add the following test to `src/change/issue-sync.test.ts`, after the
   existing `AC-2` test (reuse the file's `workspace()`/`seed()`/`itemAt()`/
   `FakeGhAdapter`/`URL` helpers already defined; add `resolveBacklogItem` to
   the `./backlog.js` import):

   ```typescript
   test("AC-6 (2026-07-26-backlog-resolve): push closes the GitHub issue for an item resolved via resolveBacklogItem, with no issue-sync.ts change", async () => {
     const root = workspace();
     const gh = new FakeGhAdapter([{ number: 9, title: "Fixed thing", url: URL(9), state: "open" }]);
     try {
       seed(root, [{ id: "fixed-thing", title: "Fixed thing", priority: "p2", area: "architecture", status: "scheduled", evidence: [], source: { kind: "plan-followup", workId: "2026-07-25-example" }, externalRef: { provider: "github", number: 9, url: URL(9) }, workId: "2026-07-25-example", count: 1, firstSeenAt: "2026-07-25T00:00:00.000Z", lastSeenAt: "2026-07-25T00:00:00.000Z" }]);
       resolveBacklogItem(root, "fixed-thing", "done", new Date("2026-07-26T00:00:00.000Z"));
       const result = await syncIssues(root, "push", { gh });
       assert.deepEqual(result.pushed.closed, [9]);
       assert.deepEqual(gh.closed, [{ number: 9, reason: "completed" }]);
       const after = itemAt(root, "fixed-thing");
       assert.equal(after.status, "done");
     } finally { rmSync(root, { recursive: true, force: true }); }
   });
   ```

7. Run `node --import jiti/register --test src/change/issue-sync.test.ts`.
   This is a characterization test for AC-6, not a new behavior: it proves
   `issue-sync.ts`'s existing close-on-resolve logic (`issue-sync.ts:129-137`)
   already reacts correctly to a status `resolveBacklogItem` just made
   reachable, without any change to `issue-sync.ts` itself. Since step 4
   already landed by this point in the sequence, expect green on first run —
   confirm it is green, and record in the journal that this test exercises
   pre-existing, unmodified logic (mirrors how the prior Change's AC-3
   characterization test was handled).
   Expected: all tests pass, including every pre-existing test in the file
   (no regression to pull/push/dry-run behavior).
8. Run `npm run typecheck`.
   Expected: no new errors.

**Task result:** changed paths, red/green evidence, deviations, and
assessment are appended to `apply/journal.md`.

### T2 — CLI command `backlog resolve --id <item-id> --status done|dismissed`

**Purpose:** Satisfies AC-3 (CLI-boundary validation) and completes AC-4/AC-5
at the CLI layer (confirms `CodepatrolError.exitCode` propagates through
`main.ts` to the process exit code, per `src/cli/main.ts:80`).

**Depends on:** T1 (imports `resolveBacklogItem`)

**Files:**

- Modify: `src/cli/args.ts` — register `backlog.resolve` in `COMMAND_OPTIONS`
- Modify: `src/cli/commands.ts` — add `case "backlog.resolve":`
- Modify: `src/cli/output.ts` — add help text line
- Modify: `src/cli/cli.test.ts` — add CLI-level tests

**Interfaces:**

- Consumes: `resolveBacklogItem` from `../change/backlog.js` (add to the
  existing `import { listBacklog, upsertBacklogItem, readBacklog, ... } from "../change/backlog.js";` in `commands.ts`)
- Produces: no new exported symbol — `case "backlog.resolve":` returns
  `{ data: { id: string, status: BacklogStatus }, text: string }`
- Invariants/errors: `args.status` must be exactly `"done"` or `"dismissed"`
  before `resolveBacklogItem` is called; anything else throws
  `CodepatrolError("INVALID_ARGUMENT", ..., 2)` naming the received value.

**Simplicity proof:** Reuses the already-registered `id`/`status` flags (no
new flag parsing); mirrors the CLI-boundary-then-module two-layer validation
shape already used by every other `case` in `commands.ts` (e.g. `backlog.add`,
`change.session`).

**Surface delta:** +1 map entry in `args.ts` (1 line); +1 `case` block in
`commands.ts` (~6 lines) plus one import addition; +1 help-text line in
`output.ts`; +tests in `cli.test.ts`.

**Steps:**

1. Add the following tests to `src/cli/cli.test.ts`, appended after the
   existing `"codepatrol backlog add and list dedupe, classify, and filter"`
   test (reuse the file's `workspace()`/`run()` helpers):

   ```typescript
   test("CLI backlog resolve marks an item done or dismissed, rejects bad status/id/already-terminal", () => {
     const root = workspace();
     try {
       const add = JSON.parse(run(["backlog","add","--input","-","--workspace",root,"--format=json"], JSON.stringify({ title: "Resolve me", area: "workflow", evidence: [], source: { kind: "close-trace", workId: "2026-07-26-x" } })).stdout).data;
       const ok = run(["backlog","resolve","--id",add.id,"--status","done","--workspace",root,"--format=json"]);
       assert.equal(ok.status, 0, ok.stderr || ok.stdout);
       const okData = JSON.parse(ok.stdout).data;
       assert.equal(okData.id, add.id);
       assert.equal(okData.status, "done");

       const badStatus = run(["backlog","resolve","--id",add.id,"--status","bogus","--workspace",root,"--format=json"]);
       assert.equal(badStatus.status, 2, badStatus.stdout);
       assert.equal(JSON.parse(badStatus.stdout).error.code, "INVALID_ARGUMENT");

       const badId = run(["backlog","resolve","--id","does-not-exist","--status","done","--workspace",root,"--format=json"]);
       assert.equal(badId.status, 4, badId.stdout);
       assert.equal(JSON.parse(badId.stdout).error.code, "CHANGE_INVALID");

       const alreadyDone = run(["backlog","resolve","--id",add.id,"--status","dismissed","--workspace",root,"--format=json"]);
       assert.equal(alreadyDone.status, 4, alreadyDone.stdout);
       assert.equal(JSON.parse(alreadyDone.stdout).error.code, "CHANGE_CONFLICT");
     } finally { rmSync(root, { recursive: true, force: true }); }
   });
   ```

2. Run `node --import jiti/register --test src/cli/cli.test.ts`.
   Expected red: `backlog resolve` is an unrecognized command
   (`args.ts` has no `COMMAND_OPTIONS` entry for `backlog.resolve`, so it
   falls through to the default "Unknown command" case) — the first
   assertion (`ok.status === 0`) fails.
3. In `src/cli/args.ts`, add `["backlog.resolve", new Set(["id", "status"])],`
   to `COMMAND_OPTIONS`, next to the existing `backlog.list` entry.
4. In `src/cli/commands.ts`, add `resolveBacklogItem` to the existing
   `import { listBacklog, upsertBacklogItem, readBacklog, type BacklogArea, type BacklogPriority, type BacklogSource, type BacklogStatus } from "../change/backlog.js";`.
   Add, after the `case "backlog.list":` block:

   ```typescript
   case "backlog.resolve": {
   	const id = requireValue(args.id, "id");
   	const status = args.status;
   	if (status !== "done" && status !== "dismissed") throw new CodepatrolError("INVALID_ARGUMENT", `INVALID_ARGUMENT: backlog resolve --status must be done or dismissed, got ${status}.`, 2);
   	const item = resolveBacklogItem(workspace, id, status);
   	return { data: { id: item.id, status: item.status }, text: `${item.id} -> ${item.status}` };
   }
   ```

5. In `src/cli/output.ts`, add `  backlog resolve --id <item-id> --status done|dismissed`
   directly after the existing `  backlog list [--status <candidate|scheduled|done|dismissed>]`
   line in the help block.
6. Run `node --import jiti/register --test src/cli/cli.test.ts`.
   Expected green: all tests pass, including every pre-existing test in the
   file (no regression to `backlog add`/`backlog list`/`change session`/etc.).
7. Run `npm run typecheck`.
   Expected: no new errors.

**Task result:** changed paths, red/green evidence, deviations, and
assessment are appended to `apply/journal.md`.

### T3 — Final verification

**Purpose:** Confirms all six acceptance criteria hold together, the full
gate is green, and the actual surface delta matches the spec forecast.

**Depends on:** T1, T2

**Files:** None (verification only)

**Steps:**

1. Run `npm run verify` (typecheck + full test suite + build + smoke-cli +
   lint-skills). Expected: all steps pass, 0 failures, no new warnings.
2. Run `git status --porcelain` and confirm the changed-file set is exactly:
   `src/change/backlog.ts`, `src/change/backlog.test.ts`,
   `src/change/issue-sync.test.ts`, `src/cli/args.ts`, `src/cli/commands.ts`,
   `src/cli/output.ts`, `src/cli/cli.test.ts` — no undeclared work. (The
   `.codepatrol/backlog/items.yaml` follow-up entry and this Change's own
   `.codepatrol/changes/2026-07-26-backlog-resolve/` directory were committed
   during Plan/are Apply-owned respectively, not part of this check.)
3. Re-read AC-1 through AC-6 against the new tests; confirm each is
   satisfied by name and by the actual red/green evidence recorded in T1/T2.
4. Confirm actual surface delta (7 files, ~40 production+test lines) matches
   the spec's forecast; reconcile any difference.
5. Confirm no `DC-1`/`DC-2` trigger fired during implementation (no evidence
   surfaced a need for a reason field or for auto-resolve-on-close beyond
   what was already filed as a follow-up).
6. Graph sync: not required — no exported symbol removed or renamed, only
   additive exports (`resolveBacklogItem`); state this explicitly rather
   than running `codepatrol graph sync` needlessly.
7. Rollback check: confirm `git revert` of the resulting commit would
   cleanly remove the new command with no migration or data dependency
   (existing items with any status remain valid — `resolveBacklogItem` never
   ran automatically, only via explicit CLI invocation).

**Task result:** final gate output, diff reconciliation, and residual-risk
statement are appended to `apply/journal.md`.
