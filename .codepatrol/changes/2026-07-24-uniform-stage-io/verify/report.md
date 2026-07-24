# Verification — Uniform, harness-independent stage input and output

- Change: `2026-07-24-uniform-stage-io`
- Verified revision: 1
- Verifier: opencode (auditor persona)
- Base ref: `5674289d953cb32b7b178029e10ca78fdb72141a` (`main` @ the terminal commit of the prior `2026-07-24-architecture-assessment-v2` Change)
- Head ref: `fcbf3d451d38f0da73ea950ef639700bdd519e0c` (Apply `implemented` checkpoint; tree `214dcfb42decea2e7906d591976a3f2e556305fd`)
- Evidence date: 2026-07-24T21:49:18Z

## Scope and instruments

Artifacts read on branch `codepatrol/2026-07-24-uniform-stage-io`
(clean working tree, target `main` @ `5674289`):

- `plan/spec.md`, `plan/plan.md`, `plan/evidence/investigation.md`
- `review/report.md`
- `apply/journal.md`
- `.codepatrol/changes/2026-07-24-uniform-stage-io/change.yaml`

Diff range audited: `5674289..fcbf3d4` (11 production paths;
114 / 19 additions / deletions on those paths). Apply candidate
commit `fcbf3d4`; recorded tree
`214dcfb42decea2e7906d591976a3f2e556305fd` matches
`git rev-parse fcbf3d4^{tree}` exactly. Working tree is clean.

Apply declared changes (11 paths):

- `src/cli/args.ts` (+1 option, +2 `COMMAND_OPTIONS` entries, +1
  `ParsedArgs` field)
- `src/cli/commands.ts` (+2 switch cases for `next` and
  `change.summary`)
- `src/cli/output.ts` (+2 renderers, +2 HELP lines)
- `src/cli/cli.test.ts` (+2 test blocks)
- `skills/_shared/STAGE-IO.md` (new; 19 lines)
- 5 `skills/codepatrol-*/SKILL.md` (each gains one entry
  paragraph + one exit paragraph + a `STAGE-IO.md` reference)
- `scripts/skills-contract.test.mjs` (+3 per-skill loop
  assertions + 1 `commit+push` assertion for `close`)

Commands executed in this session:

- `git rev-parse`, `git diff --stat`, `git diff` (per-path)
- `git diff --name-status 5674289 fcbf3d4`
- `codepatrol change inspect --id <id> --workspace $PWD --format json`
- `codepatrol change doctor --id <id> --workspace $PWD --format json` (returned `valid: true`)
- `codepatrol graph sync` (43 ms; 73 files; 1886 symbols; 399 imports / 3846 calls / 135 tests)
- `codepatrol graph impact --since-ref 5674289 --include-ambiguous` (17 seeds, 51 affected files)
- `codepatrol wiki status` → `exists: false` (valid substrate)
- `node --test --import jiti/register src/cli/cli.test.ts` (10/10 pass; 8 existing + 2 new)
- `node --test --import jiti/register scripts/skills-contract.test.mjs` (8/8 pass)
- `npm run verify` (exit 0; typecheck + 167 tests + build + smoke:cli + lint:skills)
- Independent exercise of the new commands in a tmpdir
  (started a Change, then `next --stage plan`,
  `next --stage close`, `next --stage bogus`, `change summary`
  text + JSON)
- `grep -c 'codepatrol next\|codepatrol change summary\|STAGE-IO.md\|commit+push' skills/codepatrol-*/SKILL.md` to confirm
  the contract test's underlying assertions hold by hand

Environment limits: the harness exposes no authoritative provider
usage hook, so per-run token/character measurement is `unavailable`
for the verify run, the prior review run, the prior apply run, and
the prior plan run. This is the same constraint recorded in the
prior five Changes' journals and is not a verification defect.

## Plan conformance

