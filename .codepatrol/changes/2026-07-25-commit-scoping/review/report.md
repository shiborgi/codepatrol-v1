# Review — Scope every lifecycle bookkeeping commit to its own intended paths

- Change: `2026-07-25-commit-scoping`
- Incoming revision: 2 (Plan attempt 2)
- Reviewed revision: 2
- Reviewer: claude-sonnet-5 (default persona)
- Evidence date: 2026-07-25T15:41:30Z

## Scope and evidence

Reviewed at branch `codepatrol/2026-07-25-commit-scoping`, Plan attempt 2 checkpoint `6bc06ad` (transition commit `0caaa3b`), base `bcaa3c2`, clean worktree (porcelain empty). This attempt is the Plan response to review attempt 1's `fix-first` return.

Attempt-2 declared artifact hashes re-computed and matched `change.yaml` exactly:

- `plan/spec.md` → `a670871f…46d0f5` (intent `modify`) ✓
- `plan/plan.md` → `0ec62a2f…89d226` (intent `modify`; hash byte-identical to attempt 1) ✓
- `plan/evidence/investigation.md` → `813f692a…32987a` (intent `modify`) ✓

Diff `b68f3ee` (attempt 1 plan content) → `6bc06ad` (attempt 2 plan content), full tree: only `change.yaml` (lifecycle events), `plan/spec.md` (8 lines), and `plan/evidence/investigation.md` (6 lines) changed. **No production code changed** between the two checkpoints, so the code-citation verification performed in review attempt 1 (and re-confirmed below) carries forward unchanged. `plan.md` is not in the diff (byte-identical), consistent with the finding having been evidence-only.

The attempt-1 → attempt-2 textual diff is **exactly and only** the correction flagged in review attempt 1: every changed line is a `2026-07-24-docs-consolidation` → `2026-07-25-docs-consolidation` replacement (spec.md lines 13, 29, 36, 96; investigation.md lines 5, 9, 13). No scope, design, AC, task, or simplicity change was introduced. The literal pathspec sample `docs/codepatrol/assessments/2026-07-24-architecture-v2.md` (a real file path quoted from the incident's error message, not a Change id) is correctly left untouched.

Re-verified that the now-corrected durable citations resolve: `git cat-file -e` against terminal tag `codepatrol/committed/2026-07-25-docs-consolidation` confirms `.codepatrol/changes/2026-07-25-docs-consolidation/{apply/journal.md, verify/report.md, close/improvement-report.md}` all exist (immutable tag). The improvement-report mirror `.codepatrol/docs/improvement-reports/2026-07-25-docs-consolidation.md` and its `OPERATION_FAILED | 6` Top-errors row (with the verbatim pathspec sample) remain present, as does the backlog origin item `top-error-code-operation-failed-investigate-the-first-occurrence-s-args-and-stage-context`.

Code citations carried forward from review attempt 1, all still accurate at base `bcaa3c2` (production code unchanged):

- `src/change/git.ts:18` interface `commit(message, allowEmpty?, signal?)`; `:32` single impl `NodeGitAdapter`; `:75`/`:76` `add()`/`unstage()` use `["<verb>", "--", ...paths]`; `:77-80` `commit()` has no pathspec tail.
- `src/change/orchestrator.ts`: `:95-98` `commitMetadata`; `:264-270` checkpoint pre-commit audit; `:289-290` checkpoint commit; `:291-292` post-commit validation; `:395` Close receipt guard; `:400` receipt commit; `:418` terminal commit; `:420` `trace.close`.
- Production `.commit(` site count: exactly 4 (`orchestrator.ts:97, :290, :400, :418`) — re-confirmed via `rg`.
- `commitMetadata` invocations `:190`/`:227`/`:305`/`:377` all route through the single `:97` commit, so the fix covers all four.
- Test doubles `git.test.ts:32-` (`FailAfterCheckoutGit`, `FailAfterMergeGit`, `FailInitialCommitGit`, `CoordinatedStartGit`, `ForeignWinnerGit`) — none declares an incompatible `commit()` override; the optional 4th parameter is backward-compatible.

## Findings

None. The single review-attempt-1 finding (minor/evidence — systematic mis-citation of the source Change id) has been corrected precisely and completely, with no collateral change. No new defect was introduced.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none (attempt-2 already corrects the citation) | review attempt-1 finding resolved | none |
| `plan/evidence/investigation.md` | none (attempt-2 already corrects the citation) | review attempt-1 finding resolved | none |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 (optional pathspec; byte-identical when omitted) | yes | T1, T3 | yes — existing `git.test.ts` suite stays green pre-T2; new param is optional | covered |
| AC-2 (unrelated staged file excluded from `commitMetadata` commit, remains staged) | yes | T2, T3 | yes — T3 stages an unrelated file via raw `git add`, triggers a `"usage"` transition, asserts exclusion + still-staged; red demonstrated by temporarily reverting T2's `commitMetadata` change | covered |
| AC-3 (receipt + terminal commits exclude unrelated staged content) | yes | T2, T3 | yes — T3 companion assertion in `close-integration.test.ts`/`close-push.test.ts` | covered |
| AC-4 (checkpoint commit passes its own paths; existing validation untouched) | yes | T2 | yes — full checkpoint suite stays green; `:264-270`/`:291-292` preserved | covered |
| AC-5 (`npm run verify` exit 0) | yes | T4 | yes — `applyGate` machine-gates the `implemented` checkpoint | covered |

## Simplicity axis

- Selected rung: **confirmed** — direct local change; one optional interface parameter reused at 4 existing call sites whose path arrays each site already computes for its preceding `git.add()`. Mirrors the existing `add()`/`unstage()` `["<verb>", "--", ...paths]` convention in `git.ts`.
- Safety floor: checkpoint commit's pre/post-commit validation (`orchestrator.ts:264-270`, `:291-292`) preserved unmodified as defense-in-depth; fix is strictly non-destructive (unrelated staged content stays staged); `AGENTS.md`'s "preserve unrelated user changes" directive honored more strictly.
- Surface delta: `src/change/git.ts`, `src/change/orchestrator.ts`, `src/change/git.test.ts` (+ a companion Close-lifecycle test file). No new files, dependencies, config, or runtime-state change — matches the spec forecast.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| — | — | already sufficient | — | no finding survives validation on the simplicity axis |

Deferred constraint DC-1 retains a known ceiling, observable trigger, and bounded upgrade path.

## Executability audit

- Paths/interfaces: `GitAdapter.commit` signature change is additive and optional; all 4 orchestrator call sites have their path array already in local scope. No unresolved dependency.
- Commands: gate `npm run verify` is the project's existing gate, re-enforced at Apply seal via `.codepatrol/config.json` `applyGate`.
- Red/green: T3's red-capability is well-specified (temporarily revert T2's `commitMetadata` edit, observe the unrelated file wrongly in `git show --name-only HEAD`, restore). Helper shape present in the anchor test `git.test.ts:186-196`.
- Rollback: revert the branch; purely additive/hardening, no migration.
- Context independence: fix localized to `NodeGitAdapter.commit()`'s arg construction.
- Unresolved assumption: none.

