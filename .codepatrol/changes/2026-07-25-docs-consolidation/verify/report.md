# Verification — Revalidate `docs/` and `.codepatrol/` artifacts

- Change: `2026-07-25-docs-consolidation`
- Verified revision: 1
- Verifier: claude-sonnet-5 (Auditor persona)
- Base ref: `9cf610d961294a0c00baa8464d79f2f950c16783`
- Head ref: `88e868d4146146cc97640c8e83911bd6ba778bce` (Apply attempt 1 checkpoint; tree `11f38964b93bb2f7a1dd4f7b874e69c7a370b417`)
- Evidence date: 2026-07-25T15:01:19Z

## Scope and instruments

Checkout verified on `codepatrol/2026-07-25-docs-consolidation`; projection Verify attempt 1/ready; working tree clean. Apply checkpoint tree re-derived with `git rev-parse 88e868d^{tree}` and matched `11f38964…` exactly. All five accepted-artifact SHA-256 hashes (`plan/spec.md`, `plan/plan.md`, `plan/evidence/investigation.md`, `review/report.md`, `apply/journal.md`) recomputed with `shasum -a 256` and matched `change.yaml` exactly.

`git diff --stat 9cf610d 88e868d -- . ':!.codepatrol'` produced exactly the 15 files declared in the Apply checkpoint's `changes` array — every line of every file's diff read in full (not sampled), not trusted from `apply/journal.md`'s claims.

Commands executed: full `npm run verify` (typecheck + 175 tests + build + smoke:cli + lint:skills, independently re-run), the 7-file/26-test improvement-report/close/lifecycle suite re-run standalone, `codepatrol graph sync --force` + `graph impact --since-ref`, `codepatrol backlog list --format json`, `git show <base>:<path>` recoverability checks, and two direct scratch-repo reproductions (outside this repository, destroyed after use) proving the `.codepatrol/docs/` gitignore mechanism independently of the unit tests. No command could not be executed; no environment limit encountered.

## Plan conformance

| Task | Diff evidence | Conforms |
|---|---|---|
| T1 (governing docs) | `AGENTS.md:64-65` and `docs/runtime-state.md` diffs read in full: "ignored state lives only in `.codepatrol/runtime/`" → lists both `.codepatrol/runtime/` and `.codepatrol/docs/`; new paragraph added, structurally parallel to the existing backlog paragraph | yes |
| T2 (mirror relocation) | `improvement-report.ts:217`, `orchestrator.ts:369-370`, `.gitignore`, all 6 `.gitignore`-fixture test files (7 occurrences), `improvement-report.test.ts:105`, `skills/codepatrol-plan/SKILL.md:31` — every diff read and matches the plan's exact prescribed change | yes |
| T3 (assessments removal) | Both files show as full `deleted file mode 100644` diffs with complete original content removed, nothing else touched | yes |
| T4 (final verification) | `apply/journal.md`'s T4 section present; independently re-verified below rather than trusted | see below |

