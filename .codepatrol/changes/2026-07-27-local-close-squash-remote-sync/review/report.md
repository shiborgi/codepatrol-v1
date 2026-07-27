# Review — Close squash-merges and retains the branch locally; new `sync` command owns every remote action

- Change: `2026-07-27-local-close-squash-remote-sync`
- Incoming revision: 8
- Reviewed revision: 8
- Reviewer: openai/gpt-5.6-terra
- Evidence date: 2026-07-27T03:50:58.000Z

## Scope and evidence

Reviewed the accepted Plan artifacts at checkpoint `2cb5c39841ac280da857ec768d6d078c896771e7` on `codepatrol/2026-07-27-local-close-squash-remote-sync`. Verified the bound SHA-256 values, the Close/Git/CLI seams, target selection, dry-run behavior, and graph impact. `npm test` passed: 217 tests, 0 failures.

The returned explicit-target safety defect is resolved: T6 applies the existing safe branch grammar before `git.push`, and direct plus CLI tests reject deletion/refspec forms with zero recorded push calls.

## Findings

No blocking findings.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none | complete and consistent | all |
| `plan.md` | none | dependency-ordered and executable | all |
| `plan/evidence/investigation.md` | none | load-bearing local evidence recorded | AC-6 |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 through AC-5 | yes | T2-T5 | yes | covered |
| AC-6 | yes | T6, T7 | yes - adapter doubles reject refspecs before push | covered |
| AC-7 | yes | T8 | yes | covered |
| AC-8 | yes | T9 | yes | covered |
| AC-9 | yes | T2, T3 | yes | covered |
| AC-10 | yes | T6, T7 | yes | covered |
| AC-11 | yes | T7 | yes | covered |

## Simplicity axis

- Selected rung: confirmed. The design reuses the existing Git, issue-sync, Change identity, and safe-branch validation patterns.
- Safety floor: tree identity, lineage validation, local-only Close, dry-run mutation suppression, post-push-only pruning, and no remote pruning remain enforced.
- Surface delta: one bounded sync module plus required CLI, documentation, and regression-test updates; no new dependency or protocol.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| reuse | Existing target-branch grammar | Reject refspecs before `git.push` | AC-6, AC-8 | already sufficient |

All deferred constraints have a known ceiling, observable trigger, and bounded upgrade path.

## Executability audit

Tasks are dependency-ordered, paths and interfaces are explicit, and failure cases have red-capable tests. A single revert restores the prior Close behavior and removes sync, as documented.

## Verdict

`approve`

The Plan is complete enough for independent Apply. The permitted next transition is `codepatrol-apply 2026-07-27-local-close-squash-remote-sync on codepatrol/2026-07-27-local-close-squash-remote-sync`; it was not invoked here.

## External evidence sufficiency

`not required` — all governing behavior is determined by local source and artifacts.

## Residual concerns and evidence gaps

No external remote was contacted. The new behavior remains unimplemented, so candidate verification belongs to Apply and Verify.
