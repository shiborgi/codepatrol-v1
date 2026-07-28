# Plan - Unify offline work, Change, branch and issue identity

- Work id: `2026-07-27-unify-issue-change-kanban`
- Governing spec: `spec.md`
- Target baseline: `main` at `8e28c44d71c926d1691f160bcb5098acf1264404`

## Goal and approach

Replace the dual `BacklogItem.id`/nullable `workId` model with one tracked
`WorkItem` per work id. Keep lifecycle state in the existing Change, derive the
branch from the same id, publish issues one-way only when sync is explicitly
requested, and render a six-column local Kanban joined directly by work id.
Migrate all existing backlog data offline before sealing the candidate.

## Global constraints

- Core lifecycle, backlog, next, status and Kanban commands must pass with no `gh` binary/network.
- GitHub state never changes local priority, description, disposition or Change stage.
- Preserve all v2 Change records/checkpoints/tags; no Change schema migration.
- Every new durable Work path is workspace-contained and exact-key validated.
- Use existing locks/atomic writes; never add a dependency.
- Preserve unrelated user paths and stop for re-planning on semantic deviation.
- Every task starts with its stated red test and journals exact red/green evidence.
- Final verification runs `npm run verify` and exact base-to-candidate path inspection.

## Expected surface

Production/data:

- Modify `src/shared/state.ts`.
- Modify `src/change/backlog.ts`, `issue-sync.ts`, `board.ts`, `types.ts`, `model.ts`, `orchestrator.ts`, `sync.ts`.
- Modify `src/cli/args.ts`, `commands.ts`, `output.ts`.
- Modify `scripts/render-kanban.mjs`.
- Delete `.codepatrol/backlog/items.yaml`; create deterministic `.codepatrol/work/*.yaml` migration outputs.
- Add `docs/adr/0001-offline-work-identity.md`.

Tests/contracts:

- Modify direct tests for backlog/Work, issue sync, board, Change/model, start/link, Close/backlog, sync, CLI and Kanban script.
- Modify `AGENTS.md`, `CONTEXT.md`, `README.md`.
- Modify `skills/codepatrol-plan/SKILL.md`, `skills/codepatrol-status/SKILL.md`, `skills/codepatrol-sync/SKILL.md`, `skills/_shared/CODEPATROL-CLI.md`, `skills/catalog.yaml` and `scripts/skills-contract.test.mjs`.
- No other production, configuration, dependency or durable-lifecycle path.

## Acceptance mapping

| Criterion | Tasks | Verification |
|---|---|---|
| AC-1 | T1, T6 | Work/migration focused tests; migrated path reconciliation |
| AC-2 | T1, T2, T4 | offline Work/lifecycle/CLI/Kanban tests with a failing GhAdapter |
| AC-3 | T2 | start Work ownership and failure-cleanup integration tests |
| AC-4 | T2 | Close Work disposition and no-auto-feed integration tests |
| AC-5 | T3 | issue publication unit/CLI/sync tests with FakeGhAdapter |
| AC-6 | T4 | pure board and script tests |
| AC-7 | T4 | model projection and exact compact-cell tests |
| AC-8 | T5 | skill contract, CLI help and documentation assertions |
| AC-9 | T6 | focused suites, migration, `npm run verify`, final diff |

## Dependency order

`T1 -> T2 -> T3`; `T1 -> T4`; `T2,T3,T4 -> T5 -> T6`.

### T1 - Introduce canonical local Work storage and legacy migration

**Purpose:** Establish AC-1/AC-2's offline source of truth before lifecycle,
remote or board consumers change.

**Files:**

- Modify `src/shared/state.ts`: replace backlog-root helpers with
  `workRootRelativePath()` and `workRelativePath(workId)`.
- Rewrite `src/change/backlog.ts`: Work schema, per-work CRUD, deterministic
  migration and compatibility-only legacy parser.
- Rewrite `src/change/backlog.test.ts`: Work validation/storage/migration tests.

**Interfaces:**

