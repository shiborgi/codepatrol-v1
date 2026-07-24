# Specification — Centralize change-record compat migrations into one normalizer seam

## Intent

- Origin: improve-codebase
- Mode: architecture
- Target baseline: `main` @ `8ac598b0b0e2120f8d0747ea2c5efaeca001a5ef`; clean worktree; `npm run verify` green at baseline (157 tests).
- Governing constraints: `CONTEXT.md` domain vocabulary (Change, Stage Attempt, Terminal Outcome); `AGENTS.md` — `change.yaml` plus declared artifacts is the sole durable lifecycle truth; Git owns ref identity. No ADRs (`docs/adr/` absent). None block this design.
- Substrate state: graph synced (73 files, 1838 symbols); wiki absent (valid substrate state).
- Improvement signals (most recent report `docs/codepatrol/improvement-reports/2026-07-24-cli-input-ergonomics.md`):
  - Command `change.transition` invoked 13 times — consider caching or batching repeated invocations. (Not addressed here; recorded.)
  - No `Top errors`/returns of note in that report beyond the single recommendation.
- Problem: Legacy change-record compat migrations are scattered across three sites in two layers, with an asymmetry that makes correctness non-obvious and untested. `finalize→close` / `change-finalized→change-closed` / `finalize/receipt.md→close/receipt.md` live **only** inside `foldChange` (`src/change/model.ts:59-61`), executed on every fold and mutating the caller's event objects as a side effect that `validateCheckpointLineage` implicitly depends on. `tokens→characters` is **duplicated verbatim** in `src/change/store.ts:20-22` (`readChangeRecord`) and `src/change/orchestrator.ts:293-295` (`recordFromYaml`). None of these migrations has any test coverage (no test references `finalize` or `tokens`). This is assessment finding F3.
- Outcome: All legacy record migrations live in one `migrateRecord` seam invoked at the two record-read boundaries; `foldChange` no longer migrates; the behavior is locked by characterization tests.

## Scope

### In scope

- A single exported `migrateRecord(record)` applying every current legacy migration: `finalize`→`close` stage, `change-finalized`→`change-closed` type, `finalize/receipt.md`→`close/receipt.md` receipt, and `run.tokens`→`run.characters`.
- Invoke `migrateRecord` at the two record-read boundaries: `readChangeRecord` (`store.ts`) and `recordFromYaml` (`orchestrator.ts`).
- Remove the inline `finalize`/receipt migration from `foldChange` (making the fold strict on already-normalized input) and remove the duplicated inline `tokens` loops from `store.ts` and `orchestrator.ts`.
- Characterization tests proving legacy records project identically to their modern equivalents and that `foldChange` no longer migrates.

### Out of scope

