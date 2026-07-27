# Review - Close squash-merges and retains the branch locally; new `sync` command owns every remote action

- Change: `2026-07-27-local-close-squash-remote-sync`
- Incoming revision: 2
- Reviewed revision: 2
- Reviewer: `openai/gpt-5.6-terra`
- Evidence date: 2026-07-27T02:51:46Z

## Scope and evidence

Read the complete revision-2 specification, plan, and investigation evidence. Recomputed the three declared Plan SHA-256 values and matched `change.yaml`; verified Plan checkpoint `e84920e9231ac7735d56acd0ca2b1570362faef7`, tree `45904f34cbc7813c7b15d0d7ce088a8ccbe828ac`, the recorded branch, and a clean checkout before Review began. Read current Close/finalization logic at `src/change/orchestrator.ts:400-481`, `GitAdapter` at `src/change/git.ts:7-30`, current CLI parsing/dispatch at `src/cli/args.ts:23-63` and `src/cli/commands.ts:68-213`, and `syncIssues` at `src/change/issue-sync.ts:62-141`. Graph impact identifies the lifecycle, CLI, Close, issue-sync, and skill-contract test surfaces. `npm test` passed: 217 tests, 0 failures.

## Findings

### major - plan

`plan/plan.md:38-40` still declares branch pruning forbidden and labels it DC-1, while `spec.md:24`, `spec.md:156`, `spec.md:242`, and `plan/plan.md:T6` make `sync --prune-closed` a required behavior with four load-bearing tests. An Apply agent cannot honor both instructions. Replace the stale simplicity-proof constraint with the current scope: pruning is implemented only when `--prune-closed` is explicitly selected; its opt-in status, not the feature itself, is DC-1.

### major - plan

`plan/plan.md:297-320` defines `RemoteSyncOptions`, but does not make the CLI contract decision that T7 requires: which exact flags select `target`, `branches`, and `issues`, their accepted values, and the default when no selector is supplied. T7 defers this to "selectors chosen in T6," but T6 does not choose them. Define this payload and flag mapping before Apply, including how `--prune-closed` interacts with branch selection, then name it in `COMMAND_OPTIONS` and the CLI tests. Without it, AC-6 has no executable CLI acceptance contract.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none | The intended Close and sync boundaries are coherent. | AC-1 through AC-10 |
| `plan.md` | required in Plan attempt 3 | Resolve stale pruning scope and define sync selector/default semantics. | AC-6, AC-10 |
| `evidence/investigation.md` | none | The Close, lineage, and pruning evidence remains sufficient. | AC-1 through AC-5, AC-9, AC-10 |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T2, T3 | yes | covered |
| AC-2 | yes | T2, T3 | yes | covered |
| AC-3 | yes | T3 | yes | covered |
| AC-4 | yes | T4 | yes | covered |
| AC-5 | yes | T5 | yes | covered |
| AC-6 | no at the CLI boundary | T6, T7 | no - selector/default contract is unspecified | missing |
| AC-7 | yes | T8 | yes | covered |
| AC-8 | yes | T9 | yes | covered |
| AC-9 | yes | T2, T3 | yes | covered |
| AC-10 | yes | T6, T7 | contradictory with the Plan's global constraint | needs correction |

## Simplicity axis

- Selected rung: direct Close/inspection edits plus one bounded remote-owner module remains appropriate.
- Safety floor: tree identity, terminal-tag lineage, exact Close payload validation, and no force/fetch/rebase behavior remain required.
- Surface delta: the proposed files are proportionate, but pruning must be consistently described as opt-in in every Plan section.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| simplify | `plan/plan.md:38-40` | Remove the stale prohibition; retain only opt-in pruning as DC-1. | Restores executable AC-10 scope. | required correction |
| simplify | `plan/plan.md:T6-T7` | State one concrete selector/default CLI mapping rather than leave it to implementation. | Makes AC-6 testable without adding surface. | required correction |

DC-2 through DC-4 retain observable triggers and bounded upgrade paths. DC-1 needs the correction above before it can be evaluated.

## Executability audit

The squash, retention, tree-identity, recovery, and lineage-deduplication paths are explicitly located and have red-capable tests. The remote module is bounded to existing `GitAdapter.push` and `syncIssues`, but its user-facing target selection is incomplete: current parsing permits only named flags registered in `src/cli/args.ts`, so the CLI cannot be implemented or tested until those flag semantics are decided. No external evidence is required beyond the local Git and CLI contracts already checked.

## Verdict

`fix-first`

The architecture and evidence are sufficient, but two bounded Plan inconsistencies block an independent Apply implementation. Return to Plan attempt 3 to make pruning scope consistent and specify the concrete `sync` flag/default contract. Next permitted action: `codepatrol-plan 2026-07-27-local-close-squash-remote-sync on codepatrol/2026-07-27-local-close-squash-remote-sync`.

## External evidence sufficiency

`not required` - Git squash, local ref, lifecycle, and CLI behaviors are governed by direct local source and reproductions; no external protocol decision is needed.

## Residual concerns and evidence gaps

No production diff exists at Plan review. I did not run `npm run verify`; the current full test suite passed and the Plan reserves the assembled implementation gate for T9. The two documented Plan defects are the only blockers to this verdict.
