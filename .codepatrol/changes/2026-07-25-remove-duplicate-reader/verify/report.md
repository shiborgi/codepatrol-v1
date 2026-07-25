# Verification — Remove unsafe duplicate YAML reader

- Change: `2026-07-25-remove-duplicate-reader`
- Verified revision: 1
- Verifier: claude
- Base ref: `5893504e8d417cc7a832aecbf0c10cbb65208d48`
- Head ref: `a097014e730b2ad357cb097c7206276ffdd95ebf` (Apply checkpoint content commit `17aa8b1c5f6ea043442215463695a7832699c9a3`, tree `a9c9be0a46df40e5eb0ecce644a3a92285333e5c`)
- Evidence date: 2026-07-25T19:01:42Z

## Scope and instruments

Read `plan/spec.md`, `plan/plan.md`, `plan/evidence/investigation.md`, `review/report.md`,
`apply/journal.md` in full. Treated `apply/journal.md`'s per-task "Result: complete" lines as
unverified claims (no red/green output or command transcript was journaled) and independently
re-derived every claim below from the actual diff and command execution rather than restating
the journal. No environment limits encountered; every command in this report ran to completion in
this session against the actual checked-out worktree at `codepatrol/2026-07-25-remove-duplicate-reader`.

## Plan conformance

- **T1** (replace duplicate reader): diff matches the plan's prescribed before/after code exactly
  — `git diff 5893504..HEAD -- src/change/improvement-report.ts` shows the import line losing
  `readFileSync` and the `yaml` import, gaining `changeRecordPath`/`readChangeRecord as
  readCanonicalChangeRecord` from `./store.js` and a `ChangeRecordV2` type import; `recordPathFor`
  and the old parsing `readChangeRecord` are deleted and replaced by the planned 3-line
  existence-gated delegator. No deviation.
- **T2** (regression tests): diff matches T2's intent but deviates in fixture construction from
  the plan's illustrative snippets, and the deviation is an improvement, not a defect:
  - The plan's sketch for the legacy-`"finalize"` test hand-built a minimal 3-event fixture. The
    actual test instead loads the pre-existing real fixture `src/change/fixtures/committed-change.yaml`
    (present since `2026-07-23-rename-finalize-to-close`, not a new file) and rewrites its
    `close`→`finalize`, `change-closed`→`change-finalized`, receipt-path fields to reproduce a
    genuine legacy-shaped closed Change, then asserts `perStage.close.attemptCount === 1` and no
    `"finalize"` key. This is a stronger, more realistic fixture than the plan's sketch and adds
    no new file (reuses existing fixture) — not journaled in `apply/journal.md`, but a bounded,
    net-simplifying deviation within T2's stated purpose.
  - `seedChange` (used by five pre-existing tests) was rewritten to split its two consecutive
    `stage-returned` review events (both `attempt: 1`) into two full Plan→Review cycles (attempt 1
    returned, attempt 2 returned), with corresponding `stage-began`/`run-recorded` events added.
    This was **necessary, not optional**: once the fix routes reads through
    `assertChangeRecord`/`foldChange`, the original fixture's second `stage-returned` (still
    claiming `stage: review, attempt: 1`) violates `foldChange`'s state machine, because the first
    return already advanced state to `stage: plan, attempt: 2`
    (`src/change/model.ts:104-106`). The old duplicate reader never validated the record, so this
    invalid sequence was silently accepted before — itself a small, independent confirmation of
    the exact defect this Change fixes. The rewritten fixture preserves the original test's intent
    (`returnCount: 2`, `returns.length: 2`, first return reason `"minor defect"`) while being
    state-machine-valid; `test 1`'s `plan.attemptCount`/`review.attemptCount` assertions were
    updated from 1→2 to match, correctly. Not journaled in `apply/journal.md`, but required by the
    fix and independently re-verified below.
- **T3** (full verification): journal claims `npm run verify` passed; independently re-run in this
  session (see Wider suite) with the same result.

No task was skipped, reordered against its stated dependency, or left partially done.

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of the journal |
|---|---|---|---|
| AC-1 | `node --test --import jiti/register src/change/improvement-report.test.ts` (test: "folds legacy finalize-stage events into close") | pass | yes — also re-ran against a throwaway worktree pinned to base ref `5893504`; failed there with `0 !== 1` on `perStage.close.attemptCount`, confirming this test is red-capable against the actual prior bug |
| AC-2 | same suite (test: "throws on a present but corrupt change.yaml") | pass | yes — same base-ref worktree re-run failed there with `Missing expected exception`, confirming red-capability |
| AC-3 | same suite (test: "returns the empty-shape recommendations when no trace exists", unmodified from baseline) | pass | yes — diff confirms this test's body is untouched; ran unchanged in both the fixed and base-ref trees |
| AC-4 | `grep -n '"yaml"' src/change/improvement-report.ts` (expect no match) and `npm run typecheck` | pass — no match; typecheck exit 0 | yes |
| AC-5 | `npm run verify` | pass — exit 0 (see Wider suite) | yes |

## Wider suite

- `npm run typecheck` — exit 0, no errors.
- `npm test` (full suite, all `*.test.ts`/`*.test.mjs` under `src`, `.pi`, `scripts`) — `# tests
  190 / # pass 190 / # fail 0`, including all 8 tests in `improvement-report.test.ts` and the
  downstream Close-path suites the spec's risk note called out
  (`close-integration.test.ts`, `backlog-close-integration.test.ts`, `close-push.test.ts`,
  `orchestrator-parallel.test.ts` — all included in the same full run, all passing).
