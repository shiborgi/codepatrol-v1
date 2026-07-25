# Review — Revalidate `docs/` and `.codepatrol/` artifacts: fold open follow-ups into the backlog, consolidate the rebuildable mirror under `.codepatrol/docs/`

- Change: `2026-07-25-docs-consolidation`
- Incoming revision: 1
- Reviewed revision: 1 (no adjustments — Review never corrects Plan in place)
- Reviewer: opencode (gatekeeper persona, fresh context — no Plan-stage chat history)
- Evidence date: 2026-07-25T10:31:25Z

## Scope and evidence

Checkout on recorded branch `codepatrol/2026-07-25-docs-consolidation`;
projection Review attempt 1/active (after begin); working tree clean. Base
`9cf610d` reconciled: it is the terminal commit of the just-closed
`2026-07-24-backlog-subsystem` on `main` (git log confirms
`9cf610d chore(codepatrol): committed 2026-07-24-backlog-subsystem`), so this
Change correctly branches from current `main`. Base is an ancestor of HEAD.

Plan attempt 1 checkpoint `fbc76735` / tree `b320f61d` intact and re-verified:
`git rev-parse fbc76735^{tree}` = `b320f61d…` (exact match). Artifact hashes
re-verified on disk and match the checkpoint binding exactly (`spec.md`
`b849ffba…`, `plan.md` `34ca1910…`, `evidence/investigation.md` `15b9f498…`).

Artifacts read in full: `plan/spec.md`, `plan/plan.md`,
`plan/evidence/investigation.md`. The Plan also records that it executed
`codepatrol backlog add` for the four open v2 findings during investigation and
committed them at `4dc367e` (visible in `git log` as `chore(backlog): capture
architecture-v2 assessment findings N1-N4 as plan-followup items`) — this is the
caller-commits-backlog contract from `skills/codepatrol-plan/SKILL.md` operating
correctly, and is independently re-verified below (AC-2).

Every cited source location was re-read this session and matches; the exhaustive
mirror-path grep was re-run independently (see Findings → Executability).

## Findings

No critical, major, or minor findings survive validation. Two non-blocking
precision observations for Apply (not findings — neither affects scope,
interfaces, acceptance, or executability):

### minor — evidence — Close-postcondition line drift

The Plan cites Close's postcondition at `orchestrator.ts:439` (plan T2 step 6
and investigation.md's blast-radius section). The actual line is `:445`
(`if (parseStatusPaths(...).length) throw … "Close postcondition requires a
clean worktree."`). The location is unambiguous by name and the Plan's reasoning
does not depend on the number; the exhaustive `.gitignore`-fixture grep, not the
postcondition line, is the load-bearing correctness check. No correction needed.

### minor — evidence — "7 files" wording in spec T2 scope line

`spec.md:21` says "every test fixture that writes a scratch-repo `.gitignore`
string is updated to match (7 files…)" — but only 6 of the 7 listed test files
write a `.gitignore` fixture string; the 7th (`improvement-report.test.ts:105`)
asserts the mirror path. `plan.md`'s T2 Files section lists all 7 correctly and
the investigation table enumerates every occurrence with line numbers, so the
enumeration itself is complete and accurate (independently re-verified below).
The wording conflation is cosmetic.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `plan/spec.md` | none | AC set is unambiguous and complete | none |
| `plan/plan.md` | none | Task graph, dependency order, file ownership are correct | none |
| `plan/evidence/investigation.md` | none | Cited locations and the blast-radius table are accurate | none |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 (assessments removed; recoverable via git history) | yes | T3 | yes — `git log --diff-filter=D`; `git show <pre-removal>:<path>` | covered |
| AC-2 (4 backlog items, correct source/priority) | yes | T3 (re-verify; items already added) | yes — `codepatrol backlog list --format json` (re-run this session: all 4 present, see below) | covered |
| AC-3 (`mirrorImprovementReport` writes new path) | yes | T2 | yes — `improvement-report.test.ts:105` assertion (plan T2 steps 1→3 establish red→green) | covered |
| AC-4 (Close recovery references new path; Close suite green, unchanged assertion count) | yes | T2 | yes — the 6 close/lifecycle test files; plan T2 steps 5→8 establish red (dirty mirror trips postcondition) → green | covered |
| AC-5 (root `.gitignore` swapped; scratch Close → mirror ignored not dirty) | yes | T2 | yes — live scratch-repo Close + `git status --short` | covered |
| AC-6 (SKILL.md cites new path; governing docs sanction `.codepatrol/docs/`; lint + contract green) | yes | T1, T2 | yes — `npm run lint:skills`; `node --test scripts/skills-contract.test.mjs` | covered |
| AC-7 (`npm run verify` exit 0; zero stale `docs/codepatrol/improvement-reports` refs) | yes | T2, T4 | yes — `applyGate`; `grep -rn` across `*.ts/*.md/*.mjs/*.json` | covered |
| AC-8 (diff matches forecast; `docs/codepatrol/` fully gone) | yes | T4 | yes — `git diff --stat 9cf610d`; `find docs/codepatrol` | covered |

