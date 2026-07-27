# Review — Contain trace paths derived from CLI `--id`

- Change: `2026-07-27-trace-path-workspace-containment`
- Incoming revision: 1
- Reviewed revision: 1
- Reviewer: opencode
- Evidence date: 2026-07-27T18:17:04Z

## Scope and evidence

Reviewed the complete Plan specification, executable plan, and declared
investigation evidence. Recomputed all three declared Plan artifact hashes;
they match the accepted Plan checkpoint `a800173b3554275d72eb0656b76f3f5c10776739`.

Confirmed the target baseline is `134f46d94fdeb729092509b8646bb22b2de744c1`,
the checkout is the recorded Change branch, and the tree was clean before Review
mutation. Read `src/cli/main.ts`, `src/change/trace.ts`, `src/shared/state.ts`,
`src/shared/workspace.ts`, `src/change/trace.test.ts`, and the unwrapped
`trace.read` caller in `src/change/improvement-report.ts`. Ran graph impact for
`trace.ts` and `state.ts` and checked Plan whitespace with `git diff --check`.

Independently evaluated the proposed T1 path construction against the current
compiled `resolveInside` implementation:

```text
resolveInside(workspace, ".codepatrol/runtime/traces/../../escape-marker.jsonl")
=> <workspace>/.codepatrol/escape-marker.jsonl
```

This path remains inside the workspace but is outside the required traces
subtree.

## Findings

### major - contract / plan

The central T1 implementation cannot satisfy AC-1. `tracePath` is specified as
`resolveInside(workspace, `${RUNTIME_DIR}/traces/${workId}.jsonl`)`
(`plan/spec.md:44`, `plan/plan.md:81,98-103`). `resolveInside` establishes only
workspace containment (`src/shared/workspace.ts:26-56`); it intentionally
accepts every candidate that stays within that root. Consequently, the Plan's
own AC-1 input `../../escape-marker` normalizes to
`<workspace>/.codepatrol/escape-marker.jsonl`, which `resolveInside` accepts.
The proposed code would therefore still permit escape from
`.codepatrol/runtime/traces/`, contrary to `spec.md:11,19-21,52` and AC-1.

Return to Plan and require `tracePath` to prove containment relative to the
resolved traces directory as well as the workspace. One bounded option is to
resolve both the traces root and candidate through `resolveInside`, then reject
a candidate whose `relative(tracesRoot, candidate)` is absolute or begins with
`..`, using `CodepatrolError("INVALID_WORKSPACE", ...)`. The corrected Plan
must retain a red/green test for this inside-workspace escape and the
full-workspace escape. Do not weaken AC-1 to workspace-only containment.

### minor - plan

`git diff --check 134f46d94fdeb729092509b8646bb22b2de744c1...HEAD` reports a
space-before-tab indentation error in the T1 snippet at `plan/plan.md:101`.
Correct the fenced TypeScript indentation while updating the returned Plan.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | Require traces-subtree containment, not only workspace containment | Current design accepts the AC-1 escape | AC-1, AC-2, AC-3, AC-4, AC-5 |
| `plan.md` | Replace T1 implementation/interface and T2 red/green instructions; fix line 101 indentation | T1 cannot make AC-1 green and whitespace check fails | AC-1, AC-2, AC-3, AC-4, AC-5, AC-6 |
| `investigation.md` | none | Evidence correctly describes the workspace-only behavior | none |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T1, T2 | yes in intent, but implementation remains red | blocked |
| AC-2 | yes | T1, T2 | yes - outside-workspace input | covered after AC-1 correction |
| AC-3 | yes | T2 | yes - append/appendRaw no-write assertions | blocked by T1 defect |
| AC-4 | yes | T2 | yes - direct `read` assertion | blocked by T1 defect |
| AC-5 | yes | T1, T2 | yes - slug round trip | covered after AC-1 correction |
| AC-6 | yes | T3 | yes - full gate and path inspection | blocked pending plan correction |

## Simplicity axis

- Selected rung: corrected - local reuse remains sufficient, but `resolveInside` alone is a workspace-boundary primitive and cannot enforce the nested traces boundary.
- Safety floor: retain refusal outside `.codepatrol/runtime/traces/`, append/appendRaw best effort, narrow `read` containment handling, and the full gate.
- Surface delta: the planned three files remain necessary; `state.ts` may use existing Node path utilities and `CodepatrolError`, with no dependency, CLI, or runtime-state expansion.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| simplify | `state.ts` proposed `tracePath` | Replace workspace-only containment with traces-root containment | Required for AC-1 | required correction |
| remove | `plan/plan.md:101` | Remove leading space before tab | No behavioral impact | required correction |

DC-1 remains bounded with a known ceiling, trigger, and upgrade path. No
external dependency or protocol governs this local filesystem correction.

## Executability audit

Paths, ownership, task order, and the targeted test seam are otherwise clear.
The cited append/appendRaw catch behavior and unwrapped `read` caller were
confirmed. Graph impact identifies trace, Change lifecycle, CLI,
improvement-report, and workspace tests as affected; `npm run verify` remains
the final gate. The material unresolved assumption is that workspace containment
implies traces-subtree containment, which direct execution disproves.

## Verdict

`fix-first`

The Plan's central security boundary leaves the documented inside-workspace
trace escape exploitable. Return to a new Plan attempt to specify and test
traces-subtree containment and correct the whitespace error. The next permitted
action is `codepatrol-plan 2026-07-27-trace-path-workspace-containment on
codepatrol/2026-07-27-trace-path-workspace-containment`.

## External evidence sufficiency

not required - local filesystem semantics, the repository's `resolveInside`
implementation, and the runtime path contract are sufficient; no external
claim is load-bearing.

## Residual concerns and evidence gaps

No production implementation was inspected because Review owns only its report.
The corrected Plan should retain the existing symlink protections through
`resolveInside`; no new symlink-specific acceptance criterion is needed to
resolve this finding. No other blocking concern survived the artifact, hash,
call-flow, and impact review.
