# Implementation — Unify offline work, Change, branch and issue identity

- Package revision: 1
- Approval: `review/report.md` verdict approve
- Target start ref: `8e28c44d71c926d1691f160bcb5098acf1264404` (main)
- Actor: opencode
- Status: implemented

## Baseline reconciliation
All accepted artifact SHA-256 hashes re-validated before the first mutation;
checkout was the recorded branch with a clean tree and unchanged target. One
stray rebuildable runtime trace from a mis-scoped Review-stage inspect was
removed before Review began; no durable drift. Review carried one minor note:
the spec's CLI section omits `backlog migrate` and the migration signature
gained `changes`/`options` parameters — recorded here as implemented:
`backlog migrate [--dry-run]` and
`migrateLegacyBacklog(workspace, changes, options?)`.

## Task journal

### T1 — Introduce canonical local Work storage and legacy migration

- Claim/workflow item: T1
- Started: 2026-07-27T23:35Z
- Files changed: `src/shared/state.ts`, `src/shared/errors.ts`, `src/change/backlog.ts`, `src/change/backlog.test.ts`
- Simplicity check: approved rung holds — reused `resolveInside`, `atomicWriteFile`, `withWorkspaceLock`, exact-key guards and the literal Change work-id regex; no new generic validator or dependency.
- Surface delta: removed `BacklogItem`/`upsertBacklogItem`/`linkBacklogItem`/`readBacklog`/`writeBacklog`/`listBacklog`/`findBacklogItem`/`resolveBacklogItem`/`dedupKey`/`classifyPriority` and `backlogRelativePath`/`backlogRelativePrefix`; added `WorkItem`/`workPath`/`readWork`/`listWork`/`writeWork`/`addWork`/`resolveWork`/`migrateLegacyBacklog`/`assertWorkId`, `workRootRelativePath`/`workRelativePath`, and error code `MIGRATION_REQUIRED` (spec-named, used by all gated reads).
- Red evidence: `node --test --import jiti/register src/change/backlog.test.ts` — 16/16 failed (new Work exports/storage absent).
- Green evidence: same command — 16/16 pass; downstream typecheck errors expected at this point (T2–T4 surface).
- Assessment: migration derives capped deterministic ids, preflights uniqueness, accepts byte-identical retry, fails closed on conflict and deletes legacy only after all outputs validate; Change outcome wins terminal disposition; Change-only records bootstrap as p2 (including this Change's shape).
- Result: complete

### T2 — Collapse lifecycle and local CLI onto work id

- Claim/workflow item: T2
- Started: 2026-07-27T23:50Z
- Files changed: `src/change/types.ts`, `src/change/orchestrator.ts`, `src/cli/commands.ts`, `src/cli/args.ts`, `src/cli/output.ts`, `src/change/start-backlog-link.test.ts`, `src/change/backlog-close-integration.test.ts`, `src/change/git.test-helper.ts`, `src/cli/cli.test.ts`
- Simplicity check: nullable promotion link and fuzzy identity removed; start ownership reuses existing cleanup ladder; no new abstraction.
- Surface delta: `StartChangeInput` loses `backlogItemId`, gains optional `priority`; checkpoint path accounting now treats only `.codepatrol/work/<this-work-id>.yaml` as lifecycle metadata (every other Work path and the legacy deletion count as production); Close writes exactly one Work disposition and commits it in the terminal commit; Close no longer auto-upserts trace recommendations; CLI gains `backlog migrate [--dry-run]`; `backlog add/list/resolve` payloads are exact work-id shapes; `--direction` is rejected as an unknown option.
- Red evidence: rewritten start/Close/CLI suites failed against the old linkage (`backlogItemId` unknown field, missing Work creation, auto-feed removed).
- Green evidence: `node --test --import jiti/register src/change/start-backlog-link.test.ts src/change/backlog-close-integration.test.ts` — 12/12 pass; `src/cli/cli.test.ts` — 22/22 pass; `npm run typecheck` clean.
- Assessment: start failure after Work creation deletes only newly-owned Work (blocking-file test); terminal Work rejects before branch creation; missing Work at Close fails `CHANGE_DRIFT`; manual mid-lifecycle dismissal is overwritten by the Close disposition.
- Result: complete

### T3 — Make GitHub a one-way optional visualization

- Claim/workflow item: T3
- Started: 2026-07-28T00:05Z
- Files changed: `src/change/issue-sync.ts`, `src/change/issue-sync.test.ts`, `src/change/sync.ts`, `src/change/sync.test.ts`, `src/cli/issues-sync.test.ts`
- Simplicity check: pull authority deleted outright; matching is three ordered pure rules over existing adapter operations plus `editIssue`/`reopenIssue`.
- Surface delta: `RemoteIssue` gains `body`; `GhAdapter` gains `editIssue`/`reopenIssue`; `NodeGhAdapter.listIssues` filters the `codepatrol-backlog` label and requests body; `syncIssues(workspace, changes, {gh,dryRun,signal})` has no direction; result reports `created/edited/reopened/closed/linked/unchanged` work ids.
- Red evidence: rewritten one-way suites failed against pull semantics (`pulled`/`pushed` result shape, direction argument).
- Green evidence: `node --test --import jiti/register src/change/issue-sync.test.ts src/change/sync.test.ts src/cli/issues-sync.test.ts` — 26/26 pass.
- Assessment: complete action list is built and duplicate/cross-claimed matches fail closed before any mutation; hostile remote edits never alter local status/priority/description; dry-run performs zero local/remote writes; adapter unavailability aborts sync only.
- Result: complete

### T4 — Render the six-column unified Kanban

- Claim/workflow item: T4
- Started: 2026-07-28T00:15Z
- Files changed: `src/change/types.ts` (StageAttempt.harness), `src/change/model.ts`, `src/change/board.ts`, `src/change/board.test.ts`, `src/cli/commands.ts` (status/next), `scripts/render-kanban.mjs`, `scripts/render-kanban.test.mjs` (unchanged, still green)
- Simplicity check: `harness` is projection-only from the durable event actor; board stays a pure function; no durable event field added.
- Surface delta: `projectKanban(works, changes, options)` replaces the `backlogItems` option and joins by exact work id; `KanbanRow` carries workId, six cells and sort metadata; header is exactly `| Backlog | Plan | Review | Apply | Verify | Close |`; stage cells are exactly `<harness-or--> | #<attempt> | <active-time> | <total>[~]tok <m/n>`; Work/Branch/Total columns and in-table next-action prose removed.
- Red evidence: rewritten board tests failed against the nine-column shape and missing harness.
- Green evidence: `node --test --import jiti/register src/change/board.test.ts scripts/render-kanban.test.mjs` — 11/11 pass; full `npm test` — 261/261 pass.
- Assessment: fallback `[--] <work-id>` rows cover historical Changes; escaping keeps six-cell integrity with hostile descriptions; locale/clock determinism preserved (`--as-of` only).
- Result: complete

### T5 — Align governing contracts and architecture record

- Claim/workflow item: T5
- Started: 2026-07-28T00:35Z
- Files changed: `docs/adr/0001-offline-work-identity.md` (new), `AGENTS.md`, `CONTEXT.md`, `README.md`, `docs/runtime-state.md`, `skills/codepatrol-plan/SKILL.md`, `skills/codepatrol-status/SKILL.md`, `skills/codepatrol-sync/SKILL.md`, `skills/_shared/CODEPATROL-CLI.md`, `skills/catalog.yaml`, `scripts/skills-contract.test.mjs`
- Simplicity check: contract edits only; no new process or skill.
- Surface delta: ADR records local Work authority, one work-id relation, per-work paths, one-way publication, migration and rejected remote truth; contract tests now reject `items.yaml`, nullable linking, pull/both and nine-column text, and require six-column/compact-cell and `[pN] <work-id>` publication statements.
- Red evidence: new `live contracts describe local Work as truth` contract test failed against the stale docs.
- Green evidence: `node --test scripts/skills-contract.test.mjs` — 9/9 pass; `npm run lint:skills` valid.
- Assessment: `docs/runtime-state.md` also named the legacy backlog path; updated for AC-8 consistency (recorded in Deviations).
- Result: complete

## Deviations

- `docs/runtime-state.md` updated alongside the listed governing docs: it named `.codepatrol/backlog/items.yaml` as the sanctioned queue and would otherwise violate AC-8. Additive documentation surface only; no behavior change.
- Review's minor note is resolved as implemented: the spec's CLI section omitted `backlog migrate [--dry-run]` and named `migrateLegacyBacklog(workspace)`; the implemented surface is `backlog migrate [--dry-run]` and `migrateLegacyBacklog(workspace, changes, options?)` exactly as planned in T1/T2.
- No semantic deviation.

## Acceptance evidence

| Criterion | Implementation | Verification | Result |
|---|---|---|---|
| AC-1 | `backlog.ts` Work schema/migration | `backlog.test.ts` 16/16 (identity, rejection, ordering, migration fixtures) | pass |
| AC-2 | offline Work/lifecycle/CLI | full `npm test` 261/261; core commands never construct a GhAdapter | pass |
| AC-3 | `startChangeLocked` Work reuse/create/cleanup | `start-backlog-link.test.ts` 7/7 | pass |
| AC-4 | `closeChangeLocked` exact disposition, report-only recommendations | `backlog-close-integration.test.ts` 5/5 | pass |
| AC-5 | one-way `syncIssues` | `issue-sync.test.ts` 12/12, `issues-sync.test.ts` 4/4, `sync.test.ts` 10/10 | pass |
| AC-6 | six-column `projectKanban` | `board.test.ts` 10/10 (header, join, fallback, deterministic cases) | pass |
| AC-7 | compact cells + `StageAttempt.harness` projection | `board.test.ts` exact-cell cases; no token estimation anywhere | pass |
| AC-8 | contracts + ADR | `skills-contract.test.mjs` 9/9, `lint:skills` valid | pass |
| AC-9 | final gate | `npm run verify` green; diff reconciled; migration idempotent | pass |

## Surface delta

Forecast vs actual: all forecast paths landed. Actual additions beyond the
forecast: `src/shared/errors.ts` (spec-named `MIGRATION_REQUIRED` code),
`docs/runtime-state.md` (AC-8 consistency, see Deviations). No dependency,
configuration or durable-lifecycle schema change. DC-1/DC-2/DC-3 remain
dormant: branch field retained, module filename retained, one-way body
regeneration documented.

## Final verification

### T6 — Migrate repository data and run final verification

- Claim/workflow item: T6
- Commands and results:
  1. `npm test` (all focused suites together): 262/262 pass.
  2. `npm run build` then `node bin/codepatrol.js backlog migrate --workspace "$PWD" --format json`: 60 Work records created, `removedLegacy: true`, zero network calls (migration is pure local I/O; no GhAdapter exists on the path).
  3. Rerun: `{created: [], removedLegacy: false, dryRun: false}` — idempotent.
  4. `codepatrol status` vs `node --import jiti/register scripts/render-kanban.mjs --format markdown`: byte-identical six-column tables (the script's trailing newline was aligned with the CLI envelope; `render-kanban.test.mjs` still green). The active row renders `opencode | #1 | 35m42s | 0~tok 0/1`-shaped cells with no branch/total/next-action prose.
  5. `npm run verify`: typecheck, 262 tests, build, `smoke:cli`, `lint:skills` — all pass.
  6. `git diff --check` clean; `git status` delta reconciled path-by-path with Expected surface plus the two journaled additions (`src/shared/errors.ts`, `docs/runtime-state.md`) and 60 migration outputs.
  7. Confirmed: no `package.json`/lockfile/tsconfig change, no Change event schema key added (`harness` is projection-only), no live GitHub mutation (only dry-run-capable code paths; nothing executed against origin), DC-1/DC-3 not triggered.
- Migrated Work paths: all 60 records under `.codepatrol/work/` as listed by the migration result, including `2026-07-27-unify-issue-change-kanban.yaml` (this Change's lifecycle Work, excluded from production `changes` per T2 accounting); legacy `.codepatrol/backlog/items.yaml` deleted.
- Rollback proof: the legacy schema-1 file and every pre-Change source/doc path are restored byte-for-byte by checking out the base tree (`8e28c44`); no remote mutation occurred, so no remote rollback is required.
- Offline proof: `backlog migrate`, `status`, Kanban and the entire test suite ran with no `gh` invocation; sync paths are covered only by fake adapters.
- Residual risks: remote issue titles remain pre-unification until the first optional post-Close `sync --issues`; orchestrator checkpoint now commits the own-Work metadata file when present (covered by the full suite).

- Status: implemented
