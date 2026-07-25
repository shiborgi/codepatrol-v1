# Plan — Structured, prioritized backlog under `.codepatrol/backlog/`: Close/Plan feeding, plan no-arg list, and a Kanban Backlog column

- Work id: `2026-07-24-backlog-subsystem`
- Governing spec: `spec.md`
- Target baseline: `main` @ `8b474386e91d68f320dedbe2cc8c91673f474aed`; clean worktree; `npm run verify` green.

## Goal and approach

Sanction + amend the governing docs (T1), add the leaf module `src/change/backlog.ts` (schema, validation, dedup, P0–P3 classification, upsert, link, list) (T2), expose `backlog add`/`list` CLI (T3), wire the best-effort Close feed (T4) and `change start` linkage (T5), render the prioritized list in `next --stage plan` (T6), add the Kanban "Backlog" column with item↔Change flow (T7), instruct the Plan skill to write `plan-followup` items (T8), then verify (T9). Each behavior-new task is test-first.

## Global constraints

- The governing-doc amendment (T1) is load-bearing for Review/Verify: `AGENTS.md:16-17` and `docs/runtime-state.md` must explicitly sanction `.codepatrol/backlog/` by the end of the Change.
- `src/change/backlog.ts` mirrors `src/change/session.ts:19` exact-keys validation (`CHANGE_INVALID` on violation) and `src/change/store.ts`/`src/shared/atomic-store.ts:5` atomic write (`atomicWriteFile` + `yaml.stringify(…, {lineWidth: 0})`).
- Close's backlog upsert is best-effort — a thrown error there must never fail Close (same `try/catch` at `orchestrator.ts:390`).
- `next --stage review|apply|verify|close` must NOT render a backlog section — only `plan`/no-stage.
- The `change-started` event schema is unchanged; the linkage lives in `items.yaml`.
- No new dependencies, no lifecycle/event-schema/checkpoint change.
- Gate: `npm run typecheck && npm test && npm run build && npm run smoke:cli && npm run lint:skills`.

## Simplicity proof

- Selected rung: direct local change — one new leaf module reusing `session.ts` validation, `store.ts`/`atomic-store.ts` writes, the `next`/`renderNext` extension point, the `board.ts` Kanban projector, and the existing Close best-effort block.
- Reused capabilities: `atomicWriteFile`, `yaml.parse`/`stringify`, `CodepatrolError`, `generateImprovementReport` (pure re-call), `projectKanban`/`renderKanbanMarkdown`, `renderNext`'s `stage === "plan" || !stage` branch.
- Forbidden speculative surface: no one-command `backlog promote` (DC-1), no semantic dedup (DC-3), no backfill (DC-4), no auto-priority above p1 for close-trace (DC-2).
- Expected surface delta: create `src/change/backlog.ts`, `src/change/backlog.test.ts`; modify `AGENTS.md`, `docs/runtime-state.md`, `CONTEXT.md`, `src/cli/{args,commands,output,cli.test}.ts`, `src/change/{orchestrator,board,types}.ts`, `src/change/{close-integration,board}.test.ts` (+ `src/change/start-backlog-link.test.ts`), `skills/codepatrol-plan/SKILL.md`, `scripts/skills-contract.test.mjs`; new tracked path `.codepatrol/backlog/items.yaml`.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 (add → create + dedup-bump, keep higher priority) | T2, T3 | `node --test src/change/backlog.test.ts`; `cli.test.ts` add-bump |
| AC-2 (list text/json ordered + `--status`) | T2, T3 | `cli.test.ts` list/filter |
| AC-3 (Close feed: non-filler→item w/ priority; filler→none; hook failure non-blocking) | T4 | close-integration test |
| AC-4 (`next --stage plan` Backlog section + json `backlog[]`; other stages omit) | T6 | `cli.test.ts` next-plan/next-verify |
| AC-5 (`change start --backlogItemId` links + schedules; Kanban row populated; missing id → `INVALID_ARGUMENT` pre-branch) | T5 | start-linkage test |
| AC-6 (Kanban first "Backlog" column; backlog-only rows; promoted flow) | T7 | `board.test.ts` + render-kanban |
| AC-7 (governing docs sanction; CONTEXT term; plan SKILL instructs `backlog add`; skills-contract asserts) | T1, T8 | `skills-contract.test.mjs`; doc grep |
| AC-8 (`npm run verify` exit 0) | T9 | applyGate |

## Dependency order

