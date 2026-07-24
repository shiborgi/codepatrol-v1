# Plan investigation evidence (v2 re-scan)

Baseline: `main` @ `3ba78c140712fbeb35dbc31ada0b4b62cc102d85`; branch `codepatrol/2026-07-24-architecture-assessment-v2`. Graph: 73 files, 1869 symbols.

## v1 reconciliation

- F1 Stage-Session ergonomics — delivered (`codepatrol/committed/2026-07-24-architecture-assessment`).
- F5 CLI input ergonomics — delivered (`codepatrol/committed/2026-07-24-cli-input-ergonomics`).
- F3 migration scatter — migration-centralization delivered (`codepatrol/committed/2026-07-24-migration-normalizer`); the `transitionChangeLocked` decomposition half is still open (see N3).
- F4 persona consolidation — delivered (`codepatrol/committed/2026-07-24-persona-subevent-helpers`).
- F2 usage hollow — external gap: `src/change/usage.ts` fully supports `measured`; no CLI-readable authoritative per-run usage source. Not a code defect.
- F6 distribution — by-design: `scripts/install-lib.mjs` uses only `symlinkSync`; README ships only the symlink installer; no copy-install path promised.
- F7 wiki unused — adoption decision: `src/wiki/*` (889 LOC) wired (`src/cli/commands.ts:106` `generateWiki`; `skills/catalog.yaml:95` `codebase-wiki`) but `wiki status` → `exists:false`.

## New findings (verified)

- **N1 — dead `ErrorCode` members.** `src/shared/errors.ts:7` `ARTIFACT_INVALID`, `:13` `WORKFLOW_NOT_FOUND`, `:14` `WORKFLOW_INVALID`, `:15` `WORKFLOW_CONFLICT` — zero references across `src`/`scripts`/`skills` outside the union. Live-by-contrast: `PUSH_FAILED` (`src/change/git.ts:110`), `STATE_INCOMPATIBLE` (`src/wiki/record.ts:198`), `GRAPH_NOT_FOUND` (2 uses).
- **N2 — durability primitive untested.** `src/shared/atomic-store.ts` has no direct test; exercised only indirectly via `change/session.ts`, `change/store.ts`, `graph/store.ts`, `wiki/record.ts`. Also no direct test: `src/graph/languages.ts`, `src/graph/queries.ts`.
- **N3 — `transitionChangeLocked` density.** `src/change/orchestrator.ts:206-293` (~88 lines), mixed responsibilities. Carry of v1 F3's decomposition half.
- **N4 — un-normalized report reader.** `src/change/improvement-report.ts:33` reads records without `migrateRecord` (v1 F3 DC-2); has a test file but not for legacy inputs.
- No `TODO`/`FIXME`/`HACK` markers in `src`.

## Recurring signal (accepted cost)

- Every improvement report recommends batching `change.transition`/`change.session` invocations. This is inherent to the one-event-per-transition contract; recorded as an accepted design cost, not a defect.

## Baseline health

- `npm run verify` exit 0 at `3ba78c1` — established by the prior Change's Verify.
