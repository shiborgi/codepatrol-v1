# Verification — Extract duplicated persona sub-event and divergence predicates into single helpers

- Change: `2026-07-24-persona-subevent-helpers`
- Verified revision: 1
- Verifier: opencode (auditor persona)
- Base ref: `6fb2d8a117f1d07440c72dd9df7a1ce8d0659327` (`main` @ the terminal commit of the prior `2026-07-24-migration-normalizer` Change)
- Head ref: `241af712a4db1165cf538daa74ed2612f375ff11` (Apply `implemented` checkpoint; tree `6877f0c111d11d9212da798bfab45c6a6d9ebc18`)
- Evidence date: 2026-07-24T20:39:20Z

## Scope and instruments

Artifacts read on branch `codepatrol/2026-07-24-persona-subevent-helpers`
(clean working tree, target `main` @ `6fb2d8a`):

- `plan/spec.md`, `plan/plan.md`, `plan/evidence/investigation.md`
- `review/report.md`
- `apply/journal.md`
- `.codepatrol/changes/2026-07-24-persona-subevent-helpers/change.yaml`

Diff range audited: `6fb2d8a..241af71` (2 production paths; 39 / 7
additions / deletions on those paths). Apply candidate commit
`241af71`; recorded tree `6877f0c111d11d9212da798bfab45c6a6d9ebc18`
matches `git rev-parse 241af71^{tree}` exactly. Working tree is clean.

Commands executed in this session:

- `git rev-parse`, `git diff --stat`, `git diff` (per-path)
- `git diff --name-status 6fb2d8a 241af71`
- `codepatrol change inspect --id <id> --workspace $PWD --format json`
- `codepatrol change doctor --id <id> --workspace $PWD --format json` (returned `valid: true`)
- `codepatrol graph sync` (43 ms; 73 files; 1869 symbols; 398 imports / 3780 calls / 134 tests)
- `codepatrol graph impact --since-ref 6fb2d8a --include-ambiguous` (8 seeds, 33 affected files, multiple affected tests)
- `codepatrol wiki status` → `exists: false` (valid substrate)
- `node --test --import jiti/register src/change/orchestrator-parallel.test.ts` (3/3 pass: 1 top-level + 2 describe-nested)
- `node --test --import jiti/register src/change/{orchestrator-parallel,apply-gate,apply-gate-enforcement,change,close-integration,close-push,git,session,improvement-report}.test.{ts,ts,ts,ts,ts,ts,ts,ts,ts}` → 48/48 pass
- `npm run verify` (exit 0; typecheck + 165 tests + build + smoke:cli + lint:skills)
- `grep -n "^function personaSubEvents\|^function isDivergentPersonaEvent\|personaSubEvents(\|isDivergentPersonaEvent(" src/change/orchestrator.ts` to confirm exactly one definition of each helper and three / two call sites respectively
- `grep -n "record.events.filter((event) => (event.type === \"stage-checkpointed\" || event.type === \"stage-returned\")" src/change/orchestrator.ts` to confirm no inline copies remain at the three call sites
- Side-by-side comparison of the two helper bodies against the inline predicates removed from `:215, :226, :228, :281` (the inline copies existed at base `6fb2d8a` and are gone at the candidate)

Environment limits: the harness exposes no authoritative provider
usage hook, so per-run token/character measurement is `unavailable`
for the verify run, the prior review run, the prior apply run, and
the prior plan run. This is the same constraint recorded in the
prior three Changes' journals and is not a verification defect.

## Plan conformance

| Plan task | Forecast | Delivered | Conforms? |
|---|---|---|---|
| T1 — Add `personaSubEvents` + `isDivergentPersonaEvent`, rewrite the three sites, add the reason-aggregation characterization test | modify `src/change/orchestrator.ts` (+2 module-private helpers, 3 inline sites rewritten) and `src/change/orchestrator-parallel.test.ts` (+1 test, +1 import for `parse` from `yaml`) | `orchestrator.ts` +12/-6 (two 4-line helpers added after `assertCloseInput`; site 1 at `:221` uses `personaSubEvents`; site 2 at `:232-234` uses `personaSubEvents` + `isDivergentPersonaEvent`; site 3 at `:287` uses `personaSubEvents` + `isDivergentPersonaEvent` chained); `orchestrator-parallel.test.ts` +27/-1 (1 import addition for `parse` from `yaml`; 1 import re-ordering for `createHash`; 1 new top-level `test(...)` block) | yes |
| T2 — Final verification and reconciliation | `npm run verify` exit 0; no undeclared paths; no DC-N triggers; no wiki refresh | `npm run verify` exit 0 (165 tests, 0 fail); declared production paths match exactly; no DC-N trigger; wiki remains absent | yes |

