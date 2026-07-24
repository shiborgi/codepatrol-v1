# Plan — Centralize change-record compat migrations into one normalizer seam

- Work id: `2026-07-24-migration-normalizer`
- Governing spec: `spec.md`
- Target baseline: `main` @ `8ac598b0b0e2120f8d0747ea2c5efaeca001a5ef`; clean worktree; `npm run verify` green (157 tests).

## Goal and approach

Consolidate three scattered legacy migrations into one exported `migrateRecord`, invoked at the two record-read boundaries (`readChangeRecord`, `recordFromYaml`); make `foldChange` strict by removing its inline migration. A behavior-preserving refactor locked by characterization tests. One implementation task (test-first) plus one verification task.

## Global constraints

- Node ESM + TypeScript; `.js` import specifiers; two-tab indentation; terse style of `src/change/model.ts`.
- Preserve exact projection of every legacy and modern record and the `validateCheckpointLineage` equality.
- Ordering at each read boundary: `parse → migrateRecord → assertChangeRecord → foldChange`.
- No new files, dependencies, config keys, events, schema, lifecycle, or Git behavior.
- Gate that must stay green: `npm run typecheck && npm test && npm run build && npm run smoke:cli && npm run lint:skills`.

## Simplicity proof

- Selected rung: local reuse — one function consolidating three inline blocks at the two existing boundaries.
- Reused capabilities: existing `parse`, `assertChangeRecord`, `foldChange`, existing fixtures and `fixture()` test helper.
- Forbidden speculative surface: no new module, no schema change, no new migration form, no `improvement-report.ts` change, no `transitionChangeLocked` decomposition.
- Expected surface delta: modify `src/change/model.ts`, `src/change/store.ts`, `src/change/orchestrator.ts`, `src/change/change.test.ts`. Net lines roughly flat.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T1 | `node --test --import jiti/register src/change/change.test.ts` (legacy folds equal to modern) |
| AC-2 | T1 | same suite (`migrateRecord` reverses every field; modern unchanged) |
| AC-3 | T1 | same suite (`foldChange` throws on un-normalized legacy; folds after `migrateRecord`) |
| AC-4 | T1 | same suite (`readChangeRecord` on a legacy on-disk `change.yaml` folds) |
| AC-5 | T2 | `npm run verify` exits 0 |

## Dependency order

`T1 → T2`. Single implementation task owns all four files; no concurrent same-file writes.

### T1 — Add `migrateRecord`, route both read boundaries through it, make `foldChange` strict

**Purpose:** Satisfies AC-1, AC-2, AC-3, AC-4.

**Depends on:** None

**Files:**

- Modify: `src/change/model.ts` — add `export function migrateRecord`; remove the inline `finalize`/receipt migration from `foldChange`
- Modify: `src/change/store.ts` — `readChangeRecord` uses `migrateRecord`; remove the inline `tokens` loop
- Modify: `src/change/orchestrator.ts` — `recordFromYaml` uses `migrateRecord`; remove the inline `tokens` loop
- Modify: `src/change/change.test.ts` — characterization tests

**Interfaces:**

- Produces: `export function migrateRecord(record: unknown): ChangeRecordV2` in `model.ts`.
- Consumes: `migrateRecord` in `store.ts` and `orchestrator.ts`.
- Invariants/errors: migration is applied before `assertChangeRecord`/`foldChange`; `foldChange` no longer migrates and rejects a legacy `finalize` stage via its existing `CHANGE_INVALID` stage check.

**Simplicity proof:** One function replaces three inline blocks; both boundaries already import `model.ts`; no new module or dependency.

**Steps:**

