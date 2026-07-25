# Review — Remove unsafe duplicate YAML reader

- Change: `2026-07-25-remove-duplicate-reader`
- Incoming revision: 1
- Reviewed revision: 1
- Reviewer: opencode
- Evidence date: 2026-07-25T18:40:00Z

## Scope and evidence

- Read `plan/spec.md`, `plan/plan.md`, `plan/evidence/investigation.md`.
- Verified the `5893504e8d417cc7a832aecbf0c10cbb65208d48` baseline target.
- Validated constraints: The legacy `"finalize"` migration gap is correctly handled by deferring to the canonical reader `readChangeRecord`. The missing file "no throw" behavior is preserved by a simple `existsSync` wrapper.

## Findings

None. The plan efficiently removes duplicate logic by reusing the canonical reader in `store.ts` while retaining the localized `existsSync` behavior required by `improvement-report.ts`'s specific contract. The proposed regression tests adequately ensure coverage.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none | n/a | n/a |
| `plan.md` | none | n/a | n/a |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T1, T2 | yes — test assertions | covered |
| AC-2 | yes | T1, T2 | yes — test assertions | covered |
| AC-3 | yes | T1, T2 | yes — test assertions | covered |
| AC-4 | yes | T1 | yes — grep/typecheck | covered |
| AC-5 | yes | T3 | yes — verify script | covered |

## Simplicity axis

- Selected rung: local reuse
- Safety floor: Reliability (missing file fallback) and correctness (delegating to exact canonical migration logic) are both retained.
- Surface delta: Removed ~10 lines of duplicate parse logic and unneeded dependency imports, added a simple 5-line delegation wrapper.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| reuse | `src/change/improvement-report.ts` | duplicate `readChangeRecord` & `yaml` import | Restores correctness for older records | adjusted |

No deferred constraints were noted.

## Executability audit

All interfaces, testing verification commands, and structural changes are well-defined and executable. Dependency sequences (T1 -> T2 -> T3) are logically sound.

## Verdict

`approve`

The plan executes the spec flawlessly by delegating to the existing canonical change reader and removing duplicated fragile YAML parsing logic. It perfectly addresses both the missing file fallback behavior and the required YAML loading correctness.

## External evidence sufficiency

not required (bounded refactoring and internal code deduplication task).

## Residual concerns and evidence gaps

None. The boundary fallback (missing `change.yaml` -> `null`) matches the required spec safely without modifying other modules.