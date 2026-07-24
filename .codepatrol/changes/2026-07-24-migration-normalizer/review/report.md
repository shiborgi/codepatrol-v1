# Review — Centralize change-record compat migrations into one normalizer seam

- Change: `2026-07-24-migration-normalizer`
- Incoming revision: 1
- Reviewed revision: 1
- Reviewer: opencode (gatekeeper persona)
- Evidence date: 2026-07-24T19:15:42Z

## Scope and evidence

Files inspected on branch `codepatrol/2026-07-24-migration-normalizer`
(checkout `82056b3` plan checkpoint, head `d428c21` stage transition;
clean working tree, target `main` @ `8ac598b` — the terminal commit of
the prior `2026-07-24-cli-input-ergonomics` Change):

- `.codepatrol/changes/2026-07-24-migration-normalizer/plan/spec.md`
- `.codepatrol/changes/2026-07-24-migration-normalizer/plan/plan.md`
- `.codepatrol/changes/2026-07-24-migration-normalizer/plan/evidence/investigation.md`
- `src/change/model.ts:39-69` (`foldChange`, inline migration)
- `src/change/store.ts:13-27` (`readChangeRecord`, inline `tokens` loop)
- `src/change/orchestrator.ts:289-300` (`recordFromYaml`, inline `tokens` loop)
- `src/change/orchestrator.ts:139-152` (`validateCheckpointLineage`)
- `src/change/improvement-report.ts:33-39` (independent raw reader, out of scope)
- `src/change/session.ts:61, 82, 115, 136` (fold callers)
- `src/change/change.test.ts:1-20, 195` (helpers, file end)
- `src/change/fixtures/*.yaml` (all four, modern schema)

External artifacts re-checked:

- `docs/codepatrol/improvement-reports/2026-07-24-cli-input-ergonomics.md:35`
  — `change.transition` invoked 13 times. Matches the spec's
  Improvement signals.
- `codepatrol wiki status` → `exists: false` (valid absent substrate).
- `codepatrol graph sync` → 73 files, 1850 symbols, 42 ms.
- `.codepatrol/config.json` → `applyGate` = `npm run verify`, 600 s timeout.