**Deviation found, in-scope, correctly handled:** `close-integration.test.ts:29` builds `mirrorPath` via `join(workspace, "docs", "codepatrol", "improvement-reports", ...)` — a split-argument `join()` call, structurally identical to the production code's own original form, which the Plan/Review's literal-string grep for `docs/codepatrol/improvement-reports` could not match (no single string contains that substring in a split call). This file was already declared in T2's Files list (for its `.gitignore`-fixture line), so fixing this additional line within it is not scope creep. Diff confirms the fix: `join(workspace, ".codepatrol", "docs", "improvement-reports", ...)`. `apply/journal.md`'s T2 section documents this exact deviation with matching detail — corroborated, not merely asserted.

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of the journal |
|---|---|---|---|
| AC-1 | `find docs/codepatrol` (absent); `git show 9cf610d:docs/codepatrol/assessments/2026-07-24-architecture-v2.md \| head -3` | directory gone; pre-deletion content still fully recoverable via git history | yes |
| AC-2 | `codepatrol backlog list --format json`, filtered to `source.workId=2026-07-25-docs-consolidation` | all 4 items present: `unsafe-duplicate-yaml-reader…` (p1), `core-module-test-coverage-gaps…` (p2), `orchestrator-transitionchangelocked…` (p2), `dead-taxonomy…` (p3), all `status:"candidate"`, `source.kind:"plan-followup"` | yes |
| AC-3 | `node --test --import jiti/register src/change/improvement-report.test.ts` | 4/4 pass, mirror path is `.codepatrol/docs/improvement-reports/<id>.md` | yes |
| AC-4 | `node --test --import jiti/register src/change/{close-integration,close-push,git,backlog-close-integration,orchestrator-parallel,apply-gate-enforcement}.test.ts` | 26/26 pass (assertion count unchanged in substance — the 2 new `git show --name-only` assertions from the prior Change's Finding-1 fix are untouched by this Change) | yes |
| AC-5 | Two direct scratch-repo reproductions: (a) `git status --short` after `change start` in a repo whose `.gitignore` lists `.codepatrol/docs/` → clean; (b) writing a file directly into `.codepatrol/docs/improvement-reports/` → `git status --short` empty, `git check-ignore -v` confirms match on `.gitignore:2:.codepatrol/docs/` | both confirm the mirror is genuinely git-ignored, not merely passing by accident of `parseStatusPaths`'s internal filter (which was correctly left untouched by this Change — `.codepatrol/docs/` relies on real `.gitignore` coverage, the same mechanism the old path used) | yes |
| AC-6 | `grep -n "codepatrol/docs" AGENTS.md docs/runtime-state.md skills/codepatrol-plan/SKILL.md`; `npm run lint:skills`; `scripts/skills-contract.test.mjs` (part of the 175) | all three files consistent; lint clean; contract test passing | yes |
| AC-7 | `npm run verify` (independently re-run, this session); `grep -rn "docs/codepatrol/improvement-reports" . --include="*.ts" --include="*.md" --include="*.mjs" --include="*.json"` excluding `node_modules` and `.codepatrol/changes/` | exit 0, 175/175; zero hits in any live `src/`, `scripts/`, or `skills/*.md` file — all remaining hits are inside immutable historical `.codepatrol/changes/<id>/` records from *other*, already-closed Changes, correctly out of this Change's scope | yes |
| AC-8 | `git diff --stat 9cf610d`; `find docs/codepatrol` | exactly 13 modified + 2 deleted = 15 files, matching `plan.md`'s Simplicity proof forecast precisely; `docs/codepatrol/` fully absent | yes |

## Wider suite

`npm run verify` — exit 0, 175/175 tests pass (same count as baseline — this Change relocates paths and prose; it adds zero tests and removes none), independently re-executed rather than trusted from the journal. Tree stayed clean afterward, confirmed with `git status --short`.

## Blast radius

`codepatrol graph sync --force` → 70 files, 1814 symbols (unchanged from baseline — the two deleted files are Markdown docs outside the graph's extraction scope, and no code symbol was added/removed). `codepatrol graph impact --since-ref 9cf610d` → 22 seeds, 28 affected files, 25 affected tests (`scripts/install-lib.test.mjs`, `scripts/package-contract.test.mjs`, `scripts/render-kanban.test.mjs`, `scripts/skills-contract.test.mjs`, and 21 more under `src/change/`, `src/cli/`, `src/graph/`, `src/shared/`, including `start-backlog-link.test.ts` via the shared `orchestrator.ts` edit). Every affected test is already inside the `npm run verify` suite that passed. No impacted seam was left unexercised.

## Regressions

- The 6 `.gitignore`-fixture test files and `close-integration.test.ts` all pass unchanged in their non-mirror-related assertions — the path relocation did not loosen or alter any other Close/lifecycle behavior (`parseStatusPaths` itself is untouched by this Change; only the literal path constants moved, and the `.codepatrol/docs/` gitignore mechanism was independently proven above).
- `mirrorImprovementReport`'s signature, return semantics, and `writeImprovementReport`'s durable-artifact write are byte-identical apart from the one changed path segment — confirmed by reading the full diff, not just the changed lines.
- No drift found at any other surviving interface: `AGENTS.md`'s and `docs/runtime-state.md`'s other content is untouched (diffs show only additive insertions plus the one precise wording edit); `skills/codepatrol-plan/SKILL.md`'s only change is the single path reference.

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| (all 15 changed files) | yes | matches `apply/journal.md`'s Surface delta section and the Apply checkpoint's `changes` array exactly — `git diff --stat` produced the identical file set |
| `close-integration.test.ts`'s `mirrorPath` line (within an already-declared file) | not literally named by line in `plan.md`, but the file itself was declared and the fix is squarely within T2's stated purpose | accepted as a journaled, in-scope deviation — not a finding |

No undeclared path was touched. `bin/`, `docs/codepatrol/improvement-reports/` (relocated, not merely deleted — confirmed the mirror mechanism works, not just that the old path vanished), and `.codepatrol/changes/` (16 prior/current Change directories, all untouched) are confirmed correctly out of scope.

## Git/ref safety

`git tag -l "codepatrol/*" | grep docs-consolidation` → empty (no premature terminal tag). `git log 9cf610d..HEAD --oneline` shows a clean, expected lifecycle commit sequence (start → backlog capture → plan → review → apply → verify-begin), with no stray branches or dangling refs on the branch itself. One local-only recovery was needed mid-Apply (documented in the journal's Notes: a raw `git rm` got swept into an unrelated `commitMetadata` commit by that function's unrestricted `git commit`; recovered via `git reset --soft` confined to this session's own unpushed commits) — verified to have left no orphaned commits reachable from the branch tip and no effect on final content, only on commit boundaries.

## Findings

No critical, major, or minor findings survive validation.

## Residual risks and evidence gaps

- DC-1 (four architecture follow-ups — N1 dead error codes, N2 test-coverage gaps, N3 orchestrator density, N4 duplicate YAML reader — remain in the backlog, not fixed here) and DC-2 (`docs/adr/` stays lazily uncreated) are both accepted, bounded deferrals with named triggers and upgrade paths in `spec.md`; neither activated.
- The prior Apply session's stale, unbacked "complete" claims (no journal, no artifacts, no checkpoint) were caught and the session was rebuilt from ground truth before any real work began — documented in the journal's Baseline reconciliation and independently corroborated here by the fact that HEAD before this Apply attempt showed none of T1-T4's changes present.
- Per-run provider token usage remains `unavailable` (no authoritative harness hook), consistent with every prior stage of this Change and every other Change in this project.

## Verdict

`commit`

All eight acceptance criteria pass independent re-verification, not merely a re-read of the journal's claims. The design is sound: two governing-doc contradictions are resolved (the tracked `docs/codepatrol/assessments/` "architecture namespace" `docs/runtime-state.md` explicitly prohibited, and the "ignored state lives only in `.codepatrol/runtime/`" claim that would otherwise have become false), the mirror relocation is complete and provably git-ignored via two independent live reproductions (not just passing unit tests), the four open architecture findings are live backlog items rather than static prose, and the diff exactly matches the plan's forecast with zero undeclared surface. The one deviation found (a split-`join()` site the Plan's grep missed) was caught by the Apply's own red/green test loop, fixed within an already-declared file, and is correctly journaled — evidence the "load-bearing, not cosmetic" caution this Change inherited from `2026-07-24-backlog-subsystem`'s two prior Verify returns was applied for real, not just asserted. No defect survives.

Next Change transition: `codepatrol-close 2026-07-25-docs-consolidation commit|rollback on codepatrol/2026-07-25-docs-consolidation`.
