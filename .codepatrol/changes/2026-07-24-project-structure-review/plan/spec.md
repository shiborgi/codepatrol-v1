# Specification — Lean and cohesive project structure: remove dead docs, dead bootstrap procedure, and the unadopted wiki subsystem

## Intent

- Origin: improve-codebase
- Mode: architecture
- Target baseline: `main` @ `185f0f9ad0ee136163cc14461e1b6a1231f0b633`; clean worktree; `npm run verify` green at baseline.
- Governing constraints: `CONTEXT.md` domain vocabulary; `AGENTS.md` sources-of-truth (`README.md` product contract, `skills/catalog.yaml` skill graph, `change.yaml` lifecycle truth); `docs/runtime-state.md`'s explicit rule that durable project decisions belong in `CONTEXT.md`, `docs/adr/`, or declared Change evidence — not `.codepatrol/`. No ADRs exist yet (`docs/adr/` absent). None block this design.
- Substrate state: graph synced (73 files, 1869 symbols); wiki absent (valid substrate state; also the subject of this Change).
- Improvement signals (most recent report `docs/codepatrol/improvement-reports/2026-07-24-uniform-stage-io.md`): none new beyond the recurring accepted transition-count cost already recorded.
- Problem: The maintainer asked for a leaner, more cohesive project structure, naming three concrete questions — is `bin/` needed, should assessment/ADR-style documents live under `.codepatrol/`, and does the wiki subsystem actually help — plus, mid-investigation, asked to evaluate every other `docs/*.md` file and remove the stale Qodo review report. Investigation with fresh evidence found: (1) `bin/codepatrol.js` is the real npm `bin` entry point — the globally installed `codepatrol` binary used throughout this project's own history resolves to it, and it is exercised by `smoke:cli`/`package-contract.test.mjs` — necessary, not removable; (2) `docs/QODO-REVIEW-REPORT.md` is entirely stale (every cited issue is already fixed or references a module renamed away, and it flags the *current required* `approve` verdict as a violation); (3) a "v1 bootstrap cutover" procedure is duplicated across `README.md`, `AGENTS.md`, `docs/change-lifecycle.md`, and `docs/smoke-tests.md`, describing migration from a `v1-release` branch and `.codepatrol/packages/`/`.codepatrol/workflows/` directories that do not exist in this repository (confirmed: no such branch, no such paths, package is `0.1.0`) — dead process documentation; (4) `docs/change-lifecycle.md` duplicates `skills/_shared/CHANGE.md` (the actively-referenced canonical contract) and has zero inbound references; (5) the wiki subsystem (`src/wiki/*`, 889 LOC, the `codebase-wiki` skill, four `wiki.*` CLI commands) is fully wired but has never been adopted — `wiki status` reports `exists:false` across the entire project history (~15 closed Changes) — and its removal was explicitly chosen over keeping it dormant or adopting it now.
- Outcome: `docs/QODO-REVIEW-REPORT.md` and `docs/change-lifecycle.md` are removed; the dead v1-bootstrap-cutover procedure is removed from the four files that describe it; the wiki subsystem is fully removed (code, CLI surface, skill, catalog entry, and every reference in shared contract docs and other skills); `bin/` and the `docs/codepatrol/assessments/` location are confirmed correct and left unchanged; the full gate stays green.

## Scope

### In scope