`T1` and `T2` are independent foundations. `T3` depends on `T2`. `T4` depends on `T2`. `T5` depends on `T4` (both edit `src/change/orchestrator.ts` — sequenced, not concurrent). `T6` depends on `T3` (both edit `src/cli/{commands,output,cli.test}.ts` — sequenced). `T7` depends on `T2` (board.ts reads `BacklogItem`; disjoint from T3–T6 files). `T8` is independent of T1–T7's files. `T9` depends on all.

Sequence: `T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9` (linear is simplest; T7/T8 could run after T2 in parallel with T3–T6 but own disjoint files).

### T1 — Amend governing docs to sanction `.codepatrol/backlog/`

**Purpose:** Satisfies the AC-7 governing-docs half; resolves the defect that returned attempt 1.

**Depends on:** None

**Files:**

- Modify: `AGENTS.md` (lines 16-17)
- Modify: `docs/runtime-state.md`
- Modify: `CONTEXT.md`

**Steps:**

1. Edit `AGENTS.md:16-17`: keep the prohibition and add the sanctioned exception, e.g. "Do not create a root progress file, a mutable status mirror, harness-specific worktrees or provider candidate trees. The structured backlog at `.codepatrol/backlog/items.yaml` is the sanctioned exception — a tracked, deduplicated follow-up queue auto-fed from Close trace analysis and Plan splits." (Remove "a global workflow ledger" from the prohibited list and name the backlog as the exception.)
2. Edit `docs/runtime-state.md`: add a short paragraph after the existing content stating `.codepatrol/backlog/items.yaml` is a tracked, top-level, schema-validated follow-up queue (not rebuildable runtime, not a per-Change artifact), auto-fed at Close and Plan-split, surfaced by `next --stage plan` and the Kanban.
3. Edit `CONTEXT.md`: add a "**Backlog**" term — "a prioritized (`p0`–`p3`), deduplicated queue of follow-up work at `.codepatrol/backlog/items.yaml`, auto-fed from Close trace analysis and Plan splits, surfaced by `codepatrol next --stage plan` and the Kanban's Backlog column."
4. `grep -n "global workflow ledger" AGENTS.md` → expect no hits (the phrase is removed/replaced). `grep -n "backlog" AGENTS.md docs/runtime-state.md CONTEXT.md` → expect hits in all three.

**Task result:** append to `apply/journal.md`.

### T2 — Backlog module: schema, validation, dedup, priority, upsert, link, list

**Purpose:** Satisfies AC-1/AC-2 (module half). Foundation for T3–T7.

**Depends on:** None

**Files:**

- Create: `src/change/backlog.ts`
- Create: `src/change/backlog.test.ts`

**Interfaces:**

- `interface BacklogItem { id: string; title: string; priority: "p0"|"p1"|"p2"|"p3"; area: "architecture"|"workflow"|"skills"; status: "candidate"|"scheduled"|"done"|"dismissed"; evidence: string[]; source: { kind: "close-trace"|"plan-followup"; workId: string }; workId: string | null; count: number; firstSeenAt: string; lastSeenAt: string }`
- `interface Backlog { schema_version: 1; items: BacklogItem[] }`
- `function dedupKey(title: string): string`
- `function classifyPriority(title: string): BacklogItem["priority"]`
- `function readBacklog(workspace: string): Backlog` (empty if absent; throws `CHANGE_INVALID` on malformed)
- `function upsertBacklogItem(workspace, input: { title; area; priority?; evidence: string[]; source }, now?: Date): BacklogItem`
- `function linkBacklogItem(workspace, itemId: string, workId: string, now?: Date): BacklogItem` (sets `workId`+`status:"scheduled"`; `CHANGE_INVALID` if missing; `CHANGE_CONFLICT` if `done`/`dismissed`)
- `function listBacklog(workspace, options?: { status?: BacklogItem["status"]; open?: boolean }): BacklogItem[]` (sort: priority p0→p3, then `count` desc, then `lastSeenAt` desc)

**Invariants:** dedup-bump keeps the higher priority (lower ordinal wins), never resurrects a non-`candidate` status, never overwrites first-seen `title`/`evidence`; `readBacklog` validates exact keys on read.

**Simplicity proof:** Mirrors `session.ts` validation and `store.ts` write; no new dependency.

**Steps:**