- Export `WorkPriority`, `WorkStatus`, `WorkIssueRef`, `WorkItem` and
  `AddWorkInput` exactly as specified.
- Export `workPath`, `readWork`, `listWork`, `addWork`, `resolveWork`,
  `writeWork`, and `migrateLegacyBacklog(workspace, changes, options?)`.
- `migrateLegacyBacklog` returns `{ created: string[]; removedLegacy: boolean;
  dryRun: boolean }`; `options.dryRun` performs no writes.
- Existing function names/types (`BacklogItem`, `upsertBacklogItem`,
  `linkBacklogItem`, `readBacklog`, fuzzy dedup/classification) are removed.

**Red first:**

1. Replace old backlog tests with cases asserting one file per work, exact
   filename/payload identity, unsafe/mismatched rejection, priority ordering,
   idempotent identical add, conflicting add and terminal resolve behavior.
2. Add migration fixtures covering linked and unlinked legacy items, long ids,
   deterministic hash suffix, generated collision rejection, preserved issue
   metadata/description, Change-only bootstrap records (including the current
   Change shape), dry-run zero writes, retry over byte-identical partial output,
   conflicting partial output and legacy deletion only after complete success.
3. Run `node --test --import jiti/register src/change/backlog.test.ts`.
   Expected red: new Work exports/storage do not exist and old monolithic
   behavior fails the per-work assertions.

**Implementation:**

1. Add state path helpers using `resolveInside`; preserve all unrelated state
   helpers.
2. Implement exact Work schema validation with work-id regex shared literally
   with Change validation (do not introduce a new generic validator in this
   Change), ISO timestamps, allowed priority/status and issue shape.
3. Use `withWorkspaceLock` keyed by `work-${workId}` for one-record
   writes and `work-migration` for migration. Use `atomicWriteFile` and sorted
   directory reads; reject symlinks/non-files through existing workspace
   containment behavior.
4. Implement complete migration preflight before writes. Compose description
   in stable section order: legacy title, area, evidence, source, count and
   legacy id. Merge a legacy item and matching Change by work id; Change outcome
   wins terminal disposition. Create p2 Work for every Change with no item.
5. Keep legacy parsing private and reachable only from migration.

**Green:** focused test passes, then `npm run typecheck` passes.

### T2 - Collapse lifecycle and local CLI onto work id

**Purpose:** Remove nullable promotion linkage and make start/Close operate on
the same Work identity (AC-2/AC-3/AC-4).

**Files:**

- Modify `src/change/types.ts`: remove `backlogItemId`; add optional
  `priority` to `StartChangeInput`; retain `title` for direct Work creation.
- Modify `src/change/orchestrator.ts`: Work-aware start ownership/cleanup,
  exact Close disposition, remove backlog scanning and trace auto-upsert.
- Rewrite `src/change/start-backlog-link.test.ts` around start/Work behavior.
- Rewrite `src/change/backlog-close-integration.test.ts` around exact Work
  Close behavior and report-only recommendations.
- Update other direct `startChange` fixture helpers only where the input type or
  newly-created Work path changes expected scoped commits.
- Modify `src/cli/commands.ts`, `src/cli/output.ts`, `src/cli/args.ts` and
  `src/cli/cli.test.ts` for Work payloads/list/status and `backlog migrate`.

**Interfaces and behavior:**

- Direct `change start` with no Work creates `{workId, priority ?? "p2",
  description: title, status:"open"}` and owns that path for cleanup.
- Start with existing open Work uses its first nonblank description line as
  Change title; terminal Work rejects with `CHANGE_CONFLICT`.
- Checkpoint path accounting treats only `.codepatrol/work/<this-work-id>.yaml`
  as lifecycle metadata for that same Change, replacing the former special
  allowance for the global backlog file; another Work path remains unexpected.
- If start fails, delete only Work created by that invocation; never delete a
  pre-existing record.
