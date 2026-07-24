# Review — Extract duplicated persona sub-event and divergence predicates into single helpers

- Change: `2026-07-24-persona-subevent-helpers`
- Incoming revision: 1
- Reviewed revision: 1
- Reviewer: opencode (gatekeeper persona)
- Evidence date: 2026-07-24T19:54:37Z

## Scope and evidence

Files inspected on branch `codepatrol/2026-07-24-persona-subevent-helpers`
(checkout `92f27fb` plan checkpoint, head `4bda76c` stage transition;
clean working tree, target `main` @ `6fb2d8a` — the terminal commit of
the prior `2026-07-24-migration-normalizer` Change):

- `.codepatrol/changes/2026-07-24-persona-subevent-helpers/plan/spec.md`
- `.codepatrol/changes/2026-07-24-persona-subevent-helpers/plan/plan.md`
- `.codepatrol/changes/2026-07-24-persona-subevent-helpers/plan/evidence/investigation.md`
- `src/change/orchestrator.ts:212-231` (the three predicate sites)
- `src/change/orchestrator.ts:280-282` (the reason-aggregation site)
- `src/change/orchestrator.ts:59-62` (the checkpoint result constraint)
- `src/change/orchestrator.ts:78-95` (`eventMatchesIntent`, where the new
  helpers will be co-located)
- `src/change/model.ts:77` (`reasons` in the `specific` keys list)
- `src/change/model.ts:98-110, 112-128` (the foldChange persona
  short-circuits; out of scope per the spec)
- `src/change/orchestrator-parallel.test.ts:1-85` (existing two tests;
  the new characterization test will be added at the end of the
  `describe` block)

External artifacts re-checked:

- `docs/codepatrol/improvement-reports/2026-07-24-migration-normalizer.md:35`
  — `change.transition` invoked 13 times. Matches the spec's
  Improvement signals.
- `codepatrol wiki status` → `exists: false` (valid absent substrate).
- `codepatrol graph sync` → 73 files, 1862 symbols, 42 ms.
- `.codepatrol/config.json` → `applyGate` = `npm run verify`, 600 s timeout.

Independent confirmations:

- `grep "reasons" src/change/*.test.ts` returns **no matches** —
  confirms the spec's claim that the `:281` aggregation path is
  observable only on the raw `change.yaml` event and has no test
  coverage. The new characterization test will close this gap.
- `grep -n` of the inline predicates on the working tree at base
  `6fb2d8a`:
  - `:215` — guard filter ✓
  - `:226` — pre-consolidation filter ✓
  - `:228` — divergence `.some(...)` predicate ✓
  - `:281` — aggregation (filter + divergence combined) ✓
  All five predicate copies the spec calls out are present at the
  cited line numbers (modulo the `:226-229` range encompassing the
  whole `if`-block at lines 226-231 rather than just the filter
  line).