1. Write `src/change/backlog.test.ts` covering: `dedupKey('Command "x" invoked 13 times') === dedupKey('Command "x" invoked 47 times')`; `classifyPriority` maps error/no-events→p1, returned→p2, invoked-times→p3, default→p3; `upsertBacklogItem` on empty workspace creates `candidate` `count:1`; a second upsert with same dedup key bumps `count`→2, updates `lastSeenAt`, keeps first `title`/`evidence`, and keeps the higher priority (e.g. p1 wins over p3); a `done` item is not resurrected to `candidate` on bump; `linkBacklogItem` sets `workId`+`status:"scheduled"` and throws `CHANGE_INVALID` when missing / `CHANGE_CONFLICT` when `dismissed`; `listBacklog({open:true})` filters to `candidate`/`scheduled` and sorts p0→p3 then count; `readBacklog` on a hand-written malformed YAML (unknown top-level key) throws `CHANGE_INVALID`.
2. Run `node --test --import jiti/register src/change/backlog.test.ts`. Expected red: module missing.
3. Implement `src/change/backlog.ts` per the interfaces/invariants. `PRIORITY_ORDER = ["p0","p1","p2","p3"]`; "higher priority" = smaller index. `readBacklog` resolves `.codepatrol/backlog/items.yaml` via `resolveInside`; absent → `{schema_version:1,items:[]}`.
4. Run the test. Expected green.
5. Run `npm run typecheck`. Expected clean.

**Task result:** append to `apply/journal.md`.

### T3 — CLI `backlog add` and `backlog list`

**Purpose:** Satisfies AC-1/AC-2 (CLI half).

**Depends on:** T2

**Files:**

- Modify: `src/cli/args.ts` — register `backlog.add`/`backlog.list`; add `"status"` to `KNOWN`
- Modify: `src/cli/output.ts` — `renderBacklogList`; add `backlog add`/`backlog list` to `HELP`
- Modify: `src/cli/commands.ts` — `backlog.add`/`backlog.list` cases
- Modify: `src/cli/cli.test.ts` — tests

**Interfaces:**

- `renderBacklogList(items: BacklogItem[]): string` — table `id | title | priority | area | status | count`.
- CLI: `codepatrol backlog add --input -` (JSON `{title, area, priority, evidence, source:{kind,workId}}`); `codepatrol backlog list [--status <s>]`.

**Steps:**

1. Add CLI tests: `backlog add` JSON creates an item (json `data.status==="candidate"`, `data.count===1`); a second `add` with a digit-varying title bumps `count`→2 and keeps higher priority; `backlog list --format=json` returns the array ordered p0→p3; `backlog list --status dismissed` returns empty; text output of `backlog list` has a table header.
2. Run `node --test --import jiti/register src/cli/cli.test.ts`. Expected red: unknown commands.
3. Implement `args.ts` (`KNOWN`+="status"; `COMMAND_OPTIONS` += `["backlog.add", new Set(["input"])]`, `["backlog.list", new Set(["status"])]`; `ParsedArgs` += `status?: string`), `output.ts` (`renderBacklogList`; HELP lines), `commands.ts` (`case "backlog.add"` validates required+enum fields and calls `upsertBacklogItem`, `text` = `${created|upserted} ${id} (count ${count})`; `case "backlog.list"` calls `listBacklog(workspace, {status: args.status})`, `text = renderBacklogList(data)`).
4. Run the test. Expected green.
5. Run `npm run smoke:cli`. Expected clean.

**Task result:** append to `apply/journal.md`.

### T4 — Close hook: auto-upsert non-filler recommendations with priority

**Purpose:** Satisfies AC-3.

**Depends on:** T2

**Files:**

- Modify: `src/change/orchestrator.ts` (the best-effort block at `:390`; import `backlog.ts`)
- Modify: `src/change/close-integration.test.ts` (add backlog assertions) — or create `src/change/backlog-close-integration.test.ts`

**Interfaces:**

- No new export. `closeChangeLocked`'s existing best-effort block gains: `const report = generateImprovementReport(workspace, workId); for (const rec of report.recommendations) if (rec !== FILLER_1 && rec !== FILLER_2) upsertBacklogItem(workspace, { title: rec, area: "workflow", evidence: [], source: { kind: "close-trace", workId } });` — all inside the same `try/catch`.

**Steps:**