- Delete `docs/QODO-REVIEW-REPORT.md` (stale review report) and `docs/change-lifecycle.md` (duplicate of `skills/_shared/CHANGE.md`, zero inbound references).
- Remove the dead v1-bootstrap-cutover procedure from `README.md` (`## v1 bootstrap cutover` section), `AGENTS.md` (the sentence referencing it), and `docs/smoke-tests.md` (the "During the bootstrap branch only…" sentence). (`docs/change-lifecycle.md`'s own `## Bootstrap from v1` section is removed for free by deleting that file.)
- Remove the wiki subsystem in full:
  - Delete `src/wiki/` (7 files: `generate.ts`, `manifest.ts`, `record.ts`, `status.ts`, `types.ts`, `validate.ts`, `wiki.test.ts`).
  - Delete `skills/codebase-wiki/` (`SKILL.md`, `PAGE-FORMAT.md`).
  - Remove the four `wiki.*` CLI commands (`status`, `validate`, `generate`, `record`) and their wiring from `src/cli/commands.ts`, `src/cli/args.ts`, `src/cli/output.ts` (HELP text), and the one CLI test in `src/cli/cli.test.ts` that exercises them.
  - Remove `wikiManifestPath`/`wikiRoot` from `src/shared/state.ts` (used only by `src/wiki/*`); adjust the `src/shared/repo-files.ts` doc comment.
  - Remove the `codebase-wiki` entry from `skills/catalog.yaml` and its trigger from `execute-change`'s trigger list; remove `codebase-wiki` from `scripts/lint-skills.mjs`'s `executionProtocolSkills` set and the now-unused `"when-wiki-refresh-required"` trigger-name literal; remove `codebase-wiki` from `scripts/skills-contract.test.mjs`'s `support` skill list.
  - Remove the wiki-specific clauses from every skill/shared doc that mentions it: `skills/_shared/SPEC-FORMAT.md` (substrate-state line), `skills/_shared/EXECUTION.md` (wiki-write governance clauses), `skills/_shared/CODEPATROL-CLI.md` (the four `wiki …` command lines), `skills/execute-change/SKILL.md` (the `codebase-wiki` link), `skills/diagnose-bug/SKILL.md` (the `docs/wiki/` mental-model clause), `skills/research-technology/SKILL.md`, `skills/codepatrol-apply/SKILL.md`, `skills/assess-change/SKILL.md`, `skills/writing-plans/PLAN-FORMAT.md`, `skills/codepatrol-plan/MARKDOWN-REPORT.md`.
  - Remove the wiki section/lines from `README.md` (`## Graph and wiki` → graph-only; wiki tree lines; OKF-wiki sentence), the `<!-- codepatrol:wiki:begin -->…<!-- codepatrol:wiki:end -->` block from `AGENTS.md` (dead once nothing writes it), the wiki lines from `docs/runtime-state.md`, and the wiki mention from `package.json`'s `description`.
- Remove the entire dead "Bootstrap-only v1 runtime" block from `.gitignore` (lines 7-15: `.codepatrol/workflows/`, `.codepatrol/code-graph/`, `.codepatrol/locks/`, `.codepatrol/eval-runs/`, `.codepatrol/wiki/`, `.codepatrol/main-consolidation-*.json`, `.codepatrol/scan-overview.json`, `.codepatrol/version.json`, and their comment) — discovered during investigation: these are old v1 top-level paths distinct from and superseded by the current `.codepatrol/runtime/` (already ignored at line 6), part of the same dead v1-bootstrap rot as the sections named above, not a new decision.

### Out of scope

- Moving `docs/codepatrol/assessments/` (or any future ADRs) into `.codepatrol/` — investigated and confirmed **against**: `docs/runtime-state.md` explicitly scopes `.codepatrol/` to runtime cache plus per-Change artifacts and states durable project decisions belong in `docs/adr/`/`CONTEXT.md`/Change evidence; `docs/codepatrol/assessments/` already correctly lives in `docs/` and stays there. No file changes for this item; it is a confirmed-correct finding recorded in the plan output.
- Removing or relocating `bin/`: investigated and confirmed **necessary** (real npm `bin` entry, exercised by `smoke:cli`/`package-contract.test.mjs`, the actual resolution target of the installed `codepatrol` command). No file changes for this item.
- Any change to the Change lifecycle, orchestrator, graph subsystem, or non-wiki CLI commands.
- Any other assessment backlog item (N1–N4 from the v2 assessment) — separate Changes.

## Current evidence

- `bin/codepatrol.js` — 3-line npm bin shim; `package.json` `"bin": {"codepatrol": "./bin/codepatrol.js"}`; `which codepatrol` → `/opt/homebrew/bin/codepatrol` → resolves (readlink) to this repo's `bin/codepatrol.js`; exercised by `scripts/smoke-cli.mjs:14,21` and asserted by `scripts/package-contract.test.mjs:14`. Confidence: high (executed).
- `docs/QODO-REVIEW-REPORT.md` — cites `src/workflow/types.ts` (module renamed to `src/change/` — `ls src/workflow` → not found); flags orphan-lock as open (fixed, `src/shared/lock.ts:82-86` present); flags symlink dir/file bug as open (fixed, `linkTypeFor` in `scripts/install-lib.mjs:18`); flags `approve` verdict as a "violation" (it is the current required Review result, `src/change/orchestrator.ts:61`). Confidence: high (all re-verified against current tree).
- `docs/change-lifecycle.md` — 46 lines, overlapping content with `skills/_shared/CHANGE.md`; `grep -rln "change-lifecycle" README.md AGENTS.md skills/ docs/` → zero inbound references besides itself. Confidence: high.
- v1-bootstrap-cutover — `README.md:169-184` (`## v1 bootstrap cutover`, references `v1-release`, `.codepatrol/packages/`, `.codepatrol/workflows/`); `AGENTS.md:117-118`; `docs/change-lifecycle.md:40-46`; `docs/smoke-tests.md:44-45`. `git branch -a | grep v1-release` → none; `ls .codepatrol/packages` → not found; `package.json` version `0.1.0`. Confidence: high.
- Wiki adoption — `codepatrol wiki status --format json` → `exists:false` (re-checked live in this investigation); every prior Verify/assessment report recorded the same. `src/wiki/*` = 889 LOC across 6 source files + `wiki.test.ts` (246 lines). Confidence: high.
- Wiki import graph — `grep -rn "from .*wiki" src` → only `src/cli/commands.ts:4-7` imports `generateWiki`/`wikiRecord`/`wikiStatus`/`validateWiki` from outside `src/wiki/`; `wikiManifestPath`/`wikiRoot` (`src/shared/state.ts:13-18`) are consumed only within `src/wiki/*`. Confidence: high (full grep).
- Wiki CLI wiring — `src/cli/args.ts:46-49` (`COMMAND_OPTIONS` entries), `src/cli/commands.ts:108-124` (four `case "wiki.*"` branches), `src/cli/output.ts:57-60` (`HELP` lines), `src/cli/cli.test.ts:51-60` (one test, `"CLI wiki record remains recoverable beneath runtime state"`). Confidence: high.
- Wiki catalog/lint wiring — `skills/catalog.yaml:95-101` (`codebase-wiki` entry), `:125,132-133` (`execute-change`'s `mayInvoke`/`triggers` reference it); `scripts/lint-skills.mjs:8,32` (`executionProtocolSkills` set, `"when-wiki-refresh-required"` literal); `scripts/skills-contract.test.mjs:11` (`support` list). Confidence: high.
- Wiki mentions in other skill/shared docs — `skills/_shared/SPEC-FORMAT.md:14,30,84`; `skills/_shared/EXECUTION.md:3,19`; `skills/_shared/CODEPATROL-CLI.md:21-24`; `skills/execute-change/SKILL.md:28`; `skills/diagnose-bug/SKILL.md:45`; `skills/research-technology/SKILL.md:14`; `skills/codepatrol-apply/SKILL.md:32`; `skills/assess-change/SKILL.md:20`; `skills/writing-plans/PLAN-FORMAT.md:110`; `skills/codepatrol-plan/MARKDOWN-REPORT.md:12`. Confidence: high (full grep, each line read).
- Top-level doc/config wiki mentions — `README.md:34,44,125-140`; `AGENTS.md:121-126` (marker block, written by `src/wiki/record.ts:162-163`, locked by `src/wiki/wiki.test.ts:127` — both being deleted); `docs/runtime-state.md:7-8,16`; `package.json:5` (description); `.gitignore:12` (`.codepatrol/wiki/`, already redundant with `.codepatrol/runtime/` at line 6 — `wikiManifestPath` resolves under `runtime/wiki/`, not a top-level `.codepatrol/wiki/`). Confidence: high.
- Baseline: `npm run verify` exits 0 at `185f0f9` — established by the prior Change's Verify (and this Change's own dogfooded `next`/`summary` close).

## Proposed design

No architecture change — this is a bounded, evidence-driven deletion/documentation-consistency pass with five task groups, each owning disjoint files:

1. **Dead/duplicate docs**: delete `docs/QODO-REVIEW-REPORT.md` and `docs/change-lifecycle.md`.
2. **Wiki code removal**: delete `src/wiki/`; strip wiki wiring from `src/cli/{commands,args,output,cli.test}.ts` and `src/shared/state.ts`/`repo-files.ts`.
3. **Wiki skill/catalog removal**: delete `skills/codebase-wiki/`; strip references from `skills/catalog.yaml`, `scripts/lint-skills.mjs`, `scripts/skills-contract.test.mjs`, and the ten skill/shared docs that mention wiki incidentally.
4. **Top-level docs**: strip wiki sections from `README.md`, `AGENTS.md`, `docs/runtime-state.md`, `package.json`, `.gitignore`; remove the dead bootstrap-cutover section from `README.md`, `AGENTS.md`, `docs/smoke-tests.md`.
5. **Verification**: full gate + diff reconciliation.

Every removal is subtractive (delete code/prose that references something now gone); no new abstraction, module, or interface is introduced. `bin/` and `docs/codepatrol/assessments/` receive no file changes — their correctness is the outcome of investigation, recorded in the plan and journal.

## Alternatives

- **Keep the wiki dormant, just document it as optional/unadopted.** Rejected by the maintainer's explicit choice: zero adoption evidence across the project's full history outweighs the sunk cost of the 889 LOC; dormant-but-wired surface still has to be read, maintained, and reasoned about by every skill that mentions it.
- **Split into multiple Changes (docs-cleanup vs. wiki-removal).** Rejected by the maintainer's explicit choice: both are low-risk, mechanical, verifiable-by-grep-and-gate removals serving one outcome ("lean and cohesive structure"); one Change is more coherent than the lifecycle overhead of several for the same objective.
- **Move `docs/codepatrol/assessments/` into `.codepatrol/`.** Rejected: contradicts the project's own documented boundary (`docs/runtime-state.md`) between rebuildable/per-Change `.codepatrol/` state and durable cross-Change project knowledge in `docs/`.
- **Consolidate `docs/change-lifecycle.md` into `skills/_shared/CHANGE.md` instead of deleting.** Rejected: the two already say the same thing in different words with zero inbound references to the `docs/` copy; deleting is leaner than maintaining a merge.

## Simplicity decision

- Selected rung: direct local change — every task is a deletion or a subtractive edit removing dead/duplicate content; no new code.
- Earlier rungs: not applicable to a removal; the "rung" here is the amount of documentation/code kept, and the floor is "keep only what is live, accurate, and referenced."
- Irreducible complexity: none added. The removal itself requires care to leave no dangling reference to a deleted command, skill, or path — that is the task list's actual complexity, fully enumerated above.
- Safety floor: `npm run verify` stays green; no lifecycle/orchestrator/graph behavior changes; `codepatrol wiki *` becomes an unknown command (existing `INVALID_ARGUMENT` unknown-command path, already actionable per the prior CLI-ergonomics Change) rather than silently succeeding.
- Expected surface delta: **deleted** — `src/wiki/` (7 files), `skills/codebase-wiki/` (2 files), `docs/QODO-REVIEW-REPORT.md`, `docs/change-lifecycle.md`. **Modified** — `src/cli/{commands,args,output,cli.test}.ts`, `src/shared/state.ts`, `src/shared/repo-files.ts`, `skills/catalog.yaml`, `scripts/lint-skills.mjs`, `scripts/skills-contract.test.mjs`, `skills/_shared/{SPEC-FORMAT,EXECUTION,CODEPATROL-CLI}.md`, `skills/execute-change/SKILL.md`, `skills/diagnose-bug/SKILL.md`, `skills/research-technology/SKILL.md`, `skills/codepatrol-apply/SKILL.md`, `skills/assess-change/SKILL.md`, `skills/writing-plans/PLAN-FORMAT.md`, `skills/codepatrol-plan/MARKDOWN-REPORT.md`, `README.md`, `AGENTS.md`, `docs/runtime-state.md`, `docs/smoke-tests.md`, `package.json`, `.gitignore`. No new files, dependencies, config, or events.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | Wiki removal deletes the subsystem outright (no soft-deprecation window) | Any external consumer of `wiki.*` commands breaks immediately | A user reports depending on `wiki generate`/`wiki status` | Not expected for an unadopted, zero-external-consumer local CLI tool; if raised, restore from Git history/the recoverable tag |
| DC-2 | `docs/change-lifecycle.md` deleted rather than merged | Any nuance unique to its phrasing is lost | A future reader wants that specific wording | Recover from Git history; `skills/_shared/CHANGE.md` remains the canonical, actively-maintained contract |

## Compatibility and rollout

- Wiki removal is a breaking change to the CLI surface (`wiki status|validate|generate|record` stop existing) but there is no evidence of any consumer (zero adoption, local-only tool, no remote/shared usage). Rollback = revert the branch; the deleted tree is fully recoverable from Git history and the Change's recoverable tag. No security/privacy impact. Minor performance improvement (fewer files to type-check/build/lint). No accessibility impact.

## Risks and mitigations

- A dangling reference to a deleted command/skill/path survives in some doc. Mitigation: `grep -rn "wiki" .` (excluding historical `.codepatrol/changes/*` records and `node_modules`) must return zero hits outside this Change's own plan/evidence files before sealing; same technique for `QODO`/`change-lifecycle`/`v1-release`/`v1 bootstrap`.
- Removing `wikiManifestPath`/`wikiRoot` breaks a hidden caller. Mitigation: full-repo grep confirmed both are consumed only within `src/wiki/*`, which is deleted in the same task.
- `scripts/lint-skills.mjs` or `skills-contract.test.mjs` still expects `codebase-wiki` and fails after deletion. Mitigation: both are explicitly edited in task 3, with the full gate (`npm run lint:skills`, `npm test`) as the red/green check.
- Deleting `docs/change-lifecycle.md` removes information not actually present in `skills/_shared/CHANGE.md`. Mitigation: side-by-side comparison performed during investigation shows equivalent coverage (identity/events model, transition table, Git protocol, metrics); DC-2 records the recovery path if a gap is later found.

## Acceptance criteria

- AC-1: `docs/QODO-REVIEW-REPORT.md` and `docs/change-lifecycle.md` no longer exist, and no remaining file references either by name.
- AC-2: No `v1-release`/`v1 bootstrap cutover`/`.codepatrol/packages/`/`.codepatrol/workflows/` text remains in `README.md`, `AGENTS.md`, or `docs/smoke-tests.md`.
- AC-3: `src/wiki/` and `skills/codebase-wiki/` no longer exist; `codepatrol wiki status|validate|generate|record` are unknown commands (`INVALID_ARGUMENT`, exit 2); `grep -rn "wiki" src skills scripts README.md AGENTS.md docs/runtime-state.md docs/smoke-tests.md package.json .gitignore` (excluding `.codepatrol/changes/`) returns zero hits.
- AC-4: `bin/` is unchanged and confirmed necessary in the plan/journal record; `docs/codepatrol/assessments/` is unchanged and confirmed as the correct location in the plan/journal record — neither has a file diff.
- AC-5: `npm run verify` exits 0 on the candidate (enforced at Apply seal by `.codepatrol/config.json` `applyGate`).

## Decisions and open questions

- Decided (maintainer, this session): wiki subsystem removed entirely (not kept dormant, not adopted).
- Decided (maintainer, this session): all cleanup bundled into one Change rather than split by theme.
- Decided (maintainer, this session, mid-investigation): also remove `docs/QODO-REVIEW-REPORT.md`.
- Decided (Architect judgment, evidence-backed, not re-confirmed as a separate fork since it is a necessary consequence of the wiki-removal decision already made): every dangling reference to the removed wiki subsystem across shared/skill docs is cleaned up, not just the three items originally named (`codebase-wiki` skill, `wiki.*` commands, catalog entry) — otherwise those docs would be left factually wrong.
- Decided: `bin/` stays; `docs/codepatrol/assessments/` stays in `docs/`, not `.codepatrol/`.
- No open question can materially change scope, interfaces, or acceptance.
