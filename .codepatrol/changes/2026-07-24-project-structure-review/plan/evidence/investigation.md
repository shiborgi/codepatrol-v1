# Plan investigation evidence

Baseline: `main` @ `185f0f9ad0ee136163cc14461e1b6a1231f0b633`; branch `codepatrol/2026-07-24-project-structure-review`. Graph: 73 files, 1869 symbols.

## bin/ — confirmed necessary, no change

- `bin/codepatrol.js` (3 lines) — npm bin shim, `package.json`: `"bin": {"codepatrol": "./bin/codepatrol.js"}`.
- `which codepatrol` → `/opt/homebrew/bin/codepatrol`; `readlink` → this repo's `bin/codepatrol.js` (confirmed live, this session's own `codepatrol` invocations run through it).
- Exercised by `scripts/smoke-cli.mjs:14,21`; asserted by `scripts/package-contract.test.mjs:14`.

## docs/codepatrol/assessments/ location — confirmed correct, no change

- `docs/runtime-state.md:25-27`: "No root `.codepatrol` scratch JSON, global ledger, duplicate status cache, architecture namespace or durable ADR is supported. Durable project decisions belong in `CONTEXT.md`, `docs/adr/` or declared Change evidence." — `.codepatrol/` is scoped to runtime cache + per-Change artifacts; `docs/` is the designed home for durable cross-Change knowledge.

## docs/QODO-REVIEW-REPORT.md — confirmed 100% stale

- Cites `src/workflow/types.ts` — `ls src/workflow` → not found (renamed to `src/change/`).
- Flags orphan-lock as open — fixed: `src/shared/lock.ts:82-86` shows the `unlink` in the `catch` block.
- Flags symlink dir/file bug as open — fixed: `scripts/install-lib.mjs:18` `linkTypeFor` dispatches file vs dir.
- Flags `approve` verdict as a violation — it is the current required Review result: `src/change/orchestrator.ts:61` `review: "approve"`.
- Flags `docs/wiki/index.md` as missing/required — current design treats a missing wiki as valid (`AGENTS.md`), not a bug.

## Dead v1-bootstrap-cutover — confirmed dead

- `git branch -a | grep v1-release` → none.
- `ls .codepatrol/packages` → not found.
- `package.json` version `0.1.0` (single package, no dual v1/v2 state).
- Present in: `README.md:169-184`, `AGENTS.md:117-118`, `docs/change-lifecycle.md:40-46` (removed for free by deleting the file), `docs/smoke-tests.md:44-45`.
- `.gitignore:7-15` — an entire "Bootstrap-only v1 runtime" block (`.codepatrol/workflows/`, `.codepatrol/code-graph/`, `.codepatrol/locks/`, `.codepatrol/eval-runs/`, `.codepatrol/wiki/`, `.codepatrol/main-consolidation-*.json`, `.codepatrol/scan-overview.json`, `.codepatrol/version.json`) — old top-level v1 paths, superseded by `.codepatrol/runtime/` (line 6, current). Discovered during investigation; same rot class, folded into scope.

## docs/change-lifecycle.md — confirmed duplicate, zero refs

- `grep -rln "change-lifecycle" README.md AGENTS.md skills/ docs/` → no hits besides the file itself.
- Content overlaps `skills/_shared/CHANGE.md` (identity/events model, transition table, Git protocol, metrics) — the latter is the actively-referenced canonical contract (linked from every lifecycle skill).

## Wiki subsystem — confirmed zero adoption, full removal blast radius

- `codepatrol wiki status --format json` → `exists:false` (re-checked live).
- `src/wiki/*` = 7 files, 889 LOC (incl. 246-line `wiki.test.ts`).
- Import graph: only `src/cli/commands.ts:4-7` imports from `src/wiki/*` externally; `wikiManifestPath`/`wikiRoot` (`src/shared/state.ts:13-18`) consumed only within `src/wiki/*` (full grep, both confirmed).
- CLI wiring: `src/cli/args.ts:46-49`, `src/cli/commands.ts:108-124`, `src/cli/output.ts:57-60`, `src/cli/cli.test.ts:51-60`.
- Skill/catalog wiring: `skills/catalog.yaml:95-101,125,132-133`; `scripts/lint-skills.mjs:8,32`; `scripts/skills-contract.test.mjs:11`.
- Incidental mentions in shared/skill docs (functional — reference deleted commands/skill, must be fixed to avoid dangling refs): `skills/_shared/SPEC-FORMAT.md:14,30,84`; `skills/_shared/EXECUTION.md:3,19`; `skills/_shared/CODEPATROL-CLI.md:21-24`; `skills/execute-change/SKILL.md:28`; `skills/diagnose-bug/SKILL.md:45`; `skills/research-technology/SKILL.md:14`; `skills/codepatrol-apply/SKILL.md:32`; `skills/assess-change/SKILL.md:20`; `skills/writing-plans/PLAN-FORMAT.md:110`; `skills/codepatrol-plan/MARKDOWN-REPORT.md:12`.
- Top-level: `README.md:34,44,125-140`; `AGENTS.md:121-126` (marker block written by `src/wiki/record.ts:162-163`, locked by `src/wiki/wiki.test.ts:127` — both deleted); `docs/runtime-state.md:7-8,16`; `package.json:5`.
- `CONTEXT.md` and `docs/smoke-tests.md` — confirmed zero wiki mentions (clean already).

## Baseline health

- `npm run verify` exit 0 at `185f0f9` — established by the prior Change's Verify (dogfooded commit+push close).
