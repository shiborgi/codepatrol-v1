# Review — Structured, prioritized backlog under `.codepatrol/backlog/`: Close/Plan feeding, plan no-arg list, and a Kanban Backlog column

- Change: `2026-07-24-backlog-subsystem`
- Incoming revision: 1
- Reviewed revision: 1 (no adjustments — Review never corrects Plan in place)
- Reviewer: opencode (gatekeeper persona)
- Evidence date: 2026-07-25T01:21:06Z

## Scope and evidence

Checkout on recorded branch `codepatrol/2026-07-24-backlog-subsystem`;
projection Review/ready; working tree clean; plan checkpoint
`521426dc` / tree `b0a37d4f` intact (HEAD `eeabea0`, the checkpoint
metadata commit). Artifact hashes re-verified on disk and match the
checkpoint binding exactly (`spec.md` `ac2a7b62…`, `plan.md`
`bd28b6ce…`, `evidence/investigation.md` `461659bd…`). Plan-checkpoint
diff purity confirmed: only the three `plan/` artifacts plus
`change.yaml`.

Artifacts read in full: `plan/spec.md`, `plan/plan.md`,
`plan/evidence/investigation.md`.

Load-bearing cited locations re-verified on the working tree at base
`8b47438`:

- `src/change/improvement-report.ts:61` `generateImprovementReport` →
  `recommendations` (`:18`,`:157`); 5 non-filler templates
  (`:136,:139,:142,:145,:148`); 2 filler strings (`:133,:152`).
- `src/change/orchestrator.ts:390` best-effort `try/catch` (import
  `:11`); `writeImprovementReport`/`mirrorImprovementReport` each have
  one production call site.
- `src/change/session.ts:19` exact-keys validate;
  `src/shared/atomic-store.ts:5` `atomicWriteFile`;
  `src/change/trace.ts:81` `read`;
  `src/change/types.ts:52` `StartChangeInput`;
  `orchestrator.ts:40,165` `assertStartInput`/`startChangeLocked`.
- `src/cli/args.ts:32,37,125`; `src/cli/output.ts:139-154`;
  `src/cli/commands.ts:104-106` (`change.start` passes
  `readJsonInput(...) as StartChangeInput` directly, so an optional
  `backlogItemId` flows through once `assertStartInput` allows it —
  confirmed sound).
- Recurring dedup evidence at
  `.codepatrol/changes/2026-07-24-project-structure-review/close/improvement-report.md:39`.
- `.codepatrol/backlog/items.yaml` is not gitignored; `.codepatrol/backlog/`
  absent on `main`.

The prior-attempt contract defect (root-`.codepatrol/` global ledger vs
`AGENTS.md:16` / `docs/runtime-state.md:23`) is **resolved**: the
maintainer explicitly sanctioned `.codepatrol/backlog/`, and T1 amends
both governing docs plus adds a `CONTEXT.md` term in the same Change.
Bundling a governing-source amendment with the feature is acceptable
here because it is explicit, declared, and its rationale is inseparable
from the feature — the alternative (a separate 3-line doc Change) adds
lifecycle overhead without changing the decision.

