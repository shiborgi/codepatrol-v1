# Review — Unify offline work, Change, branch and issue identity

- Change: `2026-07-27-unify-issue-change-kanban`
- Incoming revision: 1
- Reviewed revision: 1
- Reviewer: opencode
- Evidence date: 2026-07-27T23:30:00Z

## Scope and evidence

- Re-verified all three declared Plan artifact SHA-256 hashes against disk: exact match for `plan/spec.md`, `plan/plan.md`, `plan/evidence/investigation.md`.
- Baseline: `git merge-base HEAD main` = `8e28c44d71c926d1691f160bcb5098acf1264404`; target `main` unchanged; checkout is the recorded branch `codepatrol/2026-07-27-unify-issue-change-kanban`; tree clean (one stray runtime trace from a mis-scoped inspect was removed before begin; it was rebuildable runtime, not durable state).
- Graph: `graph overview` reports 76 files / 2,403 symbols, matching the investigation's claim.
- Read every cited location: `backlog.ts:15-28` (BacklogItem dual identity), `backlog.ts:163-173` (linkBacklogItem nullable promotion), `orchestrator.ts:175-191` (backlogItemId start path), `orchestrator.ts:440-452` (Close nullable-scan resolution), `model.ts:31-34` (work-id grammar and branch derivation), `model.ts:75` (durable event actor), `board.ts:6,34,49-50` (nine-column row/header). All citations exact.
- Confirmed current `syncIssues` signature carries `direction: pull|push|both` (`issue-sync.ts:88-104`) and `StageAttempt` (`types.ts:28`) lacks `harness` — both match Plan rewrite assumptions.
- Confirmed every Expected-surface path exists (or is a declared create: `.codepatrol/work/`, `docs/adr/`), every named test file exists, and every command the plan runs (`node --test --import jiti/register`, `npm run typecheck`, `npm run build`, `npm run verify`, `npm run kanban`, `backlog migrate`) is executable against the current `package.json`.
- Read the full tracked legacy `.codepatrol/backlog/items.yaml` (27 items, mixed candidate/done, nullable and non-null workId, external issue refs 2-26): migration fixtures in T1 cover the linked, unlinked, long-id and Change-only shapes present.
- Confirmed `skills/catalog.yaml`, `skills/codepatrol-plan/SKILL.md`, `skills/codepatrol-sync/SKILL.md`, `AGENTS.md` and `CONTEXT.md` are the only contract files naming the old model; all are enumerated in T5. No persona split was needed; this is the single consolidating Review.
- Limitation: remote GitHub issue state was not re-queried (network); the investigation's read-only `gh issue list` observation is accepted as Plan-stage evidence and is not load-bearing for offline correctness.

## Findings

### minor — evidence

Spec section "CLI and contracts" (spec.md:159-166) omits the `backlog migrate [--dry-run]` command that plan T2 defines and T6 executes, and spec §Migration names `migrateLegacyBacklog(workspace)` while T1 exports `migrateLegacyBacklog(workspace, changes, options?)`. The plan is internally consistent, unambiguous and authoritative for the implementer; AC-8 consistency is enforced by T5 contract tests. Impact: documentation-level drift only; no correction required before Apply. The Apply journal should note the implemented signature and command so Verify can confirm spec/plan/candidate honesty.

No critical or major findings survive validation.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none | Plan detail supersedes; drift is minor and recorded above | none |
| `plan.md` | none | internally consistent | none |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T1, T6 | yes — per-work storage/migration tests with collision, truncation, retry and dry-run fixtures run red against the monolithic schema | covered |
| AC-2 | yes | T1, T2, T4 | yes — CLI/lifecycle tests run with a GhAdapter that throws on any call | covered |
| AC-3 | yes | T2 | yes — start reuse/create/reject/cleanup cases contradict current backlogItemId behavior | covered |
| AC-4 | yes | T2 | yes — Close disposition and report-only recommendation tests contradict the current nullable scan and auto-upsert | covered |
| AC-5 | yes | T3 | yes — one-way create/edit/reopen/close, hostile-remote and dry-run cases contradict current pull authority | covered |
| AC-6 | yes | T4 | yes — exact six-column header and join cases fail against the current nine-column renderer | covered |
| AC-7 | yes | T4 | yes — exact compact-cell format assertions fail against current cells lacking harness | covered |
| AC-8 | yes | T5 | yes — contract tests reject `items.yaml`, nullable linking, pull/both and nine-column text before doc edits | covered |
| AC-9 | yes | T6 | yes — focused suites, migration rerun idempotency, `npm run verify` and base-to-candidate path reconciliation | covered |

## Simplicity axis

- Selected rung: confirmed — local model consolidation and reuse; reused capabilities (`resolveInside`, atomic writes, workspace locks, existing GhAdapter, aggregate usage, pure board) verified present in the codebase.
- Safety floor: retained — offline lifecycle, exact path/ref identity, atomic fail-closed migration, no remote-to-local authority, no token estimation, full project gate.
- Surface delta: necessary — removed dual id, nullable link, fuzzy dedup, scheduled mirror, pull direction and three derivable columns each correspond to a verified current-code liability.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| remove | `BacklogItem.id` + nullable `workId` (backlog.ts:15-28) | single `WorkItem.workId` | AC-1/AC-3 | already sufficient |
| remove | board Work/Branch/Total columns (board.ts:49-50) | six-column join by work id | AC-6 | already sufficient |
| reuse | `ChangeIdentity.branch` | retained, validated derivation (DC-1) | none | already sufficient |
| speculative | none found | — | — | already sufficient |

Every deferred constraint (DC-1 persisted branch field, DC-2 legacy module filename, DC-3 one-way body regeneration) has a known ceiling, observable trigger and bounded upgrade path.

## Executability audit

Paths, interfaces, dependencies, commands and expected red/green signals verified above against the live tree. Dependency order `T1 -> T2 -> T3`, `T1 -> T4`, `T2,T3,T4 -> T5 -> T6` is sound: Work storage precedes consumers, contracts follow behavior, migration/final gate is last. Rollback is byte-level Git restoration of schema-1 data with no remote mutation during Apply/Verify/Close. The plan is context-independent: an implementer needs only spec.md, plan.md and investigation.md. Unresolved assumptions: none beyond the accepted Plan-stage `gh issue list` observation, which governs no offline behavior.

## Verdict

`approve`

The Plan attempt is decision-complete, every citation and surface path was re-verified against the baseline tree, acceptance criteria map to red-capable tasks, and the only defect found is minor spec/plan documentation drift that does not impede an independent implementer. The next permitted transition is the Review checkpoint with result `approve`, advancing to `codepatrol-apply 2026-07-27-unify-issue-change-kanban on codepatrol/2026-07-27-unify-issue-change-kanban`.

## External evidence sufficiency

`not required` — the design is governed by the explicit offline-first product constraint and internal code evidence; no external technology claim is load-bearing. The one external observation (existing labeled issues 2-26) affects only post-Close optional publication, not correctness.

## Residual concerns and evidence gaps

- Remote GitHub state was not re-fetched during Review; accepted as Plan evidence because no acceptance criterion depends on live remote state and T3 tests use fakes.
- Migration correctness for the actual 27-item legacy file is asserted by fixtures rather than executed here; execution is deliberately deferred to T6 where it is verified twice (initial run plus idempotent rerun) before the candidate seals. This does not block approval because the migration algorithm is fully specified and fail-closed.
- The minor spec/plan CLI drift recorded above is carried into Apply as a journal note, not a return.
