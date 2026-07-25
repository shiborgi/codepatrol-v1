# Plan investigation evidence

Baseline: `main` @ `8b474386e91d68f320dedbe2cc8c91673f474aed`; branch
`codepatrol/2026-07-24-backlog-subsystem`. Graph synced: 66 files,
1640 symbols. This is the second Plan attempt for this feature; the
first (`2026-07-24-backlog-subsystem` attempt 1) was returned by Review
for a governing-contract defect (its root-`.codepatrol/backlog.yaml`
clashed with `AGENTS.md:16` / `docs/runtime-state.md:23`). The
maintainer has now explicitly sanctioned `.codepatrol/backlog/` and
added new requirements (priority classification, a Kanban "Backlog"
column, plan-split feeding). That explicit decision is recorded in the
spec and made durable by amending the two governing docs in T1.

## Governing-contract resolution (the prior rework's finding)

- `AGENTS.md:16-17`: "Do not create a root progress file, a mutable
  status mirror, a global workflow ledger, harness-specific worktrees or
  provider candidate trees." — prohibits exactly a root-`.codepatrol/`
  accumulating ledger.
- `docs/runtime-state.md:23-25`: "No root `.codepatrol` scratch JSON,
  global ledger, duplicate status cache, architecture namespace or
  durable ADR is supported. Durable project decisions belong in
  `CONTEXT.md`, `docs/adr/` or declared Change evidence."
- Resolution chosen by the maintainer (explicit instruction this
  session): sanction a single structured backlog at
  `.codepatrol/backlog/items.yaml` as a tracked, deduplicated follow-up
  queue, and amend both governing docs to record the sanctioned
  exception. The amendment is part of this Change (T1) so the
  implementation never contradicts a source of truth — the gap that
  returned attempt 1.

## Close trace → recommendations (the auto-feed source)

- `src/change/improvement-report.ts:61` `generateImprovementReport`
  returns `ImprovementReport { …, recommendations: string[] }`
  (`:18` field, `:157` return). Pure function of `(workspace, workId)`.
- Non-filler recommendation templates (each becomes a backlog item):
  - `:136` "Plan stage returned at least once — …"
  - `:139` "Review stage returned 2+ times — …"
  - `:142` "Top error code: ${code} (${count}). …"
  - `:145` "Command \"${cmd}\" was invoked ${n} times — consider
    caching or batching repeated invocations."
  - `:148` "No orchestrator events recorded — …"
- Filler strings to EXCLUDE (no backlog item):
  - `:133` "No trace available for this Change."
  - `:152` "No notable patterns detected; continue with current
    process."
- `src/change/orchestrator.ts:390` — the established best-effort
  side-channel: `try { reportPath = writeImprovementReport(…);
  mirrorImprovementReport(…); } catch (cause) {
  process.stderr.write(…) }`. The backlog upsert loop is added inside
  this same block, so a backlog failure never fails Close (matches the
  improvement-report precedent). Import at `orchestrator.ts:11`.
- `writeImprovementReport` (`improvement-report.ts:208`) returns the
  path `string` and is called from one production site
  (`orchestrator.ts:390`) plus two test sites
  (`improvement-report.test.ts:82,103`). To avoid touching its
  signature (and those tests), the Close hook re-calls the pure
  `generateImprovementReport(workspace, workId)` to obtain
  `recommendations` — confirmed cheap and side-effect-free.

## Recurring-recommendation evidence (why dedup + priority are needed)

- `.codepatrol/changes/2026-07-24-project-structure-review/close/improvement-report.md:39`
  (and its gitignored mirror): "Command \"change.transition\" was
  invoked 15 times — consider caching or batching repeated invocations."
- Prior reports this session carried the same sentence with only the
  count differing (13, 18, 20…). Naive un-deduplicated appending at
  every Close would flood the backlog — the direct justification for
  `dedupKey` stripping digits. The "Top error code: X (N)" line varies
  by error-code text (non-digit) so distinct codes correctly remain
  separate items; only the count varies within one code.

## Established patterns reused

- `src/change/session.ts:19` `validate` — exact-keys, `CHANGE_INVALID`
  on violation; mirrored for `backlog.ts`.
- `src/shared/atomic-store.ts:5` `atomicWriteFile` +
  `src/change/store.ts` `yaml.stringify(…, {lineWidth: 0})` — the
  durable-write pattern reused for `items.yaml`.
- `src/change/trace.ts:81` `read(workspace, workId)` — already the
  trace source `generateImprovementReport` consumes; no new trace code.

## Extension points for the new surfaces