Limitations: Review did not re-run the full gate (`npm run verify` is
Apply's job); baseline green at `8b47438` is taken as established (that
commit is the prior Change's terminal commit). No production code was
modified.

## Findings

### major — plan/executability

**The Kanban has two production render paths, but the Plan's T7
declares file ownership that omits the second one and falsely claims
disjointness, and AC-6 under-scopes the Kanban to only the script. An
implementer following the Plan literally would deliver a `codepatrol
status` Kanban with an empty/absent Backlog column — the primary
Kanban command the maintainer asked for.**

Verified facts:

- `codepatrol status` IS the Kanban: `src/cli/commands.ts:52-55`
  `case "status"` calls
  `projectKanban(inspectChanges(…), …)` then
  `text: renderKanbanMarkdown(data)`. This is distinct from `case "next"`
  at `:57` (which uses `renderNext`, not the Kanban).
- The second render path is `scripts/render-kanban.mjs`, which calls the
  same `projectKanban`/`renderKanbanMarkdown`.
- These are the only two production callers of `projectKanban`
  (`rg projectKanban src scripts` → `commands.ts:54` and
  `render-kanban.mjs`).

Defects in the Plan:

1. **AC-6 under-scopes** (`spec.md:135`): "The Kanban
   (`scripts/render-kanban.mjs --format markdown`) renders a first
   'Backlog' column …". It names only the script; the primary
   `codepatrol status` Kanban is not asserted. Once `board.ts` changes
   `renderKanbanMarkdown`'s header to add a "Backlog" column, the
   status path renders that header — but if it does not pass backlog
   items to `projectKanban`, its rows carry no backlog data and no
   backlog-only rows appear. The two Kanban views would disagree.
2. **T7 file declaration is incomplete and its disjointness claim is
   false** (`plan.md:207-212`): T7 lists only `src/change/board.ts` and
   `src/change/board.test.ts` and states "disjoint from T3–T6 files".
   But to keep `projectKanban` pure (the Plan's own choice), BOTH
   render-path callers must fetch and pass `readBacklog(workspace).items`.
   The status call site is `src/cli/commands.ts:54` — and
   `src/cli/commands.ts` is T6's file (the `next` case at `:57`). So T7
   must also edit `src/cli/commands.ts`, which (a) is missing from T7's
   Files list and (b) directly violates the Plan's Global constraint
   ("two independent tasks never write the same file or module") and
   T7's "disjoint from T3–T6" claim. (T7's prose step 3 does mention
   "render-kanban.mjs/commands.ts pass readBacklog", contradicting its
   own Files list and dependency line.)

Impact: an independent implementer working from `spec.md`+`plan.md`
alone would most plausibly update `board.ts`, `render-kanban.mjs`, and
the `board.test.ts`, then either skip the `status` case (delivering a
broken primary Kanban) or edit `commands.ts` in T7 and collide with T6.
Either outcome fails the maintainer's "nova coluna inicial no kanban"
requirement on the command users actually run.

Required correction (next Plan attempt): (a) widen AC-6 to assert that
BOTH `codepatrol status` and `scripts/render-kanban.mjs` render the
Backlog column with backlog-only rows and linked promoted rows; (b) add
`src/cli/commands.ts` (the `status` case) to T7's Files list; (c) make
T7 depend on T6 (both edit `src/cli/commands.ts` — sequenced, not
concurrent) and delete the "disjoint from T3–T6" claim. (Alternatively,
move the `status`-case edit into T6 and have T6 depend on T2 as well;
either sequencing resolves the collision.) This is bounded — the Kanban
architecture (KanbanRow.backlog cell, item↔Change linkage via workId,
backlog-only rows) is correct and needs no re-derivation.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none (Review does not correct Plan in place) | AC-6 must be widened to both Kanban render paths | AC-6 |
| `plan.md` | none | T7 Files list must add `src/cli/commands.ts` (status case); T7 must depend on T6, not claim disjointness | AC-6 |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 (add → create + dedup-bump, keep higher priority) | yes | T2, T3 | yes — `backlog.test.ts` + `cli.test.ts` | covered |
| AC-2 (list text/json ordered + `--status`) | yes | T2, T3 | yes — `cli.test.ts` | covered |
| AC-3 (Close feed: non-filler→item w/ priority; filler→none; hook failure non-blocking) | yes | T4 | yes — close-integration test | covered |
| AC-4 (`next --stage plan` Backlog section + json `backlog[]`; other stages omit) | yes | T6 | yes — `cli.test.ts` | covered |
| AC-5 (`change start --backlogItemId` links + schedules; missing id → `INVALID_ARGUMENT` pre-branch) | yes | T5 | yes — start-linkage test | covered |
| AC-6 (Kanban first "Backlog" column; backlog-only rows; promoted flow) | **partially** — names only `render-kanban.mjs`, omits `codepatrol status` | T7 | yes for the script path; **missing** the status path | **blocked by the finding** |
| AC-7 (governing docs sanction; CONTEXT term; plan SKILL; skills-contract) | yes | T1, T8 | yes — `skills-contract.test.mjs` + grep | covered |
| AC-8 (`npm run verify` exit 0) | yes | T9 | yes — applyGate | not yet runnable |

## Simplicity axis

- Selected rung: confirmed — one new leaf module reusing `session.ts`
  validation, `store.ts`/`atomic-store.ts` writes, the `next`/`renderNext`
  branch, the `board.ts` projector, and the existing Close best-effort
  block. The dedup-key + P0–P3 classification + item↔Change linkage is
  the irreducible core, hidden behind `backlog.ts`.
- Safety floor: preserved — Close's backlog write is best-effort and
  non-blocking; schema validation is fail-closed; start linkage validates
  item existence before branch creation; the governing-doc amendment
  keeps implementation and sources of truth consistent.
- Surface delta: necessary and proportionate, except the Kanban render
  surface is under-enumerated (the finding). No speculative surface.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| reuse | `session.ts`/`atomic-store.ts`/`renderNext`/`projectKanban` | reused as-is | none | already sufficient |
| simplify | Kanban render paths (`status` + `render-kanban.mjs`) | Declare both call sites in T7; pass backlog items from both | closes AC-6 gap and the file-collision | required correction (returns to Plan) |
| built-in | dedup via digit-strip; P0–P3 keyword classification | correct for the cited evidence | none | already sufficient |
| deferred | DC-1 promote / DC-2 auto-priority ceiling / DC-3 semantic dedup / DC-4 backfill | each has a known ceiling, observable trigger, bounded upgrade path | none | acceptable |

## Executability audit

- Paths/interfaces: all cited source locations exist and match
  (verified above). `change.start`'s direct JSON pass-through confirms
  T5's optional-field approach works once `assertStartInput` allows it.
- Dependencies: no new package; `backlog.ts` is a leaf under
  `src/change/`. T4/T5 correctly sequence on `orchestrator.ts`; T3/T6
  correctly sequence on the CLI files. **T6/T7 do not** — see finding.
- Commands: the test/gate commands match available tooling.
- Expected red/green: each behavior-new task names a failing-test-first
  step; credible.
- Rollback: revert the branch; `.codepatrol/backlog/items.yaml` is new.
- Context independence: this verdict is grounded entirely in the
  durable artifacts, the cited source files, and the two Kanban render
  paths verified this session. No chat history is required.

## Verdict

`fix-first`

The Plan is materially sound and a clear improvement over attempt 1:
the governing-contract defect is resolved (explicit maintainer sanction
+ T1 amendment of `AGENTS.md:16` and `docs/runtime-state.md`), the
backlog module/dedup/P0–P3 classification/Close hook/start
linkage/`next` rendering are all correctly specified and independently
verified, and AC-1–AC-5 and AC-7 are red-capable. However, one bounded
executability defect blocks a clean Apply: the Kanban has two
production render paths (`codepatrol status` at `commands.ts:54` and
`scripts/render-kanban.mjs`), but T7 declares only `board.ts`/
`board.test.ts`, falsely claims disjointness from T3–T6, and AC-6 names
only the script — so the primary `codepatrol status` Kanban would ship
without a working Backlog column, and T6/T7 would collide on
`src/cli/commands.ts`. This must return to a new Plan attempt to widen
AC-6 to both render paths, add the `status` case to T7's files, and
make T7 depend on T6. The Kanban architecture itself needs no
re-derivation.

Next permitted transition (returned to Plan):
`codepatrol-plan 2026-07-24-backlog-subsystem on codepatrol/2026-07-24-backlog-subsystem`
— fix AC-6 to cover both Kanban render paths; add
`src/cli/commands.ts` (status case) to T7 and make T7 depend on T6
(removing the false disjointness); leave the rest of the design intact.

## External evidence sufficiency

`not required` — the design is internal to the Codepatrol project
structure and reuses existing primitives. The load-bearing claim is the
governing-invariant text in `AGENTS.md`/`docs/runtime-state.md` (being
amended by T1) and the two Kanban render paths in `commands.ts`/
`render-kanban.mjs`, both checked this session.

## Residual concerns and evidence gaps

- The single major finding above is the only blocking concern. All
  cited source evidence is independently confirmed; AC-1–AC-5 and AC-7
  are red-capable; no other critical/major/minor finding survives.
- Baseline `npm run verify` was not re-executed by Review (Review's
  role); taken as green at `8b47438` per the prior Change's terminal
  commit.
- One watch-item for the next attempt's Verify: `projectKanban` is
  currently a pure projector; adding the `backlogItems` parameter keeps
  it pure but means EVERY caller must pass items — confirm no third
  caller appears (today there are exactly two).
- Per-run provider tokens remain unmeasurable from this harness;
  recorded `unavailable` with reason.
