# Review — Plan self-consistency check

- Change: `2026-07-27-plan-self-consistency-check`
- Incoming revision: 1
- Reviewed revision: 1
- Reviewer: opencode
- Evidence date: 2026-07-27T00:39:54Z

## Scope and evidence

- Read `plan/spec.md`, `plan/plan.md`, and `plan/evidence/investigation.md` in full.
- Re-read the target `skills/codepatrol-plan/SKILL.md:52-62`: the existing run-recording paragraph begins immediately after `## Seal and stop`, matching T1's insertion point.
- Ran `npm run lint:skills`, which passed.
- `codepatrol graph impact --file skills/codepatrol-plan/SKILL.md --format json` reports no affected source or tests; this skill document is graph-unknown.

## Findings

None. The Plan directly addresses two evidenced, self-contained return causes with one scoped instruction paragraph and preserves independent Review.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none | requirements and deferred enforcement ceiling are explicit | n/a |
| `plan.md` | none | exact target location, paragraph, and checks are executable | n/a |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T1 | yes — section position/content comparison | covered |
| AC-2 | yes | T1 | yes — literal paragraph comparison | covered |
| AC-3 | yes | T1 | yes — literal paragraph comparison | covered |
| AC-4 | yes | T2 | yes — restricted `git diff` | covered |
| AC-5 | yes | T2 | yes — `npm run lint:skills` | covered |

## Simplicity axis

- Selected rung: confirmed direct local instruction change.
- Safety floor: the check is author-side only and explicitly retains Review as the independent gate.
- Surface delta: one paragraph in `skills/codepatrol-plan/SKILL.md`; no code, dependency, or format change is needed.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| simplify | Plan seal step | single self-check paragraph | AC-1 to AC-3 | already sufficient |

DC-1 has a concrete recurrence trigger and bounded mechanical-check upgrade path.

## Executability audit

T1 names the exact insertion point and supplies a self-contained paragraph with no nested literal fences. T2's lint and restricted-diff commands are executable. Rollback is a normal single-commit revert. No unresolved assumption or external dependency exists.

## Verdict

`approve`

The Plan is complete, proportionate, and independently executable. The next permitted transition is `codepatrol-apply 2026-07-27-plan-self-consistency-check on codepatrol/2026-07-27-plan-self-consistency-check`.

## External evidence sufficiency

not required (the governing workflow and target instructions are local repository artifacts).

## Residual concerns and evidence gaps

The instruction is not mechanically enforced, which is explicitly retained as DC-1. No blocker remains.
