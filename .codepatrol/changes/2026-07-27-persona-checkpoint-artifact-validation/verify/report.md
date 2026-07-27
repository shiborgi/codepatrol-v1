# Verification - Validate artifact ownership and hash for persona Review/Verify checkpoints

- Change: `2026-07-27-persona-checkpoint-artifact-validation`
- Verified revision: 3
- Verifier: opencode
- Base ref: `08a43e5e85f5c617ba4d4b0d7abc89e6f7f03d85`
- Head ref: Apply checkpoint `a0aaad2ccdc50bd6d755870117ca94acb5c0d13f`, tree `9497fb1fbf368656af9a8beeca70174a43c20cd8`
- Evidence date: 2026-07-27T21:21:51Z

## Scope and instruments

Independently read the accepted Plan, Review report, Apply journal, candidate
metadata, and candidate diff. Re-ran the focused suites, full project gate,
diff whitespace and path checks, and candidate/tree resolution. The tree was
clean before Verify and no production file was edited.

## Plan conformance

T1 adds the defaulted completeness control only to the three validators in
`validation.ts`; T2 adds it to the local orchestrator helper and makes persona
validation unconditional. The candidate matches the four declared paths with no
dependency, configuration, or schema change.

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of journal |
|---|---|---|---|
| AC-1 | `node --test --import jiti/register src/change/change.test.ts src/change/orchestrator-parallel.test.ts` | pass - cross-stage persona artifact rejects before commit | yes |
| AC-2 | Same focused command | pass - forged SHA-256 rejects with `CHANGE_DRIFT` | yes |
| AC-3 | Same focused command | pass - owned correct-hash persona artifact remains active | yes |
| AC-4 | Same focused command | pass - two-persona consolidation remains green | yes |
| AC-5 | Same focused command | pass - default completeness and non-persona behavior retained | yes |
| AC-6 | `npm run verify` and diff inspection | pass - 251/251 tests, build, smoke, lint, declared paths only | yes |

## Wider suite

- Focused command: 37/37 passed.
- `npm run verify`: 251/251 tests passed; typecheck, build, compiled CLI smoke, and skill lint passed.
- `git diff --check 08a43e5...a0aaad2`: passed.

## Blast radius

The graph impact for `validation.ts` and `orchestrator.ts` includes Change,
CLI, lifecycle, and their tests. The full gate exercised all affected suites.

## Regressions

No regression found. Default `enforceCompleteness: true` remains in effect for
FromReader and non-persona callers; only persona checkpoints receive `false`.

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| `src/change/validation.ts` | yes | required validator control |
| `src/change/orchestrator.ts` | yes | required persona validation call |
| `src/change/change.test.ts` | yes | direct characterization |
| `src/change/orchestrator-parallel.test.ts` | yes | exploit/regression coverage |

## Findings

None.

## Residual risks and evidence gaps

DC-2 remains the accepted correct-hash sibling-attestation ceiling, requiring a
separate narrowing Change if its documented trigger occurs. No gap blocks this
candidate.

## Verdict

`commit`

The clean candidate is bound to checkpoint `a0aaad2ccdc50bd6d755870117ca94acb5c0d13f`
and tree `9497fb1fbf368656af9a8beeca70174a43c20cd8`; all acceptance and broad
gates passed independently. Next action: `codepatrol-close
2026-07-27-persona-checkpoint-artifact-validation commit|rollback on
codepatrol/2026-07-27-persona-checkpoint-artifact-validation`.
