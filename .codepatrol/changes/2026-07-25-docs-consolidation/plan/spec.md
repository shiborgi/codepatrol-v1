# Specification — Revalidate `docs/` and `.codepatrol/` artifacts: fold open follow-ups into the backlog, consolidate the rebuildable mirror under `.codepatrol/docs/`

## Intent

- Origin: improve-codebase
- Mode: architecture
- Target baseline: `main` @ `9cf610d961294a0c00baa8464d79f2f950c16783`; clean worktree; `npm run verify` green (175 tests) at baseline.
- Governing constraints: `docs/runtime-state.md:23-25` currently prohibits an "architecture namespace" and frames only `.codepatrol/runtime/` as ignored/rebuildable state; `AGENTS.md:64-65` states ignored state "lives only in `.codepatrol/runtime/`". `docs/codepatrol/assessments/` (git-tracked) is a live, present-tense violation of the first rule — not hypothetical. This Change resolves the contradiction by removing the namespace (after extracting its open work to the backlog) rather than further widening the exception, and **amends both governing docs (T1)** to sanction the one new path this Change does introduce (`.codepatrol/docs/`), following the exact precedent `2026-07-24-backlog-subsystem` set for `.codepatrol/backlog/`.
- Substrate state: graph synced at baseline (70 files, 1814 symbols).
- Improvement signals (most recent report `docs/codepatrol/improvement-reports/2026-07-24-backlog-subsystem.md`, mtime-latest):
  - "Top error code: INVALID_ARGUMENT (8). Investigate the first occurrence's args and stage context."
  - "Command \"change.transition\" was invoked 52 times — consider caching or batching repeated invocations." (Both are pre-existing open backlog items, unrelated to this Change's scope — not actioned here.)
- Problem: `docs/` and `.codepatrol/` have accumulated artifacts from prior Changes without a settled home. Two git-tracked architecture-assessment documents (`docs/codepatrol/assessments/`) sit in a namespace the project's own governing doc says is unsupported, and their four still-open findings (N1–N4) exist only as static prose no lifecycle command surfaces — exactly the gap the backlog subsystem was built to close. Separately, the per-Change improvement-report mirror (`docs/codepatrol/improvement-reports/*.md`, 11 files) is gitignored, rebuildable, redundant with its durable source (`.codepatrol/changes/<id>/close/improvement-report.md`), and physically misplaced under the human-facing `docs/` tree instead of alongside the tool's other own state under `.codepatrol/`.
- Outcome: `docs/codepatrol/assessments/*.md` no longer exists in the working tree (fully recoverable via Git history); its four open findings are queryable backlog items (already added and committed this Plan session). The improvement-report mirror is written to and read from `.codepatrol/docs/improvement-reports/<work-id>.md` instead of `docs/codepatrol/improvement-reports/<work-id>.md`, with every code, test, `.gitignore`, and skill reference updated in lockstep. `AGENTS.md` and `docs/runtime-state.md` explicitly sanction `.codepatrol/docs/` as gitignored, rebuildable local-mirror state, resolving both the "architecture namespace" and "ignored state lives only in `.codepatrol/runtime/`" contradictions.

## Scope

### In scope

- **Governing-doc amendment (T1):** `AGENTS.md:64-65` and `docs/runtime-state.md` explicitly sanction `.codepatrol/docs/` as gitignored, rebuildable local-mirror state (parallel structure to the existing `.codepatrol/runtime/` and `.codepatrol/backlog/` paragraphs).
- **Relocate the improvement-report mirror (T2):** `src/change/improvement-report.ts`'s `mirrorImprovementReport` writes to `.codepatrol/docs/improvement-reports/<work-id>.md`; `src/change/orchestrator.ts`'s two Close-recovery path references follow; `.gitignore` ignores `.codepatrol/docs/` instead of `docs/codepatrol/improvement-reports/`; every test fixture that writes a scratch-repo `.gitignore` string is updated to match (7 files, listed in `plan/evidence/investigation.md`); `skills/codepatrol-plan/SKILL.md`'s brownfield-report instruction points at the new path.
- **Remove the assessments namespace (T3):** delete `docs/codepatrol/assessments/2026-07-24-architecture-v2.md` and `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md`, whose only open content (v2's N1–N4) is already captured as backlog items `unsafe-duplicate-yaml-reader-in-improvement-report-ts-bypasses-migraterecord-normalization` (p1), `orchestrator-transitionchangelocked-is-dense-and-mixes-validation-persona-semantics-and-storage-responsibilities` (p2), `core-module-test-coverage-gaps-atomic-store-ts-graph-languages-ts-graph-queries-ts-lack-dedicated-tests` (p2), and `dead-taxonomy-unused-error-codes-artifact-invalid-and-workflow-in-errors-ts` (p3) — added and committed (`4dc367e`) during this Plan's investigation.
- **Final verification (T4).**

### Out of scope

- Actually fixing any of the four backlog items N1–N4 (dead error codes, orchestrator density, test-coverage gaps, the duplicate YAML reader) — deferred to whichever future Change picks them off the backlog (DC-1).
- Creating `docs/adr/` or migrating any decision into it — no ADR currently exists to migrate; the directory stays lazily-created per `skills/domain-modeling/SKILL.md:30` (DC-2).
- Any change to the *durable* per-Change artifacts under `.codepatrol/changes/<id>/` (spec/plan/review/apply/verify/close) — those are the sole durable lifecycle record per `skills/_shared/CHANGE.md` and are explicitly out of this Change's remit; none of the 16 existing Change directories are touched.
- Any change to `docs/runtime-state.md`'s or `AGENTS.md`'s existing backlog-related text, the backlog module, or the backlog CLI — `2026-07-24-backlog-subsystem` already delivered and closed that surface; this Change only adds the `.codepatrol/docs/` paragraph alongside it.
- Renaming or restructuring `docs/runtime-state.md` or `docs/smoke-tests.md` themselves — both are genuine hand-authored narrative docs, correctly placed, out of scope.

## Current evidence

(All read this investigation on the working tree at base `9cf610d`; full detail in `plan/evidence/investigation.md`.)

- `git ls-files docs/codepatrol/` → only the two assessment files are tracked; `git check-ignore -v docs/codepatrol/improvement-reports/*.md` confirms the mirror directory is ignored via `.gitignore:7`. Confidence: high (direct commands).
- `docs/runtime-state.md:23-25` prohibits an "architecture namespace"; `docs/codepatrol/assessments/` is exactly that, tracked, present. Confidence: high (read).
- `docs/codepatrol/assessments/2026-07-24-architecture-v2.md`'s "v1 Reconciliation" table resolves all 7 of v1's findings (delivered/accepted/deferred/subsumed-into-v2); v2's own 4 new findings (N1–N4) are the only currently-open work in either document. Confidence: high (read both in full).
- `grep -rln "assessments" scripts/ src/` → zero hits; no code depends on the assessments path. Confidence: high (grep).
- `src/change/improvement-report.ts:216-221` `mirrorImprovementReport` — the only production write site for the mirror path. Confidence: high (read).
- `src/change/orchestrator.ts:369-370` — Close's idempotent-recovery branch references the mirror path twice, in an allowlist pattern pre-dating this Change (the mirror was always meant to be gitignored; only its physical location moves). Confidence: high (read).
- 11 usage sites across `src/change/*.test.ts` (7 distinct files, 2 files with a repeated identical string) plus `skills/codepatrol-plan/SKILL.md:31` and `.gitignore:7` reference the current mirror path and must move in lockstep — full table in `plan/evidence/investigation.md`. Confidence: high (grep + read).
- `scripts/skills-contract.test.mjs:45` asserts only `/backlog/` against the Plan skill — unaffected by the path move. Confidence: high (read).
- `2026-07-24-backlog-subsystem` (closed at `9cf610d`) established the exact governing-doc-amendment-before-code-reference pattern this Change reuses for T1→T2, and its own Verify history (two returns) is the direct source of the "every scratch-repo `.gitignore` fixture must move too, or Close's postcondition silently starts failing" risk called out in T2. Confidence: high (this session's own prior, independently re-read work — not conversation memory).
- Baseline `npm run verify` exit 0 at `9cf610d` (175 tests). Confidence: high.

## Proposed design

**T1 — governing-doc amendment.** `AGENTS.md:64-65` changes from "ignored state lives only in `.codepatrol/runtime/`" to explicitly listing `.codepatrol/runtime/` and `.codepatrol/docs/` (with a one-clause description: local mirrors of Change-owned artifacts). `docs/runtime-state.md` gains a new paragraph, structurally parallel to the existing backlog paragraph, stating `.codepatrol/docs/` is gitignored, rebuildable, and holds no information not already durable elsewhere (its source is always a `.codepatrol/changes/<id>/close/*.md` artifact).

**T2 — mirror relocation.** `mirrorImprovementReport`'s single `join(...)` call changes its path segments from `"docs", "codepatrol", "improvement-reports"` to `".codepatrol", "docs", "improvement-reports"`; return value and `copyFileSync` semantics are unchanged. `orchestrator.ts`'s two recovery-path string literals follow. `.gitignore` drops the `docs/codepatrol/improvement-reports/` line and adds `.codepatrol/docs/` (ignoring the whole directory, matching the `.codepatrol/runtime/` pattern, future-proof against anything else later mirrored there). Every test fixture's inline scratch-repo `.gitignore` string is updated identically, so each fixture's own `git status` calls continue to see the mirror as ignored rather than newly-dirty — this is the load-bearing correctness requirement, not cosmetic (see investigation.md's blast-radius section for why). `skills/codepatrol-plan/SKILL.md:31`'s brownfield instruction updates its cited glob to `.codepatrol/docs/improvement-reports/*.md`.

**T3 — namespace removal.** Both assessment files are deleted (`git rm`). No source, script, or skill references either path (confirmed by grep); no functional code changes accompany this task. The four open findings they contained are already backlog items as of this Plan session's investigation, addressable independently of this document's presence. Deletion does not destroy information: both files remain fully recoverable via `git log`/`git show` for as long as the repository's history is retained — this Change only changes what's presented as current, not what's recorded as having happened.

**Dependency direction:** T1 must land before T2 references `.codepatrol/docs/` in code (mirrors the backlog subsystem's own T1→T2 ordering — sanction the path in governing text before any code path writes to it). T3 is independent of T1/T2 (disjoint files, no shared interface).

## Alternatives

- **Move the improvement-report mirror to `.codepatrol/runtime/docs/improvement-reports/`** instead of a new sibling `.codepatrol/docs/`. Rejected: the maintainer's instruction explicitly names `.codepatrol/docs` as the consolidation target; nesting under `runtime/` would also require `docs/runtime-state.md`'s `.codepatrol/runtime/` structure listing to grow a new subtree entry rather than gaining one clean sibling paragraph, and would blur "process-rebuildable runtime state" (sessions, locks, graph cache) with "convenience document mirrors" — two different concerns that read more clearly as siblings.
- **Keep `docs/codepatrol/assessments/` and just add a "see backlog for open items" pointer inside each file.** Rejected: this leaves the governing-doc contradiction (tracked "architecture namespace") permanently unresolved and keeps two parallel, driftable sources of truth for the same open work (static prose plus live backlog items) instead of retiring the stale one, which is exactly the "consolidate" instruction from the maintainer.
- **Fold the four N1–N4 findings directly into `plan.md`'s tasks and fix them in this Change.** Rejected: none of the four (dead error codes, orchestrator density, test-coverage gaps, duplicate YAML reader) is required by, or blocks, the documentation-consolidation goal; bundling unrelated architecture fixes here would violate this Change's own bounded scope and the Plan skill's explicit instruction to backlog rather than absorb exceeding work.
- **Leave `docs/codepatrol/improvement-reports/` where it is and only remove the assessments/ namespace.** Rejected: it only half-answers the maintainer's explicit two-part instruction ("consolidando o que pode ficar em backlog, simplificando outros que podem ser consolidados em `.codepatrol/docs`") — the improvement-reports mirror is precisely the "outros" (others) named for `.codepatrol/docs` consolidation, and leaving it in `docs/` keeps that directory cluttered with machine-generated, gitignored, redundant copies alongside the two genuine hand-authored docs (`runtime-state.md`, `smoke-tests.md`).

## Simplicity decision

- Selected rung: direct local change — a path rename plus a doc/backlog reconciliation, reusing the exact governing-doc-amendment and caller-commits-backlog patterns `2026-07-24-backlog-subsystem` already established; no new module, dependency, or abstraction.
- Earlier rungs: no existing capability already relocates a mirror path or retires a doc namespace; this is inherently a direct, mechanical change once the destination is decided (and the maintainer decided it explicitly).
- Irreducible complexity: keeping 11 scattered test-fixture `.gitignore` strings and 2 orchestrator path literals synchronized with the single source-of-truth path in `improvement-report.ts` — hidden behind one literal string, changed identically everywhere it appears, not behind a shared constant (no existing pattern in this codebase centralizes such literals across test fixtures; introducing one now would be a speculative abstraction for an 11-site, one-time rename).
- Safety floor: zero information loss (both deleted docs remain in Git history; the four open findings are captured as backlog items *before* deletion, verified present); the mirror remains best-effort/non-blocking exactly as before (only its path changes, not its write semantics or Close's tolerance of it); full gate green; the governing-doc amendment keeps implementation and sources of truth consistent, matching this Change's own root cause for existing.
- Expected surface delta: modify `AGENTS.md`, `docs/runtime-state.md`, `src/change/improvement-report.ts`, `src/change/improvement-report.test.ts`, `src/change/orchestrator.ts`, `.gitignore`, `src/change/apply-gate-enforcement.test.ts`, `src/change/close-push.test.ts`, `src/change/backlog-close-integration.test.ts`, `src/change/orchestrator-parallel.test.ts`, `src/change/close-integration.test.ts`, `src/change/git.test.ts`, `skills/codepatrol-plan/SKILL.md`; delete `docs/codepatrol/assessments/2026-07-24-architecture-v2.md` and `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md`. No new dependencies, no new public interface, no lifecycle/event-schema/checkpoint change. `.codepatrol/backlog/items.yaml` was already modified (4 items added) and committed directly by this Plan session per the established caller-commits contract, ahead of and independent of the Apply checkpoint.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | N1–N4 stay in the backlog, not fixed here | Four known architecture follow-ups remain open | Maintainer picks one via `next --stage plan` / Kanban Backlog column | Start a new Change scoped to the chosen item(s) |
| DC-2 | `docs/adr/` stays uncreated | No durable ADR exists yet for any project decision | A future Change needs to record a durable architectural decision | `skills/domain-modeling` creates `docs/adr/0001-*.md` lazily, per its own existing instruction |

## Compatibility and rollout

New path `.codepatrol/docs/improvement-reports/<work-id>.md` (gitignored, rebuildable, starts absent → populated on the next Close that has a non-empty improvement report); removed path `docs/codepatrol/improvement-reports/` (no migration needed — it was already gitignored/local-only, so no other clone or CI ever depended on its exact location); removed tracked files `docs/codepatrol/assessments/*.md` (recoverable via `git log`/`git show`, no migration). No existing command, event schema, checkpoint, public interface, or Git behavior changes — `mirrorImprovementReport`'s signature, `writeImprovementReport`'s durable-artifact write, and Close's best-effort tolerance for the mirror all stay identical; only the literal path string moves. Rollback = revert the branch. No security/privacy/performance/accessibility impact — this is a same-machine path rename plus a documentation-namespace retirement.

## Risks and mitigations

- **A test fixture's `.gitignore` string is missed, and its scratch-repo `git status` starts reporting `.codepatrol/docs/` as dirty.** Mitigation: `plan/evidence/investigation.md` enumerates all 7 files (11 occurrences) found by exhaustive grep; T2's final step re-greps for the old literal string across the whole tree and expects zero hits before green.
- **Close's recovery-path allowlist (`orchestrator.ts:369-370`) is updated inconsistently between the two literals.** Mitigation: both are edited together in one task; the existing Close-lifecycle test suite (`close-integration.test.ts`, `close-push.test.ts`, `git.test.ts`) exercises both branches and must stay green.
- **Deleting the assessment docs is perceived as losing the N1–N4 findings.** Mitigation: the backlog items were added and committed *before* this spec was written (evidence: commit `4dc367e`, verified via `codepatrol backlog list --format json`); T3's task explicitly re-verifies their presence before deleting the source docs, not after.
- **Governing-doc wording for `.codepatrol/docs/` accidentally re-opens the "architecture namespace" prohibition to mean something broader than intended.** Mitigation: T1's exact wording is scoped narrowly to "gitignored, rebuildable local mirror," explicitly not a place for new durable/tracked content — Review/Verify re-check this framing.

## Acceptance criteria

- AC-1: `docs/codepatrol/assessments/` does not exist in the working tree; `git log --diff-filter=D -- docs/codepatrol/assessments/` shows both files' removal, and `git show <pre-removal-commit>:docs/codepatrol/assessments/2026-07-24-architecture-v2.md` still returns the full original content (recoverability proof).
- AC-2: `codepatrol backlog list --format json` includes exactly the four items listed in Scope/T3 (by id), each with `source.kind: "plan-followup"` and `source.workId: "2026-07-25-docs-consolidation"`, and priorities p1/p2/p2/p3 respectively.
- AC-3: `mirrorImprovementReport(workspace, workId, sourcePath)` returns and writes to `<workspace>/.codepatrol/docs/improvement-reports/<workId>.md`; `src/change/improvement-report.test.ts`'s mirror-path assertion reflects this and passes.
- AC-4: `src/change/orchestrator.ts`'s Close idempotent-recovery branch (terminal-outcome path) references `.codepatrol/docs/improvement-reports/${workId}.md` in both the `assertVerifiedCandidate` call and the `allowedRecovery` set; the full Close-lifecycle test suite (`close-integration.test.ts`, `close-push.test.ts`, `git.test.ts`, `backlog-close-integration.test.ts`, `orchestrator-parallel.test.ts`, `apply-gate-enforcement.test.ts`) passes unchanged in assertion count.
- AC-5: root `.gitignore` no longer contains `docs/codepatrol/improvement-reports/` and instead contains `.codepatrol/docs/`; a live Close run in a scratch repo (any of the fixtures above) produces a mirror file that `git status --short` reports as ignored, not untracked/dirty.
- AC-6: `skills/codepatrol-plan/SKILL.md` cites `.codepatrol/docs/improvement-reports/*.md` (not the old path); `AGENTS.md` and `docs/runtime-state.md` both explicitly name `.codepatrol/docs/` as gitignored/rebuildable; `npm run lint:skills` and `scripts/skills-contract.test.mjs` both pass unchanged.
- AC-7: `npm run verify` exits 0 on the candidate (enforced at Apply seal by `.codepatrol/config.json`'s `applyGate`); zero remaining occurrences of the literal string `docs/codepatrol/improvement-reports` anywhere in the tracked tree (`grep -rn "docs/codepatrol/improvement-reports" . --include="*.ts" --include="*.md" --include="*.mjs"` excluding `.git` and `node_modules` returns empty).
- AC-8: `git diff --stat <base_commit>` shows only the files declared in this spec's Expected surface delta (Simplicity decision) — no undeclared production or doc surface; `docs/codepatrol/` no longer appears in the working tree at all (both former children handled).

## Decisions and open questions

- Decided (this session, following the maintainer's explicit instruction): consolidate open assessment findings into the backlog (already executed and committed, `4dc367e`) and relocate the rebuildable improvement-report mirror to `.codepatrol/docs/`.
- Decided: `docs/adr/` is not created by this Change — no ADR content exists to migrate; it stays lazily-created per existing project convention (DC-2).
- Decided: `docs/runtime-state.md` and `docs/smoke-tests.md` are genuine hand-authored docs and are not touched beyond `docs/runtime-state.md`'s new `.codepatrol/docs/` paragraph.
- No open question can materially change scope, interfaces, or acceptance.
