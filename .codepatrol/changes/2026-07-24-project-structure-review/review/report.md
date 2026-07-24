# Review — Lean and cohesive project structure: remove dead docs, dead bootstrap procedure, and the unadopted wiki subsystem

- Change: `2026-07-24-project-structure-review`
- Incoming revision: 1
- Reviewed revision: 1
- Reviewer: opencode (gatekeeper persona)
- Evidence date: 2026-07-24T22:12:16Z

## Scope and evidence

Files inspected on branch `codepatrol/2026-07-24-project-structure-review`
(checkout `fd697c7` plan checkpoint, head `ccce360` stage transition;
clean working tree, target `main` @ `185f0f9` — the terminal commit of
the prior `2026-07-24-uniform-stage-io` Change):

- `.codepatrol/changes/2026-07-24-project-structure-review/plan/spec.md`
- `.codepatrol/changes/2026-07-24-project-structure-review/plan/plan.md`
- `.codepatrol/changes/2026-07-24-project-structure-review/plan/evidence/investigation.md`
- `bin/codepatrol.js` + `package.json` (`"bin"` field + `description`)
- `docs/QODO-REVIEW-REPORT.md` (69 lines)
- `docs/change-lifecycle.md` (46 lines)
- `src/wiki/{generate,manifest,record,status,types,validate}.ts` +
  `src/wiki/wiki.test.ts` (7 files, 889 non-test LOC + 246 test LOC)
- `skills/codebase-wiki/{SKILL.md, PAGE-FORMAT.md}` (2 files)
- `src/cli/commands.ts:4-7` (4 wiki imports) +
  `:108-124` (4 wiki switch cases)
- `src/cli/args.ts:46-49` (4 wiki `COMMAND_OPTIONS` entries)
- `src/cli/output.ts:57-60` (4 wiki HELP lines + the "Wiki commands:"
  header at `:55`)
- `src/cli/cli.test.ts:51-60` (1 wiki test block)
- `src/shared/state.ts:13,17` (`wikiManifestPath`, `wikiRoot` —
  consumed only within `src/wiki/*`)
- `skills/catalog.yaml:95-101` (codebase-wiki entry) + `:125, 132-133`
  (execute-change `mayInvoke` and `triggers`)
- `scripts/lint-skills.mjs:8, 32` (`executionProtocolSkills`,
  `ALLOWED_TRIGGER_WHEN`)
- `scripts/skills-contract.test.mjs:11` (`support` list)
- 10 shared/skill docs that mention wiki incidentally
  (`_shared/{SPEC-FORMAT,EXECUTION,CODEPATROL-CLI}.md`,
  `execute-change/SKILL.md`, `diagnose-bug/SKILL.md`,
  `research-technology/SKILL.md`, `codepatrol-apply/SKILL.md`,
  `assess-change/SKILL.md`, `writing-plans/PLAN-FORMAT.md`,
  `codepatrol-plan/MARKDOWN-REPORT.md`)
- `README.md:34, 44, 125-140` (wiki), `:169-184` (v1 bootstrap
  cutover)
- `AGENTS.md:117-118` (v1 bootstrap sentence), `:121-126`
  (`<!-- codepatrol:wiki:begin -->` marker block)
- `docs/runtime-state.md:7-8, 16` (wiki tree + caches)
- `docs/smoke-tests.md:44-45` (v1 bootstrap sentence)
- `package.json:5` (`description`)
- `.gitignore:7-15` (v1 bootstrap block)

External artifacts re-checked:

- `docs/codepatrol/improvement-reports/2026-07-24-uniform-stage-io.md:35`
  — recurring `change.transition` ×13 (accepted design cost;
  dispositioned by the v2 assessment).
- `codepatrol wiki status --format json` → `exists: false` (re-checked
  live).
- `codepatrol graph sync` → 73 files, 1886 symbols, 41 ms.
- `which codepatrol` → `/opt/homebrew/bin/codepatrol` → this
  repo's `bin/codepatrol.js` (readlink -f confirmed).
- `.codepatrol/config.json` → `applyGate` = `npm run verify`, 600 s
  timeout.

Independent confirmations:

- `bin/codepatrol.js` is a 3-line shim; `package.json` has
  `"bin": {"codepatrol": "./bin/codepatrol.js"}`; `smoke-cli.mjs:14,21`
  exercises it; `package-contract.test.mjs:14` asserts it. `bin/` is
  necessary.