1. Add close-integration cases: (a) after closing a Change whose trace yields a real recommendation, assert `.codepatrol/backlog/items.yaml` has a `close-trace` item with `source.workId` = closed id and a deterministic priority (e.g. the "invoked N times" recommendation → `p3`); (b) a Change whose trace yields only filler → no item / empty items; (c) force the backlog write to throw (e.g. unit-test the hook path with a workspace that makes `upsertBacklogItem` throw, or inject via a malformed locked path) and assert Close still completes (terminal event + tag created).
2. Run the test(s). Expected red: no backlog item created.
3. Implement: import `{ upsertBacklogItem }` from `./backlog.js` and `{ generateImprovementReport }` (already imported); inside the existing `try` block after `mirrorImprovementReport`, re-call `generateImprovementReport(workspace, workId)` and loop over `report.recommendations` excluding the two filler strings, calling `upsertBacklogItem` per non-filler rec (priority auto-classified). Keep inside the same `try/catch`.
4. Run the test(s). Expected green.
5. Run the `src/change/*.test.ts` suite to confirm no Close/improvement-report regression.

**Task result:** append to `apply/journal.md`.

### T5 — `change start` backlog linkage

**Purpose:** Satisfies AC-5.

**Depends on:** T4 (both edit `src/change/orchestrator.ts` — sequenced, not concurrent)

**Files:**

- Modify: `src/change/types.ts` — `StartChangeInput` += `backlogItemId?: string`
- Modify: `src/change/orchestrator.ts` — `assertStartInput` allowed keys; `startChangeLocked` validate + link
- Create: `src/change/start-backlog-link.test.ts`

**Interfaces:**

- `StartChangeInput` gains optional `backlogItemId?: string`. If present, `startChangeLocked` validates the item exists and is promotable (`linkBacklogItem` semantics) BEFORE creating the branch (`INVALID_ARGUMENT`/`CHANGE_CONFLICT` fail-fast), and calls `linkBacklogItem(workspace, backlogItemId, input.workId)` after `writeChangeRecord` succeeds. The `change-started` event is unchanged.

**Steps:**

1. Write `start-backlog-link.test.ts`: with a `candidate` backlog item present, `startChange` with `backlogItemId` succeeds and the item's `workId` === new work id and `status === "scheduled"`; with a non-existent `backlogItemId`, start throws `INVALID_ARGUMENT` and the branch/record are not created; with a `dismissed` item, start throws `CHANGE_CONFLICT`; without `backlogItemId`, start is unchanged.
2. Run the test. Expected red.
3. Implement: add `backlogItemId` to `assertStartInput`'s `exactInput` allowed list; in `startChangeLocked`, if `input.backlogItemId`, call `readBacklog`/validate (reuse `linkBacklogItem`'s pre-check or a `findBacklogItem`) before `createBranch`; after `writeChangeRecord` succeeds, call `linkBacklogItem(workspace, input.backlogItemId, input.workId)`. Ensure the existing rollback-on-failure path is unchanged.
4. Run the test + `src/change/change.test.ts`. Expected green.

**Task result:** append to `apply/journal.md`.

### T6 — `next --stage plan` renders the prioritized backlog

**Purpose:** Satisfies AC-4.

**Depends on:** T3 (both edit `src/cli/{commands,output,cli.test}.ts` — sequenced)

**Files:**

- Modify: `src/cli/commands.ts` — `case "next"` fetches + passes backlog
- Modify: `src/cli/output.ts` — `renderNext` gains optional `backlog`
- Modify: `src/cli/cli.test.ts` — next tests

**Steps:**

1. Add CLI tests: with one open backlog item present, `next --stage plan --format=json` includes `data.backlog` with that item (ordered); `next --stage verify --format=json` has no `backlog` key (or empty, pick one and assert consistently); text output of `next --stage plan` contains a "Backlog" heading and the item's title; no-stage behaves like plan.
2. Run `node --test --import jiti/register src/cli/cli.test.ts`. Expected red.
3. Implement: in `case "next"`, when `!args.stage || args.stage === "plan"`, add `backlog: listBacklog(workspace, { open: true })` to `data`; pass it to `renderNext`. Extend `renderNext(stage, changes, backlog?)` to render a "Backlog" section (id/title/priority/area/status/count) above "To start a new change" when `backlog` is present (non-plan stages omit the argument → nothing rendered).
4. Run the test. Expected green.

**Task result:** append to `apply/journal.md`.

### T7 — Kanban "Backlog" column with item↔Change flow

**Purpose:** Satisfies AC-6.

**Depends on:** T2 (reads `BacklogItem`/`listBacklog`); disjoint from T3–T6 files

**Files:**

- Modify: `src/change/board.ts` — `KanbanRow.backlog`; `projectKanban` linkage + backlog-only rows; `renderKanbanMarkdown` header
- Modify: `src/change/board.test.ts` — Kanban backlog tests

