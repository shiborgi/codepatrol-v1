# Specification — Structured, prioritized backlog under `.codepatrol/backlog/`: auto-fed from Close trace analysis and Plan splits, listed by `codepatrol next --stage plan`, and shown as a Kanban "Backlog" column

## Intent

- Origin: improve-codebase
- Mode: feature
- Target baseline: `main` @ `8b474386e91d68f320dedbe2cc8c91673f474aed`; clean worktree; `npm run verify` green at baseline.
- Governing constraints: `AGENTS.md:16-17` and `docs/runtime-state.md:23-25` currently prohibit a root-`.codepatrol/` global workflow ledger. The maintainer has explicitly chosen to sanction one — a single structured, tracked, deduplicated follow-up queue at `.codepatrol/backlog/items.yaml`. **This Change amends both governing docs (T1) to record that sanctioned exception**, so the implementation never contradicts a source of truth (the exact gap that returned this Change's first Plan attempt). `skills/_shared/CHANGE.md`'s stage-ownership boundary is respected by placing the new durable file at the top-level sanctioned location, not inside any stage-owned `close/`. `skills/_shared/STAGE-IO.md`'s CLI-renders/skill-echoes-verbatim contract is extended to the Plan entry list (the prioritized backlog) and the Kanban. `CONTEXT.md` gains a "Backlog" term.
- Substrate state: graph synced at baseline (66 files, 1640 symbols).
- Improvement signals (most recent report `.codepatrol/changes/2026-07-24-project-structure-review/close/improvement-report.md`):
  - "Top error code: CHANGE_INVALID (1). Investigate the first occurrence's args and stage context."
  - "Command \"change.transition\" was invoked 15 times — consider caching or batching repeated invocations." (Recurring across reports, only the count varies — the concrete motivating example for dedup.)
- Problem: The maintainer asked for a persistent backlog that (1) is automatically analyzed and appended from trace data every time Close runs, with a priority classification; (2) is appended when a Plan validates that the requested work is too large for one bounded Change and must be split; (3) is shown — ordered by priority — alongside the active-Change list when `codepatrol next --stage plan` runs with no specific work id; and (4) appears as a new initial "Backlog" column in the Kanban, with items flowing into the existing Plan→Close columns once promoted to a Change. The mechanism must be deterministic and harness/model-independent, matching the `next`/`change summary`/Kanban pattern already established this session.
- Outcome: `.codepatrol/backlog/items.yaml` is a structured, schema-validated, tracked file; `codepatrol backlog add` upserts an item with dedup (bump count/lastSeenAt, keep highest priority, never resurrect a terminal status) and `codepatrol backlog list` renders it; Close automatically upserts each non-filler trace-derived recommendation as a `close-trace` item with a deterministic P0–P3 priority; `codepatrol next --stage plan` (and the no-stage case) renders the open backlog sorted by priority above the "start new" hint; `codepatrol change start` gains an optional `backlogItemId` that links the new Change to its originating backlog item (status → `scheduled`) so the Kanban can show the flow; and the Kanban gains a first "Backlog" column.

## Scope

### In scope

- **Governing-doc amendment (T1):** amend `AGENTS.md:16-17` to record the sanctioned `.codepatrol/backlog/` exception to the "no global workflow ledger" rule; amend `docs/runtime-state.md` to document `.codepatrol/backlog/items.yaml` as a tracked top-level follow-up queue distinct from rebuildable `.codepatrol/runtime/`; add a "Backlog" domain term to `CONTEXT.md`.
- **New module `src/change/backlog.ts` (T2):** `BacklogItem`/`Backlog` types, `schema_version: 1`, exact-keys validation (mirroring `session.ts:19`); `readBacklog` (default empty; `CHANGE_INVALID` on malformed); `writeBacklog` (`atomicWriteFile` + `yaml.stringify`, mirroring `store.ts`); `dedupKey(title)` (lowercase, strip digits, collapse non-alphanumeric runs to `-`, trim); `classifyPriority(title)` (deterministic keyword mapping → `p0|p1|p2|p3`); `upsertBacklogItem` (create or bump; on dedup-match bump `count`/`lastSeenAt`, keep the higher of old/new `priority`, never resurrect a `done`/`dismissed`/`scheduled` item to `candidate`); `linkBacklogItem(workspace, itemId, workId)` (sets `workId` + `status:"scheduled"`); `listBacklog(workspace, {status?, open?})` (sorted priority p0→p3 then count desc).
- **CLI `backlog add` / `backlog list` (T3):** wired through `src/cli/args.ts`/`src/cli/commands.ts`/`src/cli/output.ts` (`renderBacklogList`), with CLI tests. `add --input -` reads JSON `{title, area, priority, evidence, source:{kind,workId}}`; `list [--status <s>]` renders text + JSON.
- **Close hook (T4):** inside the existing best-effort `try/catch` at `src/change/orchestrator.ts:390`, after `mirrorImprovementReport`, re-call the pure `generateImprovementReport(workspace, workId)` to obtain `recommendations`, exclude the two filler strings, and `upsertBacklogItem` once per remaining recommendation with `source:{kind:"close-trace", workId}`, `area:"workflow"`, `priority: classifyPriority(rec)`.
- **`change start` linkage (T5):** extend `StartChangeInput` (`types.ts:52`) and `assertStartInput` (`orchestrator.ts:40`) with optional `backlogItemId?`; after a successful start in `startChangeLocked`, call `linkBacklogItem` (item existence validated before branch creation → `INVALID_ARGUMENT` if missing).
- **`next --stage plan` prioritized list (T6):** `case "next"` (`commands.ts:57`) fetches open backlog items for the plan/no-stage case; `data` gains `backlog: BacklogItem[]`; `renderNext` (`output.ts:139`) gains an optional `backlog` parameter and renders a prioritized "Backlog" section above the "start new" hint. Other stages render no backlog section.
- **Kanban "Backlog" column (T7):** `board.ts` `KanbanRow` gains a `backlog` cell; `projectKanban` links promoted items to their Change row (via `BacklogItem.workId`) and appends backlog-only items (candidate/scheduled, no `workId`) as rows whose lifecycle cells are `-`; `renderKanbanMarkdown` header becomes `| Work | Branch | Backlog | Plan | Review | Apply | Verify | Close | Total |`. Tests in `board.test.ts`.
- **Plan-skill instruction (T8):** `skills/codepatrol-plan/SKILL.md` entry line mentions reviewing the backlog, and a new instruction calls `codepatrol backlog add --input -` (`source.kind:"plan-followup"`) for each follow-up when a Plan's scope exceeds one bounded Change; `scripts/skills-contract.test.mjs` asserts the wiring.
- **Final verification (T9).**

### Out of scope

- A one-command `codepatrol backlog promote --id <id>` that starts the Change and links in one step — deferred (DC-1). Promotion in this Change is via `change start` with `backlogItemId`, which provides the linkage the Kanban needs.
- Retroactive backfill of the backlog from the 11 existing improvement reports/assessments — deferred (DC-4); the backlog starts empty and accumulates going forward.
- Semantic dedup beyond digit-stripping — deferred (DC-3).
- Any change to lifecycle transition semantics, event schema, or checkpoint validation. The `change-started` event schema is unchanged (`backlogItemId` is consumed at start time only; it is not persisted in the event).
- Any change to `.codepatrol/assessments/` or `docs/codepatrol/improvement-reports/` location.

## Current evidence

(All read this investigation on the working tree at base `8b47438`; full detail in `plan/evidence/investigation.md`.)

- `src/change/improvement-report.ts:61` `generateImprovementReport` → `recommendations: string[]` (`:18`,`:157`); the 5 non-filler templates at `:136,:139,:142,:145,:148`; the 2 filler strings at `:133,:152`. Confidence: high (read).
- `src/change/orchestrator.ts:390` best-effort `try/catch` (import `:11`) — the precedent the Close hook extends. `writeImprovementReport`/`mirrorImprovementReport` each have one production call site. Confidence: high (grep).
- Recurring dedup evidence at `.codepatrol/changes/2026-07-24-project-structure-review/close/improvement-report.md:39`. Confidence: high (read).
- `src/change/session.ts:19` exact-keys validate; `src/shared/atomic-store.ts:5` `atomicWriteFile`; `src/change/store.ts` `yaml.stringify` pattern; `src/change/trace.ts:81` `read`. Confidence: high.
- `src/cli/args.ts:32,37,125`; `src/cli/commands.ts:57,117,121,144`; `src/cli/output.ts:139-154` + `HELP`. Confidence: high.
- `src/change/board.ts:5,19,30,31` Kanban row/project/render/header; `scripts/render-kanban.mjs` wiring. Confidence: high.
- `src/change/types.ts:52` `StartChangeInput`; `orchestrator.ts:40,165` `assertStartInput`/`startChangeLocked`. Confidence: high.
- `.codepatrol/backlog/items.yaml` is not gitignored (`git check-ignore` → not ignored); `.codepatrol/backlog/` absent on `main`. Confidence: high.
- Baseline `npm run verify` exit 0 at `8b47438` (prior Change's terminal commit). Confidence: high.

## Proposed design

**Storage — `.codepatrol/backlog/items.yaml`** (single structured, tracked file inside the `.codepatrol/backlog/` directory; room for future index/splits without a schema change):

```yaml
schema_version: 1
items:
  - id: <slug>                 # stable, = dedupKey(title) at creation
    title: <string>
    priority: p0 | p1 | p2 | p3
    area: architecture | workflow | skills
    status: candidate | scheduled | done | dismissed
    evidence: [<string>]       # free-text or file:line citations
    source: { kind: close-trace | plan-followup, workId: <string> }
    workId: <string | null>    # set when promoted to a Change (Kanban linkage)
    count: <integer>           # times this dedup key was seen
    firstSeenAt: <ISO>
    lastSeenAt: <ISO>
```

**`src/change/backlog.ts`:**
- `dedupKey(title)`: lowercase, strip `[0-9]`, collapse non-`[a-z]` runs to a single `-`, trim leading/trailing `-`. ("Command x invoked 13 times" ≡ "…invoked 47 times".)
- `classifyPriority(title)`: deterministic keyword mapping — contains "error code"/"no orchestrator events" → `p1`; contains "returned" (stage-return friction) → `p2`; contains "invoked … times"/"caching or batching" → `p3`; default → `p3`. (Close-trace items never auto-classify above p1; genuinely p0 items are manual.)
- `upsertBacklogItem(workspace, {title, area, priority?, evidence, source}, now?)`: read-or-init; compute key; if an item with `dedupKey(item.title) === key` exists, bump `count` and `lastSeenAt`, set `priority` to the higher of old/new, and leave `status`/`workId`/`title`/`evidence` untouched; else create with `id=dedupKey(title)`, `status:"candidate"`, `priority: priority ?? classifyPriority(title)`, `count:1`, `firstSeenAt=lastSeenAt=now`. Validate (exact-keys) before writing.
- `linkBacklogItem(workspace, itemId, workId)`: load, find by `id`, set `workId` and `status:"scheduled"`; throw `CHANGE_INVALID` if the item is missing. (Does not resurrect `done`/`dismissed` — those throw `CHANGE_CONFLICT`.)
- `listBacklog(workspace, {status?, open?})`: read, optional filter, sort priority p0→p3 then `count` desc then `lastSeenAt` desc.

**CLI:** `backlog.add` validates `{title, area∈enum, priority∈enum, source.kind∈enum, source.workId}` and calls `upsertBacklogItem`; `backlog.list` calls `listBacklog` and renders `renderBacklogList` (text) or the array (JSON).

**Close hook:** inside the existing best-effort block, after `mirrorImprovementReport`, `const report = generateImprovementReport(workspace, workId);` then for each `rec` in `report.recommendations` not equal to either filler string, `upsertBacklogItem(workspace, { title: rec, area: "workflow", evidence: [], source: { kind: "close-trace", workId } })` (priority auto-classified). Failure stays inside the same `try/catch` → `process.stderr.write`, never fails Close.

**`change start` linkage:** `StartChangeInput` gains `backlogItemId?: string`; `assertStartInput` allows it; if present, `startChangeLocked` validates the item exists and is promotable before creating the branch, and calls `linkBacklogItem(workspace, backlogItemId, workId)` after the record is written. The `change-started` event is unchanged (the linkage lives in `items.yaml`, not the event).

**`next` enrichment:** for `stage === "plan" || !stage`, `case "next"` adds `backlog: listBacklog(workspace, { open: true })` to `data`; `renderNext` gains `backlog?: BacklogItem[]` and renders a "Backlog" section (id, title, priority, area, status, count) above "To start a new change". Non-plan stages omit it.

**Kanban:** `KanbanRow` gains `backlog: string`. `projectKanban` builds `workId → BacklogItem` from items that carry a `workId`; for each Change row it fills `row.backlog` from the linked item (e.g. `p2 · <id>`) when present, else `-`. It then appends backlog-only items (status `candidate`/`scheduled`, no `workId`) as extra rows: `work` = `<id> <title>`, `branch` = `-`, `backlog` = `<priority> · <status>`, all lifecycle cells `-`. Header becomes `| Work | Branch | Backlog | Plan | Review | Apply | Verify | Close | Total |` (`renderKanbanMarkdown:31`). JSON rows gain the `backlog` field.

**Dependency direction:** `backlog.ts` is a new leaf under `src/change/`, imported by `orchestrator.ts` (Close hook + start linkage), `cli/commands.ts` (commands + `next`), and `board.ts` (Kanban read). No existing public interface changes except `renderNext`/`projectKanban`/`KanbanRow` (additive) and `StartChangeInput` (additive optional field).

## Alternatives

- **Locate the backlog under `docs/` (the prior Review's suggested fix).** Rejected by the maintainer's explicit choice of `.codepatrol/backlog/`: the backlog is operational project state tightly coupled to the lifecycle (auto-fed by Close, read by `next`/Kanban), not a durable *decision* document of the kind `docs/`/`docs/adr/` hold. The maintainer instead sanctions the `.codepatrol/` location and amends the governing docs (T1) to make it explicit.
- **Single root file `.codepatrol/backlog.yaml` (attempt 1).** Rejected on rework: a bare root file read as a raw ledger; the directory `.codepatrol/backlog/items.yaml` is no different in kind but the amended governing docs now sanction it explicitly, and the directory leaves room for a future index without a schema break.
- **Dedup by exact string match.** Rejected: the recurring "invoked N times" evidence shows the count varies while the pattern repeats; exact match would not collapse them.
- **Close hook calls the `backlog add` CLI as a subprocess.** Rejected: unnecessary process spawn inside an already best-effort in-process `try/catch`; direct module import matches the existing improvement-report calls.
- **Persist `backlogItemId` on the `change-started` event.** Rejected: the event schema is immutable lifecycle truth and the linkage is operational, not lifecycle; storing it in `items.yaml` keeps the event schema untouched.

## Simplicity decision

- Selected rung: direct local change — one new leaf module reusing established validation/atomic-write/CLI/Kanban patterns; no new dependency.
- Earlier rungs: need is real (explicit maintainer request, grounded in recurring-recommendation evidence); no existing module provides deduplicated cross-Change backlog tracking.
- Irreducible complexity: the dedup key + priority classification + the Kanban item↔Change linkage; hidden behind `backlog.ts`.
- Safety floor: Close's backlog write is best-effort and non-blocking (matches the improvement-report precedent); schema validation rejects malformed records (fail-closed, like `session.ts`); `change start` linkage validates item existence before branch creation; full gate green; the governing-doc amendment keeps implementation and sources of truth consistent.
- Expected surface delta: create `src/change/backlog.ts`, `src/change/backlog.test.ts`; modify `AGENTS.md`, `docs/runtime-state.md`, `CONTEXT.md`, `src/cli/{args,commands,output,cli.test}.ts`, `src/change/{orchestrator,board,types}.ts`, `src/change/{close-integration,board}.test.ts` (+ a start-linkage test), `skills/codepatrol-plan/SKILL.md`, `scripts/skills-contract.test.mjs`. No new dependencies or config; one new tracked path `.codepatrol/backlog/items.yaml`.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | Link-on-start only; no one-command `backlog promote` | Promotion is two steps (mark + start) | Maintainer wants one-command promotion | Add `codepatrol backlog promote --id <id>` that calls `change start` + `linkBacklogItem` |
| DC-2 | Priority auto-classification is keyword-heuristic | A genuinely p0 close-trace signal is under-flagged (never above p1) | Maintainer notices a buried important item | Widen `classifyPriority` or add `--priority` override on the Close hook |
| DC-3 | Dedup strips digits only | Two differently-worded recommendations about one issue create separate items | Maintainer observes near-duplicate entries | Widen `dedupKey` (stemming/stopwords) |
| DC-4 | No retroactive backfill from existing reports/assessments | Backlog starts empty | Maintainer wants historical items | A `backlog backfill` command scanning closed Changes' `close/improvement-report.md` |

## Compatibility and rollout

- New tracked file (`.codepatrol/backlog/items.yaml`, starts absent → empty on first read), new CLI commands, two additive Kanban/`next` fields, one additive optional `StartChangeInput` field, one best-effort Close side-effect (failure-isolated), one skill-instruction addition, and an explicit governing-doc amendment. No existing command, event schema, checkpoint, or Git behavior changes. Rollback = revert the branch; the backlog file is new (no migration). No security/privacy/performance/accessibility impact — the overhead is a small YAML read/write at Close and a read at `next`/Kanban.

## Risks and mitigations

- **Governing-doc contradiction resurfaces.** Mitigation: T1 amends `AGENTS.md:16-17` and `docs/runtime-state.md` in the same Change; the spec's governing-constraints section names both; Review/Verify re-check both lines.
- **A backlog write inside Close is swallowed, hiding a bug.** Mitigation: matches the improvement-report precedent (`process.stderr.write` on failure); dedicated `backlog.test.ts` exercises `upsertBacklogItem`/`linkBacklogItem` directly.
- **Malformed `items.yaml` breaks `next --stage plan`/Kanban.** Mitigation: `readBacklog` validates on read (`CHANGE_INVALID`, fail-closed); a corrupt file is a loud, actionable error, not a silent misrender.
- **Kanban row explosion / duplicate rows.** Mitigation: a promoted item (has `workId`) is rendered only in its linked Change row; backlog-only items (no `workId`) are the only extra rows; `projectKanban`'s existing duplicate-`work_id` guard is preserved.
- **Dedup collision merges distinct items.** Mitigation: DC-3; collision only bumps `count` (first-seen `title`/`evidence` preserved; never data loss).

## Acceptance criteria

- AC-1: `codepatrol backlog add --input -` (valid JSON) creates a new `candidate` item in `.codepatrol/backlog/items.yaml`; a second `add` whose title normalizes to the same `dedupKey` bumps `count` to 2 and updates `lastSeenAt` instead of duplicating, and keeps the higher `priority`.
- AC-2: `codepatrol backlog list` renders a deterministic table (text and `--format json`) ordered priority p0→p3 then count; `--status candidate` filters correctly.
- AC-3: Closing a Change whose trace yields a non-filler recommendation creates a `close-trace` item with a deterministic priority; closing with only filler recommendations adds nothing; a failure inside the backlog hook does not fail Close.
- AC-4: `codepatrol next --stage plan` (and the no-stage case) includes a prioritized "Backlog" section and a JSON `backlog` array of open items; `next --stage review|apply|verify|close` include no backlog section.
- AC-5: `codepatrol change start --input -` with a valid `backlogItemId` sets that item's `workId` and `status:"scheduled"`; the new Change's Kanban row shows a populated "Backlog" cell and the item is not also rendered as a backlog-only row; a missing `backlogItemId` fails start with `INVALID_ARGUMENT` before the branch is created.
- AC-6: Both Kanban render paths — `codepatrol status --format markdown` (`src/cli/commands.ts:54`, the primary Kanban command) and `scripts/render-kanban.mjs --format markdown` — render a first "Backlog" column; backlog-only items appear as rows with lifecycle cells `-`; a promoted item's row shows its priority in the Backlog cell and its lifecycle progress in the stage cells. The two views agree (both pass `readBacklog(workspace).items` to `projectKanban`).
- AC-7: `AGENTS.md:16-17` and `docs/runtime-state.md` explicitly sanction `.codepatrol/backlog/`; `CONTEXT.md` defines "Backlog"; `skills/codepatrol-plan/SKILL.md` mentions the backlog and instructs `backlog add` for plan-split follow-ups; `scripts/skills-contract.test.mjs` asserts the SKILL wiring.
- AC-8: `npm run verify` exits 0 on the candidate (enforced at Apply seal by `.codepatrol/config.json` `applyGate`).

## Decisions and open questions

- Decided (maintainer, this session): sanction `.codepatrol/backlog/` and amend the governing docs (resolves the prior rework's finding).
- Decided (maintainer, this session): unified Kanban rows — backlog items flow into the Plan→Close columns via `workId` linkage on `change start`.
- Decided (maintainer, this session): P0–P3 priority as the ordering axis; close-trace auto-classification never exceeds p1; link-on-start now, one-command promote deferred (DC-1).
- Decided: store the linkage in `items.yaml`, not on the immutable `change-started` event.
- No open question can materially change scope, interfaces, or acceptance.
