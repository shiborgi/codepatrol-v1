# Review — Architecture, skills, and workflow assessment with Stage-Session ergonomics fix

- Change: `2026-07-24-architecture-assessment`
- Incoming revision: 1
- Reviewed revision: 1
- Reviewer: opencode (gatekeeper persona)
- Evidence date: 2026-07-24T17:04:25Z

## Scope and evidence

Files inspected on branch `codepatrol/2026-07-24-architecture-assessment`
(checkout `3476c5d…` plan checkpoint, head `a668267…` stage transition; clean
working tree, target `main` @ `415f779`):

- `.codepatrol/changes/2026-07-24-architecture-assessment/plan/spec.md`
- `.codepatrol/changes/2026-07-24-architecture-assessment/plan/plan.md`
- `.codepatrol/changes/2026-07-24-architecture-assessment/plan/evidence/investigation.md`
- `src/change/session.ts` (full file)
- `src/cli/commands.ts:45-49, 124-133`
- `src/change/orchestrator.ts:200-300`
- `src/change/model.ts:57-70`
- `scripts/skills-contract.test.mjs:24-31`
- `skills/_shared/SESSION.md` (full file)
- `.codepatrol/changes/2026-07-24-architecture-assessment/change.yaml`

External artifacts re-checked:

- `docs/codepatrol/improvement-reports/2026-07-24-aggregate-and-push.md:24,44`
  — `CHANGE_CONFLICT` "Session item is not ready" ×25; `change.session`
  invoked 109 times. Numbers match spec's Current evidence.
- `docs/codepatrol/improvement-reports/2026-07-24-apply-verify-gate.md:21-23,44`
  — `INVALID_WORKSPACE` ×2; `change.session` invoked 18 times. Matches.
- `codepatrol wiki status` → `exists: false` (valid absent substrate state).
- `codepatrol graph sync` → 73 files, 1804 symbols, 41–42 ms.
- `.codepatrol/config.json` → `applyGate` = `npm run verify`, 600 s timeout.
  Apply `implemented` checkpoint will be machine-gated.

