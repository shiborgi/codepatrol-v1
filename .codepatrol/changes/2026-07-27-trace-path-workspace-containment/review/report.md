# Review — Contain trace paths derived from CLI `--id`

- Change: `2026-07-27-trace-path-workspace-containment`
- Incoming revision: 2
- Reviewed revision: 2
- Reviewer: opencode
- Evidence date: 2026-07-27T18:41:46Z

## Scope and evidence

Read the complete revision-2 `spec.md`, `plan.md`, and investigation evidence,
then recomputed their SHA-256 hashes. They match the accepted Plan checkpoint
`e9eb264a94aed38b89666182c3d194a25ba4b018`. Confirmed the recorded branch,
baseline `134f46d94fdeb729092509b8646bb22b2de744c1`, and clean tree before
Review mutation.

Re-read `resolveInside` in `src/shared/workspace.ts`, the current `trace.ts`
path flow, `state.ts`, the trace test seam, CLI trace entry points, and the
previous Review finding. The revised Plan correctly identifies that
`resolveInside` alone permits the inside-workspace `../../escape-marker` case,
and its explicit lexical traces-root check corrects that traversal case.

## Findings

### major — contract / plan

The revised `tracePath` still cannot enforce the stated invariant for existing
symlinks inside the traces directory. T1 resolves both `tracesRoot` and
`candidate` through `resolveInside`, then compares the lexical strings with
`relative(tracesRoot, candidate)` (`plan/plan.md:81,99-115`).

`resolveInside` proves each existing path and ancestor stays inside the
*workspace*, not the traces directory (`src/shared/workspace.ts:36-48`). If an
existing `.codepatrol/runtime/traces/link` symlink points to another location
inside the workspace, work id `link/trace` produces a lexical candidate below
`tracesRoot`, so the planned `relative()` check passes. `resolveInside` also
accepts it because the canonical target remains inside the workspace. The
subsequent append can create the file outside `.codepatrol/runtime/traces/`,
violating `spec.md:11,53` and AC-1's stated traces-subtree contract.

Return to Plan. Define containment using canonical paths for both the traces
root and candidate, or reject work-id path separators so no nested/symlink
component can be traversed, while retaining workspace containment. Add a
red/green fixture that creates a symlink inside the traces directory to a
workspace-contained sibling and proves `path`, `append`, `appendRaw`, and
`read` observe the same refusal/best-effort behavior as the `..` cases. The
fix must preserve legitimate slug work ids and the existing outside-workspace
symlink protection.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | Define canonical traces-root containment, including an existing symlink that remains inside the workspace but leaves the traces subtree | Lexical relative-path check cannot prove stated invariant | AC-1, AC-3, AC-4, AC-5 |
| `plan.md` | Replace lexical-only T1 implementation with canonical containment or a bounded safe-segment rule; add symlink red/green fixture and final verification | Current algorithm accepts the new escape class | AC-1, AC-3, AC-4, AC-5, AC-6 |
| `investigation.md` | Add the workspace-contained-symlink path as evidence | Original evidence covers `..` only | AC-1 |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T1, T2 | yes for `..`, no for traces-internal symlink | blocked |
| AC-2 | yes | T1, T2 | yes — full workspace escape | covered after correction |
| AC-3 | yes | T2 | yes for `..`, missing symlink case | blocked |
| AC-4 | yes | T2 | yes for `..`, missing symlink case | blocked |
| AC-5 | yes | T1, T2 | yes — slug round trip | covered after correction |
| AC-6 | yes | T3 | yes — full gate and diff inspection | blocked pending correction |

## Simplicity axis

- Selected rung: corrected — local reuse remains sufficient, but workspace-only canonicality plus lexical traces comparison is not enough for a nested directory trust boundary.
- Safety floor: reject both traversal and symlink exits from `.codepatrol/runtime/traces/`; preserve append/appendRaw best effort, narrow `read` behavior, and full-gate verification.
- Surface delta: the same three planned files remain sufficient; no dependency, CLI surface, or durable-state expansion is necessary.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| simplify | `state.ts` proposed `tracePath` | Replace lexical-only traces-root comparison with canonical containment or safe-segment rule | Required for AC-1 | required correction |

DC-1 remains bounded. No external evidence is required for this local
filesystem and symlink containment decision.

## Executability audit

The revision fixed the first Review's material `..` defect and the Plan's
whitespace issue. Paths, ownership, commands, red/green loop, rollback, and
context are otherwise executable. The remaining material assumption is that a
lexical path below traces represents a canonical path below traces; existing
workspace-contained symlinks disprove that assumption.

## Verdict

`fix-first`

The Plan must return to Plan attempt 3 to make traces-subtree containment
canonical and cover the workspace-contained symlink escape. The next permitted
action is `codepatrol-plan 2026-07-27-trace-path-workspace-containment on
codepatrol/2026-07-27-trace-path-workspace-containment`.

## External evidence sufficiency

not required — local source, Node filesystem semantics, and the existing
`resolveInside` symlink checks govern the decision; no external dependency or
protocol claim is load-bearing.

## Residual concerns and evidence gaps

No production files were edited. The unexecuted symlink fixture is the precise
gap requiring Plan correction; all other revision-2 changes were static Plan
artifacts only. No further blocking finding survived the review.
