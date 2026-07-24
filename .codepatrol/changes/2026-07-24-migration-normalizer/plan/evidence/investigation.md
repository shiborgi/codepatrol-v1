# Plan investigation evidence

Baseline: `main` @ `8ac598b0b0e2120f8d0747ea2c5efaeca001a5ef`; branch `codepatrol/2026-07-24-migration-normalizer`.

## The three scattered migration sites (F3)

- `src/change/model.ts:59-61` — inside the `foldChange` event loop, mutating each event in place:
  - `if (event.stage === "finalize") event.stage = "close";`
  - `if (event.type === "change-finalized") event.type = "change-closed";`
  - `if (event.receipt === "finalize/receipt.md") event.receipt = "close/receipt.md";`
  - `foldChange` does NOT migrate `tokens`.
- `src/change/store.ts:18-26` — `readChangeRecord`: inline `tokens`→`characters` loop, then `assertChangeRecord` + `foldChange`. Does NOT migrate `finalize` (relies on `foldChange`).
- `src/change/orchestrator.ts:289-300` — `recordFromYaml`: identical inline `tokens`→`characters` loop; callers then `foldChange`. Does NOT migrate `finalize`.

Asymmetry: `finalize` migration lives only in fold (mutation side effect); `tokens` migration is duplicated in the two readers. Both boundaries end up applying both migrations only because `foldChange` is always called afterward and mutates in place.

## Read boundaries and fold callers

- Record entry points: `readChangeRecord` (working tree, `store.ts:13`) and `recordFromYaml` (git refs, `orchestrator.ts:289`).
- `foldChange` callers (all non-test): `orchestrator.ts:125,146-147,167,172,202,286,309,318,327,331,356,396`; `session.ts:82,136`; `store.ts:26,29,34`. Every input arrives via a read boundary or is a freshly-built modern record. None passes an un-normalized legacy record to `foldChange`.
- `validateCheckpointLineage` (`orchestrator.ts:139-152`) compares two `foldChange`-mutated records; today the equality relies on `foldChange`'s in-place `finalize` migration. After centralization both records are normalized at their read boundary, so the equality no longer needs the fold side effect.

## Safety

- `src/change/fixtures/*.yaml` — all four use the modern schema; `grep finalize|tokens` → none.
- No test references `finalize`/`tokens` (`grep` over `src/**/*.test.ts`) → no test feeds legacy input to `foldChange`, so making the fold strict breaks nothing.
- `improvement-report.ts:33` has an independent raw `readChangeRecord` returning `{events}` without normalization — out of scope (DC-2).

## Baseline health

- `npm run verify` exit 0 at `8ac598b` (157 tests) — established by the prior Change's Verify.
