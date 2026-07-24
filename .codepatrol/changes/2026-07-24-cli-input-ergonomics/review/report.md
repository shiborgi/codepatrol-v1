# Review — CLI input ergonomics: actionable errors for inline JSON and unknown commands

- Change: `2026-07-24-cli-input-ergonomics`
- Incoming revision: 1
- Reviewed revision: 1
- Reviewer: opencode (gatekeeper persona)
- Evidence date: 2026-07-24T18:31:44Z

## Scope and evidence

Files inspected on branch `codepatrol/2026-07-24-cli-input-ergonomics`
(checkout `05b5242` plan checkpoint, head `45ed8bf` stage transition;
clean working tree, target `main` @ `5ed4822` — itself the terminal
commit of the prior `2026-07-24-architecture-assessment` Change):

- `.codepatrol/changes/2026-07-24-cli-input-ergonomics/plan/spec.md`
- `.codepatrol/changes/2026-07-24-cli-input-ergonomics/plan/plan.md`
- `.codepatrol/changes/2026-07-24-cli-input-ergonomics/plan/evidence/investigation.md`
- `src/cli/commands.ts:45-49, 153-154` (`readJsonInput`, `default:`)
- `src/cli/args.ts:30-54, 95` (`COMMAND_OPTIONS`, command parsing)
- `src/change/types.ts:45-51` (`TransitionIntent`)
- `src/shared/workspace.ts:26-57` (`resolveInside`)
- `src/cli/output.ts:36-57` (`HELP`)
- `src/cli/main.ts:72-81` (error rendering)
- `src/cli/cli.test.ts:1-30, 160` (helpers and full file length)

External artifacts re-checked:

- `docs/codepatrol/improvement-reports/2026-07-24-architecture-assessment.md:21,40-41`
  — `INVALID_ARGUMENT` ×6, sample `Unknown command: change.begin`;
  `change.transition` invoked 20 times. Numbers match the spec's
  Current evidence.
- `docs/codepatrol/improvement-reports/2026-07-24-aggregate-and-push.md:25`
  — `INVALID_ARGUMENT` ×10 `Session input is not valid JSON` (corroborates
  the input-format class).
- `codepatrol wiki status` → `exists: false` (valid absent substrate).
- `.codepatrol/config.json` → `applyGate` = `npm run verify`, 600 s timeout.