## Simplicity axis

- Selected rung: **confirmed** — direct local change reusing the exact
  governing-doc-amendment-before-code-reference pattern `2026-07-24-backlog-
  subsystem` established for `.codepatrol/backlog/`, plus a mechanical path
  rename across an exhaustively-grepped, fully-enumerated file set. No new
  module, dependency, or abstraction.
- Safety floor: preserved — zero information loss (both deleted docs remain in
  Git history; the four open findings were captured as backlog items *before*
  the spec was written and *before* T3 deletes the source — verified present
  this session); the mirror stays best-effort/non-blocking (only its path
  changes, not `mirrorImprovementReport`'s signature or Close's tolerance); the
  `.gitignore`-fixture move is correctly identified as load-bearing (the direct
  lesson from the backlog subsystem's two Verify returns), not cosmetic.
- Surface delta: necessary and proportionate — 13 files modified + 2 deleted,
  all enumerated; no speculative surface. The decision *not* to introduce a
  shared path-literal constant for the one-time 11-site rename is justified
  (would be speculative abstraction for a change touching each site exactly
  once; no existing codebase pattern centralizes such literals across test
  fixtures).

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| remove | `docs/codepatrol/assessments/*.md` (2 files) | deleted; open content already in backlog | none — AC-1/AC-2 | required by scope |
| reuse | `mirrorImprovementReport` `join()`/`copyFileSync` shape | path segments only | none | already sufficient |
| reuse | `docs/runtime-state.md` backlog paragraph structure | template for new `.codepatrol/docs/` paragraph | none | already sufficient |
| deferred | DC-1 (N1–N4 stay in backlog) | each has ceiling/trigger/upgrade path | none | acceptable |
| deferred | DC-2 (`docs/adr/` stays uncreated) | lazy per `skills/domain-modeling` | none | acceptable |

## Executability audit

- **Mirror-path blast radius (the central risk) — independently re-verified.**
  `rg -n "docs/codepatrol/improvement-reports"` (excluding `node_modules`,
  `.git`, `docs/codepatrol/assessments`) returns exactly the 8 files / 13 lines
  the investigation table enumerates: `skills/codepatrol-plan/SKILL.md:31`;
  `src/change/close-integration.test.ts:18`;
  `src/change/orchestrator-parallel.test.ts:15`;
  `src/change/backlog-close-integration.test.ts:25,49`;
  `src/change/orchestrator.ts:369,370`; `src/change/apply-gate-enforcement.test.ts:16`;
  `src/change/close-push.test.ts:26`; `src/change/git.test.ts:17,97,188,200,227`;
  `src/change/improvement-report.test.ts:105`. Plus the production write site
  `src/change/improvement-report.ts:217` (split path segments `"docs",
  "codepatrol", "improvement-reports"` — not caught by a literal grep, correctly
  identified separately) and `.gitignore:7` (hidden file, `--hidden` confirmed:
  `docs/codepatrol/improvement-reports/`). The `assessments/...workflow.md:42`
  self-citation is correctly excluded (moot via T3). **No missed source site.**
- **Backlog items (AC-2) — re-verified.** `codepatrol backlog list --format json`
  returns all four plan-followup items with `source.kind: "plan-followup"`,
  `source.workId: "2026-07-25-docs-consolidation"`, priorities p1/p2/p2/p3
  (`unsafe-duplicate-yaml-reader…` p1, `orchestrator-transitionchangelocked…`
  p2, `core-module-test-coverage-gaps…` p2, `dead-taxonomy-unused-error-codes…`
  p3), plus the 2 pre-existing close-trace items (correctly noted as unrelated).
- **Cited source locations — re-verified.** `improvement-report.ts:208-213`
  `writeImprovementReport` (durable source) + `:216-221` `mirrorImprovementReport`
  (the copy); `orchestrator.ts:369-370` recovery-branch literals (both present,
  both must move); `AGENTS.md:64-65` "ignored state lives only in
  `.codepatrol/runtime/`" (exactly as quoted); `docs/runtime-state.md:23-25`
  prohibits "architecture namespace" and `:27-31` is the backlog paragraph
  template; `.gitignore:6-7`. `CONTEXT.md` has no relevant reference
  (`rg` exit 1) — correctly out of scope.
- **Deletion safety — re-verified.** `docs/codepatrol/assessments/2026-07-24-
  architecture-v2.md` opens with a "v1 Reconciliation" table resolving all 7 of
  v1's findings (delivered/external/partial/by-design/deferred) and lists
  exactly N1–N4 as its new open findings with severities Low/Medium/Medium/High
  mapping cleanly to the backlog's p3/p2/p2/p1. v1 is fully subsumed by v2.
  `grep -rln "assessments" scripts/ src/` → no hits (zero code blast radius).
- **Red capability.** T2's red signal is genuine: once
  `mirrorImprovementReport` writes to `.codepatrol/docs/…` but before each
  scratch-repo `.gitignore` fixture is updated, that fixture's internal
  `git status` reports the new mirror as untracked, and Close's postcondition
  (`parseStatusPaths(status).length` must be 0; the new path is outside the
  `.codepatrol/runtime/` exemption) fails — the same failure mode the backlog
  subsystem's Verify caught twice. The 6 close/lifecycle test files exercise it.
- **Concurrency safety.** T1→T2 is sequenced (T2's code must not reference
  `.codepatrol/docs/` before T1 sanctions it; same ordering the backlog
  subsystem used). T3 is file-disjoint from T1/T2 (`docs/codepatrol/assessments/`
  only). T4 depends on all. No two independent tasks share a file.
- **Dependencies/rollback.** No new package. Rollback = revert the branch; both
  deleted docs are recoverable via `git log`/`git show`; the mirror is
  rebuildable from its durable source on the next Close.
- **Baseline.** `npm run verify` green (175 tests) at `9cf610d` — established by
  the prior Change's terminal Close (its `applyGate` passed at 175/175). Not
  re-run by Review (Review's role).
- **Context independence.** Verdict grounded in the durable artifacts, the cited
  source files, the independent grep, and the live `backlog list`. No chat
  history required.

## Verdict

`approve`

Plan attempt 1 is decision-complete and executable by an independent
implementer without conversation history. It resolves two live governing-doc
contradictions (the tracked `docs/codepatrol/assessments/` "architecture
namespace" that `docs/runtime-state.md:23-25` prohibits; and the impending
"ignored state lives only in `.codepatrol/runtime/`" falsehood) by retiring the
stale namespace (after extracting its four open findings to the backlog —
verified present) and relocating the rebuildable mirror to a newly-sanctioned
`.codepatrol/docs/`, reusing the exact pattern the closed backlog subsystem
established. The central risk — the 11-site `.gitignore`-fixture synchronization
— is exhaustively enumerated and independently re-verified complete; each
acceptance criterion is unambiguous, mapped to a task, and red-capable. The two
minor observations are non-blocking evidence-precision notes. No defect
survives validation.

Next permitted transition:
`codepatrol-apply 2026-07-25-docs-consolidation on codepatrol/2026-07-25-docs-consolidation`,
gated by the declared `applyGate` (`npm run verify`).

## External evidence sufficiency

`not required` — the design is entirely internal to the Codepatrol project (a
path rename plus a documentation-namespace retirement) and reuses existing
primitives. The load-bearing claims are governing-doc text (amended by T1) and
the exhaustive mirror-path grep, both verified this session.

## Residual concerns and evidence gaps

- No blocking concern. The two minor evidence-precision notes above (post-
  condition line drift `:439`→`:445`; "7 files" wording) do not affect scope,
  interfaces, acceptance, or executability.
- Watch-item for Verify: confirm the live scratch-repo Close run (AC-5) actually
  reports the new mirror as ignored, and that `grep -rn
  "docs/codepatrol/improvement-reports"` across `*.ts/*.md/*.mjs/*.json` returns
  zero after T2+T3 (the Plan's own T4 step 3 check).
- Baseline `npm run verify` was not re-executed by Review (Review's role); taken
  as green at `9cf610d` from the prior Change's terminal Close.
- Per-run provider tokens remain unmeasurable from this harness; recorded
  `unavailable` with reason.
