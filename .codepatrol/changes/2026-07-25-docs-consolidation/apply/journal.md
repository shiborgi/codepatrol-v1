# Implementation — Revalidate `docs/` and `.codepatrol/` artifacts

- Package revision: 1
- Approval: `review.md` verdict approve (attempt 1)
- Target start ref: `9cf610d961294a0c00baa8464d79f2f950c16783`
- Actor: claude-sonnet-5
- Status: implemented

## Baseline reconciliation

Artifact validation result: passed. Target drift checked: working tree clean at `9cf610d`. Note: a prior Apply session's Stage Session claimed T1–T4 "complete" with no journal, no artifacts, and no checkpoint; none of the four tasks' actual file changes were present in the working tree (verified: `docs/codepatrol/assessments/` still had both files, `.gitignore` still had the old path, `AGENTS.md` still had the old wording). The session was stale/untrustworthy and was rebuilt via `codepatrol change session --input '{"action":"rebuild"}'` to the correct all-open state before any task was claimed. Conclusion: ready.

### T1 — Sanction `.codepatrol/docs/` as gitignored, rebuildable local-mirror state

- Claim/workflow item: T1
- Started: 2026-07-25T14:36:57Z
- Files changed: `AGENTS.md`, `docs/runtime-state.md`
- Simplicity check: pure prose amendment; no code; mirrors the exact shape of the backlog subsystem's own T1.
- Surface delta: 2 docs amended; "ignored state lives only in `.codepatrol/runtime/`" narrowed to drop "only" and list both paths; new paragraph in `docs/runtime-state.md` parallel to the existing backlog paragraph.
- Red evidence: N/A (doc amendment).
- Green evidence:
  - `grep -n "ignored state lives only" AGENTS.md` → empty (the now-inaccurate "only" claim is gone).
  - `grep -n "codepatrol/docs" AGENTS.md docs/runtime-state.md` → hits in both.
- Assessment: governance contract and the code T2 is about to write are now consistent — the implementation cannot contradict a source of truth.
- Result: complete

### T2 — Relocate the improvement-report mirror to `.codepatrol/docs/improvement-reports/`

- Claim/workflow item: T2
- Started: 2026-07-25T14:37:30Z
- Files changed: `src/change/improvement-report.ts`, `src/change/improvement-report.test.ts`, `src/change/orchestrator.ts`, `.gitignore`, `src/change/apply-gate-enforcement.test.ts`, `src/change/close-push.test.ts`, `src/change/backlog-close-integration.test.ts`, `src/change/orchestrator-parallel.test.ts`, `src/change/close-integration.test.ts`, `src/change/git.test.ts`, `skills/codepatrol-plan/SKILL.md`
- Simplicity check: pure literal-path substitution; `mirrorImprovementReport`'s signature and `copyFileSync` semantics unchanged.
- Surface delta: 11 files modified; net path-string change only, no new logic.
- Red evidence:
  1. `improvement-report.test.ts:105` assertion updated first → red (`AssertionError`, actual still `docs/codepatrol/improvement-reports/...`).
  2. After fixing `improvement-report.ts:217` and `orchestrator.ts:369-370`, re-running the 6 close/lifecycle test files (`close-integration`, `close-push`, `git`, `backlog-close-integration`, `orchestrator-parallel`, `apply-gate-enforcement`) → 6/22 red, all `CHANGE_CONFLICT: Close postcondition requires a clean worktree` — exactly the predicted failure mode from each fixture's stale `.gitignore` string.