| Plan task | Forecast | Delivered | Conforms? |
|---|---|---|---|
| T1 — CLI commands `next` and `change summary` | modify `src/cli/args.ts` (+1 option, +2 `COMMAND_OPTIONS` entries, +1 `ParsedArgs` field); modify `src/cli/output.ts` (+2 renderers, +2 HELP lines); modify `src/cli/commands.ts` (+2 switch cases); modify `src/cli/cli.test.ts` (+2 test blocks) | `args.ts` +6/-1 (added `stage` to `KNOWN`, `ParsedArgs`, parseArgs return; added `next` and `change.summary` to `COMMAND_OPTIONS`); `output.ts` +24/-0 (added `renderNext` + `renderSummary` + 2 HELP lines; imported `ChangeView`/`Stage` types); `commands.ts` +18/-1 (added `next` and `change.summary` cases; imported `renderNext, renderSummary`); `cli.test.ts` +29/-0 (2 new test blocks) | yes |
| T2 — Wire the lifecycle skills and shared contract | create `skills/_shared/STAGE-IO.md`; modify 5 `skills/codepatrol-*/SKILL.md` (each references both commands and `STAGE-IO.md`; `close` documents `commit+push`); modify `scripts/skills-contract.test.mjs` (loop assertion for each skill + 1 `commit+push` assertion) | `STAGE-IO.md` created (19 lines, documents entry/exit contract); all 5 SKILL.md files reference both commands and `STAGE-IO.md`; `close` references `commit+push`; `skills-contract.test.mjs` +4/-0 (3 per-skill loop assertions + 1 close assertion) | yes |
| T3 — Final verification and reconciliation | `npm run verify` exit 0; only the declared files changed; no DC-N triggers; no wiki refresh | `npm run verify` exit 0 (167 tests, 0 fail); `git diff --name-status` returns only the 11 declared files + `.codepatrol/...` lifecycle artifacts; no DC-N trigger; wiki remains absent | yes |

The plan's T1 step 2 ("Expected red: `next` and `change summary` are
unknown commands … Not a setup failure") was honored. The Apply
journal records the red-then-green cycle: the new tests failed with
parse errors before the implementations, then passed after.

No journaled deviation. The Apply journal claims all 5 ACs pass;
this verify independently re-ran every AC and re-ran the full gate
(see Acceptance re-verification and Wider suite below).

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of the journal |
|---|---|---|---|
| AC-1 (`next --stage <s>` lists non-terminal Changes at stage, text + JSON, work id + state + nextAction) | `node --test --import jiti/register src/cli/cli.test.ts` — test 9: "codepatrol next lists Changes by stage with affordances" + direct repro | pass — test asserts `data.changes[0].workId === id` and `data.startNew === true`; direct repro on a fresh tmpdir returns `{"ok":true,"data":{"stage":"plan","changes":[],"startNew":true}}` (text + JSON) | yes |
| AC-2 (plan start-new affordance; close options; invalid stage → `INVALID_ARGUMENT` exit 2) | same suite + direct repro | pass — `data.startNew === true` for plan; `data.closeOptions` deep-equals `["commit","commit+push","rollback"]` for close; `next --stage bogus` returns `{"ok":false,"error":{"code":"INVALID_ARGUMENT","message":"Unknown stage: bogus"}}` with exit 2 | yes |
| AC-3 (`change summary` three-line `Summary:` / `Verdict:` / `Next:` block, JSON `{summary,verdict,next}`) | same suite — test 10: "codepatrol change summary renders a uniform Summary/Verdict/Next block" + direct repro | pass — test asserts `j.summary && j.verdict && j.next` (JSON shape) and `text.match(/^Summary:/m)`, `text.match(/^Verdict:/m)`, `text.match(/^Next:/m)` (text); direct repro on a fresh Change returns `Summary: <id> — <title>\nVerdict: <stage> attempt <attempt> is <state>\nNext: <nextAction>` and `{"data":{"summary":"<id> - <title>","verdict":"<stage> attempt <attempt> is <state>","next":"<nextAction>"}}` | yes |
| AC-4 (each lifecycle skill reproduces `next` and `change summary`; `close` documents commit+push; `skills-contract.test.mjs` asserts all five) | `node --test --import jiti/register scripts/skills-contract.test.mjs` + `grep -c` on each SKILL.md + `npm run lint:skills` | pass — 8/8 contract tests pass; per-skill `grep` confirms each of 5 skills contains `codepatrol next`, `codepatrol change summary`, and `STAGE-IO.md` (1 each); `close` contains `commit+push` (1 match); `lint:skills` reports "Skill catalog, frontmatter, dependencies, portability, and relative links are valid." | yes |
| AC-5 (`npm run verify` exit 0) | `npm run verify` | pass — exit 0; `tsc --noEmit` clean; 167 tests, 0 fail, 0 cancelled, 0 skipped; `tsc -p tsconfig.build.json` clean; CLI smoke "Compiled CLI smoke passed (0.1.0)."; `lint:skills` "Skill catalog, frontmatter, dependencies, portability, and relative links are valid." | yes |

