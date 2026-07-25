# Plan — Revalidate `docs/` and `.codepatrol/` artifacts: fold open follow-ups into the backlog, consolidate the rebuildable mirror under `.codepatrol/docs/`

- Work id: `2026-07-25-docs-consolidation`
- Governing spec: `spec.md`
- Target baseline: `main` @ `9cf610d961294a0c00baa8464d79f2f950c16783`; clean worktree; `npm run verify` green (175 tests).

## Goal and approach

Resolve two governing-doc contradictions and one piece of maintainer-directed cleanup: (1) amend `AGENTS.md`/`docs/runtime-state.md` to sanction the one new path this Change introduces, `.codepatrol/docs/` (T1); (2) relocate the gitignored improvement-report mirror from `docs/codepatrol/improvement-reports/` to `.codepatrol/docs/improvement-reports/`, updating every production, test-fixture, and skill reference in lockstep (T2); (3) delete the git-tracked `docs/codepatrol/assessments/` namespace, whose only open content (four findings) is already captured as backlog items from this Plan's own investigation (T3); then verify (T4).

## Global constraints

- T1 must land before any T2 code references `.codepatrol/docs/` — same ordering `2026-07-24-backlog-subsystem` used for `.codepatrol/backlog/`.
- Every one of the 11 occurrences (7 files) of the literal string `docs/codepatrol/improvement-reports/` found in `plan/evidence/investigation.md` must be updated; a stray occurrence causes a scratch-repo test fixture's `git status` to report the new mirror path as unexpectedly dirty, failing Close's postcondition — the exact failure mode `2026-07-24-backlog-subsystem`'s Verify caught twice.
- `.codepatrol/backlog/items.yaml` was already modified (4 items added, `source.kind: "plan-followup"`, `source.workId: "2026-07-25-docs-consolidation"`) and committed at `4dc367e` during Plan investigation, per the caller-commits-before-transition contract in `skills/codepatrol-plan/SKILL.md`. No task in this plan re-touches that file; T3 only re-verifies it.
- No new dependency, no lifecycle/event-schema/checkpoint change, no change to `mirrorImprovementReport`'s signature or `writeImprovementReport`'s durable-artifact write — only the literal mirror path string moves.
- Gate: `npm run typecheck && npm test && npm run build && npm run smoke:cli && npm run lint:skills` (i.e. `npm run verify`).

## Simplicity proof

- Selected rung: direct local change — reuses the backlog subsystem's governing-doc-amendment pattern and the caller-commits-backlog contract; a mechanical path rename across a known, exhaustively-grepped file set; no new module or dependency.
- Reused capabilities: `mirrorImprovementReport`'s existing `join()`/`copyFileSync` shape (only its path segments change); the existing scratch-repo `.gitignore` fixture pattern already used by 7 test files; the existing `docs/runtime-state.md` backlog-paragraph structure as the template for the new `.codepatrol/docs/` paragraph.
- Forbidden speculative surface: no shared path-literal constant introduced for the one-time 11-site rename (would be a speculative abstraction for a change that touches each site exactly once); no `docs/adr/` scaffold (DC-2, nothing to migrate); no fix for the four backlogged findings themselves (DC-1).
- Expected surface delta: modify `AGENTS.md`, `docs/runtime-state.md`, `src/change/improvement-report.ts`, `src/change/improvement-report.test.ts`, `src/change/orchestrator.ts`, `.gitignore`, `src/change/apply-gate-enforcement.test.ts`, `src/change/close-push.test.ts`, `src/change/backlog-close-integration.test.ts`, `src/change/orchestrator-parallel.test.ts`, `src/change/close-integration.test.ts`, `src/change/git.test.ts`, `skills/codepatrol-plan/SKILL.md`; delete `docs/codepatrol/assessments/2026-07-24-architecture-v2.md`, `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md`.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 (assessments removed, recoverable via git history) | T3 | `git log --diff-filter=D`; `git show <pre-commit>:<path>` |
| AC-2 (4 backlog items present with correct source/priority) | T3 (re-verification only; items already added) | `codepatrol backlog list --format json` |
| AC-3 (`mirrorImprovementReport` writes new path) | T2 | `node --test --import jiti/register src/change/improvement-report.test.ts` |
| AC-4 (Close recovery references new path; Close suite green) | T2 | `node --test --import jiti/register src/change/{close-integration,close-push,git,backlog-close-integration,orchestrator-parallel,apply-gate-enforcement}.test.ts` |
| AC-5 (`.gitignore` updated; mirror reported ignored not dirty) | T2 | live scratch-repo Close run + `git status --short` |
| AC-6 (SKILL.md + governing docs consistent; lint/contract green) | T1, T2 | `npm run lint:skills`; `node --test scripts/skills-contract.test.mjs` |
| AC-7 (full gate green; zero stale path references) | T2, T4 | `npm run verify`; `grep -rn "docs/codepatrol/improvement-reports"` |
| AC-8 (diff matches forecast; `docs/codepatrol/` fully gone) | T4 | `git diff --stat 9cf610d`; `find docs/codepatrol` |

