# Verification — Centralize change-record compat migrations into one normalizer seam

- Change: `2026-07-24-migration-normalizer`
- Verified revision: 1
- Verifier: opencode (auditor persona)
- Base ref: `8ac598b0b0e2120f8d0747ea2c5efaeca001a5ef` (`main` @ the terminal commit of the prior `2026-07-24-cli-input-ergonomics` Change)
- Head ref: `e47c1625d567a703e120f23e447ad0ab780b23b7` (Apply `implemented` checkpoint; tree `6b640439f1c47004de785eab8fecbe1473eae29d`)
- Evidence date: 2026-07-24T19:28:51Z

## Scope and instruments

Artifacts read on branch `codepatrol/2026-07-24-migration-normalizer`
(clean working tree, target `main` @ `8ac598b`):

- `plan/spec.md`, `plan/plan.md`, `plan/evidence/investigation.md`
- `review/report.md`
- `apply/journal.md`
- `.codepatrol/changes/2026-07-24-migration-normalizer/change.yaml`

Diff range audited: `8ac598b..e47c162` (4 production paths; 61 / 27
additions / deletions on those paths). Apply candidate commit
`e47c162`; recorded tree `6b640439f1c47004de785eab8fecbe1473eae29d`
matches `git rev-parse e47c162^{tree}` exactly. Working tree is clean.

Commands executed in this session:

- `git rev-parse`, `git diff --stat`, `git diff` (per-path)
- `git diff --name-status 8ac598b e47c162`
- `codepatrol change inspect --id <id> --workspace $PWD --format json`
- `codepatrol change doctor --id <id> --workspace $PWD --format json` (returned `valid: true`)
- `codepatrol graph sync` (45 ms; 73 files; 1862 symbols; 397 imports / 3758 calls / 133 tests)
- `codepatrol graph impact --since-ref 8ac598b --include-ambiguous` (10 seeds, 31 affected files, 12 affected tests)
- `codepatrol wiki status` → `exists: false` (valid substrate)
- `node --test --import jiti/register src/change/change.test.ts` (21/21 pass — 4 new characterization tests + 17 existing)
- `node --test --import jiti/register src/change/{change,apply-gate,apply-gate-enforcement,board,close-integration,close-push,git,improvement-report,orchestrator-parallel}.test.ts` (48/48 pass)
- `npm run verify` (exit 0; typecheck + 164 tests + build + smoke:cli + lint:skills)
- `grep -rn "migrateRecord\(" src/ --include='*.ts' | grep -v '\.test\.'` to confirm the function is called only at the two declared read boundaries
- `grep -rn "tokens.*characters\|characters.*tokens" src/change/ --include='*.test.ts'` to confirm the new test's `toLegacy` helper is the only `tokens`/`characters` reference in the test suite

Environment limits: the harness exposes no authoritative provider
usage hook, so per-run token/character measurement is `unavailable`
for the verify run, the prior review run, the prior apply run, and
the prior plan run. This is the same constraint recorded in the
prior two Changes' journals and is not a verification defect.

## Plan conformance

| Plan task | Forecast | Delivered | Conforms? |
|---|---|---|---|
| T1 — `migrateRecord` + boundary rewrites + strict `foldChange` + 4 characterization tests | modify `src/change/model.ts` (+1 export, -3 inline lines), `src/change/store.ts` (-8 inline lines, +1 call), `src/change/orchestrator.ts` (-8 inline lines, +1 call), `src/change/change.test.ts` (+~50 lines, +1 import for `stringify`) | `model.ts` +13/-3 (`migrateRecord` export + 3 removed migration lines in `foldChange`); `store.ts` +2/-11 (one import, `migrateRecord` call replaces 8-line inline loop); `orchestrator.ts` +1/-12 (one import, `recordFromYaml` collapsed); `change.test.ts` +46/-3 (4 new `test(...)` blocks + 3 import additions: `stringify`, `migrateRecord`, `readChangeRecord`) | yes |
| T2 — Final verification and reconciliation | `npm run verify` exit 0; no undeclared paths; no DC-N triggers; no wiki refresh | `npm run verify` exit 0 (164 tests, 0 fail); declared production paths match exactly; no DC-N trigger; wiki remains absent | yes |

