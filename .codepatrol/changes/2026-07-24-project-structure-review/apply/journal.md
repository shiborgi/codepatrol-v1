# Implementation — Lean and cohesive project structure: remove dead docs, dead bootstrap procedure, and the unadopted wiki subsystem

- Package revision: 1
- Approval: `review.md` verdict approve
- Target start ref: 185f0f9ad0ee136163cc14461e1b6a1231f0b633
- Actor: codepatrol-apply
- Status: implemented

## Baseline reconciliation

Artifact validation result: passed. Target drift checked: working tree clean at 185f0f9. Conclusion: ready.

### T1 — Delete stale and duplicate top-level docs

- Claim/workflow item: T1
- Started: 2026-07-24T22:20:00Z
- Files changed: deleted `docs/QODO-REVIEW-REPORT.md`, `docs/change-lifecycle.md`
- Simplicity check: pure deletion.
- Surface delta: 2 files removed.
- Red evidence: N/A (deletion)
- Green evidence: `grep` verified no inbound references existed in source files.
- Assessment: successful deletion of dead docs.
- Result: complete

### T2 — Delete the wiki subsystem code and its CLI wiring

- Claim/workflow item: T2
- Started: 2026-07-24T22:25:00Z
- Files changed: deleted `src/wiki/*`, modified `src/cli/commands.ts`, `src/cli/args.ts`, `src/cli/output.ts`, `src/cli/cli.test.ts`, `src/shared/state.ts`, `src/shared/repo-files.ts`
- Simplicity check: pure deletion of code paths.
- Surface delta: 7 files removed, CLI `wiki` bindings stripped, states stripped.
- Red evidence: N/A (deletion)
- Green evidence: `node --import jiti/register src/cli/main.ts wiki status` returns `INVALID_ARGUMENT` cleanly indicating dead commands are pruned. Tests and typechecks pass.
- Assessment: wiki subsystem entirely untangled from codebase architecture.
- Result: complete

### T3 — Delete the wiki skill and its catalog/lint/skill-doc references

- Claim/workflow item: T3
- Started: 2026-07-24T22:30:00Z
- Files changed: deleted `skills/codebase-wiki/*`, modified `skills/catalog.yaml`, `scripts/lint-skills.mjs`, `scripts/skills-contract.test.mjs`, `skills/_shared/SPEC-FORMAT.md`, `skills/_shared/EXECUTION.md`, `skills/_shared/CODEPATROL-CLI.md`, `skills/execute-change/SKILL.md`, `skills/diagnose-bug/SKILL.md`, `skills/research-technology/SKILL.md`, `skills/codepatrol-apply/SKILL.md`, `skills/assess-change/SKILL.md`, `skills/writing-plans/PLAN-FORMAT.md`, `skills/codepatrol-plan/MARKDOWN-REPORT.md`
- Simplicity check: pure deletion of code paths and specific references.
- Surface delta: `skills/codebase-wiki` removed entirely. Cleaned up all other skills and scripts to ensure no dangling wiki references.
- Red evidence: N/A (deletion)
- Green evidence: `node --test --import jiti/register scripts/skills-contract.test.mjs` and `npm run lint:skills` both completed successfully indicating valid links and contract.
- Assessment: wiki subsystem entirely untangled from agent workflows and docs.
- Result: complete

### T4 — Strip wiki and dead-bootstrap content from top-level docs/config

- Claim/workflow item: T4
- Started: 2026-07-24T22:28:00Z
- Files changed: `README.md`, `AGENTS.md`, `docs/runtime-state.md`, `docs/smoke-tests.md`, `package.json`, `.gitignore`, `skills/codepatrol-plan/SKILL.md`, `skills/codepatrol-apply/IMPLEMENTATION-FORMAT.md`, `skills/_shared/SPEC-FORMAT.md`
- Simplicity check: pure deletion of wiki and dead-bootstrap prose from top-level docs/config + skill directives.
- Surface delta: 6 forecast files + 3 additional cleanup files (skill directives that referenced defunct `wiki status` directive or generic "graph/wiki/domain" template phrases). All edits are subtractive.
- Red evidence: N/A (deletion)
- Green evidence:
  - `package.json` stays valid JSON (confirmed with `node -e "JSON.parse(...)"`).
  - `git status --porcelain` shows no spurious untracked files from `.gitignore` edit.
  - `grep -n "v1-release\|v1 bootstrap"` on `README.md`, `AGENTS.md`, `docs/smoke-tests.md` returns empty.
  - `grep -rn "wiki"` on `src`, `skills`, `scripts`, `README.md`, `AGENTS.md`, `docs/runtime-state.md`, `docs/smoke-tests.md`, `package.json`, `.gitignore` returns empty (AC-3 scope).
- Assessment: Top-level docs are now wiki-free. The plan's T4 forecast was extended with 3 additional files (`skills/codepatrol-plan/SKILL.md`, `skills/codepatrol-apply/IMPLEMENTATION-FORMAT.md`, `skills/_shared/SPEC-FORMAT.md`) where I found leftover wiki directives during implementation — same dangling-reference intent as T3, fully consistent with the spec's Plan risk #1 mitigation.
- Result: complete

### T5 — Final verification and reconciliation

