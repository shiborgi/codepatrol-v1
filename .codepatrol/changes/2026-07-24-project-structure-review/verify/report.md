# Verification — Lean and cohesive project structure: remove dead docs, dead bootstrap procedure, and the unadopted wiki subsystem

- Change: `2026-07-24-project-structure-review`
- Verified revision: 1
- Verifier: opencode (codepatrol-verify)
- Base ref: `185f0f9ad0ee136163cc14461e1b6a1231f0b633` (target `main`)
- Head ref: `codepatrol/2026-07-24-project-structure-review` (working tree at HEAD; candidate bound below)
- Evidence date: 2026-07-24T22:43:13Z (run start)

## Scope and instruments

Artifacts read in full this session: `plan/spec.md`, `plan/plan.md`,
`plan/evidence/investigation.md`, `review/report.md`, `apply/journal.md`,
`.codepatrol/changes/2026-07-24-project-structure-review/change.yaml`.

Diff range audited: `git diff 185f0f9 HEAD` (44 files) reconciled against
the apply checkpoint's declared `changes` list and the spec's surface
forecast.

Candidate binding: the apply attempt sealed at checkpoint
`4bb5638ef382d0d4e1dc7933fd3695dda3ae9528` / tree
`1b76373b0967042ee016319968ab23362d0c2389`. HEAD (`ecff67d`, the verify
`begin` commit) is a descendant whose production tree is identical to
that candidate: `git diff --stat 4bb5638 HEAD` reports a single changed
path — `.codepatrol/changes/…/change.yaml` (lifecycle metadata only,
the `checkpoint apply` + `begin verify` bookkeeping). The Verify
checkpoint will bind the production candidate exactly.

Commands available and executed: `git`, `rg`, `node`, `codepatrol`
(resolves to this repo's `bin/codepatrol.js`). Environment limit: the
harness exposes no authoritative provider-usage hook, so per-run tokens
are recorded `unavailable` (consistent with the prior three stages'
runs).

## Plan conformance

Task-by-task comparison of `git diff 185f0f9 HEAD` against `plan.md`:

- **T1 (delete stale/duplicate docs):** `docs/QODO-REVIEW-REPORT.md`
  and `docs/change-lifecycle.md` both show as deletions in the diff
  (−69 and −46 lines). Match.
- **T2 (wiki code + CLI wiring):** all 7 `src/wiki/*` deleted
  (`generate`, `manifest`, `record`, `status`, `types`, `validate`,
  `wiki.test.ts`); `src/cli/{commands,args,output,cli.test}.ts`,
  `src/shared/state.ts`, `src/shared/repo-files.ts` modified
  subtractively. Match.
- **T3 (wiki skill + catalog/lint/skill-doc refs):**
  `skills/codebase-wiki/{SKILL,PAGE-FORMAT}.md` deleted;
  `skills/catalog.yaml`, `scripts/lint-skills.mjs`,
  `scripts/skills-contract.test.mjs`, and the 10 shared/skill docs in
  the spec list modified. Match.
- **T4 (top-level docs/config + dead bootstrap):** `README.md`,
  `AGENTS.md`, `docs/runtime-state.md`, `docs/smoke-tests.md`,
  `package.json`, `.gitignore` modified. Match.
- **T5 (verification):** no file operations. Match.

Journaled deviation (accepted): Apply extended the T3/T4 edit set with
3 additional subtractive cleanups —
`skills/codepatrol-plan/SKILL.md`,
`skills/codepatrol-apply/IMPLEMENTATION-FORMAT.md`, and
`skills/_shared/SPEC-FORMAT.md` — each removing a leftover `wiki`
clause, consistent with the spec's Plan risk #1 ("zero dangling
reference") mitigation. All three appear in the diff as 1-line
subtractive edits. No new abstraction, dependency, or interface.

No undeclared production paths in the diff. Every difference between
the diff and the spec forecast is journaled in `apply/journal.md`.

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of the journal |
|---|---|---|---|
| AC-1 | `ls docs/QODO-REVIEW-REPORT.md docs/change-lifecycle.md` → both "No such file"; `rg -l "QODO\|change-lifecycle"` (excl `.codepatrol/changes`, `node_modules`, `dist`) → EMPTY | pass | yes |
| AC-2 | `rg -n "v1-release\|v1 bootstrap\|codepatrol/packages\|codepatrol/workflows" README.md AGENTS.md docs/smoke-tests.md` → EMPTY | pass | yes |
| AC-3 | `ls -d src/wiki skills/codebase-wiki` → both "No such file"; `codepatrol wiki status --format json` → exit 2 `INVALID_ARGUMENT` "Unknown command: wiki.status" with the known-commands suggestion; `rg -n "wiki" src skills scripts README.md AGENTS.md docs/runtime-state.md docs/smoke-tests.md package.json .gitignore` → EMPTY | pass | yes |
| AC-4 | `git diff --stat 185f0f9 HEAD -- bin/ docs/codepatrol/assessments/` → no output (zero changes) | pass | yes |
| AC-5 | `npm run verify` → exit 0 | pass | yes |

## Wider suite

The plan's final verification task and the full project gate:

```
npm run verify   # = typecheck && test && build && smoke:cli && lint:skills
```

Observed (exit 0):

- `npm run typecheck` — clean.
- `npm test` — `# tests 151, # pass 151, # fail 0` (test count dropped
  167 → 151; −16 = the deleted `src/wiki/wiki.test.ts`; the single
  `cli.test.ts` wiki assertion was also removed).
- `npm run build` — `tsc -p tsconfig.build.json` succeeds.
- `npm run smoke:cli` — "Compiled CLI smoke passed (0.1.0)."
- `npm run lint:skills` — "Skill catalog, frontmatter, dependencies,
  portability, and relative links are valid."

No warnings.

## Blast radius

`codepatrol graph impact --since-ref 185f0f9` seeds = the 38 production
paths; `affectedTests` (depth 1–3) = 22 test files. Every affected test
is exercised by `npm test` / `npm run verify` above (all pass):

- `src/cli/cli.test.ts` — wiki case removed; remaining CLI cases green.
- `scripts/skills-contract.test.mjs` — `codebase-wiki` removed from the
  support list; contract green.
- `scripts/package-contract.test.mjs`, `scripts/render-kanban.test.mjs`,
  `src/change/*` (board/change/close/git/orchestrator/session/trace/
  improvement-report/apply-gate), `src/graph/*`, `src/shared/*` — all
  pass unchanged.

Seams the plan did not explicitly list but the graph flagged as
possibly affected: `src/change/usage.ts`, `src/change/validation.ts`,
`src/shared/config.ts` — transitive neighbors of edited files; verified
clean by typecheck + the full suite (no behavior drift; none reference
the deleted exports).

The wiki removal's breaking CLI-surface change (`wiki.*` → unknown
command) is absorbed by the existing `INVALID_ARGUMENT` path inherited
from the prior `cli-input-ergonomics` Change — re-confirmed live above.