- The independent raw reader `readChangeRecord` inside `src/change/improvement-report.ts:33` (best-effort report stats over raw events) — recorded as a residual risk, not normalized here.
- Any change to the migration set (no new legacy forms introduced or removed) or to record schema, events, lifecycle, or Git behavior.
- The broader `transitionChangeLocked` decomposition (assessment F3's other half) — deferred.
- Findings F2, F4, F6, F7 — separate follow-up Changes.

## Current evidence

- `src/change/model.ts:57-61` — `foldChange` mutates each event in place: `finalize`→`close`, `change-finalized`→`change-closed`, `finalize/receipt.md`→`close/receipt.md`. `foldChange` does **not** migrate `tokens`. Confidence: high (read).
- `src/change/store.ts:18-26` — `readChangeRecord` parses YAML, runs the inline `tokens`→`characters` loop, then `assertChangeRecord` + `foldChange`. Confidence: high.
- `src/change/orchestrator.ts:289-300` — `recordFromYaml` parses YAML and runs the identical inline `tokens`→`characters` loop; callers then `foldChange`. Does **not** migrate `finalize` (relies on `foldChange`). Confidence: high.
- All `foldChange` callers receive records via `readChangeRecord`/`recordFromYaml` or freshly-built modern records (traced: `orchestrator.ts:125,146-147,167,172,202,286,309,318,327,331,356,396`; `session.ts:82,136`; `store.ts:26,29,34`). None passes an un-normalized legacy record to `foldChange`. Confidence: high.
- `validateCheckpointLineage` (`orchestrator.ts:139-152`) compares `foldChange`-mutated `checkpointRecord` against `expected`; today this relies on `foldChange`'s in-place `finalize` migration. After centralization both sides are normalized at the read boundary, so the comparison no longer depends on the fold side effect. Confidence: high.
- All four fixtures (`src/change/fixtures/*.yaml`) use the modern schema (`grep` for `finalize`/`tokens` → none); no test feeds legacy `finalize`/`tokens` to `foldChange`. So making the fold strict breaks no existing test. Confidence: high.
- Baseline: `npm run verify` exits 0 at `8ac598b` (157 tests). Confidence: high.

## Proposed design

Add `export function migrateRecord(record: unknown): ChangeRecordV2` to `src/change/model.ts` (co-located with `assertChangeRecord`). It defensively iterates `record.events` (when present) and applies, per event: stage `finalize`→`close`; type `change-finalized`→`change-closed`; receipt `finalize/receipt.md`→`close/receipt.md`; and, when `event.run` is an object containing `tokens`, set `run.characters = run.tokens` and delete `run.tokens`. It returns the same (now-normalized) object typed as `ChangeRecordV2`.

- `store.ts` `readChangeRecord`: `const record = migrateRecord(parse(text)); assertChangeRecord(record); foldChange(record); return record;` — the inline `tokens` loop is removed.
- `orchestrator.ts` `recordFromYaml`: `return migrateRecord(parse(raw));` — the inline `tokens` loop is removed.
- `model.ts` `foldChange`: delete the three `finalize`/receipt migration lines (`:59-61`). The fold now assumes normalized input; a legacy `finalize` stage reaching it fails the existing stage-validity check (`CHANGE_INVALID`).

Ordering at each boundary is `parse → migrateRecord → assertChangeRecord → foldChange`, so migration precedes validation and projection. Dependency direction is unchanged: `store.ts` and `orchestrator.ts` already import from `model.ts`.

## Alternatives

- **Extract the logic but keep `foldChange` calling it (fold stays defensive).** Rejected: leaves migration invoked at two layers and keeps `foldChange` mutating its input — it centralizes the code but not the seam, and preserves the fragile side-effect dependency in `validateCheckpointLineage`.
- **New `src/change/migrate.ts` module.** Rejected: adds a file for one small function; `model.ts` already owns record-shape validation and is imported by both boundaries.
- **Leave as-is.** Rejected: three untested copies across two layers is exactly the finding.
- **Also normalize the `improvement-report.ts` raw reader.** Deferred: it is a separate best-effort stats reader; folding it in widens scope beyond the record-projection seam.

## Simplicity decision

- Selected rung: local reuse — one new function consolidating three existing inline blocks, invoked at the two existing read boundaries.
- Earlier rungs: need is real (scattered untested compat); no runtime/stdlib/platform/dependency provides record-specific migration.
- Irreducible complexity: the set of legacy→modern field rewrites; hidden behind `migrateRecord`.
- Safety floor: preserve exact projection of every legacy and modern record; preserve `validateCheckpointLineage` equality; keep `assertChangeRecord`/`foldChange` validation strength; no schema/lifecycle/Git change. Full gate green.
- Expected surface delta: modify `src/change/model.ts`, `src/change/store.ts`, `src/change/orchestrator.ts`, `src/change/change.test.ts`. Net line count roughly flat (one function added; six inline lines removed across three sites). No new files, dependencies, config, or events.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | `migrateRecord` covers only today's two legacy forms | A future rename adds a third legacy form | A new schema rename lands | Add the rewrite to the single `migrateRecord` seam |
| DC-2 | `improvement-report.ts` raw reader left un-normalized | Legacy `finalize`/`tokens` records could miscount in report stats | A report over a legacy record shows wrong counts | Route that reader through `migrateRecord` |

## Compatibility and rollout

- Behavior-preserving refactor; no on-disk schema, event, lifecycle, or Git change. Modern records project identically; legacy records continue to project identically (migration now at the read boundary). The only observable behavior change is that `foldChange` called directly on an un-normalized legacy record now throws instead of silently migrating — no production path does this. Rollback = revert the branch; no migration. No security/privacy/performance/accessibility impact.

## Risks and mitigations

- A `foldChange` caller is missed and receives a legacy record. Mitigation: all callers traced to normalized inputs; a strict-fold characterization test asserts the new contract; the 157-test suite exercises every lifecycle path.
- `validateCheckpointLineage` equality regresses. Mitigation: both compared records are normalized at their read boundary before comparison; the existing lineage tests (`close-integration`, `orchestrator-parallel`) run in the suite.
- `migrateRecord` diverges from the removed inline blocks. Mitigation: a unit test asserts `migrateRecord(legacy)` deep-equals the modern record for every rewritten field.

## Acceptance criteria

- AC-1: `foldChange(migrateRecord(legacy))` produces a `ChangeView` deep-equal to `foldChange(modern)`, where `legacy` is a modern committed record rewritten to `finalize`/`change-finalized`/`finalize/receipt.md`/`tokens` form.
- AC-2: `migrateRecord(legacy)` deep-equals the modern record (every rewritten field reversed); `migrateRecord(modern)` returns the modern record unchanged.
- AC-3: `foldChange` no longer migrates — called directly on an un-normalized legacy record (stage `finalize`) it throws `CHANGE_INVALID`, while the same record after `migrateRecord` folds successfully.
- AC-4: `readChangeRecord` reading a legacy `change.yaml` written directly to disk returns a normalized record that folds successfully (the read boundary migrates).
- AC-5: `npm run verify` exits 0 on the candidate (enforced at Apply seal by `.codepatrol/config.json` `applyGate`).

## Decisions and open questions

- Decided (maintainer, this session): next fix = F3, scoped to migration centralization (not the full orchestrator decomposition), after validating F2 is an external data gap (not a clean code fix) and F4 already has coverage.
- Decided: centralize the seam (relocate migration to the read boundaries) rather than only extract shared code, so `foldChange` becomes strict and the `validateCheckpointLineage` side-effect dependency is removed.
- Decided: leave `improvement-report.ts`'s raw reader out of scope (DC-2).
- No open question can materially change scope, interfaces, or acceptance.
