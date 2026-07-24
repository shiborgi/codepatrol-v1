# Implementation — Centralize change-record compat migrations into one normalizer seam

- Package revision: 1
- Approval: `review.md` verdict approve
- Target start ref: 8ac598b0b0e2120f8d0747ea2c5efaeca001a5ef
- Actor: codepatrol-apply
- Status: implemented

## Baseline reconciliation

Artifact validation result: passed. Target drift checked: working tree clean at 8ac598b0b0e2120f8d0747ea2c5efaeca001a5ef. Conclusion: ready.

### T1 — Add `migrateRecord`, route both read boundaries through it, make `foldChange` strict

- Claim/workflow item: T1
- Started: 2026-07-24T19:22:00Z
- Files changed: src/change/model.ts, src/change/store.ts, src/change/orchestrator.ts, src/change/change.test.ts
- Simplicity check: reused parse, assertChangeRecord, foldChange, and fixture helper. Centralized 3 scattered blocks into 1 function without introducing new modules or schema types.
- Surface delta: added `migrateRecord` to `model.ts`, updated `readChangeRecord` and `recordFromYaml` to use it, removed inline migration loop in `foldChange`. Added 4 characterization tests.
- Red evidence: 4 new tests initially failed since `migrateRecord` was un-exported or undefined.
- Green evidence: `node --test --import jiti/register src/change/change.test.ts` passed for all legacy-migration behavior.
- Assessment: Legacy records are properly migrated precisely at read boundaries, allowing `foldChange` to enforce strict invariant validation.
- Result: complete

## Acceptance evidence

| Criterion | Implementation | Verification | Result |
|---|---|---|---|
| AC-1 | src/change/change.test.ts | node --test --import jiti/register src/change/change.test.ts | pass |
| AC-2 | src/change/change.test.ts | node --test --import jiti/register src/change/change.test.ts | pass |
| AC-3 | src/change/change.test.ts | node --test --import jiti/register src/change/change.test.ts | pass |
| AC-4 | src/change/change.test.ts | node --test --import jiti/register src/change/change.test.ts | pass |
| AC-5 | Verified `npm run verify` exits 0 | npm run verify | pass |

## Surface delta

All changes match the approved forecast exactly:
- `src/change/model.ts`: extracted `migrateRecord` and removed inline loop from `foldChange`.
- `src/change/store.ts`: updated `readChangeRecord` to call `migrateRecord`.
- `src/change/orchestrator.ts`: updated `recordFromYaml` to call `migrateRecord` from `model.ts`.
- `src/change/change.test.ts`: added characterization tests.
No unforecasted dependencies or APIs were added. No DC-N triggers activated.

## Final verification

- Affected checks run: `change.test.ts`.
- Full gate: `npm run verify` passed (exit 0).
- Graph refreshed via `codepatrol graph sync`. Wiki remains absent.
- Residual risks: DC-2 `improvement-report.ts` reader; F2, F4, F6, F7 remain as follow-up items.
- Rollback: Revert the branch.
