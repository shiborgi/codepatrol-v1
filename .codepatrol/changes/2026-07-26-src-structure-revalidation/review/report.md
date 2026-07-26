# Review — Revalidate `src/` structure: module cohesion, boundaries, testability and extensibility

- Change: `2026-07-26-src-structure-revalidation`
- Incoming revision: 1 (Plan attempt 1)
- Reviewed revision: 1
- Reviewer: opencode (codepatrol-review skill)
- Evidence date: 2026-07-26T14:45Z

## Scope and evidence

- `codepatrol change inspect` → stage `review`, attempt 1, state `ready`; on recorded branch `codepatrol/2026-07-26-src-structure-revalidation` at `4e14b7c` (plan checkpoint transition; plan content `1ed783a`, tree `ee10f15`). Clean tree.
- Artifact hashes re-verified (`shasum -a 256`): `spec.md` `e3598046…`, `plan.md` `446e3ac5…`, `investigation.md` `da173715…` — all match the attempt-1 bindings.
- Baseline: `main` @ `5f569db`; confirmed == `main` HEAD and an ancestor of HEAD — no target advance. `git diff --name-only 5f569db HEAD -- ':!.codepatrol'` is empty → the assessment Change has (correctly) touched no production code; the reviewed citations are checked against the base state.
- This is a `mode: architecture` assessment Change (zero-production-diff precedent from v1/v2/v3). Its deliverable is the spec as durable record plus four backlog items filed at Apply. Review therefore focuses on **evidence accuracy** (the assessment's entire value) and **plan executability**.
- Every load-bearing citation independently re-checked against the live tree (see below).

## Findings

### S1 evidence — verified accurate

Cited path-literal scatter confirmed at every site: `orchestrator.ts:24` (`relativeRecord`, `.codepatrol/changes/<id>/change.yaml`) and `store.ts:11` (`changeRecordPath`) build the same record path two ways; the `<stage>/` prefix is built identically at `orchestrator.ts:123`, `validation.ts:24`, `validation.ts:43`; `backlog.ts:47` owns `backlogPath` while `orchestrator.ts:265,269,292` re-inline the literal; the four required stage-artifact paths live at `orchestrator.ts:254-258` (inside the post-decompose `buildCheckpointEvent`) and `session.ts:123` independently hardcodes `plan/plan.md`; `state.ts:5` owns `stateRoot` while `orchestrator.ts:25,27` re-inline `.codepatrol/runtime/`. The reframing of the just-closed F1 (the removed `changeDirectory`/`changeRoot` were abandoned centralization attempts) is consistent with that Change's own evidence. Severity medium, recommended-next-pickup — sound.

### S2 evidence — verified accurate (one minor wording note, non-blocking)

`grep "contains unknown field"` returns 9 sites (`usage.ts:17`, `orchestrator.ts:34`, `model.ts:11`, `backlog.ts:52,66,76,95`, `session.ts:26,33`); the 10th is the forbidden-key variant at `session.ts:25` (different wording) — 10 across 6 files as stated. `exactInput` (`orchestrator.ts:33-35`) and `exactKeys` (`model.ts:10-12`) confirmed.

Minor note (not a finding): the spec's S2 headline calls these two "byte-identical function bodies"; they are identical *logic* but differ in throw path (`new CodepatrolError("INVALID_ARGUMENT",…,2)` vs `invalid(…)` → `CHANGE_INVALID`/4). The investigation states this correctly ("the only difference is the throw path"), and the S2 backlog-item evidence names the required error-code parameterisation — so the overstatement does not mislead the eventual fix. Cosmetic wording in a backlog title; the durable evidence is accurate.

### S3 evidence — verified accurate

Counted independently: 19 `case` labels in `commands.ts` and 19 `COMMAND_OPTIONS` keys in `args.ts` — set-difference empty both ways. Correctly classified latent-not-live (discipline-held, not type-enforced). Severity low — sound.

### S4 evidence — verified accurate

`grep -rln "graph/link" src/ --include="*.test.ts"` → no matches: `graph/link.ts` (235 lines, edge-resolution logic) has no direct test and is not named by the existing N2 item. Correctly filed as an extension cross-referencing N2 rather than a duplicate. The legitimate indirect coverage of `cli/main.ts`/`cli/output.ts` via subprocess tests is correctly excluded. Severity low-medium — sound.

### Positive findings — verified

Layering acyclic & one-directional confirmed: `grep -rln 'from "\.\./' src/shared/` → empty (`shared/` imports nothing upward); `grep -rln 'from "\.\./cli/' src/change/ src/graph/ src/shared/` → empty. The compile-time `Record<LanguageId,…>` exhaustiveness argument and the `shared/`-cohesion/minimal-deps observations are consistent with the codebase.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none required | findings S1-S4 and positive findings are accurately evidenced; the single "byte-identical" wording nuance in S2 is corrected by the investigation in the same artifact and does not affect any AC or the future fix | — |
| `plan.md` | none | the four `backlog add` payloads are schema-correct (`source.kind: plan-followup`, `workId`, areas, priorities p2/p2/p3/p3 matching AC-3) and reuse the established caller-commits-the-backlog pattern | — |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes — S1-S4 with `file:line` + positive subsection | (spec, satisfied at Plan) | yes — re-read `spec.md` Current evidence | covered |
| AC-2 | yes — Method paragraph names graph sync + import-graph parse + matrix + fan-in + DFS + test map + grep-reconfirm rule | (spec, satisfied at Plan) | yes — re-read Method paragraph | covered |
| AC-3 | yes — exactly 4 items, `plan-followup`/this workId, p2/p2/p3/p3 | T1 | yes — `codepatrol backlog list --format json` filtered on workId; count + priorities asserted | covered |
| AC-4 | yes — only `.codepatrol/backlog/items.yaml` changed | T2 | yes — `git diff --stat <base>..HEAD -- ':!.codepatrol'` empty | covered |

## Simplicity axis

- Selected rung: **confirmed** — `need` (read-only investigation cannot be reduced; findings + filed items is the minimum that makes it actionable).
- Safety floor: n/a (no code mutation); the `count:1` dedup-collision guard in T1 step 5 is a sound integrity check for the filing.
- Surface delta: confirmed — `.codepatrol/backlog/items.yaml` (+4 items), no source files, no new `docs/` file (honors `docs/runtime-state.md`'s namespace prohibition, as v3 did).

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| — | — | already sufficient — no speculative or removable surface survives | none | — |

DC-1 (file, don't fix) and DC-2 (`src/`-only scope) each carry a known ceiling, observable trigger, and bounded upgrade path — accepted, not silently worked around.

## Executability audit

- T1's four `codepatrol backlog add` payloads match the `backlog add` input schema (`title`, `area: architecture`, `priority`, `evidence[]`, `source{kind,workId}`); the `count:1` assertion guards against a silent dedup-key collision.
- T1 step 5 verifies by re-reading the persisted file (not trusting the command return values) — correct discipline.
- T2 confirms zero production diff via `git diff --stat ... -- ':!.codepatrol'` and runs the full `npm run verify` gate — the assessment leaves the green 215/215 baseline untouched.
- Context independence: the spec is self-contained; every finding cites a re-runnable command or a `file:line` re-checked here.
- No unresolved assumption. No external evidence governs (pure local static analysis).

## Verdict

`approve`

Plan attempt 1 is contract-complete and executor-ready. The assessment's evidence is accurate — every load-bearing S1-S4 citation and the positive layering/cycle/exhaustiveness findings were independently re-confirmed against the live tree; the findings are correctly scoped, ranked (S1 next pickup), and filed under the repo's one-finding-per-Change discipline; the plan's four `backlog add` payloads are schema-correct with a dedup-collision guard; all four ACs are unambiguous and red-capable; and the zero-production-diff shape matches the `mode: architecture` precedent. The single "byte-identical" wording nuance in S2 is corrected within the same artifact's investigation and does not affect any AC or the future fix. The Review checkpoint may advance to Apply.

Next permitted transition: checkpoint Review with result `approve`; next action `codepatrol-apply 2026-07-26-src-structure-revalidation on codepatrol/2026-07-26-src-structure-revalidation`.

## External evidence sufficiency

Not required. No external claim governs this Change — it is a local static-structure analysis whose every conclusion is backed by a re-runnable `grep`/read, all re-verified here.

## Residual concerns and evidence gaps

- None blocking. The minor S2 "byte-identical" vs "identical-logic-different-throw-path" wording is noted above; it is cosmetic and self-corrected in the investigation.
- Review did not run `npm run verify` (Apply/Verify authority); the 215/215 baseline is consistent with the no-production-diff state and prior gates.
- The scratch analysers are intentionally not committed (session scratch); the spec's method section records their logic and the grep-reconfirmation discipline that makes their conclusions trustworthy without committing the tools.
