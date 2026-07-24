# Verification — CLI input ergonomics: actionable errors for inline JSON and unknown commands

- Change: `2026-07-24-cli-input-ergonomics`
- Verified revision: 1
- Verifier: opencode (auditor persona)
- Base ref: `5ed48226999d1a3d116fade28bee0652732a4db4` (`main` @ the terminal commit of the prior `2026-07-24-architecture-assessment` Change)
- Head ref: `2b666bbb2dab7a40f6d613f762cb91ad05cac90d` (Apply `implemented` checkpoint; tree `5411550c5d28f9cfde734c50b082071494e73bba`)
- Evidence date: 2026-07-24T18:53:05Z

## Scope and instruments

Artifacts read on branch `codepatrol/2026-07-24-cli-input-ergonomics`
(clean working tree, target `main` @ `5ed4822`):

- `plan/spec.md`, `plan/plan.md`, `plan/evidence/investigation.md`
- `review/report.md`
- `apply/journal.md`
- `.codepatrol/changes/2026-07-24-cli-input-ergonomics/change.yaml`

Diff range audited: `5ed4822..2b666bbb` (3 production paths; 47 / 3
additions / deletions on those paths). Apply candidate commit
`2b666bbb`; recorded tree `5411550c5d28f9cfde734c50b082071494e73bba`
matches `git rev-parse 2b666bbb^{tree}` exactly. Working tree is clean.

Commands executed in this session:

- `git rev-parse`, `git diff --stat`, `git diff` (per-path)
- `git diff --name-status 5ed4822 2b666bbb`
- `codepatrol change inspect --id <id> --workspace $PWD --format json`
- `codepatrol change doctor --id <id> --workspace $PWD --format json`
- `codepatrol graph sync` (43 ms; 73 files; 1850 symbols; 397 imports / 3735 calls / 133 tests)
- `codepatrol graph impact --since-ref 5ed4822 --include-ambiguous`
- `codepatrol wiki status --format json` → `exists: false` (valid substrate)
- `node --test --import jiti/register src/cli/cli.test.ts` (8/8 pass)
- `node --test --import jiti/register src/cli/cli.test.ts src/cli/main.test.ts` (10/10 pass)
- `node --test --import jiti/register scripts/skills-contract.test.mjs scripts/package-contract.test.mjs` (12/12 pass)
- `npm run verify` (exit 0; typecheck + 160 tests + build + smoke:cli + lint:skills)
- Direct CLI repro: `node --import jiti/register src/cli/main.ts <args> --workspace /tmp/cp-verify --format=json` for AC-1, AC-2, AC-3, AC-4a (cleaned `/tmp/cp-verify` afterwards)

Environment limits: the harness exposes no authoritative provider
usage hook, so per-run token/character measurement is `unavailable`
for the verify run, the prior review run, and the prior plan run.
This is the same constraint recorded in both prior Changes' journals
and is not a verification defect.

## Plan conformance

| Plan task | Forecast | Delivered | Conforms? |
|---|---|---|---|
| T1 — Inline-JSON guard and unknown-command suggestion | modify `src/cli/args.ts` (+1 export), `src/cli/commands.ts` (one guard + enriched `default:`), `src/cli/cli.test.ts` (3 new tests) | `args.ts` +2 / -0 (`KNOWN_COMMANDS`); `commands.ts` +12 / -3 (import + guard + enriched `default:`); `cli.test.ts` +33 / -0 (3 new `test(...)` blocks) | yes |
| T2 — Final verification and reconciliation | `npm run verify` exit 0; no undeclared paths; no DC-N triggers; no wiki refresh | `npm run verify` exit 0; declared production paths match exactly; no DC-N trigger; wiki remains absent | yes |

