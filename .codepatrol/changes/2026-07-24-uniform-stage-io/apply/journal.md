# Implementation — Uniform, harness-independent stage input and output

- Package revision: 1
- Approval: `review.md` verdict approve
- Target start ref: 5674289d953cb32b7b178029e10ca78fdb72141a
- Actor: codepatrol-apply
- Status: implemented

## Baseline reconciliation

Artifact validation result: passed. Target drift checked: working tree clean at 5674289. Conclusion: ready.

### T1 — CLI commands next and change summary

- Claim/workflow item: T1
- Started: 2026-07-24T21:40:00Z
- Files changed: src/cli/args.ts, src/cli/output.ts, src/cli/commands.ts, src/cli/cli.test.ts
- Simplicity check: added two pure rendering layers leveraging existing `inspectChanges`/`ChangeView`. No modifications to business logic or the orchestrator module were required.
- Surface delta: added `next` command parsing + `--stage` arg in `args.ts`, added `change.summary` implementation.
- Red evidence: The `next` and `change.summary` invocations threw parse errors before modifications.
- Green evidence: `node --test --import jiti/register src/cli/cli.test.ts` passes the affordance rendering checks.
- Assessment: Clean implementation capturing unified logic for CLI output of change states.
- Result: complete

### T2 — Wire the lifecycle skills and shared contract

- Claim/workflow item: T2
- Started: 2026-07-24T21:45:00Z
- Files changed: skills/_shared/STAGE-IO.md, skills/codepatrol-*/SKILL.md, scripts/skills-contract.test.mjs
- Simplicity check: reused existing assertion seam, matched formatting of other shared contracts.
- Surface delta: created `STAGE-IO.md`, added `next` and `change summary` instructions verbatim to plan, review, apply, verify, close skills, updated `skills-contract.test.mjs` with assertions.
- Red evidence: Modified `skills-contract.test.mjs` and verified it failed until the skills were properly wired with the expected strings.
- Green evidence: `scripts/skills-contract.test.mjs` passes, `npm run lint:skills` passes.
- Assessment: Uniform entry and exit I/O is effectively documented and structurally enforced across all lifecycle skills.
- Result: complete

## Acceptance evidence

| Criterion | Implementation | Verification | Result |
|---|---|---|---|
| AC-1 | src/cli/args.ts, src/cli/output.ts, src/cli/commands.ts, src/cli/cli.test.ts | node --test --import jiti/register src/cli/cli.test.ts | pass |
| AC-2 | src/cli/cli.test.ts | node --test --import jiti/register src/cli/cli.test.ts | pass |
| AC-3 | src/cli/args.ts, src/cli/output.ts, src/cli/commands.ts, src/cli/cli.test.ts | node --test --import jiti/register src/cli/cli.test.ts | pass |
| AC-4 | skills/*, scripts/skills-contract.test.mjs | node --test scripts/skills-contract.test.mjs && npm run lint:skills | pass |
| AC-5 | Verified `npm run verify` exits 0 | npm run verify | pass |

## Surface delta

All changes match the approved forecast exactly:
- `src/cli/args.ts`, `src/cli/commands.ts`, `src/cli/output.ts`, `src/cli/cli.test.ts`: CLI implementations for `next` and `change.summary`.
- `skills/_shared/STAGE-IO.md`: new shared documentation.
- `skills/codepatrol-*/SKILL.md`: updated to invoke CLI tools for uniform I/O.
- `scripts/skills-contract.test.mjs`: added assertions.
No unforecasted dependencies or config added. No DC-N triggers activated.

## Final verification

- Affected checks run: `cli.test.ts`, `skills-contract.test.mjs`.
- Full gate: `npm run verify` passed (exit 0).
- Graph refreshed via `codepatrol graph sync`. Wiki remains absent.
- Residual risks: none identified.
- Rollback: Revert the branch.
