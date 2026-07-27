# Review — Contain trace paths derived from CLI `--id`

- Change: `2026-07-27-trace-path-workspace-containment`
- Incoming revision: 3
- Reviewed revision: 3
- Reviewer: opencode
- Evidence date: 2026-07-27T19:09:34Z

## Scope and evidence

Read the complete revision-3 specification, implementation plan, and declared
investigation evidence. Recomputed the SHA-256 values for all three Plan
artifacts; they match checkpoint `9a4451ebf48bd5fb4d0bc314feabfcd9c958432d`.
Confirmed the recorded Change branch, baseline
`134f46d94fdeb729092509b8646bb22b2de744c1`, clean tree, and no diff-check
whitespace errors.

Revalidated `resolveInside` in `src/shared/workspace.ts`, current trace
callers/tests, model identity validation, and graph impact for `trace.ts` and
`state.ts`. `src/change/model.ts:32` requires every Change `work_id` to match
`YYYY-MM-DD-slug`; the revision's separator rejection therefore preserves the
only accepted Change identity shape while preventing both traversal and nested
symlink components.

## Findings

None. The prior Review defects are addressed: the Plan no longer relies on
workspace-only containment or a lexical comparison against a non-canonical
candidate. It rejects `/` and `\\` before path construction, then retains
`resolveInside` for workspace and existing-ancestor checks.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none | Revision 3 specifies the safe-segment boundary and DC-2 ceiling precisely | none |
| `plan.md` | none | T1-T3 name exact paths, separator behavior, symlink fixture, red/green commands, and rollback | none |
| `investigation.md` | none | Documents the independently reproduced symlink-pivot evidence | none |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T1, T2 | yes — `..` and in-workspace symlink-pivot path cases fail before implementation | covered |
| AC-2 | yes | T1, T2 | yes — full workspace escape fails before implementation | covered |
| AC-3 | yes | T2 | yes — append/appendRaw no-throw/no-write behavior | covered |
| AC-4 | yes | T2 | yes — containment error returns `[]` from `read` | covered |
| AC-5 | yes | T1, T2 | yes — generated slug path and round trip | covered |
| AC-6 | yes | T3 | yes — full gate and base-to-HEAD path inspection | covered |

## Simplicity axis

- Selected rung: confirmed local reuse. A one-segment guard plus existing `resolveInside` is sufficient because Change identity validation accepts only the flat `YYYY-MM-DD-slug` form.
- Safety floor: separator rejection precedes construction; `resolveInside` retains workspace/ancestor protections; append/appendRaw remain best effort; `read` is narrow to `CodepatrolError`; full gate remains mandatory.
- Surface delta: exactly `src/shared/state.ts`, `src/change/trace.ts`, and `src/change/trace.test.ts`; no dependency, CLI, config, or durable-state surface is added.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| reuse | `state.ts` / `workspace.ts` | Existing `resolveInside` plus a local separator guard | Satisfies AC-1 through AC-5 | already sufficient |

DC-1 and DC-2 each state a known ceiling, observable trigger, and bounded
upgrade path. DC-2 correctly records the distinct pre-existing root-symlink
threat model rather than expanding this raw-`--id` containment fix.

## Executability audit

T1 owns the safe builder, T2 owns trace consumption and all red/green tests,
and T3 owns final gate, diff, DC, and rollback checks. The commands, expected
signals, imports, changed paths, and dependency order are context-complete. The
symlink fixture creates a workspace-contained target, proving the prior
lexical-boundary failure without relying on an outside-workspace symlink. No
unresolved assumption blocks an independent Apply agent.

## Verdict

`approve`

Revision 3 closes the prior traversal and symlink-pivot defects with the
smallest sufficient boundary rule and a complete executable verification loop.
The permitted next action is
`codepatrol-apply 2026-07-27-trace-path-workspace-containment on
codepatrol/2026-07-27-trace-path-workspace-containment`.

## External evidence sufficiency

not required — the governing claims are local Change identity validation, Node
path semantics, and the repository's `resolveInside` behavior; no external
dependency or protocol claim is load-bearing.

## Residual concerns and evidence gaps

The accepted DC-2 ceiling is that a pre-existing symlink at the traces root
itself may redirect inside-workspace writes; this requires separate local
filesystem tampering not supplied by raw CLI `--id`, has an explicit trigger,
and does not block the current fix. No production files were edited during
Review.