Limitations: did not execute `npm run verify` (Review never re-runs the
full gate; that is Apply's job per AGENTS.md). Did not execute the
existing CLI suite end-to-end (it was green at the prior Verify at
`5ed4822` per the spec's Current evidence; Apply will re-run it).

## Findings

### minor — plan

**Issue:** Spec and plan cite `src/cli/commands.ts:145-146` for the
`default:` case that throws `Unknown command: …`, but at base `5ed4822`
the `default:` lives at lines 153-154 (the `change.close` switch arm
was added in a prior Change and shifted the trailing case by eight
lines). The error message text and behavior at the cited lines match
the plan; only the line number drifted.

**Impact:** None on acceptance criteria. An independent implementer will
locate the `default:` case via the `Unknown command` literal in T1
step 4.

**Disposition:** carry-forward note; non-blocking.

### minor — evidence

**Issue:** Spec's `Current evidence` for `src/cli/output.ts:38-57` says
"no help change needed" because the `HELP` string already documents
`--input <file|->`. Confirmed: the existing `HELP` (output.ts:36-57)
lists `--input <file|->` for every change command that takes input.
The new inline-JSON error message will reference the same `--input -`
form, so help and error stay aligned.

**Impact:** None. Cited prose is correct.

No critical or major findings survive validation. All other cited
`file:line` references were re-verified against the working tree:

- `src/cli/commands.ts:45-49` — `readJsonInput` ✓
- `src/cli/args.ts:36-54` — `COMMAND_OPTIONS` table ✓
- `src/cli/args.ts:95` — `command = positionals.slice(0,2).join(".")` ✓
- `src/change/types.ts:46-51` — `TransitionIntent` types
  `begin|usage|checkpoint|return|block|resume` ✓
- `src/shared/workspace.ts:28-55` — `resolveInside` body that throws
  `INVALID_WORKSPACE` (exit 3) for absolute / non-existent / symlink-
  escaping / out-of-workspace paths ✓
- `src/cli/main.ts:72-81` — error envelope and exit-code propagation
  (`error.exitCode` returned, `INVALID_ARGUMENT` → exit 2) ✓
- `scripts/skills-contract.test.mjs:30` — not in this Change's diff
  (no skills touch); not re-checked.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `plan/plan.md` | none (carry-forward note only) | minor `commands.ts:145-146` line drift for the `default:` case; non-blocking | none |
| `plan/spec.md` | none | All citations verified; safety floor confirmed; rung correct | none |
| `plan/evidence/investigation.md` | none | Telemetry numbers match durable report | none |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 (inline JSON → exit 2, `INVALID_ARGUMENT`, message names `--input -`) | yes | T1 | yes — `node --test --import jiti/register src/cli/cli.test.ts` with `run(["change","transition","--input","{\"type\":\"begin\"}"])`; asserts `status===2`, `error.code==="INVALID_ARGUMENT"`, message matches `/--input -/` | covered |
| AC-2 (`change begin` → exit 2, message names `change transition`) | yes | T1 | yes — same suite; `run(["change","begin"])`; asserts `/change transition/` in message | covered |
| AC-3 (unknown command → exit 2, message lists known commands) | yes | T1 | yes — same suite; `run(["frobnicate"])`; asserts message matches `/change start\|graph sync/` (or any other known command token) | covered |
| AC-4 (no regression in `--input -` and file-path inputs) | yes | T1 | yes — existing `cli.test.ts` tests at lines 22-160 stay green; the plan explicitly asserts this in T1 step 5 | covered |
| AC-5 (`npm run verify` exit 0 on candidate) | yes | T2 | yes — applyGate machine-enforces at implemented checkpoint | covered |

## Simplicity axis

- **Selected rung:** direct local change at the CLI input seam — confirmed.
  The Plan reuses `COMMAND_OPTIONS` (the parse-time source of valid
  commands in `args.ts:36-54`) to derive the new `KNOWN_COMMANDS` export
  so the suggestion list cannot drift. The inline-JSON guard is one
  `if` in `readJsonInput`; the suggestion is one `default`-case
  enrichment.
- **Safety floor:** the `--input <file|->` contract, `resolveInside`
  path-safety, all successful invocations, and exit-code semantics
  (usage errors remain `INVALID_ARGUMENT`, exit 2) are preserved. The
  new error messages change content only; exit codes and the
  `INVALID_ARGUMENT` code are unchanged. `resolveInside` is untouched
  (intentionally — the spec explicitly rejects moving JSON detection
  into the path validator).
- **Surface delta:** `src/cli/commands.ts` (one guard in
  `readJsonInput`; enriched `default:` case), `src/cli/args.ts` (+1
  exported constant), `src/cli/cli.test.ts` (3 new test blocks). No
  new files, no new dependencies, no new config, no new event-schema
  entries, no lifecycle / persona / checkpoint changes.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| reuse | `KNOWN_COMMANDS` derived from `COMMAND_OPTIONS.keys()` | Single source of truth for valid commands; cannot drift | none — keeps the suggestion list honest as new commands are added | required (already in plan) |
| reuse | `transition-types` literal in `default:` | The plan hard-codes `["begin","usage","checkpoint","return","block","resume"]` in step 4; same set as `TransitionIntent` union in `types.ts:46-51` | none — `TransitionIntent` is the parse-time schema, not a runtime export; importing it just to enumerate the strings would couple `cli` to the orchestrator | required as written; could be exported as `TRANSITION_TYPES` in a future Change if reused |
| speculative | none observed | — | — | already sufficient |
| built-in | `input.trimStart()` regex `{`/`[` | standard library, no new dep | none | already sufficient |
| simplify | Telemetry-derived scope | F2, F3, F4, F6, F7 from the prior assessment are recorded as separate follow-up work-ids; this Change attacks only F5 | keeps this Change bounded; preserves the assessment doc's plan | already sufficient |

## Executability audit

- **Paths:** all declared paths exist. `src/cli/commands.ts`,
  `src/cli/args.ts`, `src/cli/cli.test.ts` are present at the base
  commit. No new files are created.
- **Interfaces:** the new export is `KNOWN_COMMANDS: string[]` —
  net-additive; no existing signature changes. `readJsonInput` gains
  one guard; `default:` gains a more informative message; both
  preserve the `INVALID_ARGUMENT` code and exit 2.
- **Dependencies:** no new packages, no config keys, no event-schema
  additions, no lifecycle / persona state-machine changes.
- **Commands:** the verification commands in the plan
  (`node --test --import jiti/register src/cli/cli.test.ts`,
  `npm run typecheck`, `npm run verify`) match the scripts registered
  in `package.json`. T1 step 6 also runs `npm run typecheck` — that
  guards against the new constant being mistyped.
- **Expected red:** T1 red is the current `INVALID_WORKSPACE` from
  `resolveInside` for inline-JSON input (AC-1), a bare
  `Unknown command: change.begin` (AC-2), and a bare
  `Unknown command: frobnicate` (AC-3). None of these are setup /
  syntax failures.
- **Expected green:** T1 green when the inline-JSON guard and the
  enriched `default:` case are added; the existing stdin and
  file-path input tests (T1 step 5 explicitly asserts this) stay
  green. T2 green when `npm run verify` exits 0 (applyGate enforces).
- **Rollback:** revert the branch — no migration, no on-disk schema
  change.
- **Context independence:** the Review verdict is grounded entirely
  in the durable plan artifacts, the cited source files, and the
  existing improvement report. No chat history is required.

## Verdict

`approve`

The Plan is decision-complete, evidence-backed, and tightly bounded.
All seven cited `file:line` references for production code (one with a
minor line drift that does not affect the message text or behavior)
were re-verified. The two actionable error classes — inline-JSON
`--input` and unknown `change.<transition-type>` — map to red-capable
tests; the unknown-command case for non-transition types is covered
separately. `KNOWN_COMMANDS` is derived from the existing
`COMMAND_OPTIONS` so the suggestion list cannot drift. The safety
floor (`--input <file|->` contract, `resolveInside` path-safety, exit
codes, `INVALID_ARGUMENT` code) is preserved. Findings F2, F3, F4,
F6, and F7 from the prior assessment remain as separate follow-up
Changes, as the prior assessment doc records; this Change attacks only
F5 as the maintainer chose.

Next permitted transition: `codepatrol-apply 2026-07-24-cli-input-ergonomics`
on `codepatrol/2026-07-24-cli-input-ergonomics`, gated by the
declared `applyGate` (`npm run verify`).

## External evidence sufficiency

`not required` — the design is internal to the Codepatrol CLI seam and
reuses existing primitives (`readJsonInput`, `executeCommand` switch,
`COMMAND_OPTIONS`, `CodepatrolError("INVALID_ARGUMENT", …, 2)`). The
only external claim that motivates this design is the latest
improvement report's `INVALID_ARGUMENT` ×6 top-error entry; that
report was re-read and the numbers match the spec's Current evidence
exactly. No new dependency, protocol, or external API is introduced.

## Residual concerns and evidence gaps

- The minor `commands.ts:145-146` line drift in the spec is a
  documentation nit, not a defect; the `default:` case's `Unknown
  command: ${args.command || "(none)"}` literal is unique in the file
  and an independent implementer will find it in one Grep. Recommend
  updating the spec line number in a future plan revision.
- The Plan does not redefine `wiki status`; the wiki is correctly
  recorded as absent in both spec and evidence. No wiki refresh is
  required.
- Per-run provider tokens remain unmeasurable from this harness (same
  constraint recorded in the prior Change's Plan run). Apply will
  record `characters: { status: "unavailable", reason: … }` for its
  finished runs, consistent with the established pattern.
- DC-1 (a file path literally starting with `{` or `[` is misread as
  inline JSON) is a real but pathological case; the spec's upgrade
  path (an `existsSync` fallback) is correct and the risk is
  acknowledged in the spec. No change to the verdict.
- T1 step 4's hard-coded `["begin","usage","checkpoint","return","block","resume"]`
  literal duplicates the `TransitionIntent` union in `types.ts:46-51`.
  Coupling `cli` to the orchestrator for a one-time literal would be
  worse than the duplication; if the list is reused by another
  command, a future Change can export `TRANSITION_TYPES` from
  `types.ts`. Noted, not blocking.
