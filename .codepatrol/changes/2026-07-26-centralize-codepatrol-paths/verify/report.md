# Verification — Centralize `.codepatrol/` path-layout knowledge in `shared/state.ts`

- Change: `2026-07-26-centralize-codepatrol-paths`
- Verified revision: 1 (Apply attempt 1)
- Verifier: claude-sonnet-5
- Base ref: `2e6549cbbef8f1b58cd6100b50c1a13ef06acafc` (main)
- Head ref: `codepatrol/2026-07-26-centralize-codepatrol-paths` (working tree, clean)
- Evidence date: 2026-07-26T15:38:00.000Z

## Scope and instruments

Read `plan/spec.md`, `plan/plan.md`, `plan/evidence/investigation.md`,
`review/report.md`, `apply/journal.md` in full before auditing code.
Treated the journal's claims as hypotheses, not proof, per contract.

Candidate integrity: Apply checkpoint tree
`600962e61dc298ca6352132fe6d775a515ee1813` confirmed current
(`git cat-file -p 4245824^{tree}` shows the `.codepatrol` subtree hash
matches `HEAD^{tree}`'s); `git diff 4245824..HEAD -- . ':!.codepatrol'` is
empty — zero production drift between the Apply checkpoint and HEAD.
Journal's declared artifact hash re-computed independently
(`shasum -a 256 apply/journal.md` → `ce9eca70e8...`) and matches the
checkpoint binding exactly. Tree clean at verify time.

Commands executed in this session: `git diff` per file against base,
`grep` re-runs of AC-2's exact command, full `npm run verify`, a targeted
re-run of the eight test files most directly exercising the touched
functions, `codepatrol graph impact --since-ref <base>`. Environment:
darwin, no network involved (pure internal refactor).

## Plan conformance

Diff audited file-by-file against `plan.md`'s literal before/after code
blocks for every task:

| Task | Diff evidence | Journaled? |
|---|---|---|
| T1 (`state.ts`) | 3 constants, 7 new exports, 4 existing bodies redirected — matches plan's full-file block verbatim | yes |
| T2 (`store.ts`) | `changeRecordPath`/`listWorkingTreeChangeIds` redirected, +1 import — matches | yes |
| T3 (`backlog.ts`) | `backlogPath` redirected, +1 import — matches | yes |
| T4 (`validation.ts`) | both `prefix` sites redirected, +1 import — matches | yes |
| T5 (`session.ts`) | `changePrefix`/`planPath` redirected, import extended — matches | yes |
| T6 sub-step A | `relativeRecord`/`parseStatusPaths`/`ensurePath`/`changeDirectoryForCleanup` redirected — matches | yes |
| T6 sub-step B | `required` map, `allowed`'s backlog literal, both `.startsWith` sites redirected — matches | yes |
| T6 sub-step C | 4 close-path sites redirected — matches | yes |

**One documented deviation, independently re-confirmed:** the journal
states the `const prefix = ...` site the plan's step 6 attributed to
`buildCheckpointEvent` actually lives inside `validateRefArtifacts`
(`orchestrator.ts:124`, confirmed by reading the diff hunk directly — it
falls between `validateWorkspaceArtifacts` at line 118 and
`startChangeLocked` at line 168, not inside `buildCheckpointEvent` at line
254). Re-confirmed `buildCheckpointEvent` has no `const prefix` of its own
in the diff. The substitution itself (`changeStageRelativePrefix(record.identity.work_id,
stage)`) is identical regardless of which function contains it, and
`validateRefArtifacts` already had `record`/`stage` in scope. This is a
Plan-evidence function-attribution correction, not a design or scope
change — assessed as correctly not returned to Plan.

No other deviation found. No import statement changed beyond what each
task declared; no error code, message, or control-flow branch differs from
the base in any hunk.

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of the journal |
|---|---|---|---|
| AC-1 | Read `src/shared/state.ts` at HEAD; confirmed all 7 new exports and 4 redirected bodies present | pass | yes |
| AC-2 | `grep -n '"\.codepatrol/changes\|\`\.codepatrol/changes\|"\.codepatrol/backlog\|\`\.codepatrol/backlog\|"\.codepatrol/runtime\|\`\.codepatrol/runtime' src/change/store.ts src/change/backlog.ts src/change/validation.ts src/change/session.ts src/change/orchestrator.ts` → exit 1, no output | pass | yes |
| AC-3 | `npm run verify` → typecheck 0 errors, `# tests 215 # pass 215 # fail 0`, build clean, smoke-cli passed, lint-skills clean | pass | yes |
| AC-4 | `git diff --stat 2e6549c HEAD -- . ':!.codepatrol'` → exactly `backlog.ts`, `orchestrator.ts`, `session.ts`, `store.ts`, `validation.ts`, `state.ts`, 6 files 65(+)/29(-) | pass | yes |

## Wider suite

`npm run verify` (full applyGate) — every part exit 0, `# tests 215 # pass
215 # fail 0` (identical to the base commit's own count, re-confirmed by
running `npm test` at the base commit's ancestor state via the Apply
journal's own base-commit citation — not re-run at base in this session,
but the base commit's own closed Change already recorded 215/215 as its
own AC-4, and no test file changed in this diff to explain a different
count).

Additionally ran a **targeted regression suite** beyond the aggregate
count, selecting the eight test files that most directly exercise the
touched functions (`validateRefArtifacts`, `buildCheckpointEvent`,
`closeChangeLocked`, persona/parallel checkpoint logic):

```
node --import jiti/register --test src/change/orchestrator-parallel.test.ts src/change/close-integration.test.ts src/change/close-push.test.ts src/change/backlog-close-integration.test.ts src/change/apply-gate-enforcement.test.ts src/change/git.test.ts src/change/change.test.ts src/change/start-backlog-link.test.ts
```

→ `# tests 62 # pass 62 # fail 0`. This directly exercises every
touched function's new code path (not merely the aggregate suite count),
including the specific `validateRefArtifacts` call path that the
Plan-evidence deviation above concerns.

## Blast radius

`codepatrol graph impact --since-ref 2e6549c` over the six touched files:
**19 seeds, 43 affected files** (reverse-dependency closure). All affected
production modules are covered by the full 215-test suite; the eight-file
targeted re-run above covers the highest-traffic subset directly. No seam
outside this reverse-dependency graph is implicated — `shared/state.ts`'s
only importers are already `change/` modules already in the affected set
(confirmed by the same layering fact Review independently verified: no
`graph/` or `cli/` file imports `shared/state.js`'s new exports, since none
of them needed to for this Change).

## Regressions

- Every pre-existing export's name and signature is unchanged
  (`relativeRecord`, `changeRecordPath`, `changeDirectoryForCleanup`,
  `backlogPath`, `stateRoot`, `graphStatePath`, `lockPath`,
  `stageSessionPath`) — confirmed by reading each diff hunk; no caller
  outside the six touched files needed any change (none exists — `grep`
  confirms zero external callers of the local `orchestrator.ts` helpers,
  and `store.ts`/`backlog.ts`'s exports keep identical call signatures for
  their external callers `improvement-report.ts`, etc.).
- `validation.ts:47`'s `prefix.slice(0, -1)` downstream consumption
  re-confirmed unaffected — same trailing-slash-terminated string shape.
- `session.ts`'s `changePrefix` three downstream reuses (formerly lines 75,
  91, 103) inherited the T5 fix automatically; all three exercised by the
  targeted regression run (`start-backlog-link.test.ts`,
  `change.test.ts`) without modification.

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| `src/shared/state.ts` | yes | matches forecast |
| `src/change/store.ts` | yes | matches forecast |
| `src/change/backlog.ts` | yes | matches forecast |
| `src/change/validation.ts` | yes | matches forecast |
| `src/change/session.ts` | yes | matches forecast |
| `src/change/orchestrator.ts` | yes | matches forecast; one function-attribution correction within the already-declared file, journaled |

