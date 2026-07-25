# Review — Structured, prioritized backlog under `.codepatrol/backlog/`: Close/Plan feeding, plan no-arg list, and a Kanban Backlog column

- Change: `2026-07-24-backlog-subsystem`
- Incoming revision: 2
- Reviewed revision: 2 (no adjustments — Review never corrects Plan in place)
- Reviewer: opencode (gatekeeper persona)
- Evidence date: 2026-07-25T01:42:59Z

## Scope and evidence

Checkout on recorded branch `codepatrol/2026-07-24-backlog-subsystem`;
projection Review attempt 2/ready; working tree clean; plan attempt 2
checkpoint `1d4a8ae1` / tree `55ae4768` intact (HEAD `492ef21`, the
checkpoint metadata commit). Artifact hashes re-verified on disk and
match the checkpoint binding exactly (`spec.md` `83f67965…`, `plan.md`
`0daa3c12…`, `evidence/investigation.md` `fd7dd4fa…`).

Artifacts read in full: `plan/spec.md`, `plan/plan.md`,
`plan/evidence/investigation.md`. Review attempt 1's returned report
was read from the `stage-returned` event's `reason` (the report file
was correctly cleared on re-plan; its finding survives in that reason
and in git history).

This review focuses on (a) confirming attempt 1's finding is resolved,
(b) a full file-ownership audit of the 9-task graph, and (c) checking
for any new defect. Cited source locations were re-verified in attempt
1's review and are unchanged at base `8b47438`; the two Kanban render
paths were re-confirmed this session.

## Resolution of the attempt-1 finding

Attempt 1 returned `fix-first` on one major finding: the Kanban has
two production render paths, but T7 declared only `board.ts`/
`board.test.ts` with a false "disjoint from T3–T6" claim, and AC-6
named only the script. Verified resolved:

- **AC-6 widened** (`spec.md:135`): now asserts BOTH
  `codepatrol status --format markdown` (`src/cli/commands.ts:54`, the
  primary Kanban) AND `scripts/render-kanban.mjs --format markdown`
  render the first "Backlog" column, with an explicit "the two views
  agree (both pass `readBacklog(workspace).items` to `projectKanban`)"
  clause.
- **T7 files completed** (`plan.md:209-214`): now declares
  `src/change/board.ts`, `src/change/board.test.ts`,
  `src/cli/commands.ts` (the `status` case at `:54`), and
  `scripts/render-kanban.mjs`.
- **T7 dependency corrected** (`plan.md:207`): "Depends on: T2 … and
  T6 (T7 also edits `src/cli/commands.ts` … which T6 owns; sequenced)";
  the false disjointness claim is removed.
- **Dependency-order and acceptance-mapping lines updated** to match
  (`plan.md:43`, `plan.md:37`).
- **Render-path count re-confirmed**: `rg "projectKanban\(" src scripts`
  → exactly two production callers — `src/cli/commands.ts:54` and
  `scripts/render-kanban.mjs:31` (plus the `board.ts:19` definition and
  `board.test.ts` test calls). No third caller exists.

## Full file-ownership audit (concurrency safety)

The plan's Global constraint requires that two independent tasks never
write the same file; any shared file must carry a dependency edge.
Matrix of shared files:

| File | Tasks | Dependency edge | OK |
|---|---|---|---|
| `src/cli/commands.ts` | T3, T6, T7 | T3 (backlog cases) → T6 (next case) → T7 (status case) | yes |
| `src/cli/output.ts` | T3, T6 | T6 → T3 | yes |
| `src/cli/cli.test.ts` | T3, T6 | T6 → T3 | yes |
| `src/change/orchestrator.ts` | T4, T5 | T5 → T4 | yes |

All other declared files are single-owner (`backlog.ts`/`backlog.test.ts`
T2; `args.ts` T3; `types.ts`, `start-backlog-link.test.ts` T5;
`close-integration.test.ts` T4; `board.ts`/`board.test.ts`/
`render-kanban.mjs` T7; `SKILL.md`/`skills-contract.test.mjs` T8;
governing docs T1). No two independent tasks share a file. The linear
sequence `T1 → … → T9` respects every edge. The plan is concurrency-safe.

## Findings

No critical, major, or minor findings survive validation. The
attempt-1 defect is fully resolved, the file-ownership matrix is
consistent, and no new defect was introduced by the revision.

Two non-blocking implementation notes for Apply (not findings):

- T4 step 1(c) (forcing the Close hook to throw to prove
  non-blocking) is slightly open on the exact injection mechanism; the
  intent is unambiguous and the test is red-capable — Apply may choose
  any sound injection (e.g. a workspace where `upsertBacklogItem`
  throws).
- T5's pre-branch validation reuses `linkBacklogItem` semantics; a
  read-only existence check before `createBranch` is the right shape.
  Apply may factor a small `findBacklogItem` helper. Neither affects
  scope, interfaces, or acceptance.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `plan/spec.md` | none | AC-6 is correct | none |
