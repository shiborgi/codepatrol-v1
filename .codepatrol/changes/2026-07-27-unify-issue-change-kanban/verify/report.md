# Verification - Unify offline work, Change, branch and issue identity

- Change: `2026-07-27-unify-issue-change-kanban`
- Verified revision: 1
- Verifier: opencode
- Base ref: `8e28c44d71c926d1691f160bcb5098acf1264404`
- Candidate commit: `a0e55fe44734e821871fbe4626ff33b0deca0551`
- Candidate tree: `2d86630e9a3bf14404a5c4ed51ccb6d99851f698`
- Evidence date: 2026-07-28T00:29:57Z

## Scope and instruments

- Read accepted `plan/spec.md`, `plan/plan.md`, `plan/evidence/investigation.md`, `review/report.md`, and `apply/journal.md`.
- Audited the base-to-candidate diff with `git diff --name-status`, `git diff --check`, candidate commit/tree resolution, and the Apply `changes` declaration.
- Candidate binding is exact: `git show -s --format='%H%n%T' a0e55fe...` returned `a0e55fe44734e821871fbe4626ff33b0deca0551` and `2d86630e9a3bf14404a5c4ed51ccb6d99851f698`.
- Current HEAD is the Verify-begin bookkeeping commit `958b6e5e6c3009fba6a247fe4046c4563f97b732`; its non-candidate delta is limited to this Change's `change.yaml` and own Work record. `git status --porcelain` was empty and `git diff --check` passed.
- No live GitHub call was made. Remote behavior was exercised through existing fake-adapter tests; this is sufficient for the offline-first contract but cannot prove current GitHub credentials or remote state.

## Plan conformance

- T1: `src/change/backlog.ts` replaces monolithic backlog access with validated, per-work Work records and deterministic migration; 58 migrated Work files plus the Change Work are declared production paths.
- T2: lifecycle and CLI start/Close paths use exact work ids and Work dispositions; no `backlogItemId` linkage remains.
- T3: `issue-sync.ts` is local-to-GitHub only, with canonical title/body, duplicate protection, and dry-run behavior.
- T4: `board.ts` projects exactly six columns and compact event-derived stage cells. The live CLI and render script emitted byte-identical tables.
- T5: ADR, governing documents, public skill contracts, catalog and contract tests describe the offline Work authority.
- T6: legacy data is removed and migrated into declared Work files. The two additional paths versus the initial forecast, `src/shared/errors.ts` and `docs/runtime-state.md`, are journaled deviations and are necessary for the migration gate and contract consistency.
- No unjournaled implementation or semantic deviation found. DC-1, DC-2, and DC-3 triggers did not activate.

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of journal |
|---|---|---|---|
| AC-1 | focused `backlog.test.ts` in the command below | pass: per-work validation, migration, retry, collision and dry-run cases | yes |
| AC-2 | focused CLI/lifecycle/issue tests and `npm run verify` | pass: offline listing and fake-adapter unavailability cases pass | yes |
| AC-3 | focused `start-backlog-link.test.ts` | pass: create, reuse, terminal rejection and cleanup cases | yes |
| AC-4 | focused `backlog-close-integration.test.ts` | pass: exact Work terminal disposition and report-only recommendations | yes |
| AC-5 | focused `issue-sync.test.ts`, `sync.test.ts`, and `issues-sync.test.ts` | pass: one-way creation, reconciliation, duplicate failure and dry-run cases | yes |
| AC-6 | focused `board.test.ts` and live Status/render-script comparison | pass: exact six-column header, joins, fallback and sorting | yes |
| AC-7 | focused `board.test.ts` and live output | pass: exact compact cell format and partial-usage marker | yes |
| AC-8 | `scripts/skills-contract.test.mjs` and `npm run verify` | pass: current contracts reject legacy remote/pull/nullable model | yes |
| AC-9 | `npm run verify` | pass: 262 tests, build, CLI smoke and skill lint | yes |

Focused command executed:

```text
node --test --import jiti/register src/change/backlog.test.ts src/change/start-backlog-link.test.ts src/change/backlog-close-integration.test.ts src/change/issue-sync.test.ts src/change/board.test.ts src/change/sync.test.ts src/cli/cli.test.ts src/cli/issues-sync.test.ts scripts/render-kanban.test.mjs scripts/skills-contract.test.mjs
```

Result: `tests 96`, `pass 96`, `fail 0`.

## Wider suite

- `npm run verify`: passed. Decisive result: `tests 262`, `pass 262`, `fail 0`; build passed; `Compiled CLI smoke passed (0.1.0).`; skill catalog validation passed.
- `git diff --check 8e28c44...a0e55fe...`: passed.
- `codepatrol graph sync --workspace "$PWD" --format json`: passed, 76 files and 2,448 symbols.
- `codepatrol status` and `node --import jiti/register scripts/render-kanban.mjs --workspace "$PWD" --format markdown`: emitted identical six-column tables. The active Change row has only Backlog/Plan/Review/Apply/Verify/Close cells.

## Blast radius

- `codepatrol graph impact --workspace "$PWD" --since-ref 8e28c44d71c926d1691f160bcb5098acf1264404 --format json` reported direct affected lifecycle, CLI, usage, close, tracing and graph seams, with 22 affected tests and graph-related possibly affected tests.
- The broad gate exercised all affected test seams and the graph suite; focused coverage additionally exercised all changed Work, lifecycle, issue-sync, board, CLI and contract seams.
- No impacted production seam outside the Plan's declared lifecycle/CLI/board/sync surface requires a correction.

## Regressions

- Existing Close, sync, graph, trace, usage and CLI suites passed under `npm run verify`.
- Existing expected test stderr such as fixture `fatal: Needed a single revision` and simulated trace failures occurred only in passing negative-path tests; no command failure or source drift resulted.

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| `src/shared/errors.ts` | no | accepted journaled deviation: defines `MIGRATION_REQUIRED` required by the specified gate |
| `docs/runtime-state.md` | no | accepted journaled deviation: removes stale legacy queue contract |
| `.codepatrol/work/*.yaml` | yes | 58 migrated records plus exact Work record for this Change |

## Findings

No critical, major, or minor findings.

## Residual risks and evidence gaps

- Live GitHub publication was intentionally not run; fake-adapter tests establish behavior, while current remote authentication/state remains unverified.
- First explicit `sync --issues` after Close may edit existing labeled issue prose to the canonical local representation. This is the documented DC-3 one-way ownership behavior.
- Token counters remain unavailable for all recorded runs; the board accurately marks coverage as partial rather than estimating usage.

## Verdict

`commit`

The candidate exactly binds to `a0e55fe44734e821871fbe4626ff33b0deca0551` and tree `2d86630e9a3bf14404a5c4ed51ccb6d99851f698`, satisfies AC-1 through AC-9 independently, has no production drift after candidate sealing, and passes both focused and broad gates. Verify may advance only to `codepatrol-close 2026-07-27-unify-issue-change-kanban commit|rollback on codepatrol/2026-07-27-unify-issue-change-kanban`.