Limitations: did not execute `npm run verify` (Review never re-runs
the full gate; that is Apply's job per AGENTS.md). Did not exercise
the consolidation paths on a real persona round (those behaviors are
the existing tests in `orchestrator-parallel.test.ts`, which the
plan will keep green and which the new characterization test will
add to).

## Findings

No critical, major, or minor findings survive validation. The plan
is a textbook behavior-preserving refactor: write the
characterization test first (locking current behavior), confirm
green, refactor, confirm still green.

(All cited `file:line` references for production code were
re-verified against the working tree at base `6fb2d8a`:

- `src/change/orchestrator.ts:215` — persona sub-event filter
  (guard against a bare non-persona transition mid persona-round) ✓
- `src/change/orchestrator.ts:226` — same filter pre-consolidation ✓
- `src/change/orchestrator.ts:228` — divergence `.some(...)` predicate
  throwing `CONSOLIDATION_AFTER_SUBEVENTS` ✓
- `src/change/orchestrator.ts:281` — reason-aggregation site
  (filter + divergence combined inline) ✓
- `src/change/orchestrator.ts:59-62` — `assertTransitionIntent`
  checkpoint result constraint (the basis for the spec's claim that
  the checkpoint branch of the divergence predicate is defensive
  for persona sub-events) ✓
- `src/change/model.ts:77` — `reasons` in the `specific` keys list
  for `stage-returned` events ✓
- `src/change/model.ts:102-106, 122-126` — foldChange persona
  short-circuits (out of scope; distinct from the filter/divergence
  predicates; not duplicated) ✓
- `src/change/orchestrator-parallel.test.ts:18-55` — existing
  happy-path test ✓
- `src/change/orchestrator-parallel.test.ts:57-84` — existing
  divergence test ✓
- `src/change/orchestrator-parallel.test.ts:5` — `readFileSync`
  already imported; the new test will need `parse` from `yaml`
  (the spec's T1 step 1 anticipates this).)

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `plan/plan.md` | none (T1 step 1 explicitly anticipates adding `parse` from `yaml`) | the test file's existing `readFileSync` (line 5) covers read; `parse` from `yaml` is the only new import | none |
| `plan/spec.md` | none | All citations verified; safety floor confirmed; rung correct | none |
| `plan/evidence/investigation.md` | none | Telemetry number (13 `change.transition` invocations) verified in latest report; coverage gap independently confirmed | none |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 (non-persona return aggregates persona reason into `reasons[]`) | yes | T1 | yes — `node --test --import jiti/register src/change/orchestrator-parallel.test.ts` ("a non-persona return aggregates persona sub-event reasons into reasons[]"); reads the raw `change.yaml` and asserts `consolidatedReturn.reasons` deep-equals `["security: boundary gap"]` | covered |
| AC-2 (existing divergence behavior preserved — `CONSOLIDATION_AFTER_SUBEVENTS` on persona-return + non-persona-approve) | yes | T1 | yes — existing test at `orchestrator-parallel.test.ts:57-84` (`assert.rejects(... err.code === "CONSOLIDATION_AFTER_SUBEVENTS")`) stays green; the refactor preserves the predicate verbatim | covered |
| AC-3 (existing happy path preserved — two persona approves stay active, non-persona approve consolidates to `apply`) | yes | T1 | yes — existing test at `orchestrator-parallel.test.ts:18-55` (assertions at lines 36-37, 42-43, 52-53) stays green; the refactor preserves the guard predicate verbatim | covered |
| AC-4 (one `personaSubEvents` + one `isDivergentPersonaEvent` definition; no inline copies remain at `:215, 226, 228, 281`) | yes | T1 | yes — `grep -n` after refactor: the only `personaSubEvents` calls are the new helper definition + 3 call sites (no inline filter); the only `isDivergentPersonaEvent` calls are the new helper definition + 2 call sites (no inline `.some`) | covered |
| AC-5 (`npm run verify` exit 0 on candidate) | yes | T2 | yes — applyGate machine-enforces at implemented checkpoint | covered |

The plan's T1 step 2 ("Expected: **green against current code** — this
is a characterization test that captures the existing `:281`
behavior") is the right test-first pattern for a behavior-preserving
refactor on safety-critical code. Writing the test first and
confirming it is green against the unchanged code proves the test
itself is correct before the refactor changes anything; the refactor
must then leave it green. This is a stronger guard than a "refactor
first, then add a test" order.

## Simplicity axis

- **Selected rung:** local reuse — two module-private helpers
  consolidating five inline predicate copies in one function.
  Confirmed. Both `ChangeEvent` and `Stage` types are already
  imported in `orchestrator.ts`; the new helpers slot in next to
  the existing private helpers (`eventMatchesIntent`,
  `assertTransitionIntent`, `ensurePath`, `requireObject`,
  `exactInput`, `textInput`, `baselineRef`, etc.).
- **Safety floor:** the helpers reproduce the inline predicates
  verbatim (same `(event as { persona?: string }).persona` and
  `(event as { result?: string }).result` casts, same condition
  ordering, same short-circuit structure). The result is provably
  behavior-preserving for every reachable input because (a) the
  predicate bodies are character-identical, (b) the call sites pass
  the same arguments (`record.events`, `intent.stage`,
  `view.attempt`) and consume the same return shape (`T[]` or
  `boolean`), and (c) the three integration tests plus the new
  characterization test exercise all three sites. No export means
  the module surface is unchanged. `CONSOLIDATION_AFTER_SUBEVENTS`
  semantics, event schema, and lifecycle are all untouched.
- **Surface delta:** `src/change/orchestrator.ts` (+2 module-private
  helper functions; -5 inline predicate copies across 3 sites);
  `src/change/orchestrator-parallel.test.ts` (+1 `test(...)` block,
  +1 import for `parse` from `yaml`). Net lines roughly flat (the
  refactor saves ~3 lines per inline copy × 5 sites ≈ 15 lines; the
  helpers add ~10 lines; the new test adds ~25 lines). No new
  files, no new dependencies, no new config keys, no event-schema
  changes, no lifecycle / persona / Git / checkpoint changes.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| reuse | `personaSubEvents` reuses the existing `ChangeEvent` / `Stage` imports | No new imports; the helper sits next to the other module-private helpers | none — keeps the orchestrator's existing private-helper style | required (already in plan) |
| reuse | `isDivergentPersonaEvent` reproduces the existing `result !== "approve" && …` predicate verbatim | Single source of truth for the divergence check | none on the predicate; locks AC-2 and AC-3 via the two existing tests | required (already in plan) |
| speculative | none observed | — | — | already sufficient |
| built-in | `parse` from `yaml` for the new test | standard library, no new dep | none | already sufficient |
| simplify | Telemetry-derived scope | `change.transition` ×13 is recorded as "not addressed here"; F2/F6/F7 follow-ups remain out of scope | keeps this Change tightly bounded to F4's predicate centralization + the aggregation coverage gap | already sufficient |
| deferred | Helpers stay module-private (DC-1) | No direct unit test of the predicates in isolation | none — the three call-site integration tests fully exercise the helpers; matches the file's existing private-helper style (no private helper in this file is unit-tested today) | acceptable |
| deferred | Divergence keeps its defensive checkpoint-result branch (DC-2) | The branch is unreachable for today's persona checkpoints (result is constrained by `assertTransitionIntent`) | none on production paths; behavior preserved | acceptable |

## Executability audit

- **Paths:** both declared paths exist at base `6fb2d8a`:
  `src/change/orchestrator.ts` and
  `src/change/orchestrator-parallel.test.ts`. No new files are
  created.
- **Interfaces:** the two new symbols are module-private
  (`personaSubEvents`, `isDivergentPersonaEvent`); no new exports;
  no existing signature changes. `transitionChangeLocked`'s
  signature and the `ChangeEvent` / `Stage` types are unchanged.
- **Dependencies:** no new packages, no config keys, no event-schema
  additions, no lifecycle / persona / Git / checkpoint changes.
- **Commands:** the verification commands in the plan
  (`node --test --import jiti/register src/change/orchestrator-parallel.test.ts`,
  `npm run typecheck`, `npm run verify`) match the scripts
  registered in `package.json`.
- **Expected red:** none at T1 step 2. The characterization test is
  written to capture the *current* behavior; T1 step 2 explicitly
  expects green against the unchanged code. The red is at T1 step
  3-4 only if the refactor subtly changes a predicate — guarded by
  the three integration tests + the new characterization test.
- **Expected green:** T1 green when the helpers are added and the
  three sites are rewritten with calls; the new test and both
  existing consolidation tests pass. T2 green when `npm run
  verify` exits 0 (applyGate enforces).
- **Rollback:** revert the branch — no migration, no on-disk schema
  change, no event-schema change.
- **Context independence:** the Review verdict is grounded entirely
  in the durable plan artifacts, the cited source files, and the
  existing improvement report. No chat history is required.

## Verdict

`approve`

The Plan is decision-complete, evidence-backed, and tightly bounded.
All cited `file:line` references for production code (four predicate
sites in `orchestrator.ts`, one out-of-scope short-circuit pair in
`model.ts`, two existing tests in `orchestrator-parallel.test.ts`,
the result constraint in `assertTransitionIntent`) were re-verified
on the working tree at base `6fb2d8a`; the duplicated predicates
are exactly as described, and the asymmetry the spec identifies
(five inline copies of a safety-critical predicate whose gap
produced a past critical `CONSOLIDATION_AFTER_SUBEVENTS` defect)
is observable. The simplicity rung is correct (two module-private
helpers, no export, no new module); the safety floor is preserved
(behavior-preserving for every reachable input because the helpers
reproduce the inline predicates verbatim). The five ACs map to
red-capable tests — three integration tests for the consolidation
behaviors plus one inspection criterion (verifiable by `grep`) plus
one machine-gated gate. The "characterization test before refactor"
pattern at T1 step 2 is the right order for a safety-critical
behavior-preserving refactor: it proves the test itself is correct
before the refactor changes anything. The previously untested
reason-aggregation path at `:281` is now locked by AC-1, closing
the documented coverage gap. Findings F2/F6/F7 from the prior
assessment remain as separate follow-ups, correctly out of scope.

Next permitted transition: `codepatrol-apply 2026-07-24-persona-subevent-helpers`
on `codepatrol/2026-07-24-persona-subevent-helpers`, gated by the
declared `applyGate` (`npm run verify`).

## External evidence sufficiency

`not required` — the design is internal to the Codepatrol
orchestrator persona logic and reuses existing primitives
(`ChangeEvent`, `Stage`, `assertTransitionIntent`'s result
constraint, the existing two consolidation tests' `initRepo` /
`binding` / `at` / `startChange` / `transitionChange` /
`inspectChanges` helpers). The only external claim that motivates
this design is the architecture assessment's F4 finding (persona
consolidation logic risk) and the follow-up telemetry that lists
`change.transition` ×13 in the latest report. Both are
re-confirmed; no new dependency, protocol, or external API is
introduced.

## Residual concerns and evidence gaps

- The plan does not redefine `wiki status`; the wiki is correctly
  recorded as absent in both spec and evidence. No wiki refresh
  is required.
- Per-run provider tokens remain unmeasurable from this harness
  (same constraint recorded in the prior three Changes' Plan and
  Review runs). Apply will record
  `characters: { status: "unavailable", reason: … }` for its
  finished runs, consistent with the established pattern.
- DC-1 (helpers stay module-private) is correctly deferred with a
  known observable trigger (a future site needs the predicate
  outside `orchestrator.ts`) and an upgrade path (export the
  helpers and add focused unit tests). Not blocking.
- DC-2 (divergence keeps its defensive checkpoint-result branch)
  is correctly deferred with a known observable trigger (persona
  checkpoints gain a non-accepted result form) and an upgrade path
  (tighten or document the predicate for the new form). The
  branch is unreachable today because `assertTransitionIntent`
  constrains a checkpoint's result to the expected stage result;
  preserving it is the behavior-preserving choice. Not blocking.
- The `reasons` field in the `specific` keys list at
  `model.ts:77` is the only place the new field is registered;
  `foldChange` does not project it, so the aggregation at `:281`
  is observable only on the raw `change.yaml` event. The new
  characterization test reads the raw event, which is the right
  level of indirection for a fold-internal field.
- The plan correctly leaves `model.ts:102-106, 122-126`
  (foldChange's persona short-circuits) out of scope: those are
  distinct, non-duplicated logic, and the spec explicitly records
  the distinction. The Review confirms the distinction by reading
  both code regions side by side.