Test count went from 165 (at base `5674289`) to 167 — exactly the
2 new CLI tests the spec called for. The skills-contract test
count is unchanged at 8 (the new assertions are looped over the
existing 5 lifecycle skills; no new top-level test was added, so
the total test count is unchanged there).

The applyGate (`applyGate` = `npm run verify`, 600 s timeout,
`.codepatrol/config.json`) would have refused the Apply `implemented`
checkpoint if AC-5 had not held at seal time. The Apply commit
`fcbf3d4` is recorded with that gate having passed (the journal
and `change inspect` show `result: "implemented"` without an
`APPLY_GATE_FAILED` event). This verify re-ran the same gate on
the exact same candidate commit/tree and observed exit 0.

## Wider suite

The plan's final verification task ("T3 — Final verification and
reconciliation") is the full gate. I re-ran it on the exact Apply
candidate:

- `npm run verify` → exit 0
  - `tsc --noEmit` → clean (the new `ParsedArgs.stage` field, the new
    `renderNext`/`renderSummary` exports, the two new switch
    cases, and the test-file's two new `test(...)` blocks all
    type-check)
  - `node --test --import jiti/register $(find src .pi scripts -name '*.test.ts' -o -name '*.test.mjs')` → 167 tests, 0 fail
  - `node scripts/clean-dist.mjs && tsc -p tsconfig.build.json` → clean
  - `node scripts/smoke-cli.mjs` → "Compiled CLI smoke passed (0.1.0)."
  - `node scripts/lint-skills.mjs` → "Skill catalog, frontmatter, dependencies, portability, and relative links are valid."

In addition to the 167-test full gate, I re-ran the focused blast
suite explicitly:

- `node --test --import jiti/register src/cli/cli.test.ts` → 10/10 pass
- `node --test --import jiti/register scripts/skills-contract.test.mjs` → 8/8 pass
- `node --test --import jiti/register scripts/package-contract.test.mjs scripts/skills-contract.test.mjs` → 20/20 pass (combined focused suite)

No warnings of substance. The wiki remains absent (a valid substrate
state per `wiki status`; the spec correctly did not require a wiki
refresh for this Change). `codepatrol graph sync` ran cleanly in
43 ms; 73 files, 1886 symbols (up from 1869 at the prior Verify —
the delta reflects the two new renderers, the two new switch
cases, the new option, the new test blocks, the new shared doc,
and the per-skill wiring).

## Blast radius

`codepatrol graph impact --since-ref 5674289 --include-ambiguous`
reports 17 seeds (6 `.codepatrol/changes/...` artifacts + 11
declared production files: 4 `src/cli/*` + 5 `skills/codepatrol-*/SKILL.md`
+ 1 `skills/_shared/STAGE-IO.md` + 1 `scripts/skills-contract.test.mjs`)
and 51 affected files at depth ≤ 4. The four direct seeds
(`src/cli/{args,commands,output,cli.test}.ts`) drive the bulk of
the blast radius via the existing `./cli/*` import edges; the
five SKILL.md files drive the rest via the umbrella
`bin/codepatrol.js` → entry chain and the skills-contract test
seam.