- `backlog add` input is exactly `workId`, `priority`, `description`.
- `backlog list --status` accepts open/done/dismissed and remains local.
- `backlog resolve --id <work-id>` edits exactly that Work.
- `backlog migrate [--dry-run]` calls `inspectChanges(...,{all:true})` then the
  T1 migration; it performs no Git commit.
- Close commit/rollback updates only `.codepatrol/work/<work-id>.yaml`, includes
  it in scoped terminal paths, and fails `CHANGE_DRIFT` when a nonterminal
  Change lacks Work.
- Improvement report generation remains; automatic `upsertBacklogItem` loop is
  deleted.

**Red first:**

1. Start tests: direct start creates Work; existing Work is reused; independent
   backlog id is rejected at input validation; terminal Work rejects; failures
   before/after branch creation clean only newly-owned Work.
2. Close tests: commit -> done, rollback -> dismissed, unrelated Work unchanged,
   recommendations create no Work, and missing Work fails closed.
3. CLI tests: exact new add/list/resolve/migrate envelopes; all commands run
   with an adapter that throws on any GitHub call.
4. Run focused start/Close/CLI tests. Expected red: old linkage/status and
   auto-feed behavior contradict all new assertions.

**Green:** focused tests and typecheck pass; no network adapter is touched.

### T3 - Make GitHub a one-way optional visualization

**Purpose:** Satisfy AC-5 without weakening offline ownership.

**Files:**

- Rewrite `src/change/issue-sync.ts` and `src/change/issue-sync.test.ts`.
- Modify `src/change/sync.ts`, `src/change/sync.test.ts`.
- Modify `src/cli/args.ts`, `commands.ts`, `output.ts`,
  `src/cli/issues-sync.test.ts`, and affected CLI registration tests.

**Interfaces:**

- `RemoteIssue` includes `body`; `GhAdapter` adds `editIssue` and `reopenIssue`.
- `NodeGhAdapter.listIssues` filters `codepatrol-backlog` and requests
  number/title/body/state/url.
- `syncIssues(workspace, changes, {gh,dryRun,signal})` has no direction.
- Result reports `created`, `edited`, `reopened`, `closed`, `linked` and
  `unchanged` work ids plus dry-run.
- `issues sync` and `sync --issues` remove `--direction`; ref sync behavior is
  unchanged.

**Red first:**

1. Replace pull-authority tests with one-way cases: canonical create; title/body
   edit; reopen local-open remote-closed; completed/not-planned closure;
   stored-number match; marker fallback; duplicate/conflicting match rejection;
   local status/description unchanged after hostile remote edits; dry-run zero
   local/remote writes; adapter unavailable affects sync only.
2. CLI/sync tests assert `--direction` is rejected and local lifecycle/status
   commands never invoke GhAdapter.
3. Run issue/CLI/sync focused tests. Expected red: current sync copies remote
   state into local schema and lacks canonical edit/reopen operations.

**Implementation:**

1. Format exact title/body in pure functions and parse only generated body
   marker; never parse remote text into governing Work fields.
2. Build the complete reconciliation action list before mutating. Detect all
   duplicate/conflicting matches first.
3. Execute actions deterministically by priority/work id; update issue metadata
   in local Work only after corresponding remote success. Dry-run executes none.
4. Keep sync error explicit/retryable; do not affect local Work on adapter
   availability failure.

**Green:** all focused tests and typecheck pass.

### T4 - Render the six-column unified Kanban

**Purpose:** Satisfy AC-6/AC-7 with a pure offline projection.

**Files:**

- Modify `src/change/types.ts`, `src/change/model.ts`, `src/change/change.test.ts`.
- Rewrite `src/change/board.ts`, `src/change/board.test.ts`.
- Modify `src/cli/commands.ts` status/next projections and related CLI tests.
- Modify `scripts/render-kanban.mjs` and `scripts/render-kanban.test.mjs`.

**Interfaces:**

- `StageAttempt.harness?: string` is projection-only.
- `foldChange` sets harness from latest event actor for that attempt; no Change
  event/schema key changes.
