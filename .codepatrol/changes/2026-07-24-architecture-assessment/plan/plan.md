# Plan — Architecture, skills, and workflow assessment with Stage-Session ergonomics fix

- Work id: `2026-07-24-architecture-assessment`
- Governing spec: `spec.md`
- Target baseline: `main` @ `415f779bde14e57ad0af7ac4cd25657bcea00fcd`; clean worktree; `npm run verify` green.

## Goal and approach

Deliver (A) a durable ranked assessment of architecture, skills, and workflow, and (B) the #1 finding implemented: read-only Stage-Session `status` projection plus a claim error that names the blocking dependency. Implementation is confined to the session module, its CLI seam, one shared skill doc, and its contract test. The assessment document is authored independently. A final task runs the full gate and reconciles the diff.

## Global constraints

- Node ESM + TypeScript; `.js` import specifiers; two-tab indentation and the terse single-statement style already in `src/change/session.ts`.
- Preserve invariants: claim-one-before-mutation, session-never-owns-lifecycle validation (`forbidden` set), current-attempt guard, atomic writes via `atomicWriteJson`.
- The new `status` path and `readStageSession` MUST NOT write to disk.
- Keep the `CHANGE_CONFLICT` code and the `Session item is not ready: <id>` message prefix.
- No new dependencies, config keys, events, or on-disk schema changes.
- Gate that must stay green: `npm run typecheck && npm test && npm run build && npm run smoke:cli && npm run lint:skills`.

## Simplicity proof

- Selected rung: direct local change reusing `readySessionItems` (`session.ts:73`) and `deriveItems` (`session.ts:44`).
- Reused capabilities: existing session validation/write path, existing `change.session` CLI dispatch, existing `skills-contract` SESSION.md assertion seam.
- Forbidden speculative surface: no batch claim/close, no new error code, no config, no lifecycle/persona changes.
- Expected surface delta: modify `src/change/session.ts`, `src/cli/commands.ts`, `skills/_shared/SESSION.md`, `scripts/skills-contract.test.mjs`, `src/change/change.test.ts`, `src/cli/cli.test.ts`; create `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md`.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T2 | `node --test --import jiti/register src/cli/cli.test.ts` (status action returns ready + blocked, exit 0) |
| AC-2 | T1 | `node --test --import jiti/register src/change/change.test.ts` (claim names blocker) |
| AC-3 | T1 | `node --test --import jiti/register src/change/change.test.ts` (no file written by read-only status) |
| AC-4 | T3 | `node --test --import jiti/register scripts/skills-contract.test.mjs` + grep `status` in `SESSION.md` |
| AC-5 | T4 | Inspect `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md` for ranked findings, evidence, follow-ups |
| AC-6 | T5 | `npm run verify` exits 0 |

## Dependency order

`T1 → T2`; `T1 → T3`; `T4` is independent (owns only the assessment doc); `T5` depends on `T1, T2, T3, T4`.

### T1 — Session status projection, read-only accessor, and blocking-aware claim error

**Purpose:** Satisfies AC-2 and AC-3 and provides the `sessionStatus`/`readStageSession` surface T2 consumes.

**Depends on:** None

**Files:**

- Modify: `src/change/session.ts` — add `sessionStatus`, `readStageSession`, extract `loadOrDerive`, enrich `claimSessionItem`
- Modify: `src/change/change.test.ts` — unit tests for the above

**Interfaces:**

- Produces:
  - `interface BlockedItem { id: string; title: string; blockedBy: { id: string; status: SessionItem["status"] | "missing" }[] }`
  - `interface SessionStatusView { ready: SessionItem[]; blocked: BlockedItem[]; claimed: SessionItem[]; closed: SessionItem[] }`
  - `function sessionStatus(session: StageSession): SessionStatusView`
  - `function readStageSession(workspace: string, workId: string, stage: Stage, attempt: number, now?: Date): StageSession`
- Consumes: existing `readySessionItems`, `deriveItems`, `foldChange`, `readChangeRecord`, `stageSessionPath`.
- Invariants/errors: `readStageSession` performs no write when the session file is absent; `claimSessionItem` still throws `CHANGE_CONFLICT` for a not-ready item, now naming the blocker.

**Simplicity proof:** Reuse `readySessionItems` and the current-attempt guard already in `primeStageSession`; extract `loadOrDerive` so `prime` (writes) and `readStageSession` (no write) share one derivation without duplicating logic.

**Surface delta:** +2 exported functions, +2 interfaces in one existing file; unit tests added; no dependency or config added.

**Steps:**

