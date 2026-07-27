# Review — Close squash-merges and retains the branch locally; new `sync` command owns every remote action

- Change: `2026-07-27-local-close-squash-remote-sync`
- Incoming revision: 7
- Reviewed revision: 7
- Reviewer: openai/gpt-5.6-terra
- Evidence date: 2026-07-27T03:37:35.000Z

## Scope and evidence

Reviewed the Plan artifacts and SHA-256 bindings on `codepatrol/2026-07-27-local-close-squash-remote-sync` at Plan checkpoint `aa5d524b5691118d2c14a83e9719f35a23d81d84` (tree `7e6f0fe145f0eb5b94f1bd9e09b2234b6b63b364`). Rechecked target resolution, Git push behavior, and the new CLI contract. `npm test` passed: 217 tests, 0 failures.

The prior shared-target contradiction is resolved: T6 now uses an existence check and includes a multiple-`main` regression test.

## Findings

### major — safety

`--target-branch` is forwarded directly to `git.push("origin", targetBranch)` without a branch-name validation rule. `NodeGitAdapter.push` executes `git push origin <value>` (`src/change/git.ts:106-112`), so Git refspec syntax is accepted; for example, `:refs/heads/name` deletes a remote branch. This violates DC-4 and the explicit scope boundary that `sync` never deletes remote refs.

Required correction: validate `--target-branch` as a safe local branch name before it reaches `GitAdapter.push`, using the existing `targetBranch` grammar from `assertStartInput` or a shared equivalent, and add red-capable tests rejecting refspec/deletion syntax with zero push calls.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none; return to Plan | Pin the safe explicit-target boundary | AC-6, AC-8 |
| `plan.md` | none; return to Plan | Specify validation and rejection tests | AC-6, AC-8 |
| `plan/evidence/investigation.md` | none; return to Plan | Record `git push` refspec behavior and existing branch grammar | AC-6 |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T2, T3 | yes | covered |
| AC-2 | yes | T2, T3 | yes | covered |
| AC-3 | yes | T3 | yes | covered |
| AC-4 | yes | T4 | yes | covered |
| AC-5 | yes | T5 | yes | covered |
| AC-6 | no | T6, T7 | no - explicit refspec is unbounded | blocked |
| AC-7 | yes | T8 | yes | covered |
| AC-8 | yes | T9 | no - DC-4 can be violated | blocked |
| AC-9 | yes | T2, T3 | yes | covered |
| AC-10 | yes | T6, T7 | yes | covered |
| AC-11 | yes | T7 | yes | covered |

## Simplicity axis

- Selected rung: confirmed. Reusing the existing safe-branch grammar is smaller and safer than accepting arbitrary Git refspecs.
- Safety floor: tree identity, lineage validation, local-only Close, dry-run mutation suppression, post-push-only pruning, and no remote pruning remain required.
- Surface delta: validation belongs in existing argument or sync input handling; no dependency is needed.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| reuse | `assertStartInput` branch grammar | Apply equivalent validation to `--target-branch` | AC-6, AC-8 | required correction |

All deferred constraints retain a known ceiling, observable trigger, and bounded upgrade path once this boundary is restored.

## Executability audit

Target resolution, Close cleanup, adapter injection, and tests are executable. Explicit target override must reject Git refspec syntax before implementation can uphold the stated remote-deletion boundary.

## Verdict

`fix-first`

Return to Plan to validate explicit target branches and test rejection of remote-deletion refspecs. The next permitted transition is `codepatrol-plan 2026-07-27-local-close-squash-remote-sync on codepatrol/2026-07-27-local-close-squash-remote-sync`.

## External evidence sufficiency

`not required` — local adapter behavior and the existing branch-validation contract determine the issue.

## Residual concerns and evidence gaps

No production implementation or external service was exercised. The baseline suite passes but cannot validate the proposed sync command before it exists.