No journaled deviation. The Apply journal claims all 5 ACs pass; this
verify independently re-ran every AC and re-ran the full gate
(see Acceptance re-verification and Wider suite below).

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of the journal |
|---|---|---|---|
| AC-1 (inline JSON → exit 2, `INVALID_ARGUMENT`, message names `--input -`) | `node --test --import jiti/register src/cli/cli.test.ts` (test "CLI rejects inline JSON passed to --input with an actionable error") AND direct repro: `change transition --id 2026-07-22-x --input '{"type":"begin"}' --workspace /tmp/cp-verify --format=json` | pass — test green; direct repro returned `{"ok":false,"command":"change.transition","error":{"code":"INVALID_ARGUMENT","message":"Transition input looks like inline JSON, not a file path. Pipe it via stdin with \`--input -\` (for example: echo '<json>' | codepatrol … --input -) or write it to a workspace-relative file.","retryable":false}}`, exit 2 | yes |
| AC-2 (`change begin` → exit 2, message names `change transition`) | `cli.test.ts` (test "CLI suggests change transition for an unknown change.<transition-type> command") AND direct repro: `change begin --workspace /tmp/cp-verify --format=json` | pass — test green; direct repro returned `... "Unknown command: change.begin. Did you mean \`change transition --id <work-id> --input -\` with type \"begin\"?" ...`, exit 2 | yes |
| AC-3 (unknown command → exit 2, message lists known commands) | `cli.test.ts` (test "CLI lists known commands for an unknown command") AND direct repro: `frobnicate --workspace /tmp/cp-verify --format=json` | pass — test green; direct repro returned `... "Unknown command: frobnicate. Known commands: status, graph sync, graph overview, graph outline, graph find, graph neighbors, graph impact, wiki status, wiki validate, wiki generate, wiki record, change start, change inspect, change transition, change session, change doctor, change close." ...`, exit 2 | yes |
| AC-4 (no regression in `--input -` and file-path inputs) | `cli.test.ts` (5 existing tests at lines 22, 31, 43, 51, 63 stay green) AND direct repro: `change start --id 2026-07-24-verify-test --input -` from a clean worktree | pass — 5 existing tests green; direct repro returned `{"ok":true,...,"command":"change.start"}` with exit 0; AC-4b (file-path input) is exercised by the existing `cli.test.ts` tests which use `workspace()` / `writeFileSync(join(root, "input.json"), ...)` paths | yes |
| AC-5 (`npm run verify` exit 0) | `npm run verify` | pass — exit 0; `tsc --noEmit` clean; 160 tests, 0 fail, 0 cancelled, 0 skipped; `tsc -p tsconfig.build.json` clean; CLI smoke "Compiled CLI smoke passed (0.1.0)."; `lint:skills` "Skill catalog, frontmatter, dependencies, portability, and relative links are valid." | yes |

The applyGate (`applyGate` = `npm run verify`, 600 s timeout,
`.codepatrol/config.json`) would have refused the Apply `implemented`
checkpoint if AC-5 had not held at seal time. The Apply commit
`2b666bbb` is recorded with that gate having passed (the journal and
`change inspect` show `result: "implemented"` without an
`APPLY_GATE_FAILED` event). This verify re-ran the same gate on the
exact same candidate commit/tree and observed exit 0.

## Wider suite

The plan's final verification task ("T2 — Final verification and
reconciliation") is the full gate. I re-ran it on the exact Apply
candidate:

- `npm run verify` → exit 0
  - `tsc --noEmit` → clean
  - `node --test --import jiti/register $(find src .pi scripts -name '*.test.ts' -o -name '*.test.mjs')` → 160 tests, 9 suites, 0 fail
  - `node scripts/clean-dist.mjs && tsc -p tsconfig.build.json` → clean
  - `node scripts/smoke-cli.mjs` → "Compiled CLI smoke passed (0.1.0)."
  - `node scripts/lint-skills.mjs` → "Skill catalog, frontmatter, dependencies, portability, and relative links are valid."

No warnings of substance. The wiki remains absent (a valid substrate
state per `wiki status`; the spec correctly did not require a wiki
refresh for this Change). `codepatrol graph sync` ran cleanly in
43 ms; 73 files, 1850 symbols (up from 1838 at the prior Plan — the
delta reflects the 3 new symbols added by the 3 new test blocks
plus any symbol count drift from re-extraction; the seeds reported
`extracted 0, unchanged 73`, so the increase is from re-summarized
existing nodes, not from new files).