- `npm run build` — exit 0 (`tsc -p tsconfig.build.json` after `clean-dist.mjs`).
- `npm run smoke:cli` — exit 0, "Compiled CLI smoke passed (0.1.0)."
- `npm run lint:skills` — exit 0, "Skill catalog, frontmatter, dependencies, portability, and
  relative links are valid."
- Red-capability cross-check: built a detached `git worktree` at base ref `5893504…`, copied only
  the new `improvement-report.test.ts` onto the old `improvement-report.ts`, symlinked
  `node_modules`, and ran the suite — 6/8 pass, 2/8 fail exactly on the two new tests, with
  failure messages matching the claimed defect (`0 !== 1` for the finalize-fold count; `Missing
  expected exception` for the corrupt-file throw). Confirms the tests are not vacuously green.

No `DC-N` exists in the spec (spec states "None — the fix fully closes the identified gap"); none
activated.

## Blast radius

`codepatrol graph impact --file src/change/improvement-report.ts --since-ref 5893504e8d417cc7a832aecbf0c10cbb65208d48`
reports 20 affected files at depth 1–3, headed by `src/change/orchestrator.ts` (depth 1, the sole
real caller — already covered above) and, unexpectedly, `src/graph/analysis.ts` (depth 1). Checked
directly: `src/graph/analysis.ts` has no import/call/inherit edge to `orchestrator.ts` or
`improvement-report.ts` (`head -20` on both files shows disjoint import sets); this is graph-tool
noise from the impact seed set also including this Change's own `.codepatrol/changes/.../*.md`
bookkeeping files as seeds, not a real code dependency. Not a residual risk: the full `npm test`
run above includes `src/graph/analysis.test.ts`, which passed, empirically ruling out any real
regression regardless of the graph tool's edge attribution. All depth-2/3 entries
(`src/cli/commands.ts`, `src/cli/args.ts`, `src/cli/main.ts`, various `*.test.ts`) are downstream
of `orchestrator.ts` as an existing hub, not new coupling introduced by this Change, and all are
exercised (green) in the same full suite run. No impacted seam is missing from the plan's stated
scope.

## Regressions

- Ran the full project test suite (190 tests) rather than only the changed file's suite — no
  failures anywhere, including every existing `improvement-report.test.ts` case and every
  Close-stage integration test that transitively calls `generateImprovementReport`
  (`orchestrator.ts:409`).
- Confirmed `main`/`origin/main` unchanged at `5893504…`, matching the Change's recorded
  `base_commit` and `target_branch` — no target-ref drift since Plan.
- No `codepatrol/committed/*` or `codepatrol/rolled-back/*` tag exists yet for this work id
  (`git tag -l` empty) — correct pre-Close state, no premature terminal marker.

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| `src/change/improvement-report.ts` | yes (T1) | matches plan exactly |
| `src/change/improvement-report.test.ts` | yes (T2) | matches T2's intent; fixture construction deviates from the plan's illustrative snippet as described in Plan conformance — accepted as a necessary, net-simplifying deviation, not journaled but independently re-verified |

`git diff 5893504..HEAD --stat -- ':!.codepatrol'` confirms exactly these two files changed in
production/test source — identical to the Apply checkpoint's declared `changes` list
(`src/change/improvement-report.ts`, `src/change/improvement-report.test.ts`). No undeclared file
was touched.

## Findings

None. No conformance, acceptance, regression, scope, or evidence-quality defect survived
independent re-verification.

## Residual risks and evidence gaps

- `apply/journal.md` is thin (no red/green transcripts, no rationale for the fixture rewrite) —
  this Change's Apply attempt relied on this Verify pass to supply the missing evidence rather
  than journaling it at the time. Not a defect in the delivered code, but future Apply attempts on
  this codebase should journal deviations from the plan's illustrative snippets as they happen,
  not leave them to be reconstructed at Verify.
- The two on-disk Changes still carrying the legacy `stage: finalize` value
  (`2026-07-23-finalize-merge`, `2026-07-23-rename-finalize-to-close`) were not read through
  `generateImprovementReport` directly as part of this Verify (only a reconstructed-from-fixture
  analog was); this is an accepted, spec-scoped gap (spec's Out of scope explicitly excludes
  migrating or exercising those two files in place) and does not affect the acceptance criteria as
  written.
- Carried over from Plan (not this stage's defect): the backlog item
  `unsafe-duplicate-yaml-reader-in-improvement-report-ts-bypasses-migraterecord-normalization`
  was never linked via `backlogItemId` at `change start`, so it still shows `status: candidate`,
  `workId: null` in `.codepatrol/backlog/items.yaml`. Cosmetic; does not block this Verify or
  Close.

## Verdict

`commit`

Every task in `plan.md` is implemented and matches its interfaces exactly; the one real deviation
(fixture reconstruction in T2) is a necessary, accuracy-improving consequence of the fix itself and
was independently re-verified rather than taken on faith. All five acceptance criteria were
re-executed directly against the working tree in this session, including a from-scratch red/green
cross-check against the pre-fix code that confirms the new tests actually detect the original
defect. The full project gate (`npm run verify`) passes with zero failures across 190 tests, and
the diff contains exactly the two files the Apply checkpoint declared — no undeclared production
change. This Change is fit to advance to Close with `commit`; next action:
`codepatrol-close 2026-07-25-remove-duplicate-reader commit on codepatrol/2026-07-25-remove-duplicate-reader`.