1. Add these tests to `src/change/change.test.ts` (new `test(...)` blocks, reusing existing imports `primeStageSession, claimSessionItem, closeSessionItem` and adding `sessionStatus, readStageSession`):

   ```typescript
   test("sessionStatus reports ready and dependency-blocked items", () => {
     const session = {
       schema_version: 1 as const, work_id: "2026-07-22-active", stage: "apply" as const, attempt: 1,
       next_action: "x", updated_at: "2026-07-22T10:00:00Z",
       items: [
         { id: "T1", title: "a", status: "closed" as const, dependencies: [] },
         { id: "T2", title: "b", status: "open" as const, dependencies: ["T1"] },
         { id: "T3", title: "c", status: "open" as const, dependencies: ["T2"] },
       ],
     };
     const view = sessionStatus(session);
     assert.deepEqual(view.ready.map((i) => i.id), ["T2"]);
     assert.deepEqual(view.blocked.map((b) => [b.id, b.blockedBy.map((d) => [d.id, d.status])]), [["T3", [["T2", "open"]]]]);
   });

   test("readStageSession does not write when no session file exists", () => {
     const workspace = mkdtempSync(join(tmpdir(), "codepatrol-status-"));
     // build a Change with an active plan attempt (reuse the helper used by the session test above)
     // ...create record with change-started at plan/1 (mirror the existing "Stage Sessions are scoped" setup)...
     const path = stageSessionPath(workspace, "2026-07-22-active", "plan", 1);
     assert.equal(existsSync(path), false);
     const view = readStageSession(workspace, "2026-07-22-active", "plan", 1);
     assert.equal(view.items[0]?.status, "open");
     assert.equal(existsSync(path), false);
   });

   test("claim of a blocked item names the blocking dependency", async () => {
     // reuse the Apply-session setup that yields items T1, T2 (T2 depends on T1)
     await assert.rejects(
       claimSessionItem(workspace, record.identity.work_id, "apply", 1, "T2", "codex"),
       (e: unknown) => e instanceof CodepatrolError && e.code === "CHANGE_CONFLICT" && /T2/.test(e.message) && /T1/.test(e.message),
     );
   });
   ```

   Mirror the record/workspace construction already present in the "Apply session rebuilds deterministic plan tasks" test (`change.test.ts:109-127`) for the workspace + record setup; import `existsSync` from `node:fs` if not already imported.

2. Run `node --test --import jiti/register src/change/change.test.ts`.
   Expected red: `sessionStatus`/`readStageSession` are missing exports (reference errors) and the claim message lacks `T1`; a setup/syntax failure is not accepted.
3. Implement in `src/change/session.ts`:
   - Export `BlockedItem`, `SessionStatusView`, `sessionStatus(session)` computing `ready = readySessionItems(session)`, `blocked` = open items with ≥1 dependency whose resolved status ≠ `closed` (status `"missing"` when the dependency id is absent), plus `claimed`/`closed` filters.
   - Extract `function loadOrDerive(workspace, workId, stage, attempt, now)` returning `{ session, fromDisk }` from the current `primeStageSession` body; keep the `view.stage/attempt/terminal` guard. `primeStageSession` calls it and `write(...)` only when `!fromDisk`. `readStageSession` returns `loadOrDerive(...).session` and never writes.
   - In `claimSessionItem`, when `readySessionItems(session).find(...)` is undefined, inspect the item: absent → `... is not ready: <id> — no such item.`; status `claimed`/`closed` → `... is not ready: <id> — already <status>.`; otherwise list unclosed deps from `sessionStatus` → `... is not ready: <id> — blocked by <depId> (<status>)[, ...].`
4. Run `node --test --import jiti/register src/change/change.test.ts`.
   Expected green: all three new tests pass and existing session tests still pass.
5. Run `npm run typecheck`. Expected: clean (jiti transpiles but does not type-check, so this is the real type gate).

**Task result:** append changed paths, red/green evidence, and any deviation to `apply/journal.md`.

### T2 — CLI `status` action for `change session`

**Purpose:** Satisfies AC-1 by surfacing claimable and blocked items in one read-only call.

**Depends on:** T1

**Files:**

- Modify: `src/cli/commands.ts` — add `status` branch to the `change.session` switch
- Modify: `src/cli/cli.test.ts` — CLI test for the action

**Interfaces:**

- Consumes: `readStageSession`, `sessionStatus` from T1.
- Produces: `change.session` action `status` returning `{ data: { session, status }, text }` where `text` lists ready item ids and each blocked item with its blocker(s).
- Invariants/errors: read-only; `payload.action` union extended to include `"status"`; unknown action still errors.

**Simplicity proof:** Reuse the existing `readJsonInput` + switch dispatch in `commands.ts:124-133`; only one branch and a text renderer are added.

**Surface delta:** one new switch branch; one CLI test; no new files.

**Steps:**