- CLI: `src/cli/args.ts:32` `KNOWN`, `:37` `COMMAND_OPTIONS`,
  `:125` stage parse; `src/cli/commands.ts:57` `case "next"`,
  `:117` `case "change.transition"`, `:144` `case "change.start"`,
  `:121` `case "change.session"`; `src/cli/output.ts:139`
  `renderNext(stage, changes)` and the `HELP` block.
- `next` plan/no-stage rendering: `commands.ts:57-67` builds `data`
  (currently `{stage, changes, startNew, …}`) and calls `renderNext`;
  `renderNext` (`output.ts:139-154`) appends a "start new" hint only
  for `stage === "plan" || !stage`. The prioritized Backlog section is
  added under the same condition.
- Kanban: `src/change/board.ts:5` `KanbanRow` (columns
  work/branch/plan/review/apply/verify/close/total),
  `:19` `projectKanban(changes, options)`, `:30`
  `renderKanbanMarkdown(board)` (header at `:31`).
  `scripts/render-kanban.mjs` wires `inspectChanges` → `projectKanban`
  → `renderKanbanMarkdown`/JSON. The Backlog column is inserted as the
  first stage column and `projectKanban` merges backlog-only items
  (rows with only the Backlog cell) and links promoted items to their
  Change row via `BacklogItem.workId`.

## change-start linkage surface

- `src/change/types.ts:52` `StartChangeInput { workId, title,
  targetBranch, actor, nextAction? }`; `orchestrator.ts:40`
  `assertStartInput` uses `exactInput(value, ["workId","title",
  "targetBranch","actor","nextAction"])`; `:165`
  `startChangeLocked` creates branch + record + commits metadata, with
  rollback-on-failure. An optional `backlogItemId?` is added to the
  input + allowed list; after a successful start, `linkBacklogItem`
  sets `item.workId` and `status: "scheduled"`. The item's existence is
  validated before branch creation (fail-fast `INVALID_ARGUMENT`).

## Informal precedent for the backlog concept

- `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md`
  (F1–F7) and `-v2.md` (N1–N4) already used an ad-hoc "ranked findings
  + proposed follow-up work-id" pattern in prose, with no durable,
  queryable, deduplicated record. This Change codifies that pattern and
  makes it queryable.

## Baseline health

- `npm run verify` exit 0 at `8b47438` — established by the prior
  `2026-07-24-project-structure-review` Verify/Close (its terminal
  commit is `8b47438`).
- `.codepatrol/backlog/` does not exist on `main`; `backlog` path is
  not gitignored (`git check-ignore .codepatrol/backlog/items.yaml` →
  not ignored), so it is trackable. `.gitignore:6` ignores
  `.codepatrol/runtime/` only; `.gitignore:7` ignores
  `docs/codepatrol/improvement-reports/` (unrelated).

## Attempt 2 — Kanban two-render-path finding (from Review return)

Review attempt 1 returned `fix-first` with one bounded finding: the
Kanban has two production render paths, and attempt 1's T7 declared
only `board.ts`/`board.test.ts` and claimed disjointness while AC-6
named only the script.

- `src/cli/commands.ts:52-55` `case "status"` calls
  `projectKanban(inspectChanges(…), …)` then
  `text: renderKanbanMarkdown(data)` — this is the primary Kanban
  command (`codepatrol status`), distinct from `case "next"` at `:57`
  (which uses `renderNext`, not the Kanban).
- `scripts/render-kanban.mjs` is the second render path (same
  `projectKanban`/`renderKanbanMarkdown`).
- `rg projectKanban src scripts` → exactly two production callers:
  `commands.ts:54` and `render-kanban.mjs`.

Correction in attempt 2: AC-6 asserts both paths; T7 files add
`src/cli/commands.ts` (the `status` case) and `scripts/render-kanban.mjs`;
T7 depends on T6 (both edit `src/cli/commands.ts` — `status` vs `next`
cases, sequenced); `projectKanban` stays pure by taking an optional
`backlogItems` parameter that both callers populate from
`readBacklog(workspace).items`.

Rework-checkpoint mechanic verified: a Plan re-checkpoint after a Review
return compares trees from the plan-attempt-1 checkpoint
(`521426dc`, where `review/report.md` did not exist) to HEAD. The
invalidated review's `review/report.md` (committed during the returned
Review) must therefore be removed before re-checkpointing — otherwise
`orchestrator.ts:255` rejects it as an undeclared worktree path (a plan
checkpoint may only declare `plan/` artifacts per `validation.ts:27`).
The finding is preserved in the `stage-returned` event's `reason` and in
git history; removal is forward-only (no history rewrite).