## Regressions

No surviving-interface behavior drift. Checks run beyond the changed
files: full `npm test` (151/151), `npm run build`, `npm run smoke:cli`
(exercises `bin/codepatrol.js` end-to-end), `npm run lint:skills`.
`codepatrol status` and `codepatrol next --stage verify` both return
valid JSON (CLI surface intact). `package.json` is valid JSON
(`JSON.parse` ok); `description` no longer contains "wiki"; `bin`
unchanged (`{"codepatrol":"./bin/codepatrol.js"}`).

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| `skills/codepatrol-plan/SKILL.md` | no (added in Apply) | accepted as journaled deviation — subtractive removal of a defunct "check wiki status" directive, consistent with spec risk #1 |
| `skills/codepatrol-apply/IMPLEMENTATION-FORMAT.md` | no (added in Apply) | accepted as journaled deviation — "graph/wiki/domain refresh" → "graph/domain refresh" |
| `skills/_shared/SPEC-FORMAT.md` | yes (T3 list) | matches; no deviation |

All 38 production paths are declared in the apply `changes` array; the
diff reconciles exactly (`git diff 185f0f9 HEAD` production paths = 44
total changed − 6 lifecycle artifacts = 38).

## Findings

No critical, major, or minor findings survive verification. Every
acceptance criterion is independently re-confirmed; the full gate is
green; the blast radius is fully covered by the passing suite; the
diff reconciles exactly with the declared candidate.

Repo-wide `wiki` survivors outside AC-3's grep scope: 3 lines in two
frozen historical assessment records
(`docs/codepatrol/assessments/2026-07-24-architecture-workflow.md:15,38`
and `…-architecture-v2.md:46`). These describe the wiki decision as it
stood at those baselines and are explicitly excluded by the spec's
Alternatives ("v1 is a historical record at its baseline"). Not a
defect.

## Residual risks and evidence gaps

- DC-1 (wiki removal deletes the subsystem outright, no soft-deprecation):
  trigger not activated — no consumer of `wiki.*` reported. Recoverable
  from Git history / the terminal tag.
- DC-2 (`docs/change-lifecycle.md` deleted rather than merged): trigger
  not activated. `skills/_shared/CHANGE.md` remains the canonical
  contract; the deleted copy is recoverable from Git history.
- Per-run provider tokens remain unmeasurable from this harness (same
  constraint recorded across this Change's Plan/Review/Apply runs) —
  recorded as `unavailable` with reason.
- The two historical-assessment `wiki` lines are intentional provenance
  exceptions, not dangling references to live code.

Rollback: revert the branch; the deleted tree is fully recoverable from
Git history and the Change's recoverable tag.

## Verdict

`commit`

The exact candidate (apply checkpoint `4bb5638` / tree `1b76373b`,
production-identical at HEAD) satisfies all five acceptance criteria on
independent re-execution, the full gate exits 0, the blast radius is
fully covered by the passing suite, and the diff reconciles exactly
with the declared production delta. The candidate is ready for Close.

Next Change transition:
`codepatrol-close 2026-07-24-project-structure-review commit|rollback on codepatrol/2026-07-24-project-structure-review`.
