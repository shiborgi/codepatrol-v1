# Review — Remove dead `.codepatrol/changes` path-builder helpers (`changeDirectory`, `changeRoot`)

- Change: `2026-07-26-remove-dead-path-builders`
- Incoming revision: 1 (Plan attempt 1)
- Reviewed revision: 1
- Reviewer: opencode (codepatrol-review skill)
- Evidence date: 2026-07-26T13:35Z

## Scope and evidence

- `codepatrol change inspect --id 2026-07-26-remove-dead-path-builders` → stage `review`, attempt 1, state `ready`; checked out on `codepatrol/2026-07-26-remove-dead-path-builders` at `fd7817e` (plan checkpoint transition; plan content `59f54f8`, tree `3adedd2`). Clean tree.
- Artifact hashes re-verified (`shasum -a 256`): `spec.md` `f5c93f44…`, `plan.md` `3c95ad99…`, `investigation.md` `7cf57e11…` — all match the attempt-1 bindings.
- Baseline: `main` @ `948905d`; confirmed equal to `main` HEAD and an ancestor of the branch — no target advance. `git diff --name-only 948905d HEAD -- ':!.codepatrol'` is empty → the branch has touched no production code, so the suite run here is the true base.
- Load-bearing claim independently re-verified with word-boundary search across the **whole repo** (not just `src/`): `rg '\bchangeDirectory\b'` → exactly one match (`src/change/store.ts:11`, the declaration); `rg '\bchangeRoot\b'` → exactly one match (`src/shared/state.ts:17`, the declaration). Zero callers in production or test code. No barrel/index re-export exists.
- The substring `changeDirectory` also matches `changeDirectoryForCleanup` in `src/change/orchestrator.ts:195,206` — a **different**, actively-used local function. The spec/investigation's use of word-boundary `\b` correctly excludes it; it is not in scope and not at risk. Confirmed its caller (`rmSync(...)` at orchestrator.ts:195) is intact and unrelated.
- Both files read in full: `store.ts` (33 lines) — `changeDirectory` (line 11) uses only `resolveInside`, which stays imported and used by `changeRecordPath` (12) and `listWorkingTreeChangeIds` (31-32); `state.ts` (23 lines) — `changeRoot` (17-19) uses only `resolveInside`, which stays used by `stateRoot`/`graphStatePath`/`lockPath`/`stageSessionPath`. **Neither deletion orphans an import or changes any other export.**
- `listWorkingTreeChangeIds` (`store.ts:30-32`) builds `.codepatrol/changes` via an inline literal, not via either helper — confirming both helpers are orphaned scaffolding, not the "intended" path-builder.
- Baseline test count re-executed: `npm test` → `# tests 215, # pass 215, # fail 0` — matches the spec's AC-3 pinned number exactly (not stale).

## Findings

None. The Plan's central evidence (zero callers for both functions) is correct and freshly re-confirmed. The deletion is provably behavior-preserving: removing two unreachable exports cannot change any observable behavior, and no import is orphaned.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none | Contract complete; cited evidence verified | — |
| `plan.md` | none | Single-task plan is executor-ready | — |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes — `grep -n "changeDirectory" src/change/store.ts` returns no matches | T1 | yes — grep is decisive pre/post deletion | covered |
| AC-2 | yes — `grep -n "changeRoot" src/shared/state.ts` returns no matches | T1 | yes | covered |
| AC-3 | yes — `npm run verify` passes at 215/215 (baseline confirmed here) | T1 | yes — typecheck fails loudly if a caller existed; test count pins the regression bound | covered |
| AC-4 | yes — `git diff --stat` touches only the two files | T1 | yes — diff --stat is a hard, observable bound | covered |

## Simplicity axis

- Selected rung: **confirmed** — direct local change (pure deletion). No "ladder" applies; the correction is inherently minimal.
- Safety floor: re-verify zero callers immediately before deletion (T1 step 1) with a stop-on-second-match contract-defect path; `typecheck`/`test` fail loudly on any missed caller. Retained.
- Surface delta: confirmed — `store.ts` −1 line, `state.ts` −2-3 lines; no new files, no dependency, net removal of two public exports.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| — | — | already sufficient — no speculative or removable surface survives | none | — |

DC-1 (no shared path-builder introduced) has a known ceiling, observable trigger (a second real call site), and bounded upgrade path — accepted, not silently worked around.

## Executability audit

- The plan correctly frames the red signal for a pure-deletion task: there is no traditional failing test (no test references either function — confirmed by `rg '\b(changeDirectory|changeRoot)\b' src/**/*.test.ts` = empty); instead T1 step 1's grep is the characterization check, with an explicit "STOP → contract defect → return to Plan" on any second match. That is a sound, falsifiable gate for this class of change.
- Paths/interfaces: only `src/change/store.ts` and `src/shared/state.ts`; no import statements change in either file (verified). AC-4's two-file bound is therefore achievable.
- Rollback: single-commit revert restores both unused functions (status quo ante). No migration.
- Context independence: plan is self-contained; every load-bearing fact is a cited `file:line` re-checkable by grep.
- No unresolved assumption. The one risk the spec names (a grep-missed dynamic caller) is implausible in this codebase's style and would be caught by `typecheck` (missing-import) — verified there is no dynamic/reflective access pattern for these identifiers.

## Verdict

`approve`

Plan attempt 1 is contract-complete and executor-ready. Both functions have zero callers (independently re-confirmed by word-boundary search across the whole repo); the deletions orphan no import and touch no other export; the 215/215 baseline is real; all four ACs are unambiguous and red-capable; scope is one finding (F2 correctly deferred to its own Change); and the simplicity rung is direct local change with no speculative helper. The Review checkpoint may advance to Apply.

Next permitted transition: checkpoint Review with result `approve`; next action `codepatrol-apply 2026-07-26-remove-dead-path-builders on codepatrol/2026-07-26-remove-dead-path-builders`.

## External evidence sufficiency

Not required. No external claim governs this Change — it is a mechanical, repo-internal dead-code removal whose entire basis is local grep evidence, all re-verified here.

## Residual concerns and evidence gaps

- None blocking. Review did not run `npm run verify` post-deletion (no deletion has happened yet — that is Apply/Verify authority); the 215/215 baseline was re-run here to ground AC-3's pinned count.
- The `changeDirectoryForCleanup` near-namesake in `orchestrator.ts` is explicitly out of scope and was confirmed intact; noted only because a careless substring grep would confuse the two — the plan's word-boundary methodology avoids that trap.