| `plan/plan.md` | none | Task graph and file ownership are correct | none |
| `plan/evidence/investigation.md` | none | The attempt-2 note records the finding and the rework-checkpoint mechanic correctly | none |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 (add → create + dedup-bump, keep higher priority) | yes | T2, T3 | yes — `backlog.test.ts` + `cli.test.ts` | covered |
| AC-2 (list text/json ordered + `--status`) | yes | T2, T3 | yes — `cli.test.ts` | covered |
| AC-3 (Close feed: non-filler→item w/ priority; filler→none; hook failure non-blocking) | yes | T4 | yes — close-integration test | covered |
| AC-4 (`next --stage plan` Backlog section + json `backlog[]`; other stages omit) | yes | T6 | yes — `cli.test.ts` | covered |
| AC-5 (`change start --backlogItemId` links + schedules; missing id → `INVALID_ARGUMENT` pre-branch) | yes | T5 | yes — start-linkage test | covered |
| AC-6 (BOTH Kanban render paths show Backlog column; backlog-only rows; promoted flow) | yes | T7 | yes — `board.test.ts` + `codepatrol status` + `render-kanban.mjs` | covered |
| AC-7 (governing docs sanction; CONTEXT term; plan SKILL; skills-contract) | yes | T1, T8 | yes — `skills-contract.test.mjs` + grep | covered |
| AC-8 (`npm run verify` exit 0) | yes | T9 | yes — applyGate | runnable at Apply |

## Simplicity axis

- Selected rung: confirmed — one new leaf module reusing `session.ts`
  validation, `store.ts`/`atomic-store.ts` writes, `next`/`renderNext`,
  the `board.ts` projector, and the existing Close best-effort block.
  `projectKanban` stays pure via an optional `backlogItems` parameter
  (no workspace read inside the projector) — the right call for
  testability.
- Safety floor: preserved — Close's backlog write is best-effort and
  non-blocking; schema validation is fail-closed; `change start` linkage
  validates item existence before branch creation; the governing-doc
  amendment keeps implementation and sources of truth consistent.
- Surface delta: necessary and proportionate; now fully enumerated
  (both Kanban render paths declared). No speculative surface.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| reuse | `session.ts`/`atomic-store.ts`/`renderNext`/`projectKanban` | reused as-is | none | already sufficient |
| built-in | dedup via digit-strip; P0–P3 keyword classification | correct for the cited evidence | none | already sufficient |
| deferred | DC-1 promote / DC-2 auto-priority ceiling / DC-3 semantic dedup / DC-4 backfill | each has a known ceiling, observable trigger, bounded upgrade path | none | acceptable |

## Executability audit

- Paths/interfaces: all cited source locations exist and match (re-verified
  in attempt 1; the two render paths re-confirmed this session).
  `change.start`'s direct JSON pass-through confirms T5's optional-field
  approach works once `assertStartInput` allows it.
- Dependencies: no new package; `backlog.ts` is a leaf under `src/change/`.
  Every shared file has a dependency edge (audited above).
- Commands: the test/gate commands match available tooling; each task is
  test-first with a named red signal.
- Rollback: revert the branch; `.codepatrol/backlog/items.yaml` is new.
- Context independence: this verdict is grounded entirely in the durable
  artifacts, the cited source files, and the render-path grep. No chat
  history is required.

## Verdict

`approve`

Plan attempt 2 resolves the single bounded defect that returned attempt
1: AC-6 now asserts both Kanban render paths (`codepatrol status` and
`render-kanban.mjs`), T7 declares the `status`-case and `render-kanban.mjs`
edits and correctly depends on T6, and the file-ownership matrix is
concurrency-safe (every shared file carries a dependency edge). No new
defect was introduced. The governing-contract amendment (T1) keeps the
implementation consistent with `AGENTS.md`/`docs/runtime-state.md`, the
backlog module/dedup/P0–P3/Close hook/start linkage/`next`/Kanban design
is sound and independently verified, and all eight acceptance criteria
are unambiguous and red-capable. The Plan is decision-complete and
executable by an independent implementer without conversation history.

Next permitted transition:
`codepatrol-apply 2026-07-24-backlog-subsystem on codepatrol/2026-07-24-backlog-subsystem`,
gated by the declared `applyGate` (`npm run verify`).

## External evidence sufficiency

`not required` — the design is internal to the Codepatrol project and
reuses existing primitives. The load-bearing claims are the
governing-invariant text (amended by T1) and the two Kanban render
paths, both verified this session.

## Residual concerns and evidence gaps

- No blocking concern. The two non-blocking Apply notes (T4 injection
  mechanism; T5 pre-check helper) do not affect scope, interfaces, or
  acceptance.
- Baseline `npm run verify` was not re-executed by Review (Review's
  role); taken as green at `8b47438` (the prior Change's terminal
  commit).
- Watch-item for Verify: confirm `projectKanban`'s `backlogItems`
  parameter is passed by BOTH render paths and that no third caller
  appears (today exactly two).
- Per-run provider tokens remain unmeasurable from this harness;
  recorded `unavailable` with reason.
