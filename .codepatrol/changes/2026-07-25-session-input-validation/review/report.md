# Review — Validate change session stage/attempt at the CLI boundary

- Change: `2026-07-25-session-input-validation`
- Incoming revision: 1
- Reviewed revision: 1
- Reviewer: opencode
- Evidence date: 2026-07-26T01:50:00.000Z

## Scope and evidence

- Checked baseline and current branch: `codepatrol/2026-07-25-session-input-validation`.
- Read `.codepatrol/changes/2026-07-25-session-input-validation/plan/spec.md`, `plan.md`, and `evidence/investigation.md`.
- Verified `src/cli/commands.ts`, `src/change/session.ts`, and `src/change/types.ts` implementations described in evidence.
- Verified test cases and documentation references `skills/_shared/CODEPATROL-CLI.md`.

## Findings

None. The plan is well-bounded, proportional to the problem, and follows prior precedents for boundary checks. The decision to validate at the CLI edge rather than `session.ts` is correct and respects internally trusted calls.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none | | |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T1, T3 | yes — new CLI tests | covered |
| AC-2 | yes | T1, T3 | yes — new CLI tests | covered |
| AC-3 | yes | T1, T3 | yes — characterization test | covered |
| AC-4 | yes | T2, T3 | yes — doc inspection/lint | covered |

## Simplicity axis

- Selected rung: confirmed direct local change.
- Safety floor: preserves `session.ts` existing internal logic, introduces boundary guards with no new dependencies.
- Surface delta: +1 helper, +3 tests, +1 doc change. Necessary and sufficient.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| simplify | `plan.md` | none | none | already sufficient |

All constraints (DC-1) deferred cleanly with observable triggers.

## Executability audit

- The plan provides exact code blocks for the test changes.
- The `requireSessionCoordinates` logic is executable and syntactically sound.
- Testing commands (`npm run typecheck`, `node --test`) are accurate for this codebase.
- No new dependencies, contexts are correctly referenced.

## Verdict

`approve`

The Plan accurately identifies the root cause and provides a focused boundary validation fix that respects the existing architecture and CLI patterns. Tests and documentation updates are thoroughly defined. Proceed to Apply.

## External evidence sufficiency

not required (no external technical references govern this change; local defect).

## Residual concerns and evidence gaps

None. The plan explicitly restricts the scope and leaves other `session.json` edge cases intact until explicitly triggered in the future.
