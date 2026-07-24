# Review — Fresh architecture, skills, and workflow re-assessment (v2)

- Change: `2026-07-24-architecture-assessment-v2`
- Incoming revision: 1
- Reviewed revision: 1
- Reviewer: opencode (gatekeeper persona)
- Evidence date: 2026-07-24T21:04:05Z

## Scope and evidence

Files inspected on branch `codepatrol/2026-07-24-architecture-assessment-v2`
(checkout `ebe9b43` plan checkpoint, head `cfff6cd` stage transition;
clean working tree, target `main` @ `3ba78c1` — the terminal commit of
the prior `2026-07-24-persona-subevent-helpers` Change):

- `.codepatrol/changes/2026-07-24-architecture-assessment-v2/plan/spec.md`
- `.codepatrol/changes/2026-07-24-architecture-assessment-v2/plan/plan.md`
- `.codepatrol/changes/2026-07-24-architecture-assessment-v2/plan/evidence/investigation.md`
- `src/shared/errors.ts:1-20` (the `ErrorCode` union; N1)
- `src/shared/atomic-store.ts` (no direct test; N2)
- `src/graph/languages.ts` (no direct test; N2)
- `src/graph/queries.ts` (no direct test; N2)
- `src/change/orchestrator.ts:201-293` (N3 — `transitionChange` /
  `transitionChangeLocked`; spec's `:206-293` encompasses the
  `transitionChangeLocked` body)
- `src/change/improvement-report.ts:30-40` (N4 — raw reader at `:33`)
- `scripts/install-lib.mjs:2, 192, 252` (F6 — only `symlinkSync`)
- `src/cli/commands.ts:104-108` (F7 — `wiki.generate` case at `:106`)
- `skills/catalog.yaml:93-97` (F7 — `codebase-wiki` at `:95`)
- `src/change/usage.ts:25-58` (F2 — supports `measured` and
  `unavailable`)
- `src/change/git.ts:110`, `src/wiki/record.ts:198`,
  `src/graph/service.ts:69`, `src/wiki/generate.ts:241` (live
  ErrorCode by-contrast citations)
- `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md` (v1)

External artifacts re-checked:

- `docs/codepatrol/improvement-reports/2026-07-24-persona-subevent-helpers.md:35`
  — `change.transition` invoked 13 times. Matches the spec's
  Improvement signals (and the same "13 times" appears in 4+
  reports, confirming the recurring-signal observation).
