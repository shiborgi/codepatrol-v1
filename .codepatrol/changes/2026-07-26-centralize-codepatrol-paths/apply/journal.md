# Apply journal — Centralize `.codepatrol/` path-layout knowledge in `shared/state.ts`

## T1 — Add relative-path builders to `shared/state.ts`

**Changed paths:** `src/shared/state.ts` (full-file replacement per plan
step 1, +25/-4)

**Implementation:** replaced file content verbatim per plan.md's code
block — added `CHANGES_DIR`, `BACKLOG_DIR`, `RUNTIME_DIR` private
constants; redirected `stateRoot`, `graphStatePath`, `lockPath`,
`stageSessionPath` bodies to `RUNTIME_DIR` (signatures/return values
unchanged — `RUNTIME_DIR` = `.codepatrol/runtime`, character-for-character
what was inlined before); added `runtimeRelativePrefix`,
`changesRootRelativePath`, `changeDirectoryRelativePath`,
`changeRecordRelativePath`, `changeStageRelativePrefix`,
`backlogRelativePrefix`, `backlogRelativePath`.

**Green:** `npm run typecheck` — 0 errors. `npm test` — 215/215, 0
failures, identical to base commit's count — no consumer calls the new
exports yet, and the four redirected bodies produce byte-identical strings
to their prior inline form, so nothing was expected to change and nothing
did.

**Assessment:** matches plan.md's code block exactly, no deviation. AC-1
satisfied (all 7 new exports present, 4 pre-existing exports reference
`RUNTIME_DIR`). **Verdict: approve**, no blocking finding.

**Deviations:** none.

**Risks:** none new — foundation-only change, zero consumers yet.

## T2 — Redirect `store.ts` to the new builders

**Changed paths:** `src/change/store.ts` (+1 import, `changeRecordPath` body
redirect, `listWorkingTreeChangeIds` 2 lines redirected)

**Implementation:** exactly per plan.md steps 1-3 — new import line for
`changeRecordRelativePath, changesRootRelativePath`; `changeRecordPath`
body now `resolveInside(workspace, changeRecordRelativePath(workId))`;
`listWorkingTreeChangeIds`'s root and per-entry existence check redirected.

**Green:** `npm run typecheck` — 0 errors. `npm test` — 215/215.

**Assessment:** matches plan exactly. **Verdict: approve**.

**Deviations:** none. **Risks:** none new.

## T3 — Redirect `backlog.ts` to the new builder

**Changed paths:** `src/change/backlog.ts` (+1 import, `backlogPath` body
redirect)

**Implementation:** exactly per plan.md — new import line for
`backlogRelativePath`; `backlogPath` body now
`resolveInside(workspace, backlogRelativePath())`.

**Green:** `npm run typecheck` — 0 errors. `npm test` — 215/215.

**Assessment:** matches plan exactly. **Verdict: approve**.

**Deviations:** none. **Risks:** none new.

## T4 — Redirect `validation.ts` to the new builder

**Changed paths:** `src/change/validation.ts` (+1 import, 2 `prefix`
sites redirected via a single `replace_all` edit — both were
byte-identical, so one edit covered `validateWithReader` line 25 and
`validateArtifactBindings` line 44)

**Implementation:** exactly per plan.md — new import line for
`changeStageRelativePrefix`; both `const prefix = ...` sites now
`changeStageRelativePrefix(record.identity.work_id, stage)`.

**Green:** `npm run typecheck` — 0 errors. `npm test` — 215/215. Confirmed
`validation.ts:47`'s `prefix.slice(0, -1)` downstream usage unaffected
(same trailing-slash-terminated shape) — test suite exercising artifact
validation stayed green, consistent with the spec's claim.

**Assessment:** matches plan exactly. **Verdict: approve**.

**Deviations:** none — used `replace_all` for the two byte-identical sites
instead of two separate edits; same end result as the plan's two
individually-described steps. **Risks:** none new.

## T5 — Redirect `session.ts` to the new builders

**Changed paths:** `src/change/session.ts` (extended 1 import, 2 sites
redirected)

**Implementation:** exactly per plan.md — extended the existing
`shared/state.js` import to include `changeDirectoryRelativePath,
changeStageRelativePrefix`; `changePrefix` (`itemIsDelivered`) now
`` `${changeDirectoryRelativePath(workId)}/` ``; `planPath` now derives
from `` `${changeStageRelativePrefix(workId, "plan")}plan.md` ``.

**Green:** `npm run typecheck` — 0 errors. `npm test` — 215/215. Confirmed
`changePrefix`'s three downstream uses (lines 75, 91, 103 pre-edit)
inherited the fix automatically without separate edits, as the plan
predicted.

**Assessment:** matches plan exactly. **Verdict: approve**.

**Deviations:** none. **Risks:** none new.

## T6 — Redirect `orchestrator.ts` (three sub-steps) and final verification

**Changed paths:** `src/change/orchestrator.ts` (+1 import, 33 lines
changed across `relativeRecord`/`parseStatusPaths`/`ensurePath`,
`changeDirectoryForCleanup`, `buildCheckpointEvent` (prefix, `required`
map, backlog literal, 2× `.startsWith` pair), `closeChangeLocked` (4
close-path sites))