Affected call sites the graph surfaced (and were exercised):

- `src/cli/main.ts` (depth 1): the CLI entry. The new `next` and
  `change.summary` cases route through the existing
  `executeCommand` switch; the entry's `JSON.stringify(errorEnvelope(...))`
  path renders the new `INVALID_ARGUMENT` errors identically to
  the existing pattern. `src/cli/main.test.ts` exercises this
  path (in the 167-test full gate).
- `src/change/orchestrator.ts` (depth 1): the orchestrator.
  `inspectChanges` is called by the new `next` and `change.summary`
  cases; no orchestrator change. The new cases reuse the same
  signature as `change.inspect`. The full gate exercises every
  orchestrator path that depends on `inspectChanges`.
- `src/change/board.ts` (depth 1): the Kanban. The `next` case
  does not use `projectKanban` (it uses `inspectChanges` directly
  per the spec); the new `renderNext` function does not depend
  on the Kanban. No drift.
- `src/graph/render.ts` (depth 1): the `formatTable` helper used
  by `renderNext`. The new renderer's table format is consistent
  with the existing presentation layer precedent; no behavior
  change to the underlying `formatTable`.
- `scripts/install-lib.mjs`, `scripts/lint-skills.mjs`,
  `scripts/smoke-cli.mjs`, `scripts/package-contract.test.mjs`
  (depth 1): unrelated to the new commands; surfaced via the
  umbrella chain. All stay green as part of the 167-test full
  gate.
- All depth-2 / depth-3 / depth-4 transitive files: unrelated
  to the new commands; surfaced via the umbrella chain. All
  stay green as part of the 167-test full gate.

The plan did not list every depth-1 / depth-2 / depth-3 / depth-4
transitive file by name (it listed only the 11 declared seeds).
All transitively affected files are exercised by the existing
full gate (167/167 pass), so this is a listing gap, not a
behavioral gap.

## Regressions

Beyond the changed files, the following were re-run explicitly to
guard regressions at surviving interfaces:

| Interface | Re-run command | Result |
|---|---|---|
| `parseArgs` (consumes `COMMAND_OPTIONS`) | `src/cli/main.test.ts` (10 tests pass) | no drift — the new `next` and `change.summary` entries extend the map without changing existing entries |
| `codepatrol status` text + JSON | `src/cli/cli.test.ts` test 2 ("CLI exposes only explicit Change lifecycle commands and deterministic status") | no drift — `status` switch case unchanged |
| `change inspect` text + JSON | `src/cli/cli.test.ts` test 1 (graph) + test 2 (status) | no drift — `change.inspect` switch case unchanged |
| `change.transition` invocation path | the prior 165 tests stay green | no drift — orchestrator + transition code unchanged |
| `applyGate` (the gate command for Apply `implemented`) | covered by `apply-gate.test.ts` and `apply-gate-enforcement.test.ts` (in the 167-test full gate) | no drift |
| `tsc` strictness on the new `ParsedArgs.stage` field, the two new exports, and the two new switch cases | `tsc --noEmit` (clean) | no drift |
| Build artifacts | `tsc -p tsconfig.build.json` (clean) | no drift |
| Skills contract (each lifecycle skill references both commands) | `scripts/skills-contract.test.mjs` (8/8 pass) | no drift — the per-skill loop adds 3 assertions and the close assertion adds 1 |
| Skills lint (catalog, frontmatter, dependencies, portability, relative links) | `node scripts/lint-skills.mjs` ("Skill catalog, frontmatter, dependencies, portability, and relative links are valid.") | no drift |
| Package contract | `scripts/package-contract.test.mjs` (12/12 pass, in the 167-test full gate) | no drift |