## Verdict

`approve`

Plan attempt 2 corrects the only finding from review attempt 1 (the source Change id citation) precisely and completely, with no collateral change to scope, design, acceptance criteria, tasks, or production code. The technical diagnosis, exhaustive 4-site call audit, pathspec-restriction fix, backward-compatible interface change, red-capable regression plan, simplicity choice, and all code/evidence citations are independently verified and now fully resolve. The Plan is complete enough for an independent implementer. Next permitted transition: Review checkpoint with result `approve`, advancing the Change to Apply. Next action: `codepatrol-apply 2026-07-25-commit-scoping on codepatrol/2026-07-25-commit-scoping`.

## External evidence sufficiency

Not required. No external/dependency/protocol claim governs the design. The only external semantics invoked — standard `git commit [--] <pathspec>` behavior and its composition with `--allow-empty` — are well-established Git behavior, not a Codepatrol-specific or third-party mechanism, and require no Reference Concept Analysis.

## Residual concerns and evidence gaps

- Per-event trace for the original incident remains unrecoverable (deleted at Close by design); root-caused from durable `apply/journal.md` + `verify/report.md` of `2026-07-25-docs-consolidation`, which the investigation flags and handles correctly.
- The investigation enumerates `commitMetadata` invocations at `:190`/`:227`/`:305` but omits `:377` (Close terminal-state recovery); harmless — the fix lands inside `commitMetadata` and covers `:377` automatically. Recorded for completeness; does not block approval.
- A 5th test double (`ForeignWinnerGit`) exists beyond the 4 enumerated; it inherits a compatible `commit()` override. Backward-compatibility conclusion holds. Recorded for completeness; does not block approval.