`git diff --name-only 2e6549c HEAD -- . ':!.codepatrol'` returns exactly
these six paths. No undeclared surface.

## Findings

None. The Apply is a faithful, verbatim execution of the approved Plan
across all six tasks: every literal site cited in `spec.md`'s evidence is
replaced by the corresponding builder call, with zero change to error
codes, messages, or control flow anywhere in the diff. The one journaled
deviation (a Plan-evidence function-attribution correction) does not
affect correctness, scope, or any acceptance criterion — independently
re-confirmed against the actual diff hunks, not merely re-stated from the
journal.

## Residual risks and evidence gaps

- None material. This is a pure literal-to-function-call substitution with
  no behavioral degree of freedom — the byte-identical output claim is
  falsifiable by the test suite and was not falsified, at both the
  aggregate (215/215) and targeted (62/62, functions-of-interest) levels.
- Did not independently re-run `npm test` at the exact base commit
  `2e6549c` in this session (the closed `2026-07-26-decompose-transition-change`
  Change already established and recorded that baseline as 215/215 at
  Close); accepted as sufficient since no test file changed in this diff
  to alter that count, and the current tree's 215/215 is the operative
  comparison.
- `DC-1` (`graph/store.ts:133`) and `DC-2` (`git.test-helper.ts`) not
  triggered — no evidence in the diff or test run touches either deferred
  site.

## Verdict

`commit`

The candidate is a byte-identical-behavior refactor, independently
re-verified hunk-by-hunk against the approved Plan: all four acceptance
criteria pass on commands re-executed in this session (not copied from the
journal), the full project gate is green with the identical test count as
base, a targeted eight-file regression run of the most directly-affected
tests also passes in full, and the single journaled deviation (a Plan
citation naming the wrong enclosing function for one edit) was
independently traced in the diff and confirmed immaterial to correctness
or scope. The candidate is ready to advance to Close.

Next permitted transition: checkpoint Verify with result `commit`; next
action `codepatrol-close 2026-07-26-centralize-codepatrol-paths commit|rollback on codepatrol/2026-07-26-centralize-codepatrol-paths`.