Limitations: did not execute `npm run verify` (Review never re-runs
the full gate; that is Apply's job per AGENTS.md). Did not exercise
the legacy-record projection on a real legacy `change.yaml` (the
plan is in Plan stage; that exercise is the Apply task T1's
characterization tests).

## Findings

### minor — plan

**Issue:** T1 step 1 says the new characterization tests "reuse
`fixture`, `foldChange`; import `migrateRecord` from `./model.js`; add
`writeFileSync`/`mkdtempSync`/`stringify` if not present — `stringify`
from `yaml`, already used elsewhere in tests." The "already used
elsewhere in tests" gloss is wrong for `change.test.ts`: line 7
imports only `parse` from `yaml`, not `stringify`. The test for AC-4
will need `stringify(toLegacy(modern), { lineWidth: 0 })` to write a
legacy `change.yaml` to disk, so the import must be added.

**Impact:** None on acceptance criteria; the implementer will add the
`stringify` import. The T1 step 1 list explicitly anticipates this
("add `stringify` if not present"); only the "already used elsewhere"
gloss is inaccurate.

**Disposition:** carry-forward note; non-blocking.

### minor — plan

**Issue:** Spec lists `orchestrator.ts:146-147` as a `foldChange` call
site, but the two `foldChange(checkpointRecord); foldChange(expected);`
calls live at line 147 only; line 146 is the preceding
`recordFromYaml(raw)` assignment. The intent (the pair inside
`validateCheckpointLineage`) is clear; only the line range drifted.

**Impact:** None on acceptance criteria or executability.

**Disposition:** carry-forward note; non-blocking.

### minor — plan

**Issue:** Plan T1 step 6 says "Run `npm run typecheck`" but the
acceptance criteria do not require a separate typecheck pass; the
full `npm run verify` (T2) runs it. Running typecheck at T1 is
defensive and good practice (the new `migrateRecord` signature must
type-check), but it is not gated. The plan keeps typecheck as a
sanity step, which is appropriate.

**Impact:** None.

**Disposition:** already sufficient.

No critical or major findings survive validation. All cited
`file:line` references for production code were re-verified against
the working tree at base `8ac598b`:

- `src/change/model.ts:59-61` — `foldChange` inline `finalize` /
  `change-finalized` / `finalize/receipt.md` migration ✓
- `src/change/store.ts:18-25` — `readChangeRecord` inline
  `tokens`→`characters` loop (line 26 is the `assertChangeRecord` +
  `foldChange` + return; the spec's `18-26` range covers the whole
  block) ✓
- `src/change/orchestrator.ts:289-300` — `recordFromYaml` inline
  `tokens`→`characters` loop ✓
- `src/change/orchestrator.ts:139-152` — `validateCheckpointLineage`
  comparing two `foldChange`-mutated records ✓
- `src/change/improvement-report.ts:33-39` — independent raw reader
  (out of scope per DC-2) ✓
- `src/change/{orchestrator,session,store}.ts` fold-caller list
  cross-checked against `grep foldChange(` output; all locations
  match (with the one minor `:146-147` drift noted above) ✓
- `src/change/fixtures/*.yaml` — `grep finalize|tokens` returns
  nothing; all four use the modern schema. Confirms the
  "no test feeds legacy input to `foldChange`" claim ✓
- `grep -rn "finalize"|"tokens" src/change/*.test.ts` returns
  nothing; confirms "no test references `finalize`/`tokens`" ✓
- `src/change/change.test.ts` already imports `mkdirSync,
  mkdtempSync, readFileSync, writeFileSync, existsSync` and `parse`
  from `yaml`; the only new import needed is `stringify` from `yaml`
  (see Finding 1) and `migrateRecord` from `./model.js`.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `plan/plan.md` | none (carry-forward note only) | T1 step 1 overstates that `stringify` is "already used elsewhere in tests" for `change.test.ts`; the import must be added | none |
| `plan/spec.md` | none | All citations verified; safety floor confirmed; rung correct | none |
| `plan/evidence/investigation.md` | none | Telemetry number (13 `change.transition` invocations) verified in latest report | none |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 (`foldChange(migrateRecord(legacy))` deep-equals `foldChange(modern)`) | yes | T1 | yes — `node --test --import jiti/register src/change/change.test.ts` ("legacy records project identically to their modern equivalent") uses `assert.deepEqual` on two `foldChange` outputs | covered |
| AC-2 (`migrateRecord` reverses every legacy field; modern unchanged) | yes | T1 | yes — same suite, `migrateRecord(toLegacy(modern))` and `migrateRecord(modern)` deep-equal assertions | covered |
| AC-3 (`foldChange` no longer migrates — raw legacy throws, migrated legacy folds) | yes | T1 | yes — same suite, `assert.throws(... /CHANGE_INVALID/)` followed by `assert.doesNotThrow` | covered |
| AC-4 (`readChangeRecord` migrates a legacy `change.yaml` at the read boundary) | yes | T1 | yes — same suite, writes a legacy `change.yaml` to a tmpdir, calls `readChangeRecord`, asserts deep-equal to modern and successful `foldChange` | covered |
| AC-5 (`npm run verify` exit 0 on candidate) | yes | T2 | yes — applyGate machine-enforces at implemented checkpoint | covered |

## Simplicity axis

- **Selected rung:** local reuse — one exported function
  consolidating three existing inline blocks, invoked at the two
  existing read boundaries. Confirmed. `store.ts` and
  `orchestrator.ts` both already import from `./model.js`; adding
  `migrateRecord` to that module is a one-line export and a
  one-line boundary rewrite (plus removing the now-redundant
  inline blocks).
- **Safety floor:** behavior-preserving for every production path
  (read boundaries normalize first, then `assertChangeRecord` and
  `foldChange`; modern records are unchanged by the idempotent
  normalizer). The `validateCheckpointLineage` equality
  (`orchestrator.ts:147`) is preserved because both compared records
  are normalized at their read boundary. `assertChangeRecord` /
  `foldChange` validation strength is preserved — the fold is
  *strict on already-normalized input*, which means a legacy
  `finalize` stage now fails the existing stage-validity check
  (`CHANGE_INVALID` via `STAGES.includes(event.stage)`), and no
  production path delivers a legacy record to the fold (all callers
  traced; all 12 `orchestrator.ts` callers and 2 `session.ts` callers
  arrive via the two read boundaries, which now normalize first).
- **Surface delta:** `src/change/model.ts` (+1 export; -3 inline
  migration lines); `src/change/store.ts` (-8 inline lines; +1
  call); `src/change/orchestrator.ts` (-8 inline lines; +1 call);
  `src/change/change.test.ts` (+~50 lines of characterization
  tests). Net line count roughly flat, as forecast. No new files,
  no new dependencies, no new config keys, no event-schema
  changes, no lifecycle / Git / persona changes.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| reuse | `migrateRecord` co-located in `model.ts` | Reuses the existing `./model.js` import from both `store.ts` and `orchestrator.ts`; no new module | none — keeps the seam at the record-shape layer where `assertChangeRecord` already lives | required (already in plan) |
| reuse | `assertChangeRecord` + `foldChange` validation preserved | The fold becomes strict on already-normalized input; legacy `finalize` fails the existing `STAGES.includes` check | none on production paths (all callers traced); surfaces a real invariant violation that today is silently hidden by the fold side effect | required (already in plan) |
| reuse | `recordFromYaml` still uses `parse` then `migrateRecord` | Same parse-then-normalize ordering at both read boundaries | preserves the existing parse-error mapping to `CHANGE_INVALID` | required (already in plan) |
| speculative | none observed | — | — | already sufficient |
| built-in | `structuredClone` for the `toLegacy` helper | standard library, no new dep | none | already sufficient |
| simplify | Telemetry-derived scope | `change.transition` ×13 is recorded as "not addressed here"; the Plan keeps the F2/F4/F6/F7 follow-ups out of scope | keeps this Change tightly bounded to F3's migration-centralization half | already sufficient |
| deferred | `improvement-report.ts:33` raw reader | Out of scope per DC-2; explicitly recorded as a residual risk with a known observable trigger and a one-line upgrade path | none on this Change's acceptance criteria; recorded for the next Change | acceptable |

## Executability audit

- **Paths:** all four declared paths exist at base `8ac598b`:
  `src/change/{model,store,orchestrator,change.test}.ts`. No new
  files are created.
- **Interfaces:** the new export is
  `migrateRecord(record: unknown): ChangeRecordV2` —
  net-additive; no existing signature changes. `readChangeRecord`
  and `recordFromYaml` keep their existing signatures.
- **Dependencies:** no new packages, no config keys, no event-schema
  additions, no lifecycle / persona / Git / checkpoint changes.
- **Commands:** the verification commands in the plan
  (`node --test --import jiti/register src/change/change.test.ts`,
  `npm run typecheck`, `npm run verify`) match the scripts
  registered in `package.json`. T1 step 6 also runs `npm run
  typecheck` — a defensive pass that catches a `migrateRecord`
  signature drift before T2.
- **Expected red:** T1 red is `migrateRecord is not exported` from
  `./model.js` (reference error in the test), not a setup/syntax
  failure. The plan correctly labels this as the expected red.
- **Expected green:** T1 green when the four characterization
  tests pass and the existing `change.test.ts` suite stays green.
  T2 green when `npm run verify` exits 0 (applyGate enforces).
- **Rollback:** revert the branch — no migration, no on-disk schema
  change, no event-schema change.
- **Context independence:** the Review verdict is grounded entirely
  in the durable plan artifacts, the cited source files, and the
  existing improvement report. No chat history is required.

## Verdict

`approve`

The Plan is decision-complete, evidence-backed, and tightly bounded.
All cited `file:line` references for production code (six locations
across `model.ts`, `store.ts`, `orchestrator.ts`,
`improvement-report.ts`) were re-verified on the working tree at
base `8ac598b`; the inline migration blocks are exactly as
described, and the asymmetry the spec identifies (the `finalize`
migration lives only in the fold side effect; the `tokens` migration
is duplicated in two readers) is observable. The simplicity rung is
correct (one function, two boundary rewrites, no new module); the
safety floor is preserved (behavior-preserving for every traced
production path, `validateCheckpointLineage` equality preserved
because both compared records are normalized at their read boundary).
The five ACs map to red-capable tests in `change.test.ts`; AC-5 is
machine-gated by `applyGate`. The deferred `improvement-report.ts`
raw reader is recorded as DC-2 with a known observable trigger and
a one-line upgrade path, not silently dropped. The two minor
documentation drifts (the `stringify` import, the `:146-147` line
range) do not affect any acceptance criterion or executability and
can be carried forward.

Next permitted transition: `codepatrol-apply 2026-07-24-migration-normalizer`
on `codepatrol/2026-07-24-migration-normalizer`, gated by the
declared `applyGate` (`npm run verify`).

## External evidence sufficiency

`not required` — the design is internal to the Codepatrol record
layer and reuses existing primitives (`parse`, `assertChangeRecord`,
`foldChange`, the `fixture()` test helper, the four modern
`change.yaml` fixtures). The only external claim that motivates
this design is the architecture assessment's F3 finding
(orchestrator density / scattered compat migrations) and the
follow-up telemetry that lists `change.transition` ×13 in the
latest report. Both are re-confirmed; no new dependency, protocol,
or external API is introduced.

## Residual concerns and evidence gaps

- The minor `stringify` import nit in T1 step 1 is a documentation
  drift, not a defect; the implementer will add the import as
  T1 step 1 already anticipates ("add `stringify` if not
  present"). The import path is the same as the existing
  `parse` import at `change.test.ts:7`.
- The minor `orchestrator.ts:146-147` line drift in the spec is a
  documentation nit; the two `foldChange` calls inside
  `validateCheckpointLineage` are at line 147 (line 146 is the
  preceding `recordFromYaml(raw)` assignment). The intent is
  unambiguous.
- The plan does not redefine `wiki status`; the wiki is correctly
  recorded as absent in both spec and evidence. No wiki refresh
  is required.
- Per-run provider tokens remain unmeasurable from this harness
  (same constraint recorded in the prior three Changes' Plan and
  Review runs). Apply will record
  `characters: { status: "unavailable", reason: … }` for its
  finished runs, consistent with the established pattern.
- DC-2 (`improvement-report.ts:33` raw reader) is correctly
  deferred with a known observable trigger (a future report over a
  legacy record shows wrong counts) and a one-line upgrade path
  (route that reader through `migrateRecord`). Not blocking.
- The 12 `orchestrator.ts` fold-caller list, 2 `session.ts`
  caller lines, and 3 `store.ts` caller lines were all
  cross-checked against `grep foldChange(` output and found to
  match the spec's enumeration (modulo the `:146-147` nit). No
  caller was missed.
