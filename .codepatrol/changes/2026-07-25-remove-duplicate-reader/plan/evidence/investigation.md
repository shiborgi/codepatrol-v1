# Investigation — Remove unsafe duplicate YAML reader

## Origin

Backlog item `unsafe-duplicate-yaml-reader-in-improvement-report-ts-bypasses-migraterecord-normalization`
(source: `plan-followup` of `2026-07-25-docs-consolidation`), itself sourced from
`docs/codepatrol/assessments/2026-07-24-architecture-v2.md` finding N4 (High), proposed
follow-up work id `2026-07-25-remove-duplicate-reader`. That assessment file was deleted by
`2026-07-25-docs-consolidation` (commit `88e868d`); its N4 text was recovered from Git history
(`git show e585836:docs/codepatrol/assessments/2026-07-24-architecture-v2.md`) and re-verified
directly against current `main` (`5893504e8d417cc7a832aecbf0c10cbb65208d48`) code below.

## Verified current state

- `src/change/improvement-report.ts:29-38` defines a private `readChangeRecord` that:
  - imports `node:fs` (`existsSync`, `readFileSync`) and `yaml` (`parse`) directly, duplicating
    the centralized read boundary instead of importing it;
  - computes its own record path via a local `recordPathFor` (`improvement-report.ts:29-31`)
    instead of the canonical `changeRecordPath` (`src/change/store.ts:11`);
  - parses raw YAML and returns it uncoerced, **never calling `migrateRecord`**
    (`src/change/model.ts:39-48`) or `assertChangeRecord`/`foldChange`
    (`src/change/model.ts:26-33`, `:82-131`);
  - swallows every parse failure (`catch { return null; }`) and treats a missing file the same
    way, collapsing "Change never existed" and "change.yaml is corrupt" into one silent `null`.
- The canonical boundary, `readChangeRecord` in `src/change/store.ts:13-20`, always applies
  `migrateRecord` then `assertChangeRecord`/`foldChange` before returning, and throws
  `CodepatrolError("CHANGE_NOT_FOUND" | "CHANGE_INVALID", ...)` on a missing or unparseable file.
  Every other reader in the codebase (`src/change/orchestrator.ts:221,320,361`,
  `src/change/session.ts:156,214`) uses this canonical function — `improvement-report.ts` is the
  only caller with its own copy.
- `migrateRecord` (`src/change/model.ts:39-48`) rewrites three legacy shapes still reachable on
  disk: stage `"finalize"` → `"close"`, event type `"change-finalized"` → `"change-closed"`,
  receipt path `"finalize/receipt.md"` → `"close/receipt.md"`. Concretely reachable on disk today:
  grepping every `.codepatrol/changes/*/change.yaml` for a literal `stage: finalize` shows two
  Changes still carrying the legacy stage name — `2026-07-23-finalize-merge` and
  `2026-07-23-rename-finalize-to-close` (the Change that performed the rename itself, whose own
  early events predate it). Any future or externally-authored Change with an older event log would
  hit the same gap.
- Effect of the bug on `generateImprovementReport` (`improvement-report.ts:93-125`): for a legacy
  record, un-migrated `"finalize"`-stage events create a spurious `perStage.finalize` bucket
  (`improvement-report.ts:100`) that `STAGES.reduce` (`improvement-report.ts:132`, `STAGES` are
  only `plan|review|apply|verify|close`) never sums, silently undercounting real close-stage
  attempt/checkpoint/return counts in the emitted report. For a corrupt `change.yaml` (any parse
  error, e.g. a hand-edited or partially-written file), the report silently degrades to "No trace
  available for this Change" (`improvement-report.ts:136-137`) instead of surfacing the real
  `CHANGE_INVALID` failure — masking genuine data corruption as an empty-Change no-op.
- Sole caller: `generateImprovementReport` is invoked once, from
  `src/change/orchestrator.ts:409`, during the Close stage transition for a Change whose
  `change.yaml` is already known to exist and have passed `assertChangeRecord` earlier in that
  same transition. A thrown `CHANGE_NOT_FOUND` at that call site would therefore never fire in
  the current caller — but `improvement-report.test.ts:63-74` exercises
  `generateImprovementReport` directly against a workspace with **no** `change.yaml` at all and
  asserts a graceful empty-shape report, so the "missing file → null" contract must be preserved
  as a standalone guarantee of this function, independent of today's one caller.
- `src/change/improvement-report.test.ts` (140 lines, 6 tests) exercises `generateImprovementReport`,
  `writeImprovementReport`, and `mirrorImprovementReport` against hand-seeded, schema-valid
  `change.yaml` fixtures (`seedChange`, lines 10-34) plus one missing-file case (lines 63-74). None
  of the existing fixtures use the legacy `"finalize"` stage name or a corrupt file, so today's
  suite does not currently detect this bug.

## Confirmed root cause

`improvement-report.ts` re-implements the change-record read path instead of reusing
`src/change/store.ts`'s `readChangeRecord`, bypassing `migrateRecord` normalization and the
`assertChangeRecord`/`foldChange` invariant checks that every other reader relies on.

## Design constraint this imposes

The fix must keep the "missing `change.yaml` → treated as no trace, no throw" behavior (test at
`improvement-report.test.ts:63-74`) while routing every read that *does* find a file through the
canonical, migrating, validating `readChangeRecord`. Wrapping the canonical function behind a
pre-flight `existsSync` check on the canonical `changeRecordPath` achieves both without
reintroducing a second parsing/migration implementation.