- `projectKanban(works, changes, options)` replaces backlogItems option and joins
  exact work ids.
- `KanbanRow` contains only workId plus six display cells and internal sort
  metadata; renderer emits exactly six public columns.

**Red first:**

1. Exact-header assertion for Backlog/Plan/Review/Apply/Verify/Close only.
2. Join cases: backlog-only, direct-start Work+Change one row, no duplicate,
   priority ordering, terminal/dismissed hidden/default and shown with `--all`,
   historical Change fallback.
3. Exact stage format with actor/harness, latest attempt, aggregate stage time,
   measured and unavailable token coverage; assert no branch/Total/next action.
4. Script and CLI status use the same pure projector and local Work files.
5. Run board/model/script/CLI focused tests. Expected red: current nine-column
   shape, nullable join and missing harness violate assertions.

**Green:** focused tests and typecheck pass; locale/clock determinism remains.

### T5 - Align governing contracts and architecture record

**Purpose:** Make AC-8 portable and remove stale dual-model instructions.

**Files:**

- Add `docs/adr/0001-offline-work-identity.md`.
- Modify `AGENTS.md`, `CONTEXT.md`, `README.md`.
- Modify Plan, Status and Sync skill contracts, shared CLI reference and
  `skills/catalog.yaml`.
- Modify `scripts/skills-contract.test.mjs` and any package/contract assertion
  that names the old Kanban or backlog path.

**Required content:**

- ADR records local Work authority, one work-id relation, per-work paths,
  one-way optional GitHub visualization, migration and rejected remote truth.
- AGENTS declares `.codepatrol/work/<work-id>.yaml` as the tracked backlog
  exception and removes `items.yaml`/auto-feed claims.
- Plan skill creates explicit follow-up work id/priority/description, commits
  that one Work file, and never requires network.
- Status contract names exactly six columns and compact four-part stage cells.
- Sync contract owns all remote issue reads/writes and describes one-way
  publication; dry-run remains zero-write.
- README/CONTEXT/CLI help use Work terminology and exact payloads.

**Red first:** update contract tests to reject `items.yaml`, nullable backlog
linking, pull/both directions and old nine-column text, and require offline plus
`[pN] work-id` publication statements. Run skill/contract tests; expected red
against current docs. Then edit contracts and run green.

### T6 - Migrate repository data and run final verification

**Purpose:** Complete AC-1/AC-9 and produce a usable candidate, including the
Work record needed to Close this Change under the new model.

**Steps:**

1. Run all focused suites from T1-T5 once together.
2. Run `npm run build`, then
   `node bin/codepatrol.js backlog migrate --workspace "$PWD" --format json`.
   Expected: schema-1 `.codepatrol/backlog/items.yaml` removed; deterministic
   `.codepatrol/work/*.yaml` created for every legacy item and every discovered
   Change, including `2026-07-27-unify-issue-change-kanban`; zero network calls.
3. Rerun the migration command. Expected: idempotent, zero created/changed,
   legacy already absent accepted.
4. Run `codepatrol status --workspace "$PWD"` and `npm run kanban --
   --workspace "$PWD" --format markdown`. Expected: byte-identical six-column
   tables and no network access.
5. Run `npm run verify`.
6. Run `git diff --check` and
   `git diff --name-status 8e28c44d71c926d1691f160bcb5098acf1264404...HEAD -- . ':!.codepatrol/changes/2026-07-27-unify-issue-change-kanban'`.
   Reconcile every path with Expected surface and migration result; enumerate
   all generated Work paths in `apply/journal.md` and Apply `changes`.
7. Confirm no dependency/config change, no Change event schema change, no live
   GitHub mutation, DC-1/DC-3 did not trigger, and rollback restores legacy data
   byte-for-byte from Git.

**Task result:** journal exact commands, counts, migrated paths, AC mapping,
offline proof, residual risks and rollback proof. The Apply checkpoint must be
clean and bind all production/data/contract paths.
