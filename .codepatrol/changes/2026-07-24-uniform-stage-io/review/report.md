# Review — Uniform, harness-independent stage input and output

- Change: `2026-07-24-uniform-stage-io`
- Incoming revision: 1
- Reviewed revision: 1
- Reviewer: opencode (gatekeeper persona)
- Evidence date: 2026-07-24T21:33:18Z

## Scope and evidence

Files inspected on branch `codepatrol/2026-07-24-uniform-stage-io`
(checkout `67b9565` plan checkpoint, head `f5faaed` stage transition;
clean working tree, target `main` @ `5674289` — the terminal commit of
the prior `2026-07-24-architecture-assessment-v2` Change):

- `.codepatrol/changes/2026-07-24-uniform-stage-io/plan/spec.md`
- `.codepatrol/changes/2026-07-24-uniform-stage-io/plan/plan.md`
- `.codepatrol/changes/2026-07-24-uniform-stage-io/plan/evidence/investigation.md`
- `src/cli/commands.ts:54-122` (the switch; `status` at `:56`,
  `change.start` at `:115`, `change.inspect` at `:119`)
- `src/change/board.ts:19-33` (`projectKanban` /
  `renderKanbanMarkdown`)
- `src/cli/args.ts:31-54` (`KNOWN` + `COMMAND_OPTIONS`)
- `src/cli/output.ts:32-63` (`HELP`)
- `src/change/types.ts:3` (`STAGES`)
- `src/cli/cli.test.ts:1-30` (existing `run` + `workspace` helpers)
- `skills/codepatrol-status/SKILL.md:11-23` (deterministic
  precedent)
- `skills/codepatrol-close/SKILL.md:34-40` (the `push: true` line at
  `:37`)
- `skills/codepatrol-{plan,review,apply,verify,close}/SKILL.md`
  (current entry / exit instructions)

External artifacts re-checked:

- `docs/codepatrol/improvement-reports/2026-07-24-architecture-assessment-v2.md:35`
  — `change.transition` invoked 13 times (recurring accepted
  design cost). Matches the spec's Improvement signals.
- `codepatrol wiki status` → `exists: false` (valid absent
  substrate).
- `codepatrol graph sync` → 73 files, 1869 symbols, 42 ms.
- `.codepatrol/config.json` → `applyGate` = `npm run verify`, 600 s
  timeout.

Independent confirmations:

- Each of the five lifecycle skills' `Report …` line was located
  via `grep` (plan:55, review:42, apply:41, verify:41, close:37).
  These are the free-form exit lines the new design replaces with
  the deterministic `change summary` instruction.
- The `codepatrol-status/SKILL.md:11-23` precedent reads
  "reproduce the script output verbatim" + "repeat each projected
  `nextAction` exactly" — the exact reproduce-verbatim pattern the
  new design extends to every stage.
- The `KNOWN_COMMANDS` derivation in `args.ts:36-54` confirms
  the new `next` and `change.summary` commands must be added to
  the same `COMMAND_OPTIONS` map to keep `KNOWN_COMMANDS` in
  sync (the prior `cli-input-ergonomics` Change established this
  invariant).