- Claim/workflow item: T5
- Started: 2026-07-24T22:33:00Z
- Files changed: none (verification only)
- Simplicity check: read-only.
- Surface delta: 0 file operations. Verified `bin/` and `docs/codepatrol/assessments/` show no changes (AC-4); `git diff --stat 185f0f9` shows exactly the planned 11 deletes + 27 modifies (the +3 modifies beyond the spec's forecast are documented in T4).
- Repo-wide grep checks (excluding `.codepatrol/changes/`, `.codepatrol/runtime/`, `.opencode/`, `.claude/`, `node_modules/`, `dist/`, `.git/`):
  - `wiki`: zero hits in source/docs/skills/scripts/top-level. Two matches in `docs/codepatrol/assessments/{v1,v2}-*.md` — these are frozen historical records (v1: "F7 — Wiki subsystem unused"; v2: "F7 (Wiki adoption)" dispositioned) that correctly describe what was true at their respective baselines. The spec's Alternatives section explicitly rejects amending v1 in place ("v1 is a historical record at its baseline"); v2 is similarly a frozen record. These are intentional exceptions and are NOT in AC-3's grep scope (which lists `src`, `skills`, `scripts`, `README.md`, `AGENTS.md`, `docs/runtime-state.md`, `docs/smoke-tests.md`, `package.json`, `.gitignore` — excludes `docs/codepatrol/assessments/`). Documented here per the spec's spirit of "zero dangling reference" while preserving provenance.
  - `QODO`: zero hits.
  - `change-lifecycle`: zero hits.
  - `v1-release`: zero hits.
  - `v1 bootstrap`: zero hits.
- Full gate: `npm run verify` exit 0 (typecheck + 151 tests + build + smoke:cli + lint:skills). Test count dropped from 167 → 151 because `src/wiki/wiki.test.ts` (16 tests) was deleted along with the wiki subsystem. The `cli.test.ts` wiki test (1 test) was also deleted; net delta is −16 from wiki removal.
- `codepatrol graph sync` → 66 files, 1640 symbols (down from 73 files, 1886 symbols at the prior Change's Verify; −7 files = the 7 deleted `src/wiki/*`).
- `codepatrol wiki status` → exit 2 with `INVALID_ARGUMENT` and the known-commands suggestion (inherited from the prior `cli-input-ergonomics` Change's unknown-command path). Confirmed working.
- Rollback: revert the branch; the deleted tree is fully recoverable from Git history and the recoverable tag.
- Residual risks: DC-1 (wiki removal deletes the subsystem outright; zero adoption evidence; recoverable from Git history); DC-2 (`docs/change-lifecycle.md` deleted rather than merged; recoverable from Git history, `skills/_shared/CHANGE.md` remains the canonical contract). The two wiki mentions in the historical assessment docs are intentional exceptions per the Alternatives section.
- Result: complete

## Final verification

- Affected checks run: `cli.test.ts`, `change.test.ts`, `orchestrator-parallel.test.ts`, `board.test.ts`, `apply-gate*.test.ts`, `close-push.test.ts`, `close-integration.test.ts`, `git.test.ts`, `session.ts`, `improvement-report.test.ts`, `skills-contract.test.mjs`, `package-contract.test.mjs`, `npm run typecheck`, `npm run build`, `npm run smoke:cli`, `npm run lint:skills`.
- Full gate: `npm run verify` ran and passed (exit 0; 151 tests, 0 fail).
- Graph refreshed via `codepatrol graph sync`. Wiki status is now an unknown command (no wiki substrate check applies going forward).
- Residual risks: DC-1 (wiki removal deletes the subsystem outright); DC-2 (`docs/change-lifecycle.md` deleted rather than merged); the two wiki mentions in `docs/codepatrol/assessments/{v1,v2}-*.md` are intentional exceptions (frozen historical records).
- Rollback: Revert the branch.

## Surface delta

All deletions match the spec's forecast exactly:
- `docs/QODO-REVIEW-REPORT.md`, `docs/change-lifecycle.md` (T1; 2 deletes)
- `src/wiki/{generate,manifest,record,status,types,validate}.ts`, `src/wiki/wiki.test.ts` (T2; 7 deletes)
- `skills/codebase-wiki/{SKILL.md, PAGE-FORMAT.md}` (T3; 2 deletes)

Modifications match the spec's forecast with three additional cleanups driven by the spec's "zero dangling reference" intent (Plan risk #1):
- T2 forecast (6 files): `src/cli/commands.ts`, `src/cli/args.ts`, `src/cli/output.ts`, `src/cli/cli.test.ts`, `src/shared/state.ts`, `src/shared/repo-files.ts` — all delivered.
- T3 forecast (13 files): `skills/catalog.yaml`, `scripts/lint-skills.mjs`, `scripts/skills-contract.test.mjs`, `skills/_shared/{SPEC-FORMAT,EXECUTION,CODEPATROL-CLI}.md`, `skills/{execute-change,diagnose-bug,research-technology,codepatrol-apply,assess-change}/SKILL.md`, `skills/writing-plans/PLAN-FORMAT.md`, `skills/codepatrol-plan/MARKDOWN-REPORT.md` — all delivered.
- T4 forecast (6 files): `README.md`, `AGENTS.md`, `docs/runtime-state.md`, `docs/smoke-tests.md`, `package.json`, `.gitignore` — all delivered.
- Additional cleanups (3 files, beyond spec forecast but consistent with the spec's "zero dangling reference" intent and AC-3's strict grep scope):
  - `skills/codepatrol-plan/SKILL.md` — removed the defunct "check wiki status" directive (Plan skill's brownfield Change instructions).
  - `skills/codepatrol-apply/IMPLEMENTATION-FORMAT.md` — changed "graph/wiki/domain refresh" to "graph/domain refresh" in the Final verification section template.
  - `skills/_shared/SPEC-FORMAT.md` — changed "code, graph, wiki, runtime, ..." to "code, graph, runtime, ..." in the Current evidence template.

No unforecasted dependencies, config, or events added. No DC-N triggers activated.