## Blast radius

`codepatrol graph impact --since-ref 5ed4822 --include-ambiguous`
reports 9 seeds and 52 affected files at depth ≤ 6, with one
affected test file: `scripts/install-lib.test.mjs` (the `--include-ambiguous`
flag surfaces it via `bin/codepatrol.js` → `scripts/install-lib.mjs` →
`scripts/install-lib.test.mjs`).

Direct seeds (the 3 declared production files) all share the same
parent module (`src/cli/`) and the change is purely additive on the
import surface:

- `src/cli/args.ts` adds `export const KNOWN_COMMANDS: string[]` —
  no new dependency, no module-level side effect, no top-level
  reordering; the export is consumed only by `src/cli/commands.ts`.
- `src/cli/commands.ts` adds one import (`KNOWN_COMMANDS`), one
  inline-JSON guard at the top of `readJsonInput`, and one
  enriched `default:` block. The guard is placed *before* the
  existing `input === "-"` resolution so it never executes for
  stdin (the only path the spec protects); file-path resolution
  behavior is unchanged.
- `src/cli/cli.test.ts` adds 3 new `test(...)` blocks at the end
  of the file; no existing test was modified.

Affected call sites the graph surfaced (and were exercised):

- `src/cli/main.ts` (depth 1): the error-rendering path
  `process.stderr.write(\`${error.code}: ${error.message}\\n\`)` for
  text and `JSON.stringify(errorEnvelope(...))` for JSON. Exercised
  in every repro above (the JSON envelope is the response body I
  parsed). The `errorEnvelope` function is unchanged; the new
  `CodepatrolError` thrown by the guard and the `default:` block
  both use the same `INVALID_ARGUMENT` / exit 2 contract, so the
  envelope renders identically. Existing `src/cli/main.test.ts`
  tests still pass.
- `src/cli/output.ts` (depth 2): the `HELP` text. Unchanged. The
  inline-JSON error message references the same `--input -` form
  the help already documents, so error/help stay aligned.
- `src/change/board.ts`, `src/change/orchestrator.ts`,
  `src/change/model.ts` (depth 1): none of these import from the
  changed CLI module; the graph depth comes from the umbrella
  `bin/codepatrol.js` → entry chain. They are not functionally
  affected. Their tests (`src/change/board.test.ts`,
  `src/change/change.test.ts`, `src/change/orchestrator-parallel.test.ts`)
  all pass as part of the 160-test full gate.
- `scripts/install-lib.test.mjs` (depth 1): unrelated to this
  Change's behavior; surfaced via the `bin/codepatrol.js` umbrella.
  Passes as part of the 160-test full gate.

The plan did not list every depth-1 / depth-2 / depth-3 transitive
file by name (it listed only the 3 declared seeds and the test
harness). All transitively affected files are exercised by the
existing full gate (160/160 pass), so this is a listing gap, not
a behavioral gap.

## Regressions

Beyond the changed files, the following were re-run explicitly to
guard regressions at surviving interfaces:

| Interface | Re-run command | Result |
|---|---|---|
| `parseArgs` (consumes `COMMAND_OPTIONS`) | `src/cli/main.test.ts` (10/10 pass) | no drift |
| `HELP` text and `errorEnvelope` | `scripts/smoke-cli.mjs` ("Compiled CLI smoke passed (0.1.0).") | no drift |
| `skills/_shared/SESSION.md` content | `scripts/skills-contract.test.mjs` (12/12 pass) | no drift |
| `package.json` contract | `scripts/package-contract.test.mjs` (12/12 pass) | no drift |
| `tsc` strictness on the new `KNOWN_COMMANDS` export | `tsc --noEmit` (clean) | no drift |
| Build artifacts | `tsc -p tsconfig.build.json` (clean) | no drift |