**Interfaces:**

- `KanbanRow` gains `backlog: string`. `projectKanban` builds `Map<workId, BacklogItem>` from items with a `workId`; fills each Change row's `backlog` cell from the linked item (`${priority} · ${id}`) or `-`; appends backlog-only items (status `candidate`/`scheduled`, `workId == null`) as rows (`work`=`${id} ${title}`, `branch`=`-`, `backlog`=`${priority} · ${status}`, stage cells `-`, `total`=`-`). `renderKanbanMarkdown` header → `| Work | Branch | Backlog | Plan | Review | Apply | Verify | Close | Total |`.

**Invariants:** a promoted item appears in exactly one row (its Change's); the existing duplicate-`work_id` guard is preserved; backlog-only rows never duplicate a Change row.

**Steps:**

1. Add `board.test.ts` cases: with a backlog-only `candidate` p2 item and no Changes, `projectKanban([])` yields one row with `backlog`=`p2 · candidate` and all stage cells `-`; with a Change whose `workId` matches a backlog item, the Change row's `backlog` cell is populated and no separate backlog-only row exists for it; `renderKanbanMarkdown` header has "Backlog" as the first stage column; promoted + backlog-only mix renders exactly the right row count.
2. Run `node --test --import jiti/register src/change/board.test.ts`. Expected red.
3. Implement `board.ts` per the interfaces/invariants. Read items via `listBacklog(workspace, { open: true })` + also include promoted items (those with `workId`) — expose a `readBacklog`-based helper or have `projectKanban` accept the workspace and read. (Decide: `projectKanban(changes, options)` currently takes only changes; add an optional `backlogItems?: BacklogItem[]` parameter and have `render-kanban.mjs`/`commands.ts` pass `readBacklog(workspace).items`, keeping `projectKanban` pure/testable.)
4. Run the test. Expected green.
5. `node --import jiti/register scripts/render-kanban.mjs --workspace "$PWD" --format markdown` → confirm the "Backlog" column appears.

**Task result:** append to `apply/journal.md`.

### T8 — Wire `codepatrol-plan/SKILL.md` + lock via skills-contract

**Purpose:** Satisfies the AC-7 skill half.

**Depends on:** None (disjoint from T1–T7 files)

**Files:**

- Modify: `skills/codepatrol-plan/SKILL.md`
- Modify: `scripts/skills-contract.test.mjs`

**Steps:**

1. Add an assertion in `scripts/skills-contract.test.mjs`: the `codepatrol-plan` SKILL.md contains `backlog`.
2. Run `node --test --import jiti/register scripts/skills-contract.test.mjs`. Expected red.
3. Edit `skills/codepatrol-plan/SKILL.md`: entry line → "Use `codepatrol next --stage plan` to discover active Changes, review the prioritized backlog, or confirm how to start a new one."; add an instruction after the brownfield-investigation paragraph: when investigation shows the work exceeds one bounded Change, call `codepatrol backlog add --input -` for each follow-up (`source.kind: "plan-followup"`) so it is queryable and deduplicated.
4. Run the test + `npm run lint:skills`. Expected green.

**Task result:** append to `apply/journal.md`.

### T9 — Final verification and reconciliation

**Purpose:** Confirms AC-8 and whole-Change integrity.

**Depends on:** T1–T8

**Files:**

- Modify: none (verification only)

**Steps:**

1. Map delivered paths back to AC-1…AC-8; confirm each passed.
2. Run the full gate: `npm run verify`. Expected exit 0 (also enforced at Apply `implemented` by `.codepatrol/config.json` `applyGate`).
3. `git diff --stat 8b47438` — inspect for undeclared work; confirm `.codepatrol/backlog/items.yaml` is the only new tracked top-level path and `bin/`/`docs/codepatrol/assessments/` are untouched.
4. Reconcile actual surface delta with the spec forecast; explain any difference in the journal.
5. Record whether any `DC-N` trigger activated (expected: none).
6. `codepatrol graph sync`.
7. `grep -n "global workflow ledger" AGENTS.md` → expect no hits; `grep -n "backlog" AGENTS.md docs/runtime-state.md CONTEXT.md` → hits in all three (confirms T1).
8. State rollback (revert branch; `.codepatrol/backlog/items.yaml` is new, no migration) and residual risks (DC-1–DC-4).

**Task result:** append the final reconciliation to `apply/journal.md`.