The plan's minor carry-forward note ("add `stringify` if not
present") was honored: `change.test.ts:7` now imports `stringify`
from `yaml` alongside `parse`.

No journaled deviation. The Apply journal claims all 5 ACs pass; this
verify independently re-ran every AC and re-ran the full gate
(see Acceptance re-verification and Wider suite below).

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of the journal |
|---|---|---|---|
| AC-1 (`foldChange(migrateRecord(legacy))` deep-equals `foldChange(modern)`) | `node --test --import jiti/register src/change/change.test.ts` — test 19: "legacy records project identically to their modern equivalent" | pass — `assert.deepEqual(foldChange(migrateRecord(toLegacy(modern))), foldChange(fixture("committed-change.yaml")))` | yes |
| AC-2 (`migrateRecord` reverses every legacy field; modern unchanged) | same suite — test 18: "migrateRecord reverses every legacy field and leaves modern records unchanged" | pass — both `assert.deepEqual(migrated, modern)` (legacy → modern) and `assert.deepEqual(migrateRecord(structuredClone(modern)), modern)` (idempotent on modern) hold | yes |
| AC-3 (`foldChange` no longer migrates — raw legacy throws, migrated legacy folds) | same suite — test 20: "foldChange no longer migrates: raw legacy throws, migrated legacy folds" | pass — `assert.throws(... /CHANGE_INVALID/)` for the raw legacy; `assert.doesNotThrow(...)` for the migrated legacy | yes |
| AC-4 (`readChangeRecord` migrates a legacy `change.yaml` at the read boundary) | same suite — test 21: "readChangeRecord migrates a legacy change.yaml at the read boundary" | pass — writes a legacy `change.yaml` (via `stringify(toLegacy(modern), { lineWidth: 0 })`) to a tmpdir, reads it, asserts `readChangeRecord` deep-equals the modern record and `foldChange(read)` succeeds | yes |
| AC-5 (`npm run verify` exit 0) | `npm run verify` | pass — exit 0; `tsc --noEmit` clean; 164 tests, 0 fail, 0 cancelled, 0 skipped; `tsc -p tsconfig.build.json` clean; CLI smoke "Compiled CLI smoke passed (0.1.0)."; `lint:skills` "Skill catalog, frontmatter, dependencies, portability, and relative links are valid." | yes |

Test count went from 160 (at base `8ac598b`) to 164 — exactly the
4 new characterization tests the spec called for. No existing test
was modified or removed (the only modifications to `change.test.ts`
are import additions for `stringify`, `migrateRecord`, and
`readChangeRecord`, plus the 4 new `test(...)` blocks at the end of
the file).

The applyGate (`applyGate` = `npm run verify`, 600 s timeout,
`.codepatrol/config.json`) would have refused the Apply `implemented`
checkpoint if AC-5 had not held at seal time. The Apply commit
`e47c162` is recorded with that gate having passed (the journal and
`change inspect` show `result: "implemented"` without an
`APPLY_GATE_FAILED` event). This verify re-ran the same gate on the
exact same candidate commit/tree and observed exit 0.

## Wider suite

The plan's final verification task ("T2 — Final verification and
reconciliation") is the full gate. I re-ran it on the exact Apply
candidate:

- `npm run verify` → exit 0
  - `tsc --noEmit` → clean (the new `migrateRecord(record: unknown): ChangeRecordV2` signature and the test-file's `stringify`/`migrateRecord`/`readChangeRecord` imports all type-check)
  - `node --test --import jiti/register $(find src .pi scripts -name '*.test.ts' -o -name '*.test.mjs')` → 164 tests, 0 fail
  - `node scripts/clean-dist.mjs && tsc -p tsconfig.build.json` → clean
  - `node scripts/smoke-cli.mjs` → "Compiled CLI smoke passed (0.1.0)."
  - `node scripts/lint-skills.mjs` → "Skill catalog, frontmatter, dependencies, portability, and relative links are valid."

In addition to the 164-test full gate, I re-ran the focused blast
suite explicitly:

- `node --test --import jiti/register src/change/{change,apply-gate,apply-gate-enforcement,board,close-integration,close-push,git,improvement-report,orchestrator-parallel}.test.ts` → 48/48 pass

No warnings of substance. The wiki remains absent (a valid substrate
state per `wiki status`; the spec correctly did not require a wiki
refresh for this Change). `codepatrol graph sync` ran cleanly in
45 ms; 73 files, 1862 symbols (up from 1850 at the prior Plan — the
delta reflects the new symbols added by the 4 new test blocks plus
the new `migrateRecord` function and its imports, not from new
files; the seeds reported `extracted 0, unchanged 73`).

## Blast radius

`codepatrol graph impact --since-ref 8ac598b --include-ambiguous`
reports 10 seeds (6 `.codepatrol/changes/...` artifacts + 4 declared
production files) and 31 affected files at depth ≤ 4, with 12
affected test files. The four direct seeds (the declared production
files) drive the entire blast radius via the existing `./model.js`
import edges:

- `src/change/model.ts` (depth 0) — `migrateRecord` is a new
  export. `foldChange` lost 3 lines. No new dependency, no
  module-level side effect, no top-level reordering. The new
  function is consumed by both `store.ts` and `orchestrator.ts`.
- `src/change/store.ts` (depth 0) — `readChangeRecord` now
  calls `migrateRecord(record)` instead of running an inline
  `tokens`→`characters` loop. Same parse-error mapping to
  `CHANGE_INVALID`; same `assertChangeRecord`/`foldChange`
  ordering; same return shape. `appendChangeEvent` (line 31)
  is unchanged and still calls `readChangeRecord`, so it
  inherits the migration transparently.
- `src/change/orchestrator.ts` (depth 0) — `recordFromYaml`
  body collapsed to `return migrateRecord(parse(raw))`. All 4
  callers (`validateCheckpointLineage` at :146, the close
  flow at :318 / :327, the improvement-report mirror at :356)
  benefit transparently. `validateCheckpointLineage`'s
  comparison of two `foldChange`-mutated records is preserved
  because both records now arrive normalized at their read
  boundary; today both were silently normalized by `foldChange`'s
  in-place migration; the change preserves projection equality
  (locked by AC-1).
- `src/change/change.test.ts` (depth 0) — 4 new `test(...)` blocks
  plus 3 import additions. No existing test was modified or
  removed.

Affected call sites the graph surfaced (and were exercised):

- `src/change/session.ts:82, 115, 136` (depth 1): the `foldChange`
  callers that route through `readChangeRecord` inherit the
  migration transparently. `primeStageSession` (line 60-72) is
  unchanged; `claimSessionItem` and `closeSessionItem` (lines
  74-87) are unchanged; `discardAndRebuildSession` (lines 88-91)
  is unchanged. The `src/change/change.test.ts` session suite
  (tests 12-17) all pass.
- `src/change/validation.ts` (depth 1): the artifact-binding
  validator. It does not call `migrateRecord` or `foldChange`; it
  is unaffected. Its callers (the orchestrator's
  `validateWorkspaceArtifacts`) are exercised by the full gate.
- `src/cli/commands.ts` (depth 1): the CLI dispatch. Unchanged
  for this Change; it is on the graph path because of the umbrella
  `bin/codepatrol.js` → entry chain. The CLI test suite stays
  green as part of the 164-test full gate.
- `src/shared/lock.ts`, `src/shared/workspace.ts`,
  `src/graph/*`, `src/wiki/*` (depth 1-3): unrelated to record
  shape; surfaced via the umbrella chain. Their tests stay green
  as part of the 164-test full gate.
- `scripts/render-kanban.mjs` and the affected test files
  (depth 1-6): unrelated to record shape; surfaced via the
  umbrella chain. All stay green as part of the 164-test full
  gate.

The plan did not list every depth-1 / depth-2 / depth-3 / depth-4
transitive file by name (it listed only the 4 declared seeds and
the test harness). All transitively affected files are exercised by
the existing full gate (164/164 pass), so this is a listing gap, not
a behavioral gap.

## Regressions

Beyond the changed files, the following were re-run explicitly to
guard regressions at surviving interfaces:

| Interface | Re-run command | Result |
|---|---|---|
| `readChangeRecord` on a modern `change.yaml` (no legacy fields) | covered by the existing 17 `change.test.ts` tests at lines 22-195 | no drift (all pass) |
| `recordFromYaml` on a modern YAML (no `tokens` field) | covered by `close-push.test.ts`, `close-integration.test.ts`, `orchestrator-parallel.test.ts` (lines 51, 24, 30 etc.) | no drift (all pass) |
| `foldChange` strict-mode validation (rejects unknown event types, duplicate ids, etc.) | covered by `change.test.ts` tests 5, 10, 11, 14 | no drift (all pass) |
| `assertChangeRecord` strength (unchanged) | covered by `change.test.ts` tests 5, 10, 11 | no drift (all pass) |
| `validateCheckpointLineage` equality | covered by `close-integration.test.ts` and `orchestrator-parallel.test.ts` | no drift (both pass) |
| `applyGate` (the gate command for Apply `implemented`) | covered by `apply-gate.test.ts` and `apply-gate-enforcement.test.ts` | no drift (both pass) |
| `improvement-report.ts:33` raw reader (DC-2 deferred) | `improvement-report.test.ts` | no drift — reader is unchanged per the spec's DC-2 |
| `tsc` strictness on the new `migrateRecord` signature | `tsc --noEmit` (clean) | no drift |
| Build artifacts | `tsc -p tsconfig.build.json` (clean) | no drift |
| Skills / package contract | `lint:skills` (clean) and `package-contract.test.mjs` (12/12 pass) | no drift |

No behavior drift at any surviving interface was observed. The
`validateCheckpointLineage` equality check (the most subtle
surviving invariant) is preserved by construction: both compared
records now arrive normalized at their read boundary, and AC-1
explicitly asserts that `foldChange(migrateRecord(legacy))` is
deep-equal to `foldChange(modern)`.

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| `.codepatrol/changes/2026-07-24-migration-normalizer/apply/journal.md` | yes (Apply-owned) | accepted |
| `.codepatrol/changes/2026-07-24-migration-normalizer/change.yaml` | yes (auto-managed) | accepted |
| `.codepatrol/changes/2026-07-24-migration-normalizer/plan/{spec,plan,evidence/investigation}.md` | yes (Plan-owned) | accepted |
| `.codepatrol/changes/2026-07-24-migration-normalizer/review/report.md` | yes (Review-owned) | accepted |
| `src/change/model.ts` | yes (T1) | accepted (+13/-3) |
| `src/change/store.ts` | yes (T1) | accepted (+2/-11) |
| `src/change/orchestrator.ts` | yes (T1) | accepted (+1/-12) |
| `src/change/change.test.ts` | yes (T1) | accepted (+46/-3) |

`git diff --name-status 8ac598b e47c162 | grep -v "^A\s\+\.codepatrol/" | grep -v "^M\s\+src/change/"` returns nothing: every
non-`.codepatrol/` path is one of the four declared production
files. No undeclared production changes; no undeclared runtime
paths; no undeclared docs/scripts/config.

The Review's two minor carry-forward notes — (1) the `stringify`
import in `change.test.ts` and (2) the `orchestrator.ts:146-147`
line range drift — were both correctly resolved by the implementer:
`stringify` is now imported at `change.test.ts:7`, and the
`foldChange` pair inside `validateCheckpointLineage` is exercised
by the existing `close-integration.test.ts` and
`orchestrator-parallel.test.ts` tests at line 147 (the implementer
did not need to touch the cited line number).

## Findings

No critical, major, or new minor findings. The Review's two minor
carry-forward notes were resolved during Apply.

## Residual risks and evidence gaps

- **DC-1 from the spec** (a future rename adds a third legacy
  form): unchanged. `migrateRecord` is a single seam where the
  new rewrite would be added. The risk is documented in the
  spec and was accepted at Plan; no test exercises this edge
  case because no third legacy form exists today.
- **DC-2 from the spec** (`improvement-report.ts:33` raw reader
  left un-normalized): unchanged. Confirmed at
  `improvement-report.ts:37` — the reader still uses raw
  `parse(readFileSync(...))` and is intentionally out of scope
  per the spec. The spec's upgrade path is a one-line routing
  through `migrateRecord`. The risk is documented in the spec
  and was accepted at Plan; `improvement-report.test.ts` passes
  as part of the 164-test full gate.
- **Provider token coverage**: 0/3 measured runs (plan + review
  + apply) before this verify; this verify run adds a 4th
  `unavailable` record. Same harness constraint recorded in
  the prior two Changes' journals. Not blocking.
- **Live environment tests** (e.g. the `node --test` runs of
  `apply-gate-enforcement.test.ts`, `close-push.test.ts`, etc.)
  all pass as part of the 164-test full gate. No edge case
  beyond what the gate covers was probed here.
- The verify run was performed on the exact Apply candidate
  commit (`e47c162`) and recorded tree (`6b640439`); no drift
  was introduced between Apply and Verify.
- `migrateRecord` is called at exactly the two declared read
  boundaries (`store.ts:18` and `orchestrator.ts:290`); no
  other production call site, no test call site beyond the
  4 characterization tests. The function is exported for
  future boundary use, not consumed elsewhere.
- The asymmetry the spec identified (the `finalize` migration
  lived only in the fold side effect; the `tokens` migration
  was duplicated in two readers) is now fully resolved: the
  fold's in-place migration is gone, and the two readers route
  through `migrateRecord`. `validateCheckpointLineage`'s
  equality is preserved by the new boundary-first ordering.

## Verdict

`commit`

The Apply `implemented` candidate is sound: declared production
paths match the Plan exactly, every AC was independently re-executed
on the candidate commit/tree, the full `npm run verify` gate is
green (164 tests, 0 fail; typecheck / build / smoke:cli /
lint:skills all clean), and the surviving interfaces (the
`validateCheckpointLineage` equality, `assertChangeRecord` /
`foldChange` validation strength, `applyGate`, the
`improvement-report.ts` raw reader) all remain green. The
centralization is behavior-preserving: legacy records continue to
project identically to their modern equivalents (locked by AC-1),
modern records are unchanged by the idempotent normalizer (locked
by AC-2), the fold is now strict on already-normalized input
(locked by AC-3), and the read boundary normalizes legacy
`change.yaml` on disk (locked by AC-4). The blast radius is
limited to the four declared files plus their existing depth-1
to depth-4 transitive call sites, all of which are exercised by
the 164-test full gate. No DC-N trigger activated. No undeclared
production changes. No regressions. The asymmetry the spec
identified (fold-side-effect migration + duplicated reader
loops) is fully resolved.

Next permitted transition: `codepatrol-close 2026-07-24-migration-normalizer
commit|rollback on codepatrol/2026-07-24-migration-normalizer`. This
verifier is not authorized to invoke Close.