- `codepatrol wiki status` → `exists: false` (valid absent
  substrate; F7's "wired but unadopted" status holds).
- `codepatrol graph sync` → 73 files, 1869 symbols, 42 ms (matches
  the spec's Substrate state).
- `git tag -l "codepatrol/committed/*"` confirms the four
  delivered Changes have terminal tags
  (`2026-07-24-architecture-assessment`,
  `2026-07-24-cli-input-ergonomics`,
  `2026-07-24-migration-normalizer`,
  `2026-07-24-persona-subevent-helpers`).
- `.codepatrol/config.json` → `applyGate` = `npm run verify`, 600 s
  timeout.

Independent confirmations:

- `grep -rn "ARTIFACT_INVALID" src/ scripts/ skills/` returns one
  hit at `src/shared/errors.ts:7` (the union definition only). Same
  for `WORKFLOW_NOT_FOUND` (`:13`), `WORKFLOW_INVALID` (`:14`),
  `WORKFLOW_CONFLICT` (`:15`). N1 is real dead code.
- `grep -rn "PUSH_FAILED" src/` returns 4 hits (1 in errors.ts union,
  1 throw at `git.ts:110`, 2 in `close-push.test.ts`); live. Same
  for `STATE_INCOMPATIBLE` (3 hits: union + `wiki/record.ts:198`
  throw + `wiki/wiki.test.ts:186` assertion); live. Same for
  `GRAPH_NOT_FOUND` (3 hits: union + `graph/service.ts:69` throw +
  `wiki/generate.ts:241` throw); live. N1's "live-by-contrast"
  is correct.
- `ls src/shared/atomic-store*` returns only `atomic-store.ts` (no
  `.test.ts`); `ls src/graph/languages*` returns only `languages.ts`
  (no `.test.ts`); `ls src/graph/queries*` returns only `queries.ts`
  (no `.test.ts`). N2's coverage-gap claim is real.
- `grep -rln "atomic-store" src/` returns the 4 consumers the spec
  lists (`session.ts`, `store.ts`, `graph/store.ts`,
  `wiki/record.ts`). The durability primitive is exercised
  transitively only.
- `grep -rn "TODO\|FIXME\|HACK" src/` returns no matches. The
  "clean" observation is correct.
- `wc -l src/wiki/*.ts | grep -v test | grep -v total` sums to 889
  LOC, matching the spec's F7 evidence exactly.
- `grep -n "symlinkSync\|copyFile\|copyFileSync" scripts/install-lib.mjs` returns `symlinkSync` only (no copy primitives).
  F6's "by-design" claim is correct.
- `wc -l src/wiki/wiki.test.ts` returns 246, and
  `wc -l src/wiki/generate.ts` returns 245. The non-test wiki
  module is 245+39+290+72+50+193 = 889 LOC. F7 evidence is
  correct.

Limitations: did not execute `npm run verify` (Review never re-runs
the full gate; that is Apply's job per AGENTS.md). Did not author
the assessment document (that is Apply's T1 task). The Review
verifies the plan's evidence and the new findings' observability;
the document itself is reviewed again at Verify.

## Findings

### minor — plan

**Issue:** Spec cites `orchestrator.ts:206-293` for the
`transitionChangeLocked` function. The function definition opens at
line 206 and the closing brace is at line 292 (line 293 is blank).
The line range is approximately correct; the function body runs
through line 286 (the last `return foldChange(record);` statement)
with the closing brace at line 287 and the `recordFromYaml`
declaration starting at line 289.

**Impact:** None on acceptance criteria. AC-2 ("every `file:line`
cited in the document resolves to the described construct") is
satisfied: line 206 contains the `transitionChangeLocked`
declaration. The trailing blank line at 293 is harmless.

**Disposition:** carry-forward note; non-blocking.

### minor — plan

**Issue:** Spec and plan refer to "delivered ... `codepatrol/committed/*` tags exist" in the v1 reconciliation. These
are git tags, not a `docs/codepatrol/committed/` directory. The
phrase could be misread as a directory path; the actual evidence is
the four tags
(`codepatrol/committed/2026-07-24-architecture-assessment`,
`...-cli-input-ergonomics`, `...-migration-normalizer`,
`...-persona-subevent-helpers`).

**Impact:** None on acceptance criteria. The v1 reconciliation
table will use the work-ids and dates, which are unambiguous.

**Disposition:** documentation nit; not blocking.

No critical or major findings survive validation. The four new
findings (N1–N4) are independently confirmed:

- **N1** — `ARTIFACT_INVALID`, `WORKFLOW_NOT_FOUND`,
  `WORKFLOW_INVALID`, `WORKFLOW_CONFLICT` have zero references
  outside the `ErrorCode` union. Real dead code.
- **N2** — `atomic-store.ts`, `graph/languages.ts`,
  `graph/queries.ts` have no direct test files. Real coverage
  gaps.
- **N3** — `transitionChangeLocked` is ~88 lines with mixed
  responsibilities. Real density issue.
- **N4** — `improvement-report.ts:33` reads records without
  `migrateRecord`. Real carry of v1 F3's DC-2.

The v1 reconciliation is correct: F1/F5/F3/F4 delivered (terminal
tags exist); F2 external (no CLI-readable per-run usage source);
F6 by-design (`symlinkSync` only); F7 adoption decision (889 LOC
wired but `wiki status` returns `exists: false`).

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `plan/plan.md` | none (carry-forward note only) | The `:206-293` line range for `transitionChangeLocked` is approximately correct (function opens at 206, closes at 292; line 293 is blank); not blocking | none |
| `plan/spec.md` | none | The "codepatrol/committed/*" phrase refers to git tags, not a directory; the v1 reconciliation will use unambiguous work-ids | none |
| `plan/evidence/investigation.md` | none | All citations verified; new findings independently confirmed; v1 reconciliation independently confirmed | none |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 (doc exists with v1 reconciliation + new-findings tables, evidence/severity/follow-up per finding) | yes | T1 | yes — `ls docs/codepatrol/assessments/2026-07-24-architecture-v2.md` and inspect the document's section structure; the v1 reconciliation table must cover F1–F7 with current disposition; the new-findings table must carry N1–N4 with `file:line`/severity/follow-up | covered |
| AC-2 (every cited `file:line` resolves on the current tree) | yes | T1 | yes — for each cited `path:line`, `sed -n '<line>p' <path>` and `grep -n` confirm the construct; this Review independently re-verified all spec/plan citations; Apply's T1 step 2 re-runs the same check on the document's citations | covered |
| AC-3 (explicit F2 external / F6 by-design / F7 adoption disposition + accepted transition-count cost) | yes | T1 | yes — inspect the document for an "accepted costs / decisions" section; F2/F6/F7 must each carry an explicit disposition; the recurring `change.transition` ×13 signal must be recorded as an accepted design cost with rationale | covered |
| AC-4 (`npm run verify` exit 0 on candidate) | yes | T2 | yes — applyGate machine-enforces at implemented checkpoint; this is a doc-only Change so the gate is trivially green at the candidate | covered |

## Simplicity axis

- **Selected rung:** direct local change — one documentation file.
  Confirmed. No code, no dependencies, no config, no events. The
  Change reuses the v1 assessment format as a template.
- **Safety floor:** the v1 assessment is preserved unchanged (the
  plan correctly rejects amending it in place, citing provenance).
  No production code touched. Every cited `file:line` is re-verified
  before sealing (T1 step 2). The full gate stays green because
  the only change is a Markdown file outside `src/`, `scripts/`,
  or `bin/`.
- **Surface delta:** one new file
  (`docs/codepatrol/assessments/2026-07-24-architecture-v2.md`).
  No code, no dependencies, no config keys, no event-schema
  changes, no lifecycle / Git / persona changes. The parent
  directory `docs/codepatrol/assessments/` already exists (the v1
  doc lives there), so no new directory is created.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| reuse | v1 doc as a template for v2's structure (v1 reconciliation table + ranked new-findings table + accepted costs + method note) | Reuses the v1 format so the maintainer can compare the two scans side by side | none — preserves provenance and lets v1 stand as a historical record | required (already in plan) |
| reuse | `codepatrol graph sync` for the method note's graph-revision field | Standard CLI; no new surface | none | already sufficient |
| speculative | none observed | — | — | already sufficient |
| built-in | `find`/`grep` for the dead-code / coverage-gap evidence | Standard tooling; no new dep | none | already sufficient |
| simplify | Telemetry-derived scope | The recurring `change.transition` ×13 signal is recorded as an "accepted design cost" with rationale (one event per transition is inherent to the contract) rather than a defect | prevents the same recommendation from being re-issued by every future improvement report; defers the decision to a product call | required (already in plan) |
| deferred | Findings N1–N4 recorded, not implemented (DC-1) | The debt persists until scheduled; each new finding has a named bounded follow-up work-id | keeps this Change tightly bounded to a doc-only re-scan; matches the maintainer's chosen direction | acceptable |
| deferred | F2/F6/F7 dispositioned, not resolved (DC-2) | F2 remains external; F6 stays by-design; F7 stays an adoption decision | the disposition is the value; the maintainer surfaces the decision rather than letting the findings drift | acceptable |

## Executability audit

- **Paths:** the one declared path
  (`docs/codepatrol/assessments/2026-07-24-architecture-v2.md`)
  does not exist at base `3ba78c1` and will be created by Apply
  T1. The parent directory `docs/codepatrol/assessments/`
  already exists (v1 lives there at line 1). No new directories
  are needed.
- **Interfaces:** no new exports, no new types, no new config, no
  new events. The document is pure Markdown.
- **Dependencies:** no new packages, no config keys, no
  event-schema additions, no lifecycle / persona / Git / checkpoint
  changes.
- **Commands:** the verification commands in the plan
  (`ls`, `sed -n`, `grep -n` for citation re-verification;
  `npm run verify` for the full gate) match the available
  tooling. `codepatrol graph sync` is the standard CLI command.
- **Expected red:** none at T1. The task is a pure write; the
  expected result is the file exists, all citations resolve on
  re-verification, and the document structure matches the
  spec's Proposed design (4 sections: v1 reconciliation, new
  findings, accepted costs, method note).
- **Expected green:** T1 green when the document is written and
  T1 step 2's re-verification passes. T2 green when `npm run
  verify` exits 0 (applyGate enforces; for a doc-only Change the
  gate is trivially green because no code is touched).
- **Rollback:** revert the branch — no migration, no on-disk
  schema change, no event-schema change.
- **Context independence:** the Review verdict is grounded entirely
  in the durable plan artifacts, the cited source files, the v1
  assessment doc, the four terminal git tags, and the latest
  improvement report. No chat history is required.

## Verdict

`approve`

The Plan is decision-complete, evidence-backed, and tightly bounded.
All cited `file:line` references for production code and external
artifacts (8 citations across 4 new findings + 3 v1 reconciliations
+ the F7 wiring evidence) were re-verified on the working tree at
base `3ba78c1`; the new findings are independently observable
(N1's dead `ErrorCode` members have zero references outside the
union; N2's three source files have no direct tests; N3's
`transitionChangeLocked` is 88 lines with mixed responsibilities;
N4's `improvement-report.ts:33` reads without `migrateRecord`).
The v1 reconciliation is independently confirmed: F1/F5/F3/F4
delivered (four terminal tags exist); F2 external (no
CLI-readable per-run usage source); F6 by-design (`symlinkSync`
only); F7 adoption decision (889 non-test wiki LOC wired but
`wiki status` returns `exists: false`). The recurring
`change.transition` ×13 signal is recorded as an accepted design
cost with rationale (one event per transition is inherent to the
contract), preventing the same recommendation from re-appearing
in every future report. The simplicity rung is correct (one
new doc file, no code); the safety floor is preserved (no code,
no schema, no lifecycle, no Git behavior change). The four ACs
map to inspectable / red-capable checks; AC-4 is machine-gated
by `applyGate`. The deferred findings (DC-1: N1–N4 follow-ups;
DC-2: F2/F6/F7 dispositions) are correctly recorded with
observable triggers and bounded upgrade paths. The two minor
documentation drifts (the `:206-293` line range and the
"codepatrol/committed/*" phrase) are not blocking.

Next permitted transition: `codepatrol-apply 2026-07-24-architecture-assessment-v2`
on `codepatrol/2026-07-24-architecture-assessment-v2`, gated by
the declared `applyGate` (`npm run verify`).

## External evidence sufficiency

`not required` — the design is a pure documentation scan that
reuses existing primitives (`codepatrol graph sync`, `git tag -l`,
the v1 assessment doc, the improvement reports, the four terminal
git tags, the existing `codepatrol wiki status` command, and the
standard `find`/`grep`/`sed` tooling for citation re-verification).
No new dependency, protocol, or external API is introduced; the
recurring telemetry signal (the only cross-cutting external
observation) is grounded in 4+ improvement reports all citing
`change.transition` ×13, which this Review independently
re-confirmed.

## Residual concerns and evidence gaps

- The Apply task must re-verify every `file:line` citation in
  the document before sealing (T1 step 2). This Review
  independently re-verified all spec/plan citations and the
  v1 reconciliation; the document's own citations are a
  superset and will be re-verified at Apply time.
- The four follow-up work-ids (`2026-07-25-prune-error-codes`,
  `2026-07-25-atomic-store-tests`,
  `2026-07-25-transition-decomposition`,
  `2026-07-25-report-reader-normalize`) are placeholders that
  must be filled in when each follow-up Change is actually
  scheduled. The doc records them as "proposed"; no commitment
  to date any of them is implied.
- The v1 reconciliation's F3 line ("delivered ... + carry
  [decomposition]") is correct but worth noting: F3's
  migration-centralization half was delivered in
  `2026-07-24-migration-normalizer`; F3's decomposition half
  is the N3 follow-up. The reconciliation must reflect both
  halves distinctly.
- The "recurring transition-count signal" rationale ("one
  event per transition — inherent to the contract") is correct
  but only documented in this Change; future improvement
  reports will need to know about the accepted-cost record to
  avoid re-issuing the same recommendation. The plan's T1
  step 1 must record this disposition in the document so it
  is discoverable.
- Per-run provider tokens remain unmeasurable from this harness
  (same constraint recorded in the prior four Changes' Plan and
  Review runs). Apply will record
  `characters: { status: "unavailable", reason: … }` for its
  finished runs, consistent with the established pattern.
- The plan does not redefine `wiki status`; the wiki is
  correctly recorded as absent (F7's adoption decision
  observation) in both spec and evidence. No wiki refresh
  is required.
- The v1 doc is preserved as a historical record at its
  baseline; v2 is a new dated file. This is the correct
  provenance-preserving choice (rejected alternative:
  amend v1 in place).