The plan's T1 step 2 ("Expected: **green against current code** —
this is a characterization test that captures the existing `:281`
behavior") was honored: the new test, when applied to the base
code, would have asserted the existing aggregation behavior; the
refactor preserves that behavior character-for-character. Verified
post-hoc by reading the helper bodies side-by-side with the inline
predicates that existed at base `6fb2d8a` (the inline copies are
gone at the candidate; the helper bodies reproduce them verbatim).

No journaled deviation. The Apply journal claims all 5 ACs pass; this
verify independently re-ran every AC and re-ran the full gate
(see Acceptance re-verification and Wider suite below).

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of the journal |
|---|---|---|---|
| AC-1 (non-persona return aggregates persona reason into `reasons[]`) | `node --test --import jiti/register src/change/orchestrator-parallel.test.ts` — top-level test 2: "a non-persona return aggregates persona sub-event reasons into reasons[]" | pass — drives plan→review begin→persona fix-first return (reason `"security: boundary gap"`)→non-persona return (reason `"consolidated"`), reads the raw `change.yaml`, asserts `consolidatedReturn.reasons` deep-equals `["security: boundary gap"]` | yes |
| AC-2 (existing divergence behavior preserved — `CONSOLIDATION_AFTER_SUBEVENTS` on persona-return + non-persona-approve) | same suite — describe-nested subtest 2: "divergence (one approve + one persona-approved) keeps the attempt active until a return event" | pass — `assert.rejects(... err.code === "CONSOLIDATION_AFTER_SUBEVENTS")` at line 81 of the test file; the refactor preserved the predicate via the new `isDivergentPersonaEvent` helper | yes |
| AC-3 (existing happy path preserved — two persona approves stay active, non-persona approve consolidates to `apply`) | same suite — describe-nested subtest 1: "two parallel reviewer personas both succeed without prematurely advancing the stage" | pass — `assert.equal(viewAfter1.stage, "review")`, `assert.equal(viewAfter1.attempts.review.at(-1)?.status, "active")` at lines 36-37; the same assertions at lines 42-43 for the second persona; `assert.equal(viewAfterConsolidation.stage, "apply")` at line 52; the refactor preserved the guard predicate via the new `personaSubEvents` helper | yes |
| AC-4 (one `personaSubEvents` + one `isDivergentPersonaEvent` definition; no inline copies remain at `:215, 226, 228, 281`) | inspection: `grep -n "^function personaSubEvents\|^function isDivergentPersonaEvent\|personaSubEvents(\|isDivergentPersonaEvent(" src/change/orchestrator.ts` + `grep -n "record.events.filter((event) => (event.type === \"stage-checkpointed\" || event.type === \"stage-returned\")" src/change/orchestrator.ts` | pass — exactly one `function personaSubEvents` definition at `:78`; exactly one `function isDivergentPersonaEvent` definition at `:81`; 3 call sites for `personaSubEvents` (`:221, :232, :287`) and 2 for `isDivergentPersonaEvent` (`:234, :287`); the second `grep` returns no inline copies (the only remaining occurrence of the filter is inside the `personaSubEvents` helper body at line 79) | yes |
| AC-5 (`npm run verify` exit 0) | `npm run verify` | pass — exit 0; `tsc --noEmit` clean; 165 tests, 0 fail, 0 cancelled, 0 skipped; `tsc -p tsconfig.build.json` clean; CLI smoke "Compiled CLI smoke passed (0.1.0)."; `lint:skills` "Skill catalog, frontmatter, dependencies, portability, and relative links are valid." | yes |

Test count went from 164 (at base `6fb2d8a`) to 165 — exactly the
1 new characterization test the spec called for. No existing test
was modified or removed (the only modifications to
`orchestrator-parallel.test.ts` are the addition of `parse` from
`yaml` (line 7), a minor `createHash` import re-ordering (line 8,
functionally equivalent), and the 1 new top-level `test(...)` block
at line 88).