1. Add characterization tests to `src/change/change.test.ts` (reuse `fixture`, `foldChange`; import `migrateRecord` from `./model.js`; add `writeFileSync`/`mkdtempSync`/`stringify` if not present — `stringify` from `yaml`, already used elsewhere in tests). Build a `legacy` record by deep-cloning `fixture("committed-change.yaml")` and rewriting: for each event, `close`→`finalize` stage, `change-closed`→`change-finalized` type, `close/receipt.md`→`finalize/receipt.md` receipt, and each `run.characters`→`run.tokens`:

   ```typescript
   function toLegacy(record: ChangeRecordV2): any {
     const clone = structuredClone(record) as any;
     for (const event of clone.events) {
       if (event.stage === "close") event.stage = "finalize";
       if (event.type === "change-closed") event.type = "change-finalized";
       if (event.receipt === "close/receipt.md") event.receipt = "finalize/receipt.md";
       if (event.run && event.run.characters) { event.run.tokens = event.run.characters; delete event.run.characters; }
     }
     return clone;
   }

   test("migrateRecord reverses every legacy field and leaves modern records unchanged", () => {
     const modern = fixture("committed-change.yaml");
     const migrated = migrateRecord(toLegacy(modern));
     assert.deepEqual(migrated, modern);
     assert.deepEqual(migrateRecord(structuredClone(modern)), modern);
   });

   test("legacy records project identically to their modern equivalent", () => {
     const modern = fixture("committed-change.yaml");
     assert.deepEqual(foldChange(migrateRecord(toLegacy(modern))), foldChange(fixture("committed-change.yaml")));
   });

   test("foldChange no longer migrates: raw legacy throws, migrated legacy folds", () => {
     const modern = fixture("committed-change.yaml");
     assert.throws(() => foldChange(toLegacy(modern) as ChangeRecordV2), (e: unknown) => e instanceof CodepatrolError && e.code === "CHANGE_INVALID");
     assert.doesNotThrow(() => foldChange(migrateRecord(toLegacy(modern))));
   });

   test("readChangeRecord migrates a legacy change.yaml at the read boundary", () => {
     const workspace = mkdtempSync(join(tmpdir(), "codepatrol-legacy-"));
     const modern = fixture("committed-change.yaml");
     const dir = join(workspace, `.codepatrol/changes/${modern.identity.work_id}`);
     mkdirSync(dir, { recursive: true });
     writeFileSync(join(dir, "change.yaml"), stringify(toLegacy(modern), { lineWidth: 0 }));
     const read = readChangeRecord(workspace, modern.identity.work_id);
     assert.deepEqual(read, modern);
     assert.doesNotThrow(() => foldChange(read));
   });
   ```

   (Use `readChangeRecord` from `./store.js` and `stringify` from `yaml`; reuse the file's existing imports where they already exist.)
2. Run `node --test --import jiti/register src/change/change.test.ts`.
   Expected red: `migrateRecord` is not exported (reference error) — not a setup/syntax failure.
3. Implement in `src/change/model.ts`: add
   ```typescript
   export function migrateRecord(record: unknown): ChangeRecordV2 {
     const value = record as any;
     if (value && Array.isArray(value.events)) {
       for (const event of value.events) {
         if (event.stage === "finalize") event.stage = "close";
         if (event.type === "change-finalized") event.type = "change-closed";
         if (event.receipt === "finalize/receipt.md") event.receipt = "close/receipt.md";
         if (event.run && typeof event.run === "object" && "tokens" in event.run) { event.run.characters = event.run.tokens; delete event.run.tokens; }
       }
     }
     return value as ChangeRecordV2;
   }
   ```
   and delete the three migration lines currently at `model.ts:59-61` inside the `foldChange` event loop.
4. Implement in `src/change/store.ts`: in `readChangeRecord`, replace the inline `tokens` loop with `const migrated = migrateRecord(record);` and use `migrated` for `assertChangeRecord`/`foldChange`/return (or reassign `record = migrateRecord(record)`); import `migrateRecord` from `./model.js` (already importing `assertChangeRecord, foldChange`).
5. Implement in `src/change/orchestrator.ts`: `recordFromYaml` returns `migrateRecord(parse(raw))`; remove the inline `tokens` loop; import `migrateRecord` from `./model.js` (adjust the existing `./model.js` import).
6. Run `node --test --import jiti/register src/change/change.test.ts`.
   Expected green: all four new tests pass; existing record/fold tests still pass.
7. Run `npm run typecheck`. Expected: clean.

**Task result:** append changed paths, red/green evidence, and any deviation to `apply/journal.md`.

### T2 — Final verification and reconciliation

**Purpose:** Confirms AC-5 and whole-Change integrity.

**Depends on:** T1

**Files:**

- Modify: none (verification only)

**Steps:**

1. Map delivered paths back to AC-1…AC-5; confirm each check passed.
2. Run the full gate: `npm run verify`. Expected exit 0 (also enforced at the Apply `implemented` checkpoint by `.codepatrol/config.json` `applyGate`).
3. Inspect the final diff (`git diff --stat` vs base `8ac598b`) for undeclared work; confirm only the four declared files changed.
4. Reconcile actual surface delta with the spec forecast; explain any difference in the journal.
5. Record whether any `DC-N` trigger activated (expected: none).
6. Run `codepatrol graph sync`; wiki remains absent (valid) — no wiki refresh required.
7. State rollback (revert branch; no migration) and residual risks (DC-2 `improvement-report.ts` reader; findings F2/F4/F6/F7 remain follow-ups).

**Task result:** append the final reconciliation to `apply/journal.md`.
