# Review — Centralize `.codepatrol/` path-layout knowledge in `shared/state.ts`

- Change: `2026-07-26-centralize-codepatrol-paths`
- Incoming revision: 1
- Reviewed revision: 1
- Reviewer: claude-sonnet-5
- Evidence date: 2026-07-26T15:20:00.000Z

## Scope and evidence

Read `plan/spec.md`, `plan/plan.md`, `plan/evidence/investigation.md` in
full before touching code. Treated every citation as a hypothesis and
independently re-derived it against the actual working tree (branch
`codepatrol/2026-07-26-centralize-codepatrol-paths`, base `main`@`2e6549c`,
tree clean, `npm run verify` green at baseline):

- Re-ran the full literal inventory grep and cross-checked every cited
  `file:line` against the live file for all six sites named in "Current
  evidence": `orchestrator.ts` (lines 24, 25, 27, 123, 206-208, 254-259,
  265, 269, 292, 384-385, 408, 413), `validation.ts` (24, 43), `session.ts`
  (73, 123), `backlog.ts` (46-48), `store.ts` (11, 30-31), `state.ts` (full
  19-line file). Every citation matched the live source byte-for-byte.
- Confirmed `AC-2`'s grep is genuinely red today: run verbatim, it returns
  24 matching lines (spec/plan claim it must return zero after the fix).
- Confirmed the "exactly two occurrences" claim for the
  `!path.startsWith(...changes.../) && !path.startsWith(...backlog.../)`
  substring in `buildCheckpointEvent` (`grep -c` → `2`, lines 269 and 292).
- Confirmed the import-shape claims: only `session.ts:7` currently imports
  from `../shared/state.js`; `backlog.ts`, `validation.ts`, `store.ts`,
  `orchestrator.ts` do not (`grep -n "shared/state" src/change/*.ts`
  confirms exactly one match, in `session.ts`).
- Confirmed `validation.ts:46`'s `prefix.slice(0, -1)` continues to work
  identically once `prefix` is sourced from `changeStageRelativePrefix`
  (same trailing-slash-terminated string shape, character-for-character).
- Confirmed `session.ts:75,91,103` reuse the `changePrefix` variable
  defined at line 73 — the plan only needs to redirect the one definition
  site; the three downstream uses inherit the fix automatically, correctly
  not listed as separate steps.
- Confirmed layering: `shared/state.ts` currently imports only
  `./workspace.js`; adding `change/*.ts → shared/state.js` edges introduces
  no cycle (`change → shared` is the already-established direction).
- Read `CONTEXT.md` in full: no domain-glossary term or invariant (Change,
  Stage Attempt, Stage Session, Terminal Outcome, etc.) is touched by this
  Change — pure internal `src/` refactor, no lifecycle-semantic surface.
- Ran `codepatrol graph impact --since-ref 2e6549c` against all six planned
  seed files: wide reverse-dependency reach (as expected for
  `orchestrator.ts`/`state.ts`), fully covered by the plan's own AC-3 (full
  215-test suite, identical count) — no additional targeted check needed
  beyond what the plan already specifies.
- Re-checked the precedent Change (`2026-07-26-decompose-transition-change`)
  it cites for discipline and file-touch history — confirmed accurate.

Limitation: did not execute the plan's steps myself (Review does not edit
production code); correctness of each literal replacement is verified by
character-for-character comparison against the plan's stated before/after
code blocks and the live source, not by running the refactor.

## Findings

### minor — evidence

`spec.md`'s Current evidence and `plan/evidence/investigation.md` both
state `relativeRecord(` has "15" (or "15+") call sites in
`orchestrator.ts`. Independently counted: 18 total occurrences of the
substring `relativeRecord(` in the file, one of which is the function's own
definition (line 24) — **17 actual call sites**, not 15.