## Dependency order

`T1 → T2` (T2's code must not reference `.codepatrol/docs/` before T1 sanctions it in governing text). `T3` is independent of `T1`/`T2` — disjoint files (`docs/codepatrol/assessments/*.md` only), no shared interface. `T4` depends on `T1, T2, T3`.

Sequence: `T1 → T2`, with `T3` runnable in parallel or any order relative to `T1`/`T2`; `T4` last.

### T1 — Sanction `.codepatrol/docs/` as gitignored, rebuildable local-mirror state

**Purpose:** Satisfies AC-6 (governing-doc half); establishes the sanctioned location before T2 writes to it, resolving the "ignored state lives only in `.codepatrol/runtime/`" contradiction before it becomes false.

**Depends on:** None

**Files:**

- Modify: `AGENTS.md` (lines 64-65)
- Modify: `docs/runtime-state.md`

**Steps:**

1. Edit `AGENTS.md:64-65`: change "Durable ADRs live in `docs/adr/`; ignored state lives only in `.codepatrol/runtime/`." to "Durable ADRs live in `docs/adr/`; ignored state lives in `.codepatrol/runtime/` and `.codepatrol/docs/` (local mirrors of Change-owned artifacts, e.g. the improvement-report mirror)."
2. Edit `docs/runtime-state.md`: add a new paragraph after the existing "structured backlog" paragraph (the last paragraph in the file), structurally parallel to it: state `.codepatrol/docs/` is gitignored, rebuildable, holds only local convenience mirrors of durable Change-owned artifacts (never itself a source of truth), and name the improvement-report mirror as its first occupant.
3. `grep -n "ignored state lives only" AGENTS.md` → expect no hits (the word "only" is removed along with the now-inaccurate claim). `grep -n "codepatrol/docs" AGENTS.md docs/runtime-state.md` → expect hits in both.

**Task result:** append to `apply/journal.md`.

### T2 — Relocate the improvement-report mirror to `.codepatrol/docs/improvement-reports/`

**Purpose:** Satisfies AC-3, AC-4, AC-5, and the code/skill half of AC-6.

**Depends on:** T1

**Files:**

- Modify: `src/change/improvement-report.ts` (`mirrorImprovementReport`, `:216-221`)
- Modify: `src/change/improvement-report.test.ts` (mirror-path assertion, `:97-105`)
- Modify: `src/change/orchestrator.ts` (`:369-370`, Close idempotent-recovery branch)
- Modify: `.gitignore`
- Modify: `src/change/apply-gate-enforcement.test.ts` (`:16`)
- Modify: `src/change/close-push.test.ts` (`:26`)
- Modify: `src/change/backlog-close-integration.test.ts` (`:25`, `:49`)
- Modify: `src/change/orchestrator-parallel.test.ts` (`:15`)
- Modify: `src/change/close-integration.test.ts` (`:18`)
- Modify: `src/change/git.test.ts` (`:17`, `:97`, `:188`, `:200`, `:227`)
- Modify: `skills/codepatrol-plan/SKILL.md` (`:31`)

**Interfaces:**

- `mirrorImprovementReport(workspace: string, workId: string, sourcePath: string): string` — signature and `copyFileSync` semantics unchanged; only the `join(...)` path segments change from `"docs", "codepatrol", "improvement-reports"` to `".codepatrol", "docs", "improvement-reports"`.

**Simplicity proof:** Pure literal-path substitution across a fully-enumerated, exhaustively-grepped file set (`plan/evidence/investigation.md`); no interface, signature, or logic change.

**Steps:**

1. In `src/change/improvement-report.test.ts`, change the assertion at `:105` from `` `${workspace}/docs/codepatrol/improvement-reports/${id}.md` `` to `` `${workspace}/.codepatrol/docs/improvement-reports/${id}.md` ``.
2. Run `node --test --import jiti/register src/change/improvement-report.test.ts`. Expected red: assertion fails, actual path still `docs/codepatrol/improvement-reports/...` (source not yet changed).
3. In `src/change/improvement-report.ts:217`, change `join(workspace, "docs", "codepatrol", "improvement-reports", ...)` to `join(workspace, ".codepatrol", "docs", "improvement-reports", ...)`.
4. Run the test from step 2 again. Expected green.
5. In `src/change/orchestrator.ts:369`, change the fourth element of the `assertVerifiedCandidate` array literal from `` `docs/codepatrol/improvement-reports/${workId}.md` `` to `` `.codepatrol/docs/improvement-reports/${workId}.md` ``. In `:370`, make the identical change inside the `allowedRecovery` `Set` literal.
6. Run `node --test --import jiti/register src/change/{close-integration,close-push,git,backlog-close-integration,orchestrator-parallel,apply-gate-enforcement}.test.ts`. Expected red: at least one case in each of these 6 files fails, because each file's own scratch-repo `.gitignore` fixture string (listed under Files above) still writes the old `docs/codepatrol/improvement-reports/` line — with the source now writing to `.codepatrol/docs/`, each scratch repo's `git status` starts reporting the new mirror path as untracked, tripping Close's postcondition (`orchestrator.ts:439`, unchanged) or the recovery-path checks touched in step 5.
7. In each of the 6 test files (7 occurrences total, `backlog-close-integration.test.ts` and `git.test.ts` each have 2 and 5 occurrences respectively of the identical string), change the `.gitignore` fixture string from `".codepatrol/runtime/\ndocs/codepatrol/improvement-reports/\n"` to `".codepatrol/runtime/\n.codepatrol/docs/\n"`.
8. Run the same test command as step 6. Expected green.
9. In root `.gitignore`, remove the `docs/codepatrol/improvement-reports/` line and add `.codepatrol/docs/` in its place (keep it adjacent to the existing `.codepatrol/runtime/` line for readability).
10. In `skills/codepatrol-plan/SKILL.md:31`, change the cited glob from `` `docs/codepatrol/improvement-reports/*.md` `` to `` `.codepatrol/docs/improvement-reports/*.md` ``.
11. `grep -rn "docs/codepatrol/improvement-reports" . --include="*.ts" --include="*.md" --include="*.mjs" --include="*.json" -- . ':!node_modules' ':!.git' ':!docs/codepatrol/assessments'` (the assessments docs' own historical citation is handled by T3, not this task) → expect zero remaining hits in files this task owns.
12. Run `npm run typecheck` and `npm run lint:skills`. Expected clean.

**Task result:** append to `apply/journal.md`.

### T3 — Remove `docs/codepatrol/assessments/`, re-verifying its findings are already backlogged

**Purpose:** Satisfies AC-1, AC-2, and resolves the "architecture namespace... not supported" contradiction in `docs/runtime-state.md:23-25` by elimination rather than further exception.

**Depends on:** None (disjoint files from T1/T2)

**Files:**

- Delete: `docs/codepatrol/assessments/2026-07-24-architecture-v2.md`
- Delete: `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md`

**Steps:**

1. Run `codepatrol backlog list --format json` and confirm all four ids are present with `status: "candidate"`, `source.kind: "plan-followup"`, `source.workId: "2026-07-25-docs-consolidation"`: `unsafe-duplicate-yaml-reader-in-improvement-report-ts-bypasses-migraterecord-normalization` (p1), `orchestrator-transitionchangelocked-is-dense-and-mixes-validation-persona-semantics-and-storage-responsibilities` (p2), `core-module-test-coverage-gaps-atomic-store-ts-graph-languages-ts-graph-queries-ts-lack-dedicated-tests` (p2), `dead-taxonomy-unused-error-codes-artifact-invalid-and-workflow-in-errors-ts` (p3). Expected: all 4 present (they were added and committed at `4dc367e` during Plan investigation — this step is re-verification, not creation).
2. `git rm docs/codepatrol/assessments/2026-07-24-architecture-v2.md docs/codepatrol/assessments/2026-07-24-architecture-workflow.md`.
3. `find docs/codepatrol -type f` → expect only the (already-relocated-by-T2) improvement-reports mirror is gone too, leaving `docs/codepatrol/` absent entirely (an empty directory has no Git representation).
4. `grep -rln "assessments" scripts/ src/` → expect no hits (confirms the pre-existing zero-blast-radius finding from investigation still holds; nothing else needs updating as a result of this deletion).

**Task result:** append to `apply/journal.md`.

### T4 — Final verification and reconciliation

**Purpose:** Confirms AC-7, AC-8, and whole-Change integrity.

**Depends on:** T1, T2, T3

**Files:**

- Modify: none (verification only)

**Steps:**

1. Map delivered paths back to AC-1…AC-8; confirm each passed.
2. Run the full gate: `npm run verify`. Expected exit 0 (also enforced at Apply `implemented` by `.codepatrol/config.json` `applyGate`).
3. `grep -rn "docs/codepatrol/improvement-reports" . --include="*.ts" --include="*.md" --include="*.mjs" --include="*.json"` (excluding `node_modules`, `.git`) → expect zero hits anywhere in the tree (T2's scoped grep plus T3's removal together cover every prior hit).
4. `git diff --stat 9cf610d` — inspect for undeclared work; confirm the changed-file set matches this plan's Expected surface delta exactly (Simplicity proof) and that `docs/codepatrol/` no longer appears.
5. `find docs/codepatrol` → expect "No such file or directory".
6. Reconcile actual surface delta with the spec forecast; explain any difference in the journal.
7. Record whether `DC-1` or `DC-2` triggered (expected: neither — both stay deferred as designed).
8. `codepatrol graph sync`.
9. State rollback (revert the branch; the two deleted docs and the moved mirror are both fully recoverable via Git history/rebuild) and residual risks (DC-1, DC-2).

**Task result:** append the final reconciliation to `apply/journal.md`.