1. Add to `src/cli/cli.test.ts` a test that: starts a Change, primes an apply session with dependent items (or reuses an existing fixture that yields ready/blocked items), then runs `["change", "session", "--id", id, "--input", "-", "--workspace", root]` piping `{"action":"status","stage":...,"attempt":1}` and asserts `status === 0`, the JSON `data.status.ready` contains the expected id, and stdout text mentions that id. Follow the existing `run(...)` helper pattern (`cli.test.ts:38`).
2. Run `node --test --import jiti/register src/cli/cli.test.ts`.
   Expected red: `Session action must be prime, claim, close, or rebuild` (action `status` unknown).
3. Implement: extend the `payload.action` type union with `"status"`; add `else if (payload.action === "status") { const session = readStageSession(workspace, id, payload.stage, payload.attempt); data = { session, status: sessionStatus(session) }; }` and, in the returned `text`, render a summary (ready ids; blocked `id — blocked by dep(status)`), falling back to `data.next_action` when `data` is a plain session. Keep other branches' `text: data.next_action` behavior; compute `text` per branch so the `status` branch returns its summary.
4. Run `node --test --import jiti/register src/cli/cli.test.ts`. Expected green.
5. Run `npm run smoke:cli`. Expected: existing smoke passes (no regression in CLI wiring).

**Task result:** append evidence to `apply/journal.md`.

### T3 — Document the `status` action in SESSION.md and lock it in the contract test

**Purpose:** Satisfies AC-4 so agents use `status` instead of re-priming, realizing the invocation-count reduction.

**Depends on:** T1

**Files:**

- Modify: `skills/_shared/SESSION.md` — document the read-only `status` action and blocking-dependency claim feedback
- Modify: `scripts/skills-contract.test.mjs` — assert SESSION.md documents `status`

**Interfaces:**

- Produces: prose in `SESSION.md` instructing the operator to query `status` (read-only) to discover claimable items and that a failed claim names the blocking dependency.
- Invariants/errors: the new assertion matches a stable token, not a full sentence.

**Simplicity proof:** Reuse the existing SESSION.md assertion block at `scripts/skills-contract.test.mjs:30`.

**Surface delta:** doc paragraph + one assertion line.

**Steps:**

1. Add to `scripts/skills-contract.test.mjs` (near line 30) an assertion: `assert.match(session, /status/);` scoped so it reflects the new action prose (e.g., assert the file contains both `status` and `blocked`/`blocking` near the claim guidance). Choose tokens present only after the doc edit.
2. Run `node --test --import jiti/register scripts/skills-contract.test.mjs`. Expected red: the new assertion fails.
3. Edit `skills/_shared/SESSION.md`: add a sentence — query the read-only `status` action to list claimable (ready) items and blocked items with their unclosed dependencies before claiming, and note that a failed claim reports the blocking dependency. Keep existing sentences intact so `assert.match(session, /never own lifecycle/i)` and the runtime-path assertion still pass.
4. Run `node --test --import jiti/register scripts/skills-contract.test.mjs`. Expected green.
5. Run `npm run lint:skills`. Expected: passes.

**Task result:** append evidence to `apply/journal.md`.

### T4 — Author the architecture/skills/workflow assessment

**Purpose:** Satisfies AC-5.

**Depends on:** None

**Files:**

- Create: `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md`

**Interfaces:**

- Produces: a ranked findings document (F1–F7 per spec Proposed design A), each with severity, `file:line` evidence, impact, and one proposed bounded follow-up work-id; F1 marked implemented in this Change; a short method note (graph revision, gate baseline, telemetry sources).

**Simplicity proof:** Pure documentation; no code dependency.

**Surface delta:** +1 file under `docs/`.

**Steps:**

1. Write the document with a ranked table (finding, area architecture|skills|workflow, severity, evidence `file:line`, proposed follow-up work-id) followed by one subsection per finding. Cite only verified locations from the spec's Current evidence and Proposed design.
2. Verify every cited `file:line` exists (`sed -n` / open) before sealing; correct any drifted reference.

**Task result:** append evidence to `apply/journal.md`.

### T5 — Final verification and reconciliation

**Purpose:** Confirms AC-6 and the whole-Change integrity.

**Depends on:** T1, T2, T3, T4

**Files:**

- Modify: none (verification only; journal is Apply-owned)

**Steps:**

1. Map delivered paths back to AC-1…AC-6 and confirm each check passed.
2. Run the full gate: `npm run verify`. Expected exit 0 (this is also enforced at the Apply `implemented` checkpoint by `.codepatrol/config.json` `applyGate`).
3. Inspect the final diff (`git diff --stat` vs base `415f779`) for undeclared work; confirm only the seven declared paths changed.
4. Reconcile actual surface delta with the spec forecast; explain any difference in the journal.
5. Record whether any `DC-N` trigger activated (expected: none).
6. Run `codepatrol graph sync`; wiki remains absent (valid) — no wiki refresh required.
7. State rollback (revert branch; no migration) and residual risks (F2–F7 remain as recorded follow-ups).

**Task result:** append the final reconciliation to `apply/journal.md`.
