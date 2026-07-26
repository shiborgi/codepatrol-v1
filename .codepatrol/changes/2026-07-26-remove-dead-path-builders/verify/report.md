# Verification — Remove dead `.codepatrol/changes` path-builder helpers (`changeDirectory`, `changeRoot`)

- Change: `2026-07-26-remove-dead-path-builders`
- Verified revision: 1 (Apply attempt 1)
- Verifier: opencode (codepatrol-verify skill)
- Base ref: `948905dfd872b1ef31ec9b5fe5ba4a82cea05f46` (main)
- Head ref: `codepatrol/2026-07-26-remove-dead-path-builders` @ `bd9953d` (Apply checkpoint transition; Apply content checkpoint `490eaed`, tree `0ecc4c6`)
- Evidence date: 2026-07-26T13:46Z

## Scope and instruments

Artifacts read (hashes re-verified against attempt bindings): `plan/spec.md` `f5c93f44…`, `plan/plan.md` `3c95ad99…`, `plan/evidence/investigation.md` `7cf57e11…`, `review/report.md` `de42bf6c…` (approve), `apply/journal.md` `46f3b18c…`. Journal claims treated as hypotheses; every check below was re-executed in this session.

Candidate integrity: Apply checkpoint tree `0ecc4c6` matches the declared binding; `git diff 490eaed HEAD` is **only** `.codepatrol/changes/<id>/change.yaml` (the apply events, +22) — zero production drift between the Apply checkpoint and HEAD. Tree clean at verify time.

Commands executed here: full `npm run verify` (applyGate), `npm test` (decisive counts), `grep`/`rg` word-boundary re-confirmation of removal, `git diff --stat` against base, `codepatrol graph impact --since-ref <base>`. Environment: darwin, no network involved (pure dead-code removal).

## Plan conformance

Single-task Change. Diff audited against `plan.md` T1 (`git diff 948905d HEAD -- src/change/store.ts src/shared/state.ts`):

| Step (plan T1) | Diff evidence | Journaled? |
|---|---|---|
| Re-verify zero callers before deletion | journaled (grep returned only declarations) | yes — and re-confirmed independently here (see AC-1/AC-2) |
| Delete `changeDirectory` from `store.ts` | `store.ts`: one line removed (`export function changeDirectory(...)`) | yes |
| Delete `changeRoot` from `state.ts` | `state.ts`: function + trailing blank line removed (4 lines) | yes |
| `npm run typecheck` → 0 | exit 0 (part of `npm run verify`) | yes |
| Full suite → 215/215 | `npm test` → 215/215, 0 fail | yes |
| `git diff --stat` → exactly two files | `store.ts` + `state.ts`, 5 deletions, 0 insertions | yes |

No deviation. No import statements changed in either file (the deleted functions used only `resolveInside`, which stays imported and used by remaining exports in both files — confirmed by reading the full files).

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of the journal |
|---|---|---|---|
| AC-1 | `grep -n "changeDirectory" src/change/store.ts` → no matches; `rg '\bchangeDirectory\b' src/ scripts/ bin/` → 0 matches | pass | yes |
| AC-2 | `grep -n "changeRoot" src/shared/state.ts` → no matches; `rg '\bchangeRoot\b' src/ scripts/ bin/` → 0 matches | pass | yes |
| AC-3 | `npm run verify` exit 0; `npm test` → `# tests 215, # pass 215, # fail 0` (identical to base count) | pass | yes |
| AC-4 | `git diff --stat 948905d HEAD -- ':!.codepatrol'` → `store.ts 1 -`, `state.ts 4 ----` (2 files, 5 deletions, 0 insertions) | pass | yes |

## Wider suite

`npm run verify` (configured applyGate) — every part exit 0:
- `npm run typecheck` → 0.
- `npm test` → `# tests 215, # pass 215, # fail 0` (duration within the gate).
- `npm run build` → 0.
- `npm run smoke:cli` → `Compiled CLI smoke passed (0.1.0).`
- `npm run lint:skills` → `Skill catalog, frontmatter, dependencies, portability, and relative links are valid.`

## Blast radius

`codepatrol graph impact --since-ref 948905d` → **9 seeds, 36 affected files** (depth 1-2). The seeds are the two changed source files plus Change artifacts; the affected set is the reverse-dependency (import) graph of `store.ts` and `state.ts` — e.g. `orchestrator.ts`, `improvement-report.ts`, `session.ts`, `change.test.ts`. Because the removed exports had **zero callers** (re-confirmed under AC-1/AC-2), none of these consumers is behaviorally affected; the full 215/215 suite (which exercises every impacted module and its tests) confirms no regression. No seam beyond the files' reverse-dependency graph is implicated.

## Regressions

- `store.ts` consumers (`orchestrator.ts`, `improvement-report.ts`, etc.): every remaining export (`changeRecordPath`, `readChangeRecord`, `writeChangeRecord`, `appendChangeEvent`, `listWorkingTreeChangeIds`) is intact and unchanged; their tests pass (change/close/backlog/improvement-report integration suites all green within 215/215).
- `state.ts` consumers (`session.ts`, `graph/store.ts`, `lock.ts`): every remaining export (`stateRoot`, `graphStatePath`, `lockPath`, `stageSessionPath`, `STATE_VERSION`) intact; tests pass.
- No public-interface consumer referenced either removed export (typecheck would have failed otherwise). The near-namesake `changeDirectoryForCleanup` (`orchestrator.ts:195,206`) is a separate, active local function — confirmed present and unaffected.

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| `src/change/store.ts` | yes (AC-1, AC-4) | matches forecast exactly (−1 line) |
| `src/shared/state.ts` | yes (AC-2, AC-4) | matches forecast exactly (−4 lines incl. spacing) |

`git diff --name-only 948905d HEAD -- ':!.codepatrol'` returns exactly these two paths. No undeclared surface.

## Findings

None. The Apply is a verbatim execution of the approved single-task Plan: two pure deletions of zero-caller exports, no other lines touched, no import orphaned, no behavior change possible (unreachable code removed). No `DC-N` trigger activated; DC-1 (no shared helper introduced) remains an accepted deferred constraint.

## Residual risks and evidence gaps

- None material. This is as low-risk a Change as exists in this codebase (removal of provably-unreachable code). The spec's named risk (a grep-missed dynamic caller) is implausible in this codebase's style and would have surfaced as a typecheck failure (missing import) — typecheck is green.
- Review did not introduce or require network access; `gh`/issue-tracker surface is unrelated to this Change.
- The `changeDirectoryForCleanup` near-namesake was explicitly checked and is intact — noted only because a careless substring grep would confuse the two; the word-boundary methodology avoids that.

## Verdict

`commit`

Apply attempt 1 conforms exactly to the approved Plan: `changeDirectory` and `changeRoot` are removed (AC-1, AC-2, confirmed by word-boundary search across `src/`/`scripts/`/`bin/`); the full applyGate (`npm run verify`: typecheck + 215/215 + build + smoke + lint:skills) is green with the test count identical to the base (AC-3, zero regression); the production delta is exactly the two declared files with net 5 deletions and 0 insertions (AC-4); the candidate is intact (Apply checkpoint tree `0ecc4c6`, zero production drift to HEAD); no unplanned surface; and the blast radius is fully covered by the passing suite. The candidate is ready to advance to Close.

Next permitted transition: checkpoint Verify with result `commit`; next action `codepatrol-close 2026-07-26-remove-dead-path-builders commit|rollback on codepatrol/2026-07-26-remove-dead-path-builders`.