Impact: none on correctness or executability. The fix's design is
explicitly call-count-agnostic (Proposed design: "so every existing caller
... needs zero changes" — the plan never enumerates or individually edits
call sites, only the one-line function body). No AC references this count.
Not required to correct before Apply; noted for the record since accuracy
of cited evidence matters even when the inaccuracy is not load-bearing.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none | the "15" vs. 17 discrepancy is immaterial to any AC and does not require a Plan return | none |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T1 | yes — read `state.ts` after T1, exact export list given | covered |
| AC-2 | yes | T2, T3, T4, T5, T6 | yes — confirmed red today (24 matches), must reach 0 | covered |
| AC-3 | yes | T1-T6 (every task) | yes — `npm test` after every step, identical 215/215 required | covered |
| AC-4 | yes | T6 (final steps) | yes — `git diff --stat` against named base commit | covered |

## Simplicity axis

- Selected rung: confirmed — direct local change (literal-to-function-call
  substitution) is the correct, minimal rung; no lighter mechanism exists
  between "keep the duplication" and "name it once, call it everywhere,"
  and no heavier mechanism (generic path DSL, moving I/O functions into
  `state.ts`) is justified — both alternatives are explicitly and
  correctly rejected in the spec with concrete reasoning.
- Safety floor: byte-identical path-string output is the stated floor,
  enforced by an `npm test` gate after every one of T1-T6's sub-steps, not
  merely asserted. Every existing exported function name/signature
  (`relativeRecord`, `changeRecordPath`, `changeDirectoryForCleanup`,
  `backlogPath`) is preserved — confirmed by reading the plan's exact
  before/after blocks for each.
- Surface delta: matches the spec's forecast (`state.ts` +~25 lines; five
  consumer files each ≤~4 lines changed plus at most one import edit).
  Necessary and sufficient — no speculative surface (no generic
  abstraction, no fix bundled from unrelated backlog items F2/S2/S3/S4).

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| simplify | `plan.md` | none | none | already sufficient |

DC-1 (`graph/store.ts:133`) and DC-2 (`git.test-helper.ts`) each have a
concrete known ceiling, an observable trigger, and a bounded upgrade path
that reuses infrastructure this Change already introduces (both upgrade
paths cite importing from the now-existing `shared/state.js` builders) —
both deferred cleanly.

## Executability audit

- Every task's Files/Interfaces/Steps section names exact paths and gives
  literal before/after code — no re-derivation from prose is needed by an
  independent implementer.
- T2-T5 are correctly marked mutually independent (each touches a disjoint
  file, each only depends on T1's new exports) — safe parallelization if a
  future Apply session chooses to, though the plan reasonably sequences
  them for a single-actor session.
- T6's three sub-steps are aligned to `orchestrator.ts`'s own existing
  function boundaries (post-`2026-07-26-decompose-transition-change`
  decomposition: early helpers / `buildCheckpointEvent` /
  `closeChangeLocked`) — each independently gated by a full test run,
  matching the precedent Change's discipline exactly, appropriate given
  this file's incident history.
- Rollback: plan states `git revert` cleanly restores literal-inlined form;
  confirmed plausible — every change is additive-then-redirect, no schema,
  event, or interface removed.
- Context independence: the plan's literal code blocks are copy-paste
  ready; no unresolved assumption or missing decision found.
- No external evidence trigger — this is an internal refactor with no
  external technology claim.

## Verdict

`approve`

The plan's evidence was independently re-derived against the live tree,
not merely re-read, and every citation checked out exactly — including two
specific numeric claims (AC-2's grep returning 24 matches today, and the
"exactly two occurrences" claim in `buildCheckpointEvent`) that could have
been wrong and were not. The one finding (a minor evidence-count
inaccuracy, 15 claimed vs. 17 actual `relativeRecord` call sites) is
immaterial to correctness, executability, or any acceptance criterion, and
does not warrant a Plan return. The task decomposition matches this
repository's established discipline for `orchestrator.ts` changes exactly.
Proceed to Apply.

## External evidence sufficiency

not required (internal refactor; no external technology, library, or API
claim governs this design).

## Residual concerns and evidence gaps

None material. The plan's task-per-file/sub-step granularity with a test
gate after every step is the correct mitigation for the acknowledged risk
of touching `orchestrator.ts` again immediately after a large structural
change there; independent verification here found no evidence that
mitigation is insufficient.
