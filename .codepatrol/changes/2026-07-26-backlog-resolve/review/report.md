# Review — Add a CLI command to mark a backlog item done/dismissed directly

- Change: `2026-07-26-backlog-resolve`
- Incoming revision: 1
- Reviewed revision: 1
- Reviewer: opencode
- Evidence date: 2026-07-26T02:15:00.000Z

## Scope and evidence

- Checked baseline and current branch: `codepatrol/2026-07-26-backlog-resolve`.
- Read `.codepatrol/changes/2026-07-26-backlog-resolve/plan/spec.md`, `plan.md`, and `evidence/investigation.md`.
- Verified the missing producer of `"done"` and `"dismissed"` statuses in `src/change/backlog.ts`.
- Verified the correct mapping of command arguments and validation in `src/cli/commands.ts`.

## Findings

None. The plan is well-bounded, proportional to the problem, and follows prior precedents for boundary checks and domain logic updates. It correctly defers the auto-resolution feature to a separate follow-up task.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none | | |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T1 | yes — unit tests | covered |
| AC-2 | yes | T1 | yes — unit tests | covered |
| AC-3 | yes | T2 | yes — CLI exit tests | covered |
| AC-4 | yes | T1, T2 | yes — unit & CLI tests | covered |
| AC-5 | yes | T1, T2 | yes — unit & CLI tests | covered |
| AC-6 | yes | T1 | yes — characterization test | covered |

## Simplicity axis

- Selected rung: confirmed local reuse.
- Safety floor: preserves `issue-sync.ts` and existing schemas; only updates `status` and `lastSeenAt`.
- Surface delta: +1 function, +1 CLI case, +4 tests, +1 doc update. Necessary and sufficient.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| simplify | `plan.md` | none | none | already sufficient |

All constraints (DC-1, DC-2) deferred cleanly with observable triggers.

## Executability audit

- The plan provides exact code blocks for the logic and test changes.
- The `resolveBacklogItem` logic correctly mirrors `linkBacklogItem`.
- Testing commands are accurate for this codebase.
- No new dependencies, contexts are correctly referenced.

## Verdict

`approve`

The Plan accurately identifies the missing producer for the terminal statuses and correctly restricts the scope to a manual resolution command, deferring automated resolutions. The validation and errors mirror existing CLI patterns perfectly. Proceed to Apply.

## External evidence sufficiency

not required (local domain logic addition).

## Residual concerns and evidence gaps

None.