Limitations: did not execute `npm run verify` (Review never re-runs the full
gate; that is Apply's job per AGENTS.md). Did not trace every
orchestrator seam beyond the cited lines (out of scope; findings F2–F7 are
recorded but not implemented).

## Findings

### minor — plan

**Issue:** Plan T2 step 1 cites `cli.test.ts:38` as the location of the
`run(...)` helper, but the helper is defined at `cli.test.ts:20`. The
spec's intent (use the existing helper that wraps `spawnSync`) is clear
and the helper is one Grep away; this is a stale line-number, not a
substantive defect.

**Impact:** An independent implementer will locate the helper trivially;
no acceptance criterion is affected.

**Disposition:** carry forward as a minor cleanup in a future Plan
revision (does not block approve).

### minor — plan

**Issue:** Plan does not explicitly call out `mkdir -p
docs/codepatrol/assessments/` before authoring T4's document. The path is
not present today (`ls docs/codepatrol/assessments` → No such file or
directory); the editor will create it implicitly, but the red/green
wording in T5 step 2 ("uncommitted working tree clean") only checks git
state, so the directory creation is safe.

**Impact:** None on acceptance criteria; minor operational note for Apply.

**Disposition:** not blocking.

No critical or major findings survive validation. All other cited
`file:line` references were re-verified against the working tree and
match the spec:

- `src/change/session.ts:44` (`deriveItems`), `:60-72` (`primeStageSession`),
  `:73` (`readySessionItems`), `:74-80` (`claimSessionItem`).
- `src/cli/commands.ts:46` (`readJsonInput`), `:124-133` (`change.session`
  switch; `prime|claim|close|rebuild` only).
- `src/change/orchestrator.ts:200-287` (`transitionChangeLocked`),
  `:225-231` (`CONSOLIDATION_AFTER_SUBEVENTS` guard), `:281` (return
  reason aggregation), `:292-298` (`recordFromYaml` tokens→characters
  compat migration).
- `src/change/model.ts:57-61` (finalize→close compat migrations).
- `scripts/skills-contract.test.mjs:24-31` (SESSION.md assertion block
  at line 30 contains the documented seam).

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `plan/plan.md` | none (carry-forward note only) | minor line-number drift in T2 helper reference; non-blocking | none |
| `plan/spec.md` | none | All citations verified; simplicity rung confirmed | none |
| `plan/evidence/investigation.md` | none | Telemetry numbers match durable reports | none |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 (status returns ready + blocked, exit 0) | yes | T2 | yes — `node --test --import jiti/register src/cli/cli.test.ts` with status input asserts `data.status.ready` and stdout text | covered |
| AC-2 (claim error names the blocking dependency) | yes | T1 | yes — unit test asserts `e.message` matches `/T2/` and `/T1/` while preserving `CHANGE_CONFLICT` | covered |
| AC-3 (status does not write when session absent) | yes | T1 | yes — `existsSync(path) === false` before and after `readStageSession` | covered |
| AC-4 (SESSION.md documents `status`; contract test asserts) | yes | T3 | yes — skills-contract test red until doc edited; lint:skills covers prose | covered |
| AC-5 (assessment doc ranks F1–F7 with file:line evidence) | yes | T4 | yes — file existence + per-citation `sed -n` re-check | covered |
| AC-6 (`npm run verify` exit 0 at candidate) | yes | T5 | yes — applyGate machine-enforces at implemented checkpoint | covered |

## Simplicity axis

- **Selected rung:** direct local change in `src/change/session.ts` plus a
  CLI switch branch — confirmed. The status projection reuses
  `readySessionItems` (`session.ts:73`) and `deriveItems` (`session.ts:44`);
  the `loadOrDerive` extraction keeps `prime` (write) and `readStageSession`
  (no-write) sharing one derivation without duplicating logic.
- **Safety floor:** claim-one-before-mutation invariant, current-attempt
  guard, atomic writes via `atomicWriteJson`, and the read-only guarantee
  of the new path are all preserved. The enriched `CHANGE_CONFLICT`
  message keeps the existing prefix and code, so no external matcher is
  expected to break (no test asserts the current string today, per the
  spec's own grep and a fresh `rg "not ready" src/**` that returned no
  matches).
- **Surface delta:** `src/change/session.ts` (+2 exports + 2 interfaces),
  `src/cli/commands.ts` (one new switch branch), `skills/_shared/SESSION.md`
  (one paragraph), `scripts/skills-contract.test.mjs` (one assertion),
  `src/change/change.test.ts` + `src/cli/cli.test.ts` (new test blocks),
  `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md`
  (new file). No new dependencies, no config keys, no event schema
  changes, no lifecycle / persona state-machine changes.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| reuse | `sessionStatus.ready` | Reuse `readySessionItems` instead of a second filter | none — single source of truth for the "ready" predicate | required (already in plan) |
| reuse | `loadOrDerive` extraction | Existing `primeStageSession` body split so `prime` and `readStageSession` share one derivation | preserves read-only guarantee of new path without duplicating logic | required (already in plan) |
| speculative | none observed | — | — | already sufficient |
| built-in | `node:fs` `existsSync` in AC-3 test | standard library; no new dep | none | already sufficient |
| simplify | Telemetry-derived scope | F2–F7 recorded as follow-up work-ids rather than implemented | keeps this Change bounded; assessment doc carries the rationale | already sufficient |

## Executability audit

- **Paths:** all declared paths exist or are creatable from the working
  tree. `docs/codepatrol/assessments/` is absent; the file editor will
  create it. `src/change/session.ts`, `src/cli/commands.ts`,
  `skills/_shared/SESSION.md`, `scripts/skills-contract.test.mjs`,
  `src/change/change.test.ts`, `src/cli/cli.test.ts` all exist.
- **Interfaces:** declared exports (`BlockedItem`, `SessionStatusView`,
  `sessionStatus`, `readStageSession`) are net-additive; no existing
  signature changes; `payload.action` union is extended from four
  members to five (`prime|claim|close|rebuild|status`). The unknown-action
  error path remains as a safety net.
- **Dependencies:** no new packages, no config keys, no event schema
  additions.
- **Commands:** the verification script commands in the plan
  (`node --test --import jiti/register …`, `npm run typecheck`,
  `npm run smoke:cli`, `npm run lint:skills`, `npm run verify`) match
  the scripts registered in `package.json` (re-checked).
- **Expected red:** T1 red is a missing export / missing token in the
  claim message. T2 red is the unknown-action error. T3 red is the
  contract-test assertion failure. None are syntax or setup failures.
- **Expected green:** T1 green when `sessionStatus`, `readStageSession`,
  and the enriched `claimSessionItem` are added; T2 green when the
  `status` branch and the extended union are in place; T3 green when
  `SESSION.md` mentions `status`; T4 green when the assessment file is
  written; T5 green when `npm run verify` exits 0 (applyGate enforces).
- **Rollback:** revert the branch — no migration, no on-disk schema
  change.
- **Context independence:** the Review verdict is grounded entirely in
  the durable plan artifacts, the cited source files, and the existing
  improvement reports. No chat history is required.

## Verdict

`approve`

The Plan is decision-complete, evidence-backed, and bounded. Cited
`file:line` references were re-verified on the working tree; telemetry
numbers in the spec match durable reports; the simplicity rung is
correct (direct local change, additive CLI surface, no new
dependencies); all six acceptance criteria map to red-capable tests.
The only deviations are two minor line-number / mkdir notes that do not
affect any acceptance criterion and can be carried forward. The
remaining findings (F2–F7) are explicitly recorded as bounded follow-up
work-ids in the assessment document, not silently dropped.

Next permitted transition: `codepatrol-apply 2026-07-24-architecture-assessment`
on `codepatrol/2026-07-24-architecture-assessment`, gated by the
declared `applyGate` (`npm run verify`).

## External evidence sufficiency

`not required` — the design is internal to the Codepatrol codebase and
reuses existing primitives (`readySessionItems`, `deriveItems`,
`primeStageSession`, `atomicWriteJson`, the existing SESSION.md
contract-test seam). The only external claims that govern this design
are the two durable improvement reports, both of which were re-read
and confirmed: 109 `change.session` invocations and 25
`CHANGE_CONFLICT` "Session item is not ready" occurrences in
`2026-07-24-aggregate-and-push.md`; 18 invocations and 2
`INVALID_WORKSPACE` in `2026-07-24-apply-verify-gate.md`. No new
dependency, protocol, or external API is introduced.

## Residual concerns and evidence gaps

- The assessment document (`docs/codepatrol/assessments/2026-07-24-architecture-workflow.md`)
  is authored during Apply (T4); it was not produced at Plan time and is
  therefore not available for Review to grade prose quality. T4 step 2
  requires the implementer to re-verify every cited `file:line` exists;
  Apply should re-run the same verification I performed here before
  sealing T4.
- The Plan does not redefine `wiki status`; the wiki is correctly
  recorded as absent in both spec and evidence. No wiki refresh is
  required.
- Per-run provider tokens remain unmeasurable from this harness (same
  constraint recorded in the Plan's Plan run). Apply will record
  `characters: { status: "unavailable", reason: … }` for its finished
  runs, consistent with the established pattern.
- The minor `cli.test.ts:38` line-number drift in T2 step 1 is a
  documentation nit, not a defect; the helper is unambiguously the
  `run(args, input)` wrapping `spawnSync` shown at line 20. An
  independent implementer will not be misled.
