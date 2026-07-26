# Verification — Shared exact-keys schema guard

- Change: `2026-07-26-dedupe-exact-keys-guard`
- Verified revision: 2
- Verifier: opencode
- Base ref: `45ba75af405918af899487659042d1e092560460`
- Head ref: `cbd0f0feac0e668c98f33de9d1f4ed3d2c80e77c`
- Evidence date: 2026-07-26T23:19:06Z

## Scope and instruments

- Read the accepted Plan, Review report, and Apply journal.
- Bound verification to Apply checkpoint `cbd0f0feac0e668c98f33de9d1f4ed3d2c80e77c` and its tree `af09f22f94d47188f6e78b124255ff6f58ec754a`.
- Audited the Apply delta from review checkpoint `8360a7c10a770f63b071104ae666c4079bc3c5cb`.
- Executed `npm run verify`, the AC-3 structural `rg` check, `git diff --check` on the candidate delta, `git diff --numstat`, and `codepatrol graph impact --since-ref 45ba75af405918af899487659042d1e092560460 --format json`.

## Plan conformance

T1 adds the planned shared `assertExactKeys` helper. T2 and T3 retain the wrapper names and call sites while routing their distinct error contracts through that helper. T4, T5, and T6 replace the seven remaining pure exact-key loops while preserving labels; the combined `session.ts` forbidden/allowlist loop remains unchanged. T7 verification matches the accepted plan. No unjournaled production differences were found.

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of the journal |
|---|---|---|---|
| AC-1 | `npm run verify` | pass; typecheck and 215 tests pass | yes |
| AC-2 | `git diff 8360a7c..cbd0f0f -- src/change/orchestrator.ts src/change/model.ts` | pass; imports and wrapper bodies only | yes |
| AC-3 | `rg -n "for \(const key of Object\.keys"` across the five planned files | pass; only `src/change/session.ts:24` remains | yes |
| AC-4 | `npm run verify` | pass; 215 passed, 0 failed | yes |
| AC-5 | `git diff --numstat 8360a7c..cbd0f0f` | pass; six declared production files plus Apply journal/change metadata | yes |

## Wider suite

`npm run verify` completed successfully: `tsc --noEmit`, 215 passing tests, build, compiled CLI smoke, and skill lint all passed. The test output includes expected fixture diagnostics for trace and Git failure paths; no failures occurred.

## Blast radius

`codepatrol graph impact --since-ref 45ba75af405918af899487659042d1e092560460 --format json` identified change/CLI/shared callers and their tests, including `backlog.test.ts`, `change.test.ts`, `orchestrator-parallel.test.ts`, `cli.test.ts`, and `main.test.ts`. They are covered by the full 215-test suite. No unplanned production seam is affected.

## Regressions

The candidate-delta `git diff --check` is clean. A base-range whitespace check reports pre-existing spaces before tabs inside accepted Plan Markdown code snippets; no candidate production file is affected.

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| `.codepatrol/changes/2026-07-26-dedupe-exact-keys-guard/apply/journal.md` | yes | required Apply artifact |
| `.codepatrol/changes/2026-07-26-dedupe-exact-keys-guard/change.yaml` | yes | lifecycle metadata |

## Findings

None.

## Residual risks and evidence gaps

DC-1 and DC-2 did not trigger. The shared helper is covered through existing boundary tests and the full suite; no new focused helper test was added because the Change preserves existing behavior rather than introducing a new contract. No blocking evidence gap remains.

## Verdict

`commit`

The exact Apply candidate satisfies all five acceptance criteria, has a clean declared delta, and passes the broad project gate. The next permitted action is `codepatrol-close 2026-07-26-dedupe-exact-keys-guard commit|rollback on codepatrol/2026-07-26-dedupe-exact-keys-guard`.