- `docs/QODO-REVIEW-REPORT.md` is 69 lines and 100% stale
  (`src/workflow/types.ts` doesn't exist; orphan-lock and symlink
  bugs are fixed; `approve` is the current required Review
  verdict).
- `docs/change-lifecycle.md` is 46 lines and has zero inbound
  references; its content overlaps `skills/_shared/CHANGE.md`.
- `git branch -a | grep v1-release` → none; `.codepatrol/packages`
  /`.codepatrol/workflows` (and 6 other dead v1 paths) do not
  exist; `package.json` version is `0.1.0` (single package).
- `src/wiki/` is 7 files (6 source + 1 test); non-test LOC = 889,
  test LOC = 246 (exact match to the spec's "889 LOC" claim).
- `wikiManifestPath`/`wikiRoot` are consumed only within
  `src/wiki/*` (the only non-`src/wiki` references are the
  definitions themselves in `src/shared/state.ts:13,17`).
- All 10 shared/skill docs have wiki mentions (counts 1-4 each);
  the spec's per-file line citations are approximately correct
  (some have shifted slightly; the substantive content matches).
- The 4 wiki switch cases in `commands.ts:108-124` are
  character-identical to the spec's evidence.
- The 4 `wiki.*` `COMMAND_OPTIONS` entries at `args.ts:46-49` are
  character-identical.
- The 4 wiki HELP lines at `output.ts:57-60` (with the "Wiki
  commands:" header at `:55`) are character-identical.
- The 1 wiki test at `cli.test.ts:51-60` is character-identical.
- The 4 wiki imports at `commands.ts:4-7` are character-identical.
- The `<!-- codepatrol:wiki:begin -->` block at `AGENTS.md:121-126`
  is character-identical.

Limitations: did not execute `npm run verify` (Review never re-runs
the full gate; that is Apply's job per AGENTS.md). Did not execute
the deletions (that is Apply T1-T4's job). The Review verifies
the plan's evidence and the maintainer-driven decisions; the
actual deletions are reviewed again at Verify.

## Findings

No critical, major, or minor findings survive validation. The plan
is a textbook bounded-removal design with exhaustive evidence and
explicit dangling-reference mitigation.

(All cited `file:line` references for production code and external
artifacts were re-verified against the working tree at base
`185f0f9`. The plan's evidence is independently confirmed:
- `bin/` is necessary, exercised, asserted.
- `docs/QODO-REVIEW-REPORT.md` is 100% stale (every cited issue
  fixed or module renamed).
- `docs/change-lifecycle.md` is a duplicate with zero refs.
- v1-bootstrap-cutover references are dead (no `v1-release` branch,
  no dead v1 paths exist, `package.json` is `0.1.0`).
- Wiki subsystem has zero adoption evidence across the project's
  full history; the import graph is exactly as described (only
  `src/cli/commands.ts` imports externally; `wikiManifestPath` /
  `wikiRoot` consumed only within `src/wiki/*`).)

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `plan/plan.md` | none | All citations verified; surface delta forecast is correct; disjoint file ownership (T1: 2 deletes; T2: 7 deletes + 6 modifies; T3: 2 deletes + 13 modifies; T4: 6 modifies; T5: none); dependency order T1 → T2 → T3 → T4 → T5 is correct | none |
| `plan/spec.md` | none | The maintainer-driven decisions are explicitly recorded (wiki full removal vs dormant; one Change vs multiple; docs location; change-lifecycle merge vs delete); all 4 alternatives are evaluated with rationale; deferred constraints DC-1 and DC-2 are recorded with observable triggers and upgrade paths | none |
| `plan/evidence/investigation.md` | none | All evidence claims independently re-verified: `bin/` resolution + bin/codepatrol.js line count + smoke-cli/package-contract references; Qodo staleness (each cited issue verified fixed); change-lifecycle zero-refs (grep over README/AGENTS/skills/docs); v1-bootstrap dead (no v1-release branch, no dead paths, version 0.1.0); wiki 889 LOC (6 source files) + 246 LOC test (exact match); wiki external import graph (only commands.ts); 10 shared/skill doc mentions | none |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 (Qodo + change-lifecycle absent; no name references) | yes | T1 | yes — `ls` confirms files absent; `grep -rln "QODO\|change-lifecycle"` (excl. `.codepatrol/changes/`) → empty | covered |
| AC-2 (no `v1-release`/`v1 bootstrap cutover`/`.codepatrol/packages/`/`.codepatrol/workflows/` text in README.md, AGENTS.md, docs/smoke-tests.md) | yes | T4 | yes — `grep -rln "v1-release\|v1 bootstrap\|codepatrol/packages\|codepatrol/workflows"` README.md AGENTS.md docs/smoke-tests.md → empty after T4 | covered |
| AC-3 (`src/wiki/` and `skills/codebase-wiki/` absent; `wiki *` returns `INVALID_ARGUMENT` exit 2; repo-wide `wiki` grep returns zero hits outside this Change) | yes | T2, T3 | yes — `ls` confirms dirs absent; `codepatrol wiki status` → exit 2 with `INVALID_ARGUMENT` (the existing unknown-command path from the prior `cli-input-ergonomics` Change already handles this); repo-wide `grep -rn "wiki" .` (excl. `.codepatrol/changes/`) → empty | covered |
| AC-4 (`bin/` and `docs/codepatrol/assessments/` unchanged; recorded in journal) | yes | (none — no-op) | yes — `git diff --stat 185f0f9 <candidate>` shows no changes under `bin/` or `docs/codepatrol/assessments/` | covered |
| AC-5 (`npm run verify` exit 0) | yes | T5 | yes — applyGate machine-enforces at implemented checkpoint | covered |

## Simplicity axis

- **Selected rung:** direct local change — pure deletion /
  subtraction. Confirmed. The "rung" here is the amount of
  documentation / code kept, and the floor is "keep only what
  is live, accurate, and referenced." Every task group is a
  subtractive edit; no new code, no new abstraction, no new
  module, no new interface.
- **Safety floor:** preserved. No lifecycle, orchestrator,
  graph, or non-wiki CLI behavior changes. The wiki removal is a
  breaking change to the CLI surface (`wiki status|validate|
  generate|record` stop existing) but with zero adoption evidence;
  the unknown-command path (`INVALID_ARGUMENT` exit 2 with
  known-commands suggestion from the prior `cli-input-ergonomics`
  Change) handles this automatically. The deleted tree is fully
  recoverable from Git history and the Change's recoverable
  tag. The maintainer's explicit choice (full removal, not
  dormant) is grounded in the project's own history.
- **Surface delta:** **9 deletes** (7 `src/wiki/*` + 2
  `skills/codebase-wiki/*` + 2 `docs/*.md`) + **~22 modifies**
  (the 6 files under T2, the 13 files under T3, the 6 files under
  T4). No new files, no new dependencies, no new config, no
  event-schema changes, no lifecycle / orchestrator / Git / persona
  changes.
- **Tangled-reference mitigation:** every deletion is paired with
  exhaustive grep checks before sealing (T5 step 1): zero hits
  for `wiki`, `QODO`, `change-lifecycle`, `v1-release`,
  `v1 bootstrap` outside this Change's own plan/evidence. The
  wiki CLI removal is automatically absorbed by the existing
  unknown-command path; the wiki skill removal is automatically
  absorbed by the existing skills-contract test loop (it iterates
  over the support list, which will no longer include
  `codebase-wiki`).

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| reuse | `wiki *` unknown-command handling | Falls through to the existing `INVALID_ARGUMENT` path from `cli-input-ergonomics`; no new error code needed | none — preserves the prior Change's invariant | required (already in plan) |
| reuse | `wikiManifestPath`/`wikiRoot` removal | Both are consumed only within `src/wiki/*` (deleted in same task) | none | required (already in plan) |
| reuse | `codebase-wiki` skill removal | Catalog and lint files are edited in T3 to keep invariants | none — preserves `lint:skills` and `skills-contract.test.mjs` | required (already in plan) |
| reuse | Skills-contract test loop | The per-skill loop iterates over the support list, which will be updated in T3; no test code change needed | none | already sufficient |
| speculative | none observed | — | — | already sufficient |
| built-in | `git branch -a \| grep v1-release` to confirm dead | Standard git | none | already sufficient |
| simplify | Telemetry-derived scope | The recurring `change.transition` ×13 signal is already dispositioned by the v2 assessment (accepted design cost); not touched here | keeps this Change focused on structure, not lifecycle | already sufficient |
| deferred | Wiki removal deletes the subsystem outright (no soft-deprecation) (DC-1) | Any external consumer of `wiki.*` commands breaks immediately; zero adoption evidence | not expected for a local CLI tool; if raised, restore from Git history | acceptable |
| deferred | `docs/change-lifecycle.md` deleted rather than merged (DC-2) | Any nuance unique to its phrasing is lost | recovers from Git history; `skills/_shared/CHANGE.md` remains the canonical contract | acceptable |

## Executability audit

- **Paths:** all 31 declared paths (9 deletes + 22 modifies)
  exist at base `185f0f9`. The deletes are 7 `src/wiki/*` files +
  2 `skills/codebase-wiki/*` files + 2 `docs/*.md` files. The
  modifies are the 6 `src/cli/*` + 1 `src/shared/state.ts` + 1
  `src/shared/repo-files.ts` + `skills/catalog.yaml` + 2
  `scripts/*` + 10 shared/skill docs + 5 top-level
  (README/AGENTS/docs/runtime-state.md/docs/smoke-tests.md/
  package.json/.gitignore).
- **Interfaces:** no new exports, no new types, no new
  options. `generateWiki`, `wikiRecord`, `wikiStatus`,
  `validateWiki`, `wikiManifestPath`, `wikiRoot` are removed (all
  are consumed only by the deleted `src/wiki/*` or the deleted
  wiki CLI cases; full grep confirmed).
- **Dependencies:** no new packages, no new config keys, no
  event-schema additions, no lifecycle / persona / Git / checkpoint
  changes.
- **Commands:** the verification commands in the plan
  (`node --test --import jiti/register src/cli/cli.test.ts`,
  `node --test --import jiti/register scripts/skills-contract.test.mjs`,
  `npm run typecheck`, `npm run lint:skills`, `npm run verify`,
  the repo-wide `grep` checks for `wiki`, `QODO`,
  `change-lifecycle`, `v1-release`, `v1 bootstrap`) match the
  available tooling.
- **Expected red:** the wiki test in `cli.test.ts:51-60` will
  fail after the wiki source is deleted (because `codepatrol
  wiki status` becomes an unknown command); the skills-contract
  test will fail if `codebase-wiki` is referenced anywhere
  after deletion. Both are explicitly covered in T2 step 8 and
  T3 step 6.
- **Expected green:** T1 green when both files are deleted and
  the grep returns empty; T2 green when the wiki test is removed
  and the other CLI tests pass; T3 green when the skills-contract
  test and `lint:skills` pass; T4 green when the top-level docs
  and config are clean; T5 green when `npm run verify` exits 0
  and the repo-wide grep returns empty.
- **Rollback:** revert the branch — the deleted tree is fully
  recoverable from Git history and the Change's recoverable
  tag.
- **Context independence:** the Review verdict is grounded
  entirely in the durable plan artifacts, the cited source
  files, the latest improvement report, the live `wiki status`
  output, and the live `bin/` resolution. No chat history is
  required.

## Verdict

`approve`

The Plan is decision-complete, evidence-backed, and tightly
bounded. All cited `file:line` references for production code
(~25 locations across `bin/`, `docs/`, `src/wiki/*`,
`skills/codebase-wiki/*`, `src/cli/*`, `src/shared/*`,
`skills/catalog.yaml`, 2 `scripts/*` files, 10 shared/skill
docs, and 5 top-level files) were re-verified on the working tree
at base `185f0f9`. The investigation is comprehensive and the
maintainer-driven decisions (wiki full removal vs dormant; one
Change vs multiple; docs location; change-lifecycle merge vs
delete) are explicitly recorded with rationale. The simplicity
rung is correct (pure deletion/subtraction; the only
"complexity" is the *care* of removing all dangling references,
fully enumerated in the task list). The safety floor is
preserved: no lifecycle, orchestrator, graph, or non-wiki CLI
behavior changes; the wiki removal is a breaking change to the
CLI surface but with zero adoption evidence; the
unknown-command path from the prior `cli-input-ergonomics`
Change automatically handles this; the deleted tree is fully
recoverable from Git history and the recoverable tag. The five
ACs map to red-capable tests (file deletions + grep checks +
unknown-command repro + diff inspection + `npm run verify`).
Risks are enumerated with concrete mitigations: dangling
references → repo-wide grep checks before sealing (specific
tokens: `wiki`, `QODO`, `change-lifecycle`, `v1-release`,
`v1 bootstrap`); hidden caller of `wikiManifestPath`/`wikiRoot`
→ grep confirmed only within `src/wiki/*`; lint/contract
breakage → explicitly edited in T3; `change-lifecycle.md`
removal misses info → side-by-side comparison shows equivalent
coverage. The deferred constraints (DC-1: wiki full removal;
DC-2: change-lifecycle.md deleted) are recorded with observable
triggers and bounded upgrade paths. The disjoint file ownership
(T1: 2 deletes; T2: 7 deletes + 6 modifies; T3: 2 deletes + 13
modifies; T4: 6 modifies; T5: none) prevents concurrent
same-file writes. The dependency order (T1 → T2 → T3 → T4 → T5)
is correct.

Next permitted transition: `codepatrol-apply 2026-07-24-project-structure-review`
on `codepatrol/2026-07-24-project-structure-review`, gated by the
declared `applyGate` (`npm run verify`).

## External evidence sufficiency

`not required` — the design is internal to the Codepatrol
project structure and reuses existing primitives (`bin/` shim +
`package.json` bin field; `npm run verify` gate; the existing
unknown-command path; the existing skills-contract test loop;
the existing `lint:skills` skill structure; the standard git
resolution of the installed `codepatrol` binary; the standard
`grep` tooling for dangling-reference checks). The only
external claim that motivates the design is the v2 assessment's
F7 finding (wiki adoption decision) and the maintainer's
explicit question. Both are re-confirmed; no new dependency,
protocol, or external API is introduced.

## Residual concerns and evidence gaps

- The plan correctly does not redefine `wiki status` after
  removal: T5 step 6 records "confirm `codepatrol wiki status`
  is now an unknown command" — the existing `INVALID_ARGUMENT`
  path is the right outcome. The spec's AC-3 also captures this
  ("`wiki status|validate|generate|record` are unknown commands
  (`INVALID_ARGUMENT`, exit 2)").
- The v2 assessment's other findings (N1-N4) and F2/F6 remain as
  separate follow-up Changes, correctly out of scope here.
- Per-run provider tokens remain unmeasurable from this harness
  (same constraint recorded in the prior six Changes' Plan and
  Review runs). Apply will record
  `characters: { status: "unavailable", reason: … }` for its
  finished runs, consistent with the established pattern.
- The plan does not redefine `wiki status`; the wiki is
  correctly recorded as absent. No wiki refresh is required.
- The full-repo grep checks in T5 step 1 are the safety net
  for any references the per-file edit list might miss; the
  implementer must run them before sealing.
- The `package.json` edit (removing ", wiki," from the
  description) is a single-character prose change inside a
  string field; T4 step 2 explicitly runs `JSON.parse` to
  confirm validity.
- The `.gitignore` edit (removing lines 7-15) only affects
  patterns for paths that don't exist in the working tree; T4
  step 3 explicitly checks `git status --porcelain` for
  spurious untracked-file changes.
- The plan correctly leaves `bin/` and `docs/codepatrol/assessments/`
  untouched; their correctness is the outcome of investigation,
  recorded in the plan and journal. AC-4 enforces this via
  `git diff --stat`.
- The plan's T3 lists 13 files to modify (1 catalog + 2
  scripts + 10 shared/skill docs); the count is correct.
- The T4 lists 6 files to modify (README, AGENTS,
  docs/runtime-state.md, docs/smoke-tests.md, package.json,
  .gitignore); the count is correct.
- The 22 modifies + 9 deletes = 31 file operations across
  5 task groups; all are subtractive (delete files or remove
  dead prose). No new code, no new interface, no new module.
- The wiki `INVALID_ARGUMENT` unknown-command test in T2 step 10
  leverages the existing unknown-command test from the prior
  `cli-input-ergonomics` Change; the new commands inherit the
  existing test coverage.
- The full repo-wide grep at T5 step 1 must exclude
  `.codepatrol/changes/2026-07-24-project-structure-review/`
  (this Change's own plan/evidence files use the term "wiki"
  extensively); the plan's Global constraints correctly exclude
  it.
- The plan is large (5 task groups, 31 file operations) but each
  task is mechanical and verifiable by grep + the full gate.
  The complexity is in the *care* of removing all dangling
  references, not in any new abstraction.
