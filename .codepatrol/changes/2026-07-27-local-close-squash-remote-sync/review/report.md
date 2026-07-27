# Review - Close squash-merges and retains the branch locally; new `sync` command owns every remote action

- Change: `2026-07-27-local-close-squash-remote-sync`
- Incoming revision: 3
- Reviewed revision: 3
- Reviewer: `openai/gpt-5.6-terra`
- Evidence date: 2026-07-27T03:00:46Z

## Scope and evidence

Read the complete revision-3 specification, plan, and investigation evidence. Recomputed every declared Plan SHA-256 and matched `change.yaml`; verified Plan checkpoint `890cbbd1e12fd4398bc2f9e6d6c9e6bd2e133eda`, tree `0a4e284bd624568b79c3390a0a71b9d9d52f422a`, the recorded branch, and a clean checkout before Review began. Read Close/finalization logic at `src/change/orchestrator.ts:400-481`, CLI parsing at `src/cli/args.ts:23-63`, dispatch at `src/cli/commands.ts:68-213`, and `syncIssues` at `src/change/issue-sync.ts:62-141`. Graph impact covers the lifecycle, CLI, issue-sync, and skill-contract suites. `npm test` passed: 217 tests, 0 failures.

## Findings

### major - contract

AC-6 (`spec.md:240`) requires `codepatrol sync --dry-run` to make zero remote calls, but `plan.md:T6 step 2` requires `syncRemote` to call the unchanged `syncIssues(..., { dryRun, gh })` when issues are selected. `syncIssues` unconditionally calls `gh.assertAvailable()` and `gh.listIssues()` before applying its dry-run guard (`src/change/issue-sync.ts:97-99`), so `sync --dry-run` with the default issues selector necessarily performs remote calls. Choose and document one compatible contract: either dry-run means zero remote mutations (and AC-6/tests must say so), or sync dry-run must skip/defer issue reconciliation and report that it was skipped. The current Plan cannot satisfy both requirements.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | required in Plan attempt 4 | Reconcile the dry-run network contract with unchanged issue-sync behavior. | AC-6 |
| `plan.md` | required in Plan attempt 4 | Specify the matching `syncRemote` branch and test expectation. | AC-6, AC-8 |
| `evidence/investigation.md` | required in Plan attempt 4 | Record the chosen dry-run semantics and existing `syncIssues` remote reads. | AC-6 |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T2, T3 | yes | covered |
| AC-2 | yes | T2, T3 | yes | covered |
| AC-3 | yes | T3 | yes | covered |
| AC-4 | yes | T4 | yes | covered |
| AC-5 | yes | T5 | yes | covered |
| AC-6 | no - dry-run contract conflicts with existing delegated call | T6, T7 | no | missing |
| AC-7 | yes | T8 | yes | covered |
| AC-8 | yes | T9 | yes after AC-6 is corrected | conditional |
| AC-9 | yes | T2, T3 | yes | covered |
| AC-10 | yes | T6, T7 | yes | covered |

## Simplicity axis

- Selected rung: confirmed. The local Close changes and one bounded sync module remain appropriate.
- Safety floor: tree identity, tag-anchored lineage, local-only Close, safe post-push branch pruning, and no force/fetch/rebase behavior remain intact.
- Surface delta: revision 3 resolves pruning and selector scope without new surface; the remaining correction is a single explicit dry-run decision.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| simplify | `plan.md:T6`, `spec.md:AC-6` | Choose one dry-run meaning instead of promising zero calls while delegating remote reads. | Makes remote safety testable. | required correction |

DC-1 through DC-4 retain stated ceilings, triggers, and upgrade paths.

## Executability audit

The squash, recovery, retention, dedupe, Close payload removal, selector flags, and pruning sequences are decision-complete. The issue delegation branch is not: its existing implementation reads GitHub even under dry-run, so the Plan must decide whether such reads are permitted. No external evidence is required; the conflict is directly established by repository source.

## Verdict

`fix-first`

Revision 3 addressed the prior review findings but leaves one bounded remote-safety contradiction. Return to Plan attempt 4 to align AC-6, T6, and the tests with either zero remote mutations or truly zero remote calls. Next permitted action: `codepatrol-plan 2026-07-27-local-close-squash-remote-sync on codepatrol/2026-07-27-local-close-squash-remote-sync`.

## External evidence sufficiency

`not required` - the governing behavior is directly established by `syncIssues` and the planned local command contract.

## Residual concerns and evidence gaps

No production diff exists at Plan review. I did not run `npm run verify`; the current full test suite passed. The dry-run contract is the sole blocker.
