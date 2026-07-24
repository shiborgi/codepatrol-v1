# Implementation — CLI input ergonomics: actionable errors for inline JSON and unknown commands

- Package revision: 1
- Approval: `review.md` verdict approve
- Target start ref: 5ed48226999d1a3d116fade28bee0652732a4db4
- Actor: codepatrol-apply
- Status: implemented

## Baseline reconciliation

Artifact validation result: passed. Target drift checked: working tree clean at 5ed4822. Conclusion: ready.

### T1 — Inline-JSON guard and unknown-command suggestion

- Claim/workflow item: T1
- Started: 2026-07-24T18:00:00Z
- Files changed: src/cli/args.ts, src/cli/commands.ts, src/cli/cli.test.ts
- Simplicity check: reused COMMAND_OPTIONS via new export KNOWN_COMMANDS; added pure logic guards in readJsonInput and default switch case.
- Surface delta: 1 new export in args.ts, +2 error-handling branches in commands.ts, +3 new tests in cli.test.ts. No new dependencies or behavior changes for successful flows.
- Red evidence: 3 new CLI tests initially failed with mismatched errors (e.g. INVALID_WORKSPACE or un-actionable messages).
- Green evidence: All tests passing; typecheck passing.
- Assessment: Inline JSON correctly detected and guided to stdin; unknown transition commands guided properly; unknown commands get full list of available choices.
- Result: complete

## Acceptance evidence

| Criterion | Implementation | Verification | Result |
|---|---|---|---|
| AC-1 | src/cli/commands.ts, src/cli/cli.test.ts | node --test --import jiti/register src/cli/cli.test.ts | pass |
| AC-2 | src/cli/commands.ts, src/cli/cli.test.ts | node --test --import jiti/register src/cli/cli.test.ts | pass |
| AC-3 | src/cli/commands.ts, src/cli/cli.test.ts | node --test --import jiti/register src/cli/cli.test.ts | pass |
| AC-4 | src/cli/cli.test.ts | node --test --import jiti/register src/cli/cli.test.ts | pass |
| AC-5 | Verified `npm run verify` exits 0 | npm run verify | pass |

## Surface delta

All changes match the approved forecast:
- `src/cli/args.ts`: added `KNOWN_COMMANDS` export.
- `src/cli/commands.ts`: added JSON guard and `KNOWN_COMMANDS` suggestions in default branch.
- `src/cli/cli.test.ts`: added CLI tests.
No unforecasted dependencies or config added. No DC-N triggers activated.

## Final verification

- Affected checks run: `cli.test.ts`.
- Full gate: `npm run verify` passed.
- Graph refreshed via `codepatrol graph sync`.
- Residual risks: F2, F3, F4, F6, F7 remain as follow-up items.
- Rollback: Revert the branch.