- Green evidence:
  1. `improvement-report.test.ts` → 4/4 green after the path fix.
  2. After updating all 6 fixtures' `.gitignore` strings and root `.gitignore`, re-running the same 6 files → 21/22 green, 1 remaining red.
  3. **Deviation found and fixed in-scope:** `close-integration.test.ts:29` builds its own `mirrorPath` via `join(workspace, "docs", "codepatrol", "improvement-reports", ...)` — split across separate `join()` arguments, exactly like the production code was, so it was never caught by the Plan/Review's literal-string grep for `docs/codepatrol/improvement-reports` (no single string contains that substring in a split-`join()` call). This file was already declared in T2's Files list (Plan named it for the `.gitignore` fixture), so fixing this additional line within it is in-scope, not a new file/scope addition. Re-grepped for any other `"docs", "codepatrol"` split-argument occurrences across `src/`/`scripts/` — none found. Re-ran the 6 files → 22/22 green.
  4. `npm run typecheck` — clean. `npm run lint:skills` — clean.
  5. Exhaustive `grep -rn "docs/codepatrol/improvement-reports"` across `*.ts/*.md/*.mjs/*.json` (excluding `node_modules`) → all remaining hits are inside `.codepatrol/changes/<id>/` — durable, immutable historical Change records from prior Changes (out of scope per spec's explicit exclusion) — zero hits in any live `src/`, `scripts/`, or `skills/*.md` file.
- Assessment: the mirror relocation is complete and the 22-test close/lifecycle suite proves the `.gitignore`-fixture synchronization actually works, not just that the literal grep found every site — the one genuine gap (a split-`join()` call the grep couldn't match) was caught by running the tests, not by re-grepping, confirming the plan's own stated rationale for treating this as load-bearing rather than cosmetic.
- Result: complete

### T3 — Remove `docs/codepatrol/assessments/`, re-verifying its findings are already backlogged

- Claim/workflow item: T3
- Started: 2026-07-25T14:55:00Z
- Files changed: deleted `docs/codepatrol/assessments/2026-07-24-architecture-v2.md`, deleted `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md`
- Simplicity check: pure deletion; no code changes; zero blast radius (re-confirmed).
- Surface delta: -2 tracked doc files; `docs/codepatrol/` now absent from the working tree entirely (its other child, the improvement-reports mirror, was already relocated by T2).
- Red evidence: N/A (deletion, verified by presence/absence checks, not a red/green test loop).
- Green evidence:
  1. `codepatrol backlog list --format json` re-run immediately before deletion: all 4 items present with `status: "candidate"`, correct `source.kind`/`source.workId`/priority (p1/p2/p2/p3) — these were added and committed at `4dc367e` during Plan investigation, this is re-verification not creation.
  2. `git rm` both files.
  3. `find docs/codepatrol -type f` → "No such file or directory" (the directory is fully gone).
  4. `grep -rln "assessments" scripts/ src/` → no hits (the pre-existing zero-blast-radius finding from investigation and Review both hold after deletion).
- Assessment: no information lost — both files remain fully recoverable via `git log`/`git show`; their only open content (N1-N4) already lives as live, queryable backlog items, resolving `docs/runtime-state.md:23-25`'s "architecture namespace... not supported" contradiction by elimination.
- Result: complete

### T4 — Final verification and reconciliation

- Claim/workflow item: T4
- Started: 2026-07-25T15:00:00Z
- Files changed: none (verification only)
- AC mapping:
  - AC-1: `docs/codepatrol/assessments/` absent (`find` → "No such file or directory"); `git log --diff-filter=D -- docs/codepatrol/assessments/` shows both deletions in this branch's history; recoverable via `git show <this-branch>~1:docs/codepatrol/assessments/2026-07-24-architecture-v2.md` (pre-deletion commit still in this branch's own history) → pass.
  - AC-2: `codepatrol backlog list --format json` — 4 items present, correct source/priority (re-verified twice: once in Plan investigation, once at T3 start) → pass.
  - AC-3: `improvement-report.test.ts` 4/4 pass, asserting the `.codepatrol/docs/improvement-reports/` path → pass.
  - AC-4: `orchestrator.ts:369-370` both reference the new path; the 6-file/22-test close/lifecycle suite passes → pass.
  - AC-5: root `.gitignore` contains `.codepatrol/docs/`, not the old path; every scratch-repo fixture's own Close run in the test suite implicitly proves the mirror is treated as ignored (postcondition passes, meaning `git status` sees it as clean) → pass.
  - AC-6: `skills/codepatrol-plan/SKILL.md:31` cites the new path; `AGENTS.md`/`docs/runtime-state.md` both name `.codepatrol/docs/`; `npm run lint:skills` clean; `scripts/skills-contract.test.mjs` included in the 175 passing → pass.
  - AC-7: `npm run verify` exit 0, 175/175 tests; exhaustive `grep -rn "docs/codepatrol/improvement-reports"` (excluding `node_modules` and `.codepatrol/changes/` historical records) → zero hits → pass.
  - AC-8: `git diff --stat 9cf610d` shows exactly the 13 modified + 2 deleted production/doc files forecast in `plan.md`'s Simplicity proof (no undeclared surface); `docs/codepatrol/` fully absent → pass.
- Full gate: `npm run verify` exit 0; typecheck + 175 tests + build + smoke:cli + lint:skills, independently re-run this session (not trusted from any prior claim).
- `codepatrol graph sync` → 70 files, 1814 symbols (unchanged from baseline — the two deleted files are Markdown docs, not part of the code graph's extraction scope; no code symbol was added or removed by this Change).
- Reconciliation: actual surface delta matches the spec's forecast exactly — 13 modified (`.gitignore`, `AGENTS.md`, `docs/runtime-state.md`, `skills/codepatrol-plan/SKILL.md`, `src/change/{improvement-report.ts,improvement-report.test.ts,orchestrator.ts,apply-gate-enforcement.test.ts,close-push.test.ts,backlog-close-integration.test.ts,orchestrator-parallel.test.ts,close-integration.test.ts,git.test.ts}`) + 2 deleted (`docs/codepatrol/assessments/*.md`) = 15 files, with one in-scope addition within an already-declared file: `close-integration.test.ts` needed its own inline `mirrorPath` `join()` fixed (a split-argument site the Plan's literal-string grep couldn't match), discovered via the red/green test loop, not a new file or scope expansion.
- DC-N triggers: none activated (DC-1 — N1-N4 stay backlogged, not fixed here; DC-2 — `docs/adr/` stays uncreated, nothing to migrate).
- Rollback: revert the branch; both deleted docs and the relocated mirror are fully recoverable via Git history / rebuildable from the durable Close artifact respectively; no migration needed for any party.

## Final verification

- Affected checks run: `improvement-report.test.ts`, `close-integration.test.ts`, `close-push.test.ts`, `git.test.ts`, `backlog-close-integration.test.ts`, `orchestrator-parallel.test.ts`, `apply-gate-enforcement.test.ts`, `npm run typecheck`, `npm run test` (full suite), `npm run build`, `npm run smoke:cli`, `npm run lint:skills`.
- Full gate: `npm run verify` exit 0; 175/175 tests pass (same count as baseline — this Change relocates/removes doc-mirror paths and prose, adding zero new tests and removing none).
- Graph refreshed via `codepatrol graph sync` (70 files, 1814 symbols, unchanged from baseline).
- Residual risks: DC-1 (four architecture follow-ups remain backlogged), DC-2 (`docs/adr/` stays lazily-uncreated). Per-run provider tokens: `unavailable` (no harness hook).
- Rollback: revert the branch.

## Surface delta

All changes match the spec forecast exactly:

**Deleted (2):**
- `docs/codepatrol/assessments/2026-07-24-architecture-v2.md` (T3)
- `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md` (T3)

**Modified (13):**
- T1: `AGENTS.md`, `docs/runtime-state.md`
- T2: `.gitignore`, `skills/codepatrol-plan/SKILL.md`, `src/change/improvement-report.ts`, `src/change/improvement-report.test.ts`, `src/change/orchestrator.ts`, `src/change/apply-gate-enforcement.test.ts`, `src/change/close-push.test.ts`, `src/change/backlog-close-integration.test.ts`, `src/change/orchestrator-parallel.test.ts`, `src/change/close-integration.test.ts`, `src/change/git.test.ts`

**Other (already committed by Plan, not part of this Apply checkpoint):**
- `.codepatrol/backlog/items.yaml` — 4 items added during Plan investigation, committed at `4dc367e` ahead of and independent of this checkpoint.

No unforecasted dependencies, config, or events added. No DC-N triggers activated.

## Notes

- A prior Apply attempt's Stage Session (actor `opencode-apply`) claimed all four tasks "complete" with no journal, no artifacts, and no checkpoint — a stale/untrustworthy claim (verified: none of the actual file changes existed in the working tree). The session was rebuilt from the accepted Change artifacts before any real work began, per `skills/_shared/SESSION.md`'s "missing or corrupt sessions are discarded and rebuilt" contract. This journal documents only work actually performed and verified in this session.
- `close-integration.test.ts:29`'s own `mirrorPath` construction (split `join()` arguments) was not caught by the Plan/Review's literal-string grep for `docs/codepatrol/improvement-reports` — found via the T2 red/green test loop, fixed within the already-declared file, and confirmed to be the only such site by a follow-up grep for split `"docs", "codepatrol"` argument patterns across `src/`/`scripts/`.