Limitations: did not execute `npm run verify` (Review never re-runs
the full gate; that is Apply's job per AGENTS.md). Did not exercise
the new commands end-to-end (that is Apply T1's test).

## Findings

### minor — plan

**Issue:** Spec cites `commands.ts:116-119` for the `change.inspect`
text. The actual text line is at `:121` (`<id> <stage>#<attempt>
<state>\nnext: <nextAction>`); `:116-119` covers the `change.start`
case close (`:117-118`) and the `change.inspect` case opening
(`:119-121`). The intent (the `change.inspect` text format) is
clear and the implementer will find it at `:121` via the
`Unknown command` / `next:` literal.

**Impact:** None on acceptance criteria. The Review's
AC-3 ("`change summary` … three-line `Summary:` / `Verdict:` /
`Next:` block") does not depend on the exact line number.

**Disposition:** carry-forward note; non-blocking.

No critical or major findings survive validation. All cited
`file:line` references for production code were re-verified
against the working tree at base `5674289`:

- `src/cli/commands.ts:53-57` — `status` switch case
  (`executeCommand` opens at `:54`, switch at `:55`, `status` case
  at `:56-59`; the spec's `:53-57` encompasses the dispatch + the
  first two lines of the case) ✓
- `src/cli/commands.ts:116-119` — `change.inspect` text
  (the `<id> <stage>#<attempt> <state>\nnext: <nextAction>` is at
  `:121`; the range is approximately correct) ✓
- `src/change/board.ts:19-33` — `projectKanban` opens at `:19`,
  `renderKanbanMarkdown` opens at `:32`; the range encompasses
  both ✓
- `src/cli/args.ts:31-54` — `KNOWN` is at `:31-34`,
  `COMMAND_OPTIONS` is at `:36-54` ✓
- `src/cli/output.ts:32-63` — `HELP` opens at `:33`; the
  renderers (`renderOverview`, `renderImpact`, etc.) live
  below at `:65-140`; the spec's `:32-63, 65-140` matches ✓
- `src/change/types.ts:3` — `STAGES = ["plan", "review",
  "apply", "verify", "close"] as const` ✓
- `skills/codepatrol-status/SKILL.md:11-23` — the deterministic
  precedent ("reproduce the script output verbatim … repeat each
  projected `nextAction` exactly") ✓
- `skills/codepatrol-close/SKILL.md:37` — `push: true` is set ✓

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `plan/spec.md` | none (carry-forward note only) | `commands.ts:116-119` line range is approximately correct; the inspect text is at `:121` | none |
| `plan/plan.md` | none | All citations verified; surface delta forecast is correct; disjoint file ownership (T1: `src/cli/*`; T2: skills + contract test) | none |
| `plan/evidence/investigation.md` | none | Telemetry number (13 `change.transition` invocations) verified; deterministic-CLI precedent confirmed | none |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 (`next --stage <s>` lists non-terminal Changes at stage, text + JSON, work id + state + nextAction) | yes | T1 | yes — `node --test --import jiti/register src/cli/cli.test.ts` (start a Change, then `next --stage plan --format=json` asserts the new Change is in `data.changes[0]` with the correct `workId`; text output mentions the work id) | covered |
| AC-2 (plan start-new affordance; close options; invalid stage → `INVALID_ARGUMENT` exit 2) | yes | T1 | yes — same suite (`data.startNew === true` for plan; `data.closeOptions` deep-equals `["commit","commit+push","rollback"]` for close; `next --stage bogus` exits 2 with `error.code === "INVALID_ARGUMENT"`) | covered |
| AC-3 (`change summary` three-line `Summary:` / `Verdict:` / `Next:` block, JSON `{summary,verdict,next}`) | yes | T1 | yes — same suite (`JSON.parse(...).data` has `summary` + `verdict` + `next`; text output matches `/^Summary:/m`, `/^Verdict:/m`, `/^Next:/m`) | covered |
| AC-4 (each lifecycle skill reproduces `next` and `change summary`; `close` documents commit+push; `skills-contract.test.mjs` asserts all five) | yes | T2 | yes — `node --test --import jiti/register scripts/skills-contract.test.mjs` (asserts each of 5 SKILL.md files contains `codepatrol next` and `codepatrol change summary`; `close` contains `commit+push`); `npm run lint:skills` covers prose | covered |
| AC-5 (`npm run verify` exit 0) | yes | T3 | yes — applyGate machine-enforces at implemented checkpoint | covered |

## Simplicity axis

- **Selected rung:** local reuse — two CLI renderers over existing
  `inspectChanges`/`ChangeView`, plus mechanical skill wiring.
  Confirmed. `renderNext` and `renderSummary` mirror
  `renderOverview`/`renderImpact` (the existing
  presentation-layer precedent); the `next` and `change.summary`
  switch cases follow the same shape as `change.inspect` /
  `change.start`. The skill wiring is mechanical per-skill prose
  added to the existing `Report …` lines.
- **Safety floor:** preserved. No existing command, event,
  schema, or Git behavior changes. `inspect` and `status` keep
  their current behavior. `commit+push` uses the existing
  `push: true` path (no orchestrator change). `KNOWN_COMMANDS`
  is derived from `COMMAND_OPTIONS` so the new commands
  automatically appear in the unknown-command suggestion
  (continuing the pattern from the prior `cli-input-ergonomics`
  Change). The deterministic-CLI / skill-reproduces-verbatim
  pattern matches the existing `codepatrol-status` precedent,
  so the new wiring is consistent with the file's established
  approach.
- **Surface delta:** `src/cli/args.ts` (+1 option, +2
  `COMMAND_OPTIONS` entries, +1 `ParsedArgs` field);
  `src/cli/output.ts` (+2 renderers, +2 HELP lines);
  `src/cli/commands.ts` (+2 switch cases);
  `src/cli/cli.test.ts` (+2 test blocks); create
  `skills/_shared/STAGE-IO.md`; modify five
  `skills/codepatrol-*/SKILL.md` (one entry + one exit line
  each); modify `scripts/skills-contract.test.mjs` (+1 loop
  assertion). No new files outside `skills/_shared/`, no new
  dependencies, no new config, no event-schema changes, no
  lifecycle / orchestrator / Git / persona changes.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| reuse | `renderNext` / `renderSummary` mirror `renderOverview` / `renderImpact` | Standard presentation-layer pattern; no new module | none | required (already in plan) |
| reuse | `next` / `change.summary` switch cases mirror `change.inspect` / `change.start` | Standard CLI dispatch; no new module | none | required (already in plan) |
| reuse | `KNOWN_COMMANDS` derives from `COMMAND_OPTIONS` (from `cli-input-ergonomics`) | Adding `next` and `change.summary` to `COMMAND_OPTIONS` automatically extends the unknown-command suggestion list | none — preserves the prior Change's invariant | required (already in plan) |
| reuse | Skill wiring mirrors the existing `codepatrol-status/SKILL.md` reproduce-verbatim pattern | Same model the spec is extending | none — keeps the dispatcher pattern uniform | required (already in plan) |
| speculative | none observed | — | — | already sufficient |
| built-in | `STAGES` for `--stage` validation | Standard library; no new dep | none | already sufficient |
| simplify | Telemetry-derived scope | The recurring `change.transition` ×13 signal is recorded as an accepted design cost; the new uniform `change summary` does not introduce a new invariant around the count | keeps this Change focused on uniformity, not on changing the lifecycle | already sufficient |
| deferred | `next` list is unsorted beyond `created_at` (DC-1) | A workspace with >20 active Changes could make the list long | adds paging/filtering to `next` when observed | acceptable |
| deferred | Summary verdict is the raw result/state token (DC-2) | A localized or richer verdict phrasing may be wanted | maps tokens to phrases in `renderSummary` when product asks | acceptable |

## Executability audit

- **Paths:** all 8 declared paths exist at base `5674289`
  (the four `src/cli/*` files, the five `skills/codepatrol-*/SKILL.md`
  files, the `scripts/skills-contract.test.mjs` file) plus
  `skills/_shared/` (where `STAGE-IO.md` will be created). No
  unexpected new files; `STAGE-IO.md` is the only new file.
- **Interfaces:** the two new symbols are exported renderers
  (`renderNext`, `renderSummary`) added to `src/cli/output.ts`;
  the two new commands (`next`, `change.summary`) are routed
  through the existing `executeCommand` switch. `KNOWN` and
  `COMMAND_OPTIONS` gain one new option (`stage`) and two new
  command entries. `ParsedArgs` gains one new optional field
  (`stage?: string`).
- **Dependencies:** no new packages, no config keys, no
  event-schema additions, no lifecycle / persona / Git /
  checkpoint changes.
- **Commands:** the verification commands in the plan
  (`node --test --import jiti/register src/cli/cli.test.ts`,
  `node --test --import jiti/register scripts/skills-contract.test.mjs`,
  `npm run typecheck`, `npm run smoke:cli`, `npm run lint:skills`,
  `npm run verify`) match the available tooling.
- **Expected red:** T1 step 2: `next` and `change summary` are
  unknown commands (parse/executeCommand errors). Not a setup
  failure. T2 step 2: the new skills-contract assertions fail
  before the skill edits. Both are real red signals, not
  setup failures.
- **Expected green:** T1 green when both renderers and both
  switch cases are in place; T2 green when all five skills
  reference both commands and `close` references `commit+push`;
  T3 green when `npm run verify` exits 0 (applyGate enforces).
- **Rollback:** revert the branch — no migration, no on-disk
  schema change, no event-schema change.
- **Context independence:** the Review verdict is grounded
  entirely in the durable plan artifacts, the cited source
  files, the existing `codepatrol-status` precedent, and the
  latest improvement report. No chat history is required.

## Verdict

`approve`

The Plan is decision-complete, evidence-backed, and tightly
bounded. All cited `file:line` references for production code
(8 locations across `commands.ts`, `board.ts`, `args.ts`,
`output.ts`, `types.ts`, and two SKILL.md files) were re-verified
on the working tree at base `5674289`. The
deterministic-CLI / skill-reproduces-verbatim pattern is the
right architectural model for the goal (uniform stage input and
output across harnesses and models) and matches the existing
`codepatrol-status` precedent, so the new wiring is consistent
with the file's established approach. The simplicity rung is
correct (two new renderers + two new switch cases + mechanical
skill wiring; no new modules, no new dependencies). The safety
floor is preserved: no existing command, event, schema, or Git
behavior changes; `commit+push` uses the existing `push: true`
path; `KNOWN_COMMANDS` automatically extends because the new
commands live in the same `COMMAND_OPTIONS` table (the prior
`cli-input-ergonomics` invariant). The five ACs map to
red-capable tests — three in `cli.test.ts` for AC-1, AC-2, AC-3
(text + JSON, plan start-new, close options, invalid stage,
three-line summary) plus one loop assertion in
`skills-contract.test.mjs` for AC-4 plus `applyGate` for AC-5.
The disjoint file ownership (T1: `src/cli/*`; T2: skills +
contract test) prevents concurrent same-file writes. Risks are
enumerated with concrete mitigations (skill drift → contract
assertions; verdict mis-representation → multi-stage CLI
tests; list omission/duplication → reuse `inspectChanges`).
The deferred constraints (DC-1: paging for `next`; DC-2:
verdict phrasing map) are recorded with observable triggers
and bounded upgrade paths. The two minor documentation drifts
(the `commands.ts:116-119` line range and the implicit range
in the spec's `output.ts:32-63` citation) do not affect any
acceptance criterion or executability and can be carried
forward.

Next permitted transition: `codepatrol-apply 2026-07-24-uniform-stage-io`
on `codepatrol/2026-07-24-uniform-stage-io`, gated by the
declared `applyGate` (`npm run verify`).

## External evidence sufficiency

`not required` — the design is internal to the Codepatrol CLI +
skills and reuses existing primitives (`inspectChanges`,
`ChangeView`, `STAGES`, `KNOWN_COMMANDS` via `COMMAND_OPTIONS`,
the `codepatrol-status/SKILL.md` reproduce-verbatim precedent,
the existing `run`/`workspace` CLI test helpers, and the
existing `skills-contract.test.mjs` assertion seam). The only
external claim that motivates this design is the v2 assessment
doc's "no new blocking errors" observation and the recurring
`change.transition` ×13 telemetry (which the v2 doc explicitly
dispositioned as an accepted design cost). Both are
re-confirmed; no new dependency, protocol, or external API is
introduced.

## Residual concerns and evidence gaps

- The plan does not redefine `wiki status`; the wiki is
  correctly recorded as absent in both spec and evidence.
  No wiki refresh is required.
- Per-run provider tokens remain unmeasurable from this harness
  (same constraint recorded in the prior five Changes' Plan and
  Review runs). Apply will record
  `characters: { status: "unavailable", reason: … }` for its
  finished runs, consistent with the established pattern.
- DC-1 (paging for `next`) and DC-2 (verdict phrasing map) are
  correctly deferred with observable triggers and bounded
  upgrade paths. The plan's rejected alternatives (JSON-only
  CLI; skill-prose only; extend `status`; enhance `inspect`)
  are all weaker models and were correctly rejected.
- The new `STAGE-IO.md` shared doc will establish a
  reproduce-verbatim contract for the five lifecycle skills;
  the implementer must keep the per-skill entry/exit lines
  consistent with `STAGE-IO.md` to avoid drift between the
  contract test and the actual wiring.
- The `commands.ts:116-119` line range is approximately correct
  (the inspect text is at `:121`); the implementer will find
  the inspect text via the `Unknown command` / `next:`
  literal in T1 step 4's switch case. Not blocking.
- The new renderers' JSON shape (`{summary, verdict, next}` /
  `{stage, changes, startNew, closeOptions?}`) is a public CLI
  contract and will be locked by `cli.test.ts`. Future Changes
  that extend the shape (e.g., add `cycleMs` to summary) must
  update the contract test in lockstep.
- The skills-contract test's loop assertion is the seam that
  keeps the per-skill wiring in sync with the commands. A
  future Change that adds a new lifecycle stage (e.g., a
  `codepatrol-archive` skill) must extend the loop assertion
  to include it.
- The v2 assessment follow-ups (N1–N4) and F2/F6/F7 remain as
  separate follow-up Changes, correctly out of scope here.