**Sub-step A (early helpers):** exactly per plan.md steps 1-3. Green after:
`npm run typecheck` 0 errors, `npm test` 215/215.

**Sub-step B (`buildCheckpointEvent`):** implemented per plan.md steps
6-9, with one **deviation found and corrected during transcription**: the
plan's step 6 (and spec.md's Current evidence / plan.md's task Purpose)
describe the `const prefix = \`.codepatrol/changes/${workId}/${stage}/\`;`
site as living "inside `buildCheckpointEvent`". Reading the actual function
boundaries before editing (`grep -n "const prefix = \|^async function
buildCheckpointEvent\|^async function validateRefArtifacts"`) showed this
site is the **sole occurrence in the file** and lives inside
`validateRefArtifacts` (line 122), not `buildCheckpointEvent` (line 254,
confirmed to have no `const prefix` of its own — its stage-artifact
handling goes through `required`/`paths`/`allowed` instead). This is a
function-name mislabeling in the Plan's supporting prose, not a wrong fix:
the cited literal, its replacement (`changeStageRelativePrefix(record.identity.work_id,
stage)`), and every downstream consumer of `prefix` in that function are
identical either way — `validateRefArtifacts` already had `record` and
`stage` in scope, exactly what the replacement needs. Applied the edit at
its real location (`validateRefArtifacts`) instead of searching for a
non-existent second site inside `buildCheckpointEvent`. Not returned to
Plan: this does not change scope, the design, any AC, or the surface-delta
forecast — it corrects which of the file's ~15 existing functions a
citation named, nothing about what changes or why. Documented per the
"do not hide it in the journal" instruction rather than silently
absorbed — mirrors Review's own independently-caught, separately
non-blocking "15 vs. 17 call sites" evidence-precision finding for the same
Plan artifacts.

The remaining sub-step B edits (`required` map, `allowed`'s backlog
literal, the two `.startsWith` sites in `actualProduction`/`finalProduction`)
were exactly where the plan said, inside `buildCheckpointEvent` — confirmed
by reading the full function body before editing. Green after: `npm run
typecheck` 0 errors, `npm test` 215/215.

**Sub-step C (`closeChangeLocked`):** exactly per plan.md steps 12-14, all
4 close-path sites confirmed present at cited locations before editing.
Green after: `npm run typecheck` 0 errors, `npm test` 215/215.

**Final verification:**
- AC-2: `grep -n '"\.codepatrol/changes\|\`\.codepatrol/changes\|"\.codepatrol/backlog\|\`\.codepatrol/backlog\|"\.codepatrol/runtime\|\`\.codepatrol/runtime' src/change/store.ts src/change/backlog.ts src/change/validation.ts src/change/session.ts src/change/orchestrator.ts` → zero output. Satisfied.
- AC-3: `npm run verify` — typecheck 0 errors, test 215/215, build clean,
  smoke-cli passed, lint-skills clean. Satisfied.
- AC-4: `git diff --stat 2e6549c -- . ':!.codepatrol'` → exactly six files:
  `src/change/backlog.ts`, `src/change/orchestrator.ts` (33 lines),
  `src/change/session.ts` (6), `src/change/store.ts` (7),
  `src/change/validation.ts` (5), `src/shared/state.ts` (40). Satisfied.
- DC-1/DC-2: not triggered — no evidence surfaced a need to touch
  `graph/store.ts` or `git.test-helper.ts`.
- Graph sync: not run — no exported symbol removed or renamed, only
  additive `state.ts` exports and body-only edits elsewhere.
- Rollback: `git revert` of the resulting commit(s) would cleanly restore
  every literal-inlined form; every touched function's external
  signature/name is unchanged throughout.

**Assessment (assess-change axes, self-applied across the whole Change):**
Contract — AC-1 through AC-4 delivered and verified, all red-capable checks
(AC-2's grep genuinely returned non-zero before the fix, confirmed by
Review) now pass. Code — correctness: every one of the ~20 literal sites
identified in Plan evidence was independently re-located by reading the
file immediately before editing it (not solely trusted from the plan's
line numbers, which is exactly how the `buildCheckpointEvent`/
`validateRefArtifacts` mislabeling was caught rather than silently
propagated); zero behavior change proven by identical 215/215 test count
after every one of T1-T6's granular steps, not just once at the end.
Verification quality: `npm test` re-run after every sub-step, not batched.
No undeclared scope — diff is exactly the six forecast files. Simplicity —
matches spec's "direct local change" rung exactly; no speculative surface
added. **Verdict: approve**, no blocking finding.

**Deviations:** the `buildCheckpointEvent`/`validateRefArtifacts` function-
attribution correction described above; no scope, interface, or acceptance
change.

**Risks:** none new — matches spec's Risks and mitigations section; the
one Plan-evidence inaccuracy found (function mislabeling) is exactly the
class of risk the "read the file immediately before editing, not solely
the plan's line numbers" discipline (already applied throughout T2-T6) is
meant to catch, and it did.
