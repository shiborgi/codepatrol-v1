# Review — Close squash-merges and retains the branch locally; new `sync` command owns every remote action

- Change: `2026-07-27-local-close-squash-remote-sync`
- Incoming revision: 4
- Reviewed revision: 4
- Reviewer: openai/gpt-5.6-terra
- Evidence date: 2026-07-27T03:09:46.000Z

## Scope and evidence

Reviewed the complete Plan artifacts, their SHA-256 bindings, and cited source on `codepatrol/2026-07-27-local-close-squash-remote-sync` at Plan checkpoint `35d3e31fbb0eb622ee6113474cb4fde48929be1e` (tree `8a00bf9d8c6e8908644ad512db8dd49e994f7cef`). Re-ran graph impact for the Close, Git, issue-sync, and CLI seams. `npm test` passed: 217 tests, 0 failures.

The revision correctly changed dry-run from zero remote calls to zero remote mutations and explicitly tests the inherited `syncIssues` reads.

## Findings

### major — plan

The Plan removes Close push support but leaves every user-facing `commit+push` affordance outside T5/T8: `src/cli/commands.ts:84` returns `closeOptions: ["commit", "commit+push", "rollback"]`, `src/cli/output.ts:162` prints it, `src/cli/cli.test.ts:195` asserts it, and `skills/_shared/STAGE-IO.md:11` documents it. After `CloseInput.push` is rejected, this advertises an impossible Close action and contradicts the single-owner remote-action contract.

Required correction: include these source, test, and shared-document locations in T5/T8 and verify no `commit+push` Close affordance remains; advertise `codepatrol sync` instead where appropriate.

### major — plan

T7 requires CLI tests "with injected adapter overrides" for a command that pushes refs, but `src/cli/commands.ts:24-26` exposes only `CommandOverrides.gh`; no Git adapter can be injected and T7 neither adds one nor passes it to `syncRemote`. The proposed tests would otherwise require a real `origin` push, so they cannot provide the stated deterministic adapter-double coverage.

Required correction: define the Git-adapter override seam, wire it through the `sync` command to `syncRemote`, and specify CLI tests that prove target/branch/default selection without network access.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none; return to Plan | Scope/compatibility must prohibit stale `commit+push` affordances | AC-5, AC-7 |
| `plan.md` | none; return to Plan | Add the omitted UI/doc/test cleanup and Git override wiring | AC-5, AC-6, AC-7 |
| `plan/evidence/investigation.md` | none; return to Plan | Record the verified stale affordances and existing override limitation | AC-5, AC-6, AC-7 |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T2, T3 | yes | covered |
| AC-2 | yes | T2, T3 | yes | covered |
| AC-3 | yes | T3 | yes | covered |
| AC-4 | yes | T4 | yes | covered |
| AC-5 | yes | T5 | no - stale CLI affordance unplanned | blocked |
| AC-6 | yes | T6, T7 | no - no Git override seam | blocked |
| AC-7 | yes | T8 | no - shared Close documentation omitted | blocked |
| AC-8 | yes | T9 | yes | covered |
| AC-9 | yes | T2, T3 | yes | covered |
| AC-10 | yes | T6, T7 | yes | covered |

## Simplicity axis

- Selected rung: confirmed. The existing Git and issue adapters remain sufficient; the missing override is test plumbing, not new remote behavior.
- Safety floor: tree identity, lineage validation, explicit prune ordering, and dry-run mutation suppression remain intact.
- Surface delta: adding the already-required CLI wiring and correcting stale text is necessary; no new dependency or protocol is warranted.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| remove | Close CLI and shared docs | `commit+push` affordances | AC-5, AC-7 | required correction |
| reuse | `CommandOverrides` | Extend its established injection seam for `GitAdapter` | AC-6 | required correction |

All deferred constraints retain a known ceiling, observable trigger, and bounded upgrade path.

## Executability audit

The squash, retention, dedupe, dry-run, and prune tasks are dependency-ordered and red-capable. T7 is not executable as written because its test double cannot reach `syncRemote`; the stale Close UI is likewise outside every task. No unresolved external assumption remains.

## Verdict

`fix-first`

Return to Plan for the two bounded corrections above. The next permitted transition is `codepatrol-plan 2026-07-27-local-close-squash-remote-sync on codepatrol/2026-07-27-local-close-squash-remote-sync`.

## External evidence sufficiency

`not required` — local source, Plan artifacts, and the baseline test suite determine the behavior.

## Residual concerns and evidence gaps

No production implementation or external service was exercised. The 217-test baseline passes but cannot validate the proposed, unimplemented sync command.