No behavior drift at any surviving interface was observed. The
`next` and `change.summary` commands are pure additions; the
existing `change.inspect` / `change.transition` / `change.session`
/ `change.doctor` / `change.close` / `change.start` commands are
unchanged. The lifecycle / orchestrator / Git / persona layers
are unchanged.

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| `.codepatrol/changes/2026-07-24-uniform-stage-io/apply/journal.md` | yes (Apply-owned) | accepted |
| `.codepatrol/changes/2026-07-24-uniform-stage-io/change.yaml` | yes (auto-managed) | accepted |
| `.codepatrol/changes/2026-07-24-uniform-stage-io/plan/{spec,plan,evidence/investigation}.md` | yes (Plan-owned) | accepted |
| `.codepatrol/changes/2026-07-24-uniform-stage-io/review/report.md` | yes (Review-owned) | accepted |
| `src/cli/args.ts` | yes (T1) | accepted (+6/-1) |
| `src/cli/commands.ts` | yes (T1) | accepted (+18/-1) |
| `src/cli/output.ts` | yes (T1) | accepted (+24/-0) |
| `src/cli/cli.test.ts` | yes (T1) | accepted (+29/-0) |
| `skills/_shared/STAGE-IO.md` | yes (T2) | accepted (+19/-0, new file) |
| `skills/codepatrol-plan/SKILL.md` | yes (T2) | accepted (+6/-2) |
| `skills/codepatrol-review/SKILL.md` | yes (T2) | accepted (+7/-4) |
| `skills/codepatrol-apply/SKILL.md` | yes (T2) | accepted (+7/-4) |
| `skills/codepatrol-verify/SKILL.md` | yes (T2) | accepted (+6/-3) |
| `skills/codepatrol-close/SKILL.md` | yes (T2) | accepted (+7/-4) |
| `scripts/skills-contract.test.mjs` | yes (T2) | accepted (+4/-0) |

`git diff --name-status 5674289 fcbf3d4 | grep -v "^A\s\+\.codepatrol/" | grep -v "^M\s\+\(src/cli/\|skills/\|scripts/\)"` returns nothing: every non-`.codepatrol/`
path is one of the 11 declared production files. No undeclared
production changes; no undeclared runtime paths; no undeclared
docs/scripts/config.

The Review's two minor carry-forward notes were both correctly
resolved by the implementer: the `commands.ts:116-119` line range
is approximately correct (the inspect text is at `:121`); the
`output.ts:32-63` citation encompasses the `HELP` start (line 33).

The `renderNext` text format uses `formatTable` from
`../graph/render.js` rather than the spec's proposed simple
bullet list (`- <work-id> — <state> — next: <nextAction>`). The
exact text format isn't a hard contract — the spec describes the
format at a high level ("Changes at <stage>:" + footer) and the
test asserts the work id appears in the text, not the exact
format. The `formatTable` choice is consistent with the file's
presentation-layer precedent (`renderOverview`, `renderImpact`)
and produces a deterministic, machine-readable output. The
spec's JSON shape (`{stage, changes, startNew, closeOptions?}`)
is preserved exactly. The footer ("To start a new change: ..."
for plan, "Close options: ..." for close) is preserved. This is
an implementation detail within the spec's flexibility, not a
deviation.

## Findings

No critical, major, or new minor findings. The Review had no
findings.

## Residual risks and evidence gaps

- **DC-1 from the spec** (paging for `next`): unchanged. The
  new `next` is unsorted beyond `created_at`; a workspace with
  >20 active Changes could make the list long. The upgrade path
  is documented in the spec (add paging/filtering to `next`).
  Not blocking.
- **DC-2 from the spec** (verdict phrasing map): unchanged. The
  new `change summary` verdict is the raw `<stage> attempt
  <attempt> is <state>` token; a localized or richer verdict
  phrasing may be wanted. The upgrade path is documented in the
  spec (map tokens to phrases in `renderSummary`). Not blocking.
- **Provider token coverage**: 0/3 measured runs (plan + review
  + apply) before this verify; this verify run adds a 4th
  `unavailable` record. Same harness constraint recorded in the
  prior five Changes' journals. Not blocking.