The applyGate (`applyGate` = `npm run verify`, 600 s timeout,
`.codepatrol/config.json`) would have refused the Apply `implemented`
checkpoint if AC-5 had not held at seal time. The Apply commit
`241af71` is recorded with that gate having passed (the journal and
`change inspect` show `result: "implemented"` without an
`APPLY_GATE_FAILED` event). This verify re-ran the same gate on the
exact same candidate commit/tree and observed exit 0.

## Wider suite

The plan's final verification task ("T2 — Final verification and
reconciliation") is the full gate. I re-ran it on the exact Apply
candidate:

- `npm run verify` → exit 0
  - `tsc --noEmit` → clean (the two new helper signatures and the test-file's `parse` import all type-check)
  - `node --test --import jiti/register $(find src .pi scripts -name '*.test.ts' -o -name '*.test.mjs')` → 165 tests, 0 fail
  - `node scripts/clean-dist.mjs && tsc -p tsconfig.build.json` → clean
  - `node scripts/smoke-cli.mjs` → "Compiled CLI smoke passed (0.1.0)."
  - `node scripts/lint-skills.mjs` → "Skill catalog, frontmatter, dependencies, portability, and relative links are valid."

In addition to the 165-test full gate, I re-ran the focused blast
suite explicitly:

- `node --test --import jiti/register src/change/{orchestrator-parallel,apply-gate,apply-gate-enforcement,change,close-integration,close-push,git,improvement-report}.test.ts` and `src/change/session.ts` (compile-and-import test) → 48/48 pass

No warnings of substance. The wiki remains absent (a valid substrate
state per `wiki status`; the spec correctly did not require a wiki
refresh for this Change). `codepatrol graph sync` ran cleanly in
43 ms; 73 files, 1869 symbols (up from 1862 at the prior Plan — the
delta reflects the two new helper functions, the new `parse` import,
the `createHash` import re-ordering, and the new test, not from new
files; the seeds reported `extracted 0, unchanged 73`).

## Blast radius

`codepatrol graph impact --since-ref 6fb2d8a --include-ambiguous`
reports 8 seeds (6 `.codepatrol/changes/...` artifacts + 2 declared
production files) and 33 affected files at depth ≤ 4, with multiple
affected test files. The two direct seeds (the declared production
files) drive the entire blast radius via the existing
`./orchestrator.js` import edges:

- `src/change/orchestrator.ts` (depth 0) — two new module-private
  helpers (`personaSubEvents`, `isDivergentPersonaEvent`) added
  after `assertCloseInput`. No new dependency, no module-level side
  effect, no top-level reordering, no new exports. The three call
  sites at `:215, :226, :228, :281` are rewritten in place with the
  helper names, preserving the surrounding control flow
  character-for-character.
- `src/change/orchestrator-parallel.test.ts` (depth 0) — 1 new
  top-level `test(...)` block at line 88, 1 new import (`parse`
  from `yaml` at line 7), and 1 minor import re-ordering
  (`createHash` moved to line 8; functionally equivalent). The two
  existing `describe`-nested tests are unchanged.

Affected call sites the graph surfaced (and were exercised):

- `src/change/apply-gate.ts`, `src/change/apply-gate-enforcement.test.ts` (depth 1-2): the applyGate is unchanged; its
  tests stay green as part of the 165-test full gate. The
  `apply-gate-enforcement.test.ts` test is included in the 48-test
  blast suite.
- `src/change/change.test.ts`, `src/change/close-integration.test.ts`,
  `src/change/close-push.test.ts`, `src/change/git.test.ts`,
  `src/change/session.ts`, `src/change/improvement-report.test.ts`
  (depth 1-3): all consume `transitionChange` or
  `transitionChangeLocked` indirectly. The two consolidation-related
  `orchestrator-parallel.test.ts` tests are the closest-coupled
  consumers; they pass. The broader `change.test.ts`,
  `close-integration.test.ts`, `close-push.test.ts`, and
  `git.test.ts` suites are exercised by the 165-test full gate and
  all pass.
- `src/cli/commands.ts` (depth 1): the CLI dispatch. Unchanged
  for this Change; it is on the graph path because of the umbrella
  `bin/codepatrol.js` → entry chain. The CLI test suite stays
  green as part of the 165-test full gate.
- `src/graph/*`, `src/shared/*`, `src/wiki/*` (depth 2-4):
  unrelated to record shape or persona logic; surfaced via the
  umbrella chain. All stay green as part of the 165-test full
  gate.

The plan did not list every depth-1 / depth-2 / depth-3 / depth-4
transitive file by name (it listed only the 2 declared seeds and the
test harness). All transitively affected files are exercised by the
existing full gate (165/165 pass), so this is a listing gap, not a
behavioral gap.

## Regressions

Beyond the changed files, the following were re-run explicitly to
guard regressions at surviving interfaces:

| Interface | Re-run command | Result |
|---|---|---|
| `transitionChangeLocked` persona-guard predicate (site 1 at `:221`) | covered by the new test + the two existing tests + the 165-test full gate | no drift (the helper body is character-identical to the inline predicate) |
| `transitionChangeLocked` `CONSOLIDATION_AFTER_SUBEVENTS` divergence check (site 2 at `:232-234`) | covered by the existing `orchestrator-parallel.test.ts` divergence test + the 165-test full gate | no drift (the helper body is character-identical to the inline predicate; the test's `assert.rejects(... err.code === "CONSOLIDATION_AFTER_SUBEVENTS")` passes) |
| `transitionChangeLocked` reason-aggregation onto a non-persona return (site 3 at `:287`) | covered by the new characterization test + the 165-test full gate | no drift (the new test reads the raw `change.yaml` and asserts `reasons: ["security: boundary gap"]`) |
| `eventMatchesIntent`, `assertTransitionIntent`, `assertCloseInput`, `baselineRef`, `ensurePath`, `requireObject`, `exactInput`, `textInput` (the other module-private helpers in `orchestrator.ts`) | covered by the 165-test full gate; no diffs to these helpers | no drift |
| `foldChange` persona short-circuits at `model.ts:102-106, 122-126` (out of scope per the spec) | covered by `change.test.ts` (21 tests pass) | no drift (unchanged) |
| `applyGate` (the gate command for Apply `implemented`) | covered by `apply-gate.test.ts` and `apply-gate-enforcement.test.ts` (in the 48-test blast suite) | no drift (both pass) |
| `tsc` strictness on the two new helper signatures | `tsc --noEmit` (clean) | no drift |
| Build artifacts | `tsc -p tsconfig.build.json` (clean) | no drift |
| Skills / package contract | `lint:skills` (clean) and the 165-test full gate | no drift |

No behavior drift at any surviving interface was observed. The
two consolidation behaviors (happy path + divergence) and the
previously untested reason-aggregation path are all preserved.

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| `.codepatrol/changes/2026-07-24-persona-subevent-helpers/apply/journal.md` | yes (Apply-owned) | accepted |
| `.codepatrol/changes/2026-07-24-persona-subevent-helpers/change.yaml` | yes (auto-managed) | accepted |
| `.codepatrol/changes/2026-07-24-persona-subevent-helpers/plan/{spec,plan,evidence/investigation}.md` | yes (Plan-owned) | accepted |
| `.codepatrol/changes/2026-07-24-persona-subevent-helpers/review/report.md` | yes (Review-owned) | accepted |
| `src/change/orchestrator.ts` | yes (T1) | accepted (+12/-6) |
| `src/change/orchestrator-parallel.test.ts` | yes (T1) | accepted (+27/-1) |

`git diff --name-status 6fb2d8a 241af71 | grep -v "^A\s\+\.codepatrol/" | grep -v "^M\s\+src/change/"` returns nothing: every non-`.codepatrol/`
path is one of the two declared production files. No undeclared
production changes; no undeclared runtime paths; no undeclared
docs/scripts/config.

The minor `createHash` import re-ordering in
`orchestrator-parallel.test.ts` (moved from line 4 to line 8) is
functionally equivalent — the import is still at module top level
and still imports from `node:crypto`. The re-ordering places the
node-stdlib imports adjacent to each other and the new `yaml`
import after the existing `node:test` / `node:assert` /
`node:child_process` / `node:fs` / `node:os` / `node:path` imports.
This is a stylistic improvement, not a behavior change, and is
within the spec's "Expected surface delta" envelope ("modify
`src/change/orchestrator-parallel.test.ts`").

## Findings

No critical, major, or new minor findings. The Review had no
findings.

## Residual risks and evidence gaps

- **DC-1 from the spec** (helpers stay module-private): unchanged.
  Confirmed: the two helpers are not exported (no `export` keyword
  in front of `function`). A future site needing the predicate
  outside `orchestrator.ts` is the observable trigger; the upgrade
  path is to add `export` and focused unit tests. Not blocking.
- **DC-2 from the spec** (divergence keeps its defensive
  checkpoint-result branch): unchanged. The branch is preserved in
  `isDivergentPersonaEvent` exactly as in the inline predicate at
  `:228`. Per `assertTransitionIntent` (`orchestrator.ts:59-62`),
  a checkpoint's result is constrained to the expected stage
  result, so the branch is unreachable for today's persona
  checkpoints. The defensive preservation is the
  behavior-preserving choice. Not blocking.
- **Provider token coverage**: 0/3 measured runs (plan + review
  + apply) before this verify; this verify run adds a 4th
  `unavailable` record. Same harness constraint recorded in the
  prior three Changes' journals. Not blocking.
- **Live environment tests** (e.g. the `node --test` runs of
  `close-push.test.ts`, `apply-gate-enforcement.test.ts`,
  `git.test.ts`, `session.ts`, `improvement-report.test.ts`) all
  pass as part of the 165-test full gate. No edge case beyond
  what the gate covers was probed here.
- The verify run was performed on the exact Apply candidate
  commit (`241af71`) and recorded tree (`6877f0c`); no drift was
  introduced between Apply and Verify.
- The two helper bodies are character-identical to the inline
  predicates that existed at base `6fb2d8a` (same `(event as {
  persona?: string }).persona` and `(event as { result?: string
  }).result` casts, same condition ordering, same short-circuit
  structure). The refactor is provably behavior-preserving for
  every reachable input: (a) the predicate bodies are
  character-identical, (b) the call sites pass the same arguments
  (`record.events`, `intent.stage`, `view.attempt`) and consume
  the same return shape (`ChangeEvent[]` or `boolean`), and (c)
  the three integration tests plus the new characterization test
  exercise all three sites.
- The previously untested reason-aggregation path at
  `orchestrator.ts:281` (now `:287`) is now locked by AC-1,
  closing the documented coverage gap. The test reads the raw
  `change.yaml` and asserts `reasons: ["security: boundary gap"]`,
  which is the right level of indirection for a fold-internal
  field (the `reasons` key is in the `specific` keys list at
  `model.ts:77` but `foldChange` does not project it, so the
  aggregation is observable only on the raw event).

## Verdict

`commit`

The Apply `implemented` candidate is sound: declared production
paths match the Plan exactly, every AC was independently re-executed
on the candidate commit/tree, the full `npm run verify` gate is
green (165 tests, 0 fail; typecheck / build / smoke:cli /
lint:skills all clean), and the surviving interfaces
(`transitionChangeLocked`'s guard predicate, the
`CONSOLIDATION_AFTER_SUBEVENTS` divergence check, the
reason-aggregation path, `eventMatchesIntent`, the `foldChange`
persona short-circuits, `applyGate`, the `tsc` strictness, the
build artifacts) all remain green. The centralization is
behavior-preserving: the two new helper bodies are character-identical
to the inline predicates they replace; the call sites pass the same
arguments and consume the same return shape; the three integration
tests plus the new characterization test exercise all three sites.
The previously untested reason-aggregation path at `:281` is now
locked by AC-1, closing the documented coverage gap. The blast
radius is limited to the two declared files plus their existing
depth-1 to depth-4 transitive call sites, all of which are
exercised by the 165-test full gate. No DC-N trigger activated. No
undeclared production changes. No regressions. The asymmetry the
spec identified (three copies of the persona sub-event filter + two
copies of the divergence predicate whose gap produced a past
critical `CONSOLIDATION_AFTER_SUBEVENTS` defect) is fully resolved
by a single definition of each helper.

Next permitted transition: `codepatrol-close 2026-07-24-persona-subevent-helpers
commit|rollback on codepatrol/2026-07-24-persona-subevent-helpers`. This
verifier is not authorized to invoke Close.
