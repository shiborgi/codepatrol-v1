# Review — Extract a shared exact-keys schema guard, parameterized on error code

- Change: `2026-07-26-dedupe-exact-keys-guard`
- Incoming revision: 2
- Reviewed revision: 2
- Reviewer: claude-sonnet-5
- Evidence date: 2026-07-26T21:07:16.000Z

## Scope and evidence

Read `plan/spec.md`, `plan/plan.md`, `plan/evidence/investigation.md` (attempt
2) in full before touching code, treating every citation as a hypothesis
re-derived independently against the live tree (branch
`codepatrol/2026-07-26-dedupe-exact-keys-guard`, base `main`@`45ba75a`, clean,
`npm run verify` re-run fresh: 215/215, 0 failures).

This attempt is a direct response to attempt 1's `fix-first` return: the
prior finding was that `spec.md`/`plan.md` undercounted the duplicated
"reject unknown keys" idiom at 9 sites, missing `usage.ts:28` and `:33`
inside `validateRun`. Re-ran both the narrow message-text grep and the
broader structure-based grep used to catch that gap:

```
$ grep -rn "Object.keys(.*)).*if (!.*\.\(includes\|has\)(key)" src/ --include="*.ts" | grep -v test
```

Returns exactly **10** pure allow-set sites (`usage.ts:17,28,33`,
`orchestrator.ts:35`, `model.ts:11`, `backlog.ts:53,67,77,96`,
`session.ts:33`) — matches `spec.md`'s corrected Current evidence exactly.
The message-text grep (`contains unknown field\|cannot own`) additionally
catches `session.ts:25` (the denylist half of the explicitly out-of-scope
combined loop), for 11 total — matches spec's Intent ("reimplemented 11
times across 5 files") and evidence's "11 sites total" claim.

Re-ran `grep -n "for (const key of Object.keys" ...` (the literal T7/AC-3
command) against the current pre-Apply tree: 11 matches today (10 pure
sites + `session.ts:24`, the combined loop's opening line). Confirmed by
direct count that once T2–T6 replace all 10 pure sites, only
`session.ts:24` remains — AC-3's "exactly one match" claim is achievable as
scoped. This directly closes attempt 1's finding: T6 now explicitly lists
three replace-steps (`usage.ts:17`, `:28`, `:33`), each reproducing today's
message text and code/exit-code byte-for-byte.

Independently re-verified, by direct read of current source, every other
citation in `spec.md`'s Current evidence:

- `orchestrator.ts:34-36`'s `exactInput` body, and its 4 call sites
  (`grep -c "exactInput("` → 5: 1 definition + 4 calls) — matches.
- `model.ts:6,10-12`'s `invalid()`/`exactKeys`, byte-identical loop body to
  `exactInput`'s, 4 call sites (`grep -c "exactKeys("` → 5) — matches.
- `backlog.ts:37-40`'s four `Set<string>` declarations
  (`ALLOWED_ITEM_KEYS`, `ALLOWED_SOURCE_KEYS`, `ALLOWED_EXTERNAL_REF_KEYS`,
  `ALLOWED_ROOT_KEYS`) and all four call sites (53, 67, 77, 96), including
  the genuine pre-existing "CHANGE_INVALID: " prefix inconsistency at line
  77 (`validateItem`, no prefix, unlike the other three) — matches exactly.
- `session.ts:22-33`: the combined `forbidden`/`keys` loop at lines 24-27
  (out of scope, DC-1) is structurally distinct from the per-item loop at
  line 33 (in scope, T5) — confirmed independent, no shared state, by
  direct read.
- `shared/errors.ts` read in full: exports only `ErrorCode`,
  `CodepatrolError`, `operationalError`; no import from `change/` — adding
  `assertExactKeys` introduces no new dependency edge.
- All five consumer files already import `CodepatrolError` from
  `../shared/errors.js` — every T2–T6 import edit extends an existing line,
  none adds a new one.

Baseline re-run fresh (not trusted from the spec's claim): `npm run verify`
— 215/215 tests, typecheck clean, build clean, smoke-cli clean, lint-skills
clean.

## Findings

None. No major, minor, or nit findings survive independent re-verification.

## Artifact adjustments

None required.

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T1 | yes — read `errors.ts` after T1; signature stated exactly | covered |
| AC-2 | yes | T2, T3 | yes — `git diff` shows only 2 bodies changed, 8 call sites untouched | covered |
| AC-3 | yes | T2-T6 | yes — literal grep re-run against current tree confirms 11→1 after all 10 replacements | covered |
| AC-4 | yes | T1-T6 | yes — `npm test` gate after every task, 215/215 baseline reconfirmed fresh | covered |
| AC-5 | yes | T7 | yes — `git diff --stat` against base, six files named exactly | covered |

## Simplicity axis

- Selected rung: confirmed correct — direct local change (extract-and-parameterize existing logic, no new abstraction layer, no speculative generality beyond the two real code/exit-code variants already in use).
- Safety floor: byte-identical error output (code, exitCode, message text) for all 11 sites, proven by an unchanged 215-test count re-run after every task — not merely asserted.
- Surface delta: matches the stated forecast (~5/2/2/4/1/3 lines across the six files); no new files, no new dependency, no public interface removed.
- DC-1 (`session.ts:24-27` combined loop) and DC-2 (`requireObject`-family idiom) both have concrete ceilings, observable triggers, and upgrade paths — correctly deferred, not silently dropped.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| n/a | — | no removable surface found beyond what the spec already scoped out | — | none |

## Executability audit

Every task (T1–T7) independently re-verified against the live tree:
Files/Interfaces/Steps content is accurate and copy-paste-ready. T6's three
replace-steps each match the current file byte-for-byte at the stated line
numbers. T7's grep commands, when run now, produce the exact "before"
counts the plan implies (11 matches pre-Apply, expected 1 post-Apply).
Rollback (single-commit revert) and context-independence (no conversational
history required to execute) are both satisfied. No external evidence
trigger — internal refactor only.

## Verdict

`approve`

Attempt 2 fully closes attempt 1's `fix-first` finding: the evidence gap
(`usage.ts:28`, `:33` missing from the count and from T6) is corrected, T6
now has three replace-steps covering all of `validateRun`'s exact-key
sites, and AC-3's expected grep result is now achievable — confirmed by
directly re-running the literal check against the current tree rather than
trusting the spec's arithmetic. No new defects found. Design, evidence, and
task breakdown are all sound and executable as written.

## External evidence sufficiency

not required (internal refactor; no external technology, library, or API
claim governs this design).

## Residual concerns and evidence gaps

None. Both grep methodologies (narrow message-text, broad structural) agree
on the complete site inventory; the literal AC-3/T7 command was re-run
against the current tree and produces the count the plan predicts.