- **Live environment tests**: the 167-test full gate is
  unchanged in count for the broader test suite; the +2 delta
  from 165 → 167 is exactly the 2 new `cli.test.ts` tests. The
  skills-contract test count is unchanged at 8 (the new
  assertions are looped over the existing 5 lifecycle skills).
- The verify run was performed on the exact Apply candidate
  commit (`fcbf3d4`) and recorded tree (`214dcfb4`); no drift
  was introduced between Apply and Verify.
- The deterministic-CLI / skill-reproduces-verbatim pattern is
  the right architectural model and matches the existing
  `codepatrol-status` precedent. The new `next` and
  `change.summary` commands extend the same model to every
  lifecycle stage. The `KNOWN_COMMANDS` derivation from
  `COMMAND_OPTIONS` automatically includes the new commands
  (the prior `cli-input-ergonomics` invariant holds).
- The `commit+push` close option is documented in the close
  skill (`commit, commit+push, or rollback`) and surfaced in
  the `next --stage close` output (`closeOptions: ["commit",
  "commit+push", "rollback"]`). The `push: true` path is
  unchanged; the list only surfaces what already exists.
- The `renderNext` text format is implementation-flexible
  (`formatTable` vs. simple bullet list) but the JSON shape
  matches the spec exactly. The `renderSummary` text format
  matches the spec exactly ("Summary: <id> — <title>\nVerdict:
  <stage> attempt <attempt> is <state>\nNext: <nextAction>").
- The new shared `STAGE-IO.md` (19 lines) documents the
  reproduce-verbatim contract for all five lifecycle skills.
  The per-skill SKILL.md files reference it via a relative
  link, matching the existing `SESSION.md` / `CHANGE.md`
  pattern. Future lifecycle skills must follow the same
  pattern.
- The plan does not redefine `wiki status`; the wiki is
  correctly recorded as absent. No wiki refresh is required.
- Per-run provider tokens remain unmeasurable from this harness
  (same constraint recorded in the prior five Changes' Plan
  and Review runs). The verify run records
  `characters: { status: "unavailable", reason: … }` for its
  finished run, consistent with the established pattern.
- The `applyGate` machine-enforcement is verified: the Apply
  `implemented` checkpoint is recorded with `result:
  "implemented"` (not `APPLY_GATE_FAILED`), and the verify run
  re-ran the same gate on the same candidate and observed exit
  0. No defense-in-depth gap.
- The v2 assessment follow-ups (N1–N4) and F2/F6/F7 remain as
  separate follow-up Changes, correctly out of scope here.

## Verdict

`commit`

The Apply `implemented` candidate is sound: declared production
paths match the Plan exactly, every AC was independently re-executed
on the candidate commit/tree, the full `npm run verify` gate is
green (167 tests, 0 fail; typecheck / build / smoke:cli /
lint:skills all clean), and the surviving interfaces (the
existing `change.*` commands, `status`, `parseArgs`, the
orchestrator, `applyGate`, the skills catalog, the build
artifacts) all remain green. The two new deterministic CLI
commands (`next` with stage filter and stage-specific affordances;
`change summary` with the three-line `Summary:` / `Verdict:` /
`Next:` block and JSON shape) are correctly wired into all five
lifecycle skills via the new shared `STAGE-IO.md` contract,
locked by the skills-contract test. The blast radius is bounded
to the 11 declared files plus their existing depth-1 to depth-4
transitive call sites, all of which are exercised by the 167-test
full gate. No DC-N trigger activated. No undeclared production
changes. No regressions. The `commit+push` close option is
documented in the close skill and surfaced in the `next --stage
close` output without any orchestrator change. The
`KNOWN_COMMANDS` derivation automatically includes the new
commands. The deterministic-CLI / skill-reproduces-verbatim
pattern is consistent with the existing `codepatrol-status`
precedent.

Next permitted transition: `codepatrol-close 2026-07-24-uniform-stage-io
commit|rollback on codepatrol/2026-07-24-uniform-stage-io`. This
verifier is not authorized to invoke Close.