No behavior drift at any surviving interface was observed. The
`Unknown command: ${args.command || "(none)"}` prefix is preserved
in both new messages (line 160 and 162 of `commands.ts`), and the
`INVALID_ARGUMENT` code and exit 2 are preserved.

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| `.codepatrol/changes/2026-07-24-cli-input-ergonomics/apply/journal.md` | yes (Apply-owned) | accepted |
| `.codepatrol/changes/2026-07-24-cli-input-ergonomics/change.yaml` | yes (auto-managed) | accepted |
| `.codepatrol/changes/2026-07-24-cli-input-ergonomics/plan/{spec,plan,evidence/investigation}.md` | yes (Plan-owned) | accepted |
| `.codepatrol/changes/2026-07-24-cli-input-ergonomics/review/report.md` | yes (Review-owned) | accepted |
| `src/cli/args.ts` | yes (T1) | accepted (+2 / -0) |
| `src/cli/cli.test.ts` | yes (T1) | accepted (+33 / -0) |
| `src/cli/commands.ts` | yes (T1) | accepted (+12 / -3) |

`git diff --name-status 5ed4822 2b666bbb | grep -v "^A\s\+\.codepatrol/" | grep -v "^M\s\+src/cli/"` returns nothing: every non-`.codepatrol/`
path is one of the three declared production files. No undeclared
production changes; no undeclared runtime paths; no undeclared
docs/scripts/config.

## Findings

No critical or major findings. No minor findings survive independent
re-verification.

(The Review's minor finding — the spec/plan cite
`commands.ts:145-146` for the `default:` case, which is at
`:153-154` at base `5ed4822` — is a documentation nit that does not
affect any acceptance criterion. The Apply journal did not record a
deviation on this point; the implementer found the `default:` case
trivially via the `Unknown command` literal. No new finding to add
here.)

## Residual risks and evidence gaps

- **DC-1 from the spec** (a file path literally starting with `{`
  or `[` is misread as inline JSON): unchanged. The guard fires on
  the trimmed leading character, so a file named `{x}.json` is
  rejected. Such filenames are pathological; the spec's upgrade
  path is an `existsSync` fallback. The risk is documented in the
  spec and was accepted at Plan; no test exercises this edge case
  because it would couple the spec to a specific filesystem layout.
  The verify runs did not encounter this case in any test or repro.
- **Provider token coverage**: 0/3 measured runs (plan, review,
  verify). Same harness constraint recorded in the prior Change's
  Review and Verify. Not blocking.
- **Live environment tests** (e.g. the `node --test` runs of
  `src/change/close-push.test.ts` and `apply-gate-enforcement.test.ts`
  that exist in the suite) all pass as part of the 160-test full
  gate. No edge case beyond what the gate covers was probed here.
- **Manual exercise of `--input <file>` for AC-4b** was not done
  end-to-end because the existing `cli.test.ts` suite already
  exercises workspace-relative file paths (the `wiki record` test
  at line 51 and the `change session status` test at line 63 both
  use `--input <workspace-relative file>` and pass). The repro
  workspace cleanup also exercises the path-validation contract.
- The verify run was performed on the exact Apply candidate commit
  (`2b666bbb`) and recorded tree (`5411550c`); no drift was
  introduced between Apply and Verify.

## Verdict

`commit`

The Apply `implemented` candidate is sound: declared production
paths match the Plan exactly, every AC was independently re-executed
on the candidate commit/tree, the full `npm run verify` gate is
green (160 tests, 0 fail; typecheck / build / smoke:cli /
lint:skills all clean), and the surviving interfaces (`parseArgs`,
`HELP`, `errorEnvelope`, `SESSION.md`, `package.json`) all remain
green. The two error classes the spec targeted (inline-JSON
`--input`, unknown `change.<transition-type>` command) produce
actionable `INVALID_ARGUMENT` messages with exit 2, exactly as
designed, and the `frobnicate` unknown-command case lists every
known command. The blast radius is limited to the three declared
files plus their existing depth-1 / depth-2 transitive call sites,
all of which are exercised by the full gate. No DC-N trigger
activated. No undeclared production changes. No regressions.

Next permitted transition: `codepatrol-close 2026-07-24-cli-input-ergonomics
commit|rollback on codepatrol/2026-07-24-cli-input-ergonomics`. This
verifier is not authorized to invoke Close.
