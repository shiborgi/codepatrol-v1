# Plan — Lean and cohesive project structure: remove dead docs, dead bootstrap procedure, and the unadopted wiki subsystem

- Work id: `2026-07-24-project-structure-review`
- Governing spec: `spec.md`
- Target baseline: `main` @ `185f0f9ad0ee136163cc14461e1b6a1231f0b633`; clean worktree; `npm run verify` green.

## Goal and approach

Five disjoint-file task groups, each a subtractive edit (delete dead/duplicate docs; delete the wiki subsystem; delete the wiki skill and its catalog/lint wiring; strip wiki and dead-bootstrap content from top-level docs/config; verify). No new abstractions. `bin/` and `docs/codepatrol/assessments/` are confirmed correct and untouched — recorded, not diffed.

## Global constraints

- Every deletion/edit must leave zero dangling reference (no mention of a removed command, skill, file, or branch anywhere outside historical `.codepatrol/changes/*` records, which are immutable Change history and not touched).
- No lifecycle, orchestrator, graph, or non-wiki CLI behavior changes.
- Gate that must stay green: `npm run typecheck && npm test && npm run build && npm run smoke:cli && npm run lint:skills`.
- Final grep checks (case-sensitive, whole repo minus `node_modules`, `dist`, `.codepatrol/changes/`) must return zero hits for: `wiki` (outside this Change's own `.codepatrol/changes/2026-07-24-project-structure-review/`), `QODO`, `change-lifecycle`, `v1-release`, `v1 bootstrap`.

## Simplicity proof

- Selected rung: direct local change — pure deletion/subtraction, no new code.
- Reused capabilities: none needed (removal only).
- Forbidden speculative surface: no soft-deprecation shim for `wiki.*` commands; no partial keep-for-later of any deleted file.
- Expected surface delta: deletes `src/wiki/` (7 files), `skills/codebase-wiki/` (2 files), `docs/QODO-REVIEW-REPORT.md`, `docs/change-lifecycle.md`; modifies the ~22 files enumerated in the spec's Simplicity decision.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T1 | files absent; `grep -rln "QODO\|change-lifecycle"` (excl. `.codepatrol/changes/`) → empty |
| AC-2 | T4 | `grep -rln "v1-release\|v1 bootstrap\|codepatrol/packages\|codepatrol/workflows"` README.md AGENTS.md docs/smoke-tests.md → empty |
| AC-3 | T2, T3 | `src/wiki`/`skills/codebase-wiki` absent; `codepatrol wiki status` → exit 2 `INVALID_ARGUMENT`; repo-wide `wiki` grep (per Global constraints) → empty |
| AC-4 | (none — no-op, recorded in journal) | `git diff --stat` shows no changes under `bin/` or `docs/codepatrol/assessments/` |
| AC-5 | T5 | `npm run verify` exits 0 |

## Dependency order

`T1`, `T2`, `T4` (`.gitignore`/`package.json`/`README.md`/`AGENTS.md`/`docs/runtime-state.md`/`docs/smoke-tests.md`) have no file overlap and may run in any order. `T3` depends on `T2` (deletes `skills/codebase-wiki/` and edits catalog/lint files that reference the CLI commands `T2` removes, and edits several of the same shared skill docs `T4` does not touch — no overlap with T4's file set). Sequence: `T1 → T2 → T3 → T4 → T5` (sequential is simplest given the shared full-repo grep check happens once, in T5).

### T1 — Delete stale and duplicate top-level docs

**Purpose:** Satisfies AC-1.

**Depends on:** None

**Files:**

- Delete: `docs/QODO-REVIEW-REPORT.md`
- Delete: `docs/change-lifecycle.md`

**Steps:**

1. Delete both files.
2. `grep -rln "QODO\|change-lifecycle" . --include='*.md' --include='*.ts' --include='*.mjs' --include='*.json' 2>/dev/null | grep -v node_modules | grep -v '.codepatrol/changes/'` → expect empty (no inbound references existed per investigation; confirms no new ones were added since).

**Task result:** append to `apply/journal.md`.

### T2 — Delete the wiki subsystem code and its CLI wiring

**Purpose:** Satisfies AC-3 (code half).

**Depends on:** None

**Files:**

- Delete: `src/wiki/generate.ts`, `src/wiki/manifest.ts`, `src/wiki/record.ts`, `src/wiki/status.ts`, `src/wiki/types.ts`, `src/wiki/validate.ts`, `src/wiki/wiki.test.ts`
- Modify: `src/cli/commands.ts` — remove the 4 wiki imports (lines 4-7) and the 4 `case "wiki.*"` branches (`status`, `validate`, `generate`, `record`)
- Modify: `src/cli/args.ts` — remove `["wiki.status", …]`, `["wiki.validate", …]`, `["wiki.generate", …]`, `["wiki.record", …]` from `COMMAND_OPTIONS`
- Modify: `src/cli/output.ts` — remove the four `wiki …` lines from `HELP`
- Modify: `src/cli/cli.test.ts` — remove the `"CLI wiki record remains recoverable beneath runtime state"` test
- Modify: `src/shared/state.ts` — remove `wikiManifestPath` and `wikiRoot`
- Modify: `src/shared/repo-files.ts` — update the doc comment ("shared by the graph and wiki core" → "shared by the graph") to no longer reference wiki

**Interfaces:**

- Removes: `generateWiki`, `wikiRecord`, `wikiStatus`, `validateWiki` (consumed only by `src/cli/commands.ts`, confirmed by full grep), `wikiManifestPath`, `wikiRoot` (consumed only within `src/wiki/*`, confirmed by full grep).
- Invariants: `codepatrol wiki *` now falls through to the existing unknown-command path (`INVALID_ARGUMENT`, exit 2, with the known-commands suggestion added by the prior CLI-ergonomics Change).

**Steps:**

1. Delete the 7 `src/wiki/*` files.
2. Edit `src/cli/commands.ts`: remove the 4 imports and the 4 `case` branches.
3. Edit `src/cli/args.ts`: remove the 4 `COMMAND_OPTIONS` entries.
4. Edit `src/cli/output.ts`: remove the 4 `HELP` lines.
5. Edit `src/cli/cli.test.ts`: remove the wiki test block.
6. Edit `src/shared/state.ts`: remove the two functions.
7. Edit `src/shared/repo-files.ts`: adjust the comment.
8. Run `node --test --import jiti/register src/cli/cli.test.ts`. Expected green (no wiki test remains; other CLI tests unaffected).
9. Run `npm run typecheck`. Expected clean (confirms no remaining reference to the deleted exports anywhere in `src`).
10. Run `codepatrol wiki status --format json` manually against this repo (or via a CLI test already covering unknown-command behavior) — expect exit 2, `INVALID_ARGUMENT`.

**Task result:** append to `apply/journal.md`.

### T3 — Delete the wiki skill and its catalog/lint/skill-doc references

**Purpose:** Satisfies AC-3 (skill/catalog half).

**Depends on:** T2 (removes the CLI commands these docs reference)

**Files:**

- Delete: `skills/codebase-wiki/SKILL.md`, `skills/codebase-wiki/PAGE-FORMAT.md`
- Modify: `skills/catalog.yaml` — remove the `codebase-wiki:` entry (lines 95-101); remove `codebase-wiki` from `execute-change`'s `mayInvoke` list and its `- target: codebase-wiki / when: when-wiki-refresh-required` trigger
- Modify: `scripts/lint-skills.mjs` — remove `"codebase-wiki"` from `executionProtocolSkills`; remove `"when-wiki-refresh-required"` from `ALLOWED_TRIGGER_WHEN`
- Modify: `scripts/skills-contract.test.mjs` — remove `"codebase-wiki"` from the `support` list
- Modify: `skills/_shared/SPEC-FORMAT.md` — simplify the substrate-state line/prose to drop the wiki clause (keep graph revision)
- Modify: `skills/_shared/EXECUTION.md` — remove the wiki-write governance clauses ("and every wiki write"; "never write the wiki")
- Modify: `skills/_shared/CODEPATROL-CLI.md` — remove the 4 `codepatrol wiki …` lines
- Modify: `skills/execute-change/SKILL.md` — remove the `[codebase-wiki](../codebase-wiki/SKILL.md)` reference (keep the domain-modeling reference)
- Modify: `skills/diagnose-bug/SKILL.md` — remove the `docs/wiki/` mental-model clause (keep the `CONTEXT.md`/ADR clause)
- Modify: `skills/research-technology/SKILL.md` — remove the wiki mention from the recovery-sources line
- Modify: `skills/codepatrol-apply/SKILL.md` — remove `wiki/` from the "graph/wiki/domain artifacts" phrase
- Modify: `skills/assess-change/SKILL.md` — remove the wiki mention from its list
- Modify: `skills/writing-plans/PLAN-FORMAT.md` — remove `wiki/` from "graph and refreshes affected wiki/domain artifacts"
- Modify: `skills/codepatrol-plan/MARKDOWN-REPORT.md` — remove `wiki` from "graph/wiki state"

**Steps:**

1. Delete `skills/codebase-wiki/` (both files).
2. Edit `skills/catalog.yaml` per above.
3. Edit `scripts/lint-skills.mjs` per above.
4. Edit `scripts/skills-contract.test.mjs` per above.
5. Edit each of the 10 remaining listed files, removing only the wiki-specific clause/word and preserving surrounding meaning (e.g. "graph/wiki/domain artifacts" → "graph/domain artifacts"; "Recover from … wiki, current Stage Session" → "Recover from … current Stage Session").
6. Run `node --test --import jiti/register scripts/skills-contract.test.mjs`. Expected green.
7. Run `npm run lint:skills`. Expected: `Skill catalog, frontmatter, dependencies, portability, and relative links are valid.` (confirms the catalog and every relative link — including the now-removed `codebase-wiki` links — are consistent).

**Task result:** append to `apply/journal.md`.

### T4 — Strip wiki and dead-bootstrap content from top-level docs/config

**Purpose:** Satisfies AC-2 and the remainder of AC-3 (top-level doc half).

**Depends on:** None (disjoint from T1/T2/T3's files)

**Files:**

- Modify: `README.md` — remove `## v1 bootstrap cutover` section entirely; in the directory tree, remove the `wiki/{manifest.json,transactions/}` line; remove "the generated OKF wiki lives in `docs/wiki/`" (keep the ADR clause); in `## Graph and wiki`, rename to `## Graph`, remove the three `codepatrol wiki …` lines and the paragraph about wiki freshness/transaction state and `docs/wiki/`
- Modify: `AGENTS.md` — remove the sentence "The v1-release bootstrap cutover in `README.md` requires independent Verify and a separate explicit user instruction; Apply must not execute it." (keep the surrounding Apply/Verify/Close sentences); remove the `<!-- codepatrol:wiki:begin -->` … `<!-- codepatrol:wiki:end -->` block (including the `## Project wiki` heading and its two sentences)
- Modify: `docs/runtime-state.md` — remove `wiki/manifest.json` and `wiki/transactions/` from the code block; change "The graph and wiki manifest are caches" to "The graph cache is rebuildable" (or equivalent graph-only phrasing)
- Modify: `docs/smoke-tests.md` — remove "During the bootstrap branch only, historical v1 paths may remain for later explicitly authorized cutover." (keep the preceding sentence about durable Changes/ADRs/no root scratch JSON)
- Modify: `package.json` — remove ", wiki," from the `description` field
- Modify: `.gitignore` — remove lines 7-15 (the "Bootstrap-only v1 runtime" comment and its 8 entries: `.codepatrol/workflows/`, `.codepatrol/code-graph/`, `.codepatrol/locks/`, `.codepatrol/eval-runs/`, `.codepatrol/wiki/`, `.codepatrol/main-consolidation-*.json`, `.codepatrol/scan-overview.json`, `.codepatrol/version.json`); keep line 6 (`.codepatrol/runtime/`) and line 16 (`docs/codepatrol/improvement-reports/`)

**Steps:**

1. Edit each file per above.
2. Run `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` to confirm `package.json` stays valid JSON.
3. `git status --porcelain` should show no untracked files newly un-ignored by the `.gitignore` edit (the removed patterns cover only dead v1 paths that do not exist in the working tree).

**Task result:** append to `apply/journal.md`.

### T5 — Final verification and reconciliation

**Purpose:** Confirms AC-5 and whole-Change integrity, including AC-4 (the no-op `bin/`/`docs/codepatrol/assessments/` confirmation).

**Depends on:** T1, T2, T3, T4

**Files:**

- Modify: none (verification only)

**Steps:**

1. Run the repo-wide grep checks from Global constraints (`wiki`, `QODO`, `change-lifecycle`, `v1-release`, `v1 bootstrap`) — expect zero hits outside `.codepatrol/changes/2026-07-24-project-structure-review/`.
2. Run the full gate: `npm run verify`. Expected exit 0 (also enforced at the Apply `implemented` checkpoint by `.codepatrol/config.json` `applyGate`).
3. `git diff --stat` vs base `185f0f9`: confirm `bin/` and `docs/codepatrol/assessments/` show no changes (AC-4); confirm the changed-file list matches exactly the deletions/modifications enumerated across T1-T4 with no undeclared work.
4. Reconcile actual surface delta with the spec forecast; explain any difference in the journal.
5. Record whether any `DC-N` trigger activated (expected: none).
6. Run `codepatrol graph sync`; confirm `codepatrol wiki status` is now an unknown command (no wiki substrate check applies going forward).
7. State rollback (revert branch; the deleted tree is fully recoverable from Git history/the recoverable tag) and residual risks (DC-1, DC-2).

**Task result:** append the final reconciliation to `apply/journal.md`.
