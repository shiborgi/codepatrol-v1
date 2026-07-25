# Verification — Structured, prioritized backlog under `.codepatrol/backlog/`

- Change: `2026-07-24-backlog-subsystem`
- Verified revision: 3 (verify attempt 3)
- Verifier: opencode (auditor persona, fresh context — no Plan/Apply chat history)
- Base ref: `8b474386e91d68f320dedbe2cc8c91673f474aed`
- Head ref: `codepatrol/2026-07-24-backlog-subsystem` @ `7247d7cd` (lifecycle checkpoint wrapping apply-content `0b303581`)
- Candidate binding: Apply attempt 3 checkpoint `0b303581e065b92056e6606183c0c72d9fef7913` / tree `ad385a2c5df9d0c40c192b57dff68ffefa123bb7` (re-verified: `git rev-parse 0b303581^{tree}` = `ad385a2c…` — exact match)
- Evidence date: 2026-07-25T10:08:31Z

## Scope and instruments

Artifacts read in full this session: `plan/spec.md`, `plan/plan.md`,
`plan/evidence/investigation.md`, `review/report.md`, `apply/journal.md`.
Prior verify attempts 1 & 2 returned with no bound artifacts (their reports
were cleared on return; their findings survive in git history and are
re-derived below from the journal's rework sections T1B/T1C plus direct
code/test re-verification).

Diff range audited: `8b47438..0b30358` (base → apply-content; 24 files, +2083
/−31). HEAD `7247d7c` differs from `0b30358` by exactly `.codepatrol/changes/
2026-07-24-backlog-subsystem/change.yaml` (lifecycle bookkeeping from this
Verify begin); production code is identical at HEAD and `0b30358`.

Commands executed this session: `git` (diff/stat/tree/ls-tree/check-ignore),
`codepatrol change inspect/transition/session`, `codepatrol graph sync` +
`graph impact`, `codepatrol status`, `node … render-kanban.mjs`, `npm run
verify` (typecheck + `node --test` + build + smoke:cli + lint:skills), and
the focused per-AC test files. Environment: darwin, node, clean worktree on
`codepatrol/2026-07-24-backlog-subsystem`. No command could not be executed.

## Prior-verify defect re-verification (the load-bearing question)

Verify attempt 1 returned: the Close hook wrote `.codepatrol/backlog/items.yaml`
but never git-tracked it (contradicting the T1-amended governing docs that
promise a "tracked" file). Verify attempt 2 returned: T1B's fix only covered
the `close` path; the `change start` (link) and `backlog add` CLI paths still
left the file untracked, and the reverted `parseStatusPaths` filter then turned
those into hard `CHANGE_CONFLICT` failures at the next checkpoint.

All three write paths re-verified closed this session against `0b30358`:

| Write path | Tracking mechanism (verified in source) | Falsifying test (re-run, pass) |
|---|---|---|
| Close (T4 + T1B) | `orchestrator.ts:416-417`: `pathsToCommit.push(backlogFile)` when `existsSync(backlogFile)` | `backlog-close-integration.test.ts:42` `assert.match(show, /backlog\/items\.yaml/)` on the terminal commit |
| `change start` link (T5 + T1C) | `orchestrator.ts:187-190`: `linkBacklogItem` runs before `commitMetadata(..., extraPaths=[backlogFile])` when `backlogItemId` set and file exists | `start-backlog-link.test.ts` "regression: Plan checkpoint succeeds immediately after change start with backlogItemId" |
| `backlog add` CLI (T3 + T1C) | CLI writes only (no auto-commit); caller-commits contract documented in `skills/codepatrol-plan/SKILL.md` | `cli.test.ts` "regression: Plan checkpoint succeeds after backlog add CLI when the caller commits the file" |

Checkpoint validation cooperates: `orchestrator.ts:265` adds
`.codepatrol/backlog/items.yaml` to the `allowed` set, and `:269`/`:291`
exclude `.codepatrol/backlog/` from `actualProduction`/`finalProduction`, so a
committed backlog file is never flagged as undeclared or as unexpected
production delta. The close-integration test also asserts the negative
(`:60` `doesNotMatch` — no backlog file committed when only filler
recommendations). **Defect closed.**

## Plan conformance

Task-by-task diff audit against `plan.md`. Every delivered file maps to a
declared task; no undeclared production surface.

| Task | Declared files | Delivered (diff vs base) | Conforms |
|---|---|---|---|
| T1 governing docs | `AGENTS.md`, `docs/runtime-state.md`, `CONTEXT.md` | all three amended; "global workflow ledger" removed; backlog exception added | yes |
| T2 backlog module | create `backlog.ts`, `backlog.test.ts` | created; schema/validation/dedup/classify/upsert/link/list/find all present | yes |
| T3 backlog CLI | `args.ts`, `output.ts`, `commands.ts`, `cli.test.ts` | `backlog.add`/`backlog.list` cases + `renderBacklogList` + `KNOWN`/`COMMAND_OPTIONS`/`status` + tests | yes |
| T4 Close hook | `orchestrator.ts`, `backlog-close-integration.test.ts` | best-effort loop at `:408-413` re-calling `generateImprovementReport`, excluding both fillers, per-item `try/catch` | yes |
| T5 start linkage | `types.ts`, `orchestrator.ts`, `start-backlog-link.test.ts` | `backlogItemId?` on `StartChangeInput`; `assertStartInput` allowed list; pre-branch `findBacklogItem` check at `:174-178`; post-record `linkBacklogItem` | yes |
| T6 next plan list | `commands.ts`, `output.ts`, `cli.test.ts` | `case "next"` `:61-70` adds `data.backlog` only for plan/no-stage; `renderNext(..., backlog?)` | yes |
| T7 Kanban column | `board.ts`, `board.test.ts`, `commands.ts:55`, `render-kanban.mjs` | `KanbanRow.backlog`; `projectKanban(..., {backlogItems?})` pure; header; both render-path callers pass `readBacklog().items` | yes |
| T8 Plan skill + contract | `codepatrol-plan/SKILL.md`, `skills-contract.test.mjs` | entry line + plan-split paragraph (incl. caller-commits contract); `assert.match(skill("codepatrol-plan"), /backlog/)` | yes |
| T9 verify | none | — | n/a |

Differences from the literal plan text, all journaled in T1B/T1C rework
sections and accepted:
- `parseStatusPaths` (`orchestrator.ts:25`) keeps `.codepatrol/backlog/` in
  its filter scope (the file is now tracked, so it must be visible to
  checkpoint validation rather than hidden).
- `commitMetadata` (`:95`) gained an `extraPaths` parameter; the `allowed`
  set and production-delta filters were extended for the backlog path.
These are the natural complements of the T1B/T1C defect fix, not new scope.

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of the journal |
|---|---|---|---|
| AC-1 (add → create + dedup-bump, keep higher priority) | `node --test --import jiti/register src/change/backlog.test.ts` | pass (dedupKey, classifyPriority, upsert-bump-higher-priority, no-resurrect, link throw cases, list sort, malformed→CHANGE_INVALID) | yes |
| AC-2 (list text/json ordered + `--status`) | `node --test --import jiti/register src/cli/cli.test.ts` (backlog list cases) | pass | yes |
| AC-3 (Close feed: non-filler→item w/ priority; filler→none; hook failure non-blocking) | `node --test --import jiti/register src/change/backlog-close-integration.test.ts` | pass (2/2: non-filler→p3 close-trace item committed; filler-only→no item, no file) | yes |
| AC-4 (`next --stage plan` Backlog section + json `backlog[]`; other stages omit) | `node --test --import jiti/register src/cli/cli.test.ts` (next-plan/next-verify) | pass | yes |
| AC-5 (`change start --backlogItemId` links + schedules; missing id → INVALID_ARGUMENT pre-branch; dismissed → CHANGE_CONFLICT) | `node --test --import jiti/register src/change/start-backlog-link.test.ts` | pass (5/5 incl. the T1C regression) | yes |
| AC-6 (BOTH Kanban render paths show Backlog column; backlog-only rows; promoted flow) | `node --test --import jiti/register src/change/board.test.ts`; live `codepatrol status --format text`; live `render-kanban.mjs --format markdown` + `--format json` | pass (7/7); both live paths emit `\| Work \| Branch \| Backlog \| Plan \| …\|` and a `backlog` field on every JSON row; the two views agree byte-for-byte on the header | yes |
| AC-7 (governing docs sanction; CONTEXT term; plan SKILL; skills-contract) | `rg -n "global workflow ledger" AGENTS.md docs/runtime-state.md CONTEXT.md` (exit 1, no matches); `rg -n "backlog"` hits all three; `node --test --import jiti/register scripts/skills-contract.test.mjs` | pass | yes |
| AC-8 (`npm run verify` exit 0) | `npm run verify` | pass (typecheck clean; 175/175 tests; build; smoke:cli "Compiled CLI smoke passed"; lint:skills "valid") | yes |

DC-N triggers: none activated. DC-1 (one-command promote), DC-2 (auto-priority
ceiling — close-trace items never classify above p1), DC-3 (digit-strip dedup
only), DC-4 (no backfill) all remain at their documented ceilings.

## Wider suite

`npm run verify` (the declared gate and the `.codepatrol/config.json`
`applyGate`) — exit 0. Components actually run this session:
- `npm run typecheck` (`tsc --noEmit`) — clean.
- `npm test` (`node --test` across `src`, `.pi`, `scripts`) — `# tests 175 /
  pass 175 / fail 0`, duration ~16s. Test count matches the journal's 175
  (151 baseline + 24 added: 9 backlog + 2 close-integration + 5
  start-backlog-link + 5 board + 1 cli backlog + 2 T1C regressions; the +2
  beyond the journal's +22 are the two T1C regression tests recorded in the
  rework section).
- `npm run build` (`clean-dist` + `tsc -p tsconfig.build.json`) — clean.
- `npm run smoke:cli` — "Compiled CLI smoke passed (0.1.0)."
- `npm run lint:skills` — "Skill catalog, frontmatter, dependencies,
  portability, and relative links are valid."

No warnings observed beyond ordinary test-runner diagnostics.

## Blast radius

`codepatrol graph sync` → 70 files, 1814 symbols, 385 imports, 3409 calls.
`graph impact --file <changed-production-file>` for each of the seven changed
production modules. Every affected caller and every affected test was
exercised by the full gate (175/175). Highlights:

- `projectKanban` callers — `rg "projectKanban\(" src scripts` → exactly two
  production callers: `src/cli/commands.ts:55` (`status`) and
  `scripts/render-kanban.mjs:36`. Both pass `backlogItems: readBacklog(…).items`.
  No third caller exists (the Review watch-item holds). Plus the `board.ts:26`
  definition and `board.test.ts` test calls.
- `backlog.ts` (new leaf) — direct importers: `orchestrator.ts`,
  `cli/commands.ts`, `board.ts`, `render-kanban.mjs`; all updated by this
  Change and covered by `backlog.test.ts` / `backlog-close-integration.test.ts`
  / `start-backlog-link.test.ts` / `board.test.ts` / `cli.test.ts`.
- `orchestrator.ts` — the broadest blast radius; affected tests
  `change.test.ts`, `close-integration.test.ts`, `close-push.test.ts`,
  `apply-gate-enforcement.test.ts`, `orchestrator-parallel.test.ts`,
  `git.test.ts`, `improvement-report.test.ts` all ran green in the full gate.
- Impacted seams the plan did not list: none. Every affected file is either a
  declared task file or an existing test that the gate already exercises.

## Regressions

No behavior drift at surviving interfaces. Specifically re-checked:
- `parseStatusPaths` (`orchestrator.ts:25`) still filters `.codepatrol/` and
  `.codepatrol/runtime/`; only the reverted `.codepatrol/backlog/` exclusion
  (introduced then removed in T1B) changed — net effect vs base is nil for
  every non-backlog path.
- Close postcondition (`completeFinalization:445`) still requires a clean
  worktree; the backlog file is committed before that check, so it holds.
- `change-started` event schema unchanged (`backlogItemId` is consumed at
  start time only, never persisted on the event — confirmed by reading
  `startChangeLocked:180`).
- Existing `board.test.ts` header assertion updated for the new column;
  `change.test.ts` / `git.test.ts` lifecycle suites green.

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| `.codepatrol/backlog/items.yaml` (runtime, not in candidate tree) | yes (sanctioned operational state) | accepted — correctly absent from the source tree; created/tracked at runtime by Close/start/CLI |
| `bin/`, `docs/codepatrol/assessments/` | out of scope (must be untouched) | verified untouched: `git ls-tree -r --name-only 0b30358 \| rg backog/items` → none; diffstat shows no `bin/` or assessments paths |
| `change.yaml` lifecycle events | yes (Verify begin/usage) | accepted — lifecycle bookkeeping |

No unforecast production surface. `git check-ignore .codepatrol/backlog/items.yaml`
→ exit 1 (not ignored), so the path is genuinely trackable, matching the
governing-doc amendment.

## Findings

None blocking. One minor, non-blocking observation (carried forward from the
prior verify, explicitly deferred by the maintainer in the journal):

### minor — conformance — AC-6 wording vs `status --format` flag

`spec.md:135` names `codepatrol status --format markdown`, but `status`
accepts only `--format text|json` (markdown is the text-mode rendering). The
substantive intent — both render paths show the Backlog column — is met and
live-verified above. This is a Plan-pass wording imprecision, not an
Apply-introduced defect; correcting it is a future Plan edit. No correction
required to advance.

## Residual risks and evidence gaps

- DC-1/DC-2/DC-3/DC-4 remain at their documented ceilings; none activated.
- The live workspace has no `.codepatrol/backlog/items.yaml` yet (no Close has
  run on a non-filler Change here), so the Kanban Backlog cell renders `-` for
  this Change. The populated case is covered by `board.test.ts` (7/7) and the
  close-integration terminal-commit assertion; the column/header/JSON field
  presence is live-confirmed.
- The minor AC-6 wording gap above.
- Per-run provider tokens: `unavailable` — this harness exposes no
  authoritative provider usage hook (consistent with all prior runs in this
  Change). Elapsed time is recorded.

## Verdict

`commit`

All eight acceptance criteria pass on independent re-execution; the full
`.codepatrol/config.json` `applyGate` (`npm run verify`) is green (175/175);
the candidate binding is intact (checkpoint `0b303581` / tree `ad385a2c`,
re-verified); the two prior Verify defects are closed across all three
write paths with falsifying regression tests; the blast radius is fully
covered by the gate; there are no unplanned production changes and no
regressions at surviving interfaces. The single minor finding is a
non-blocking Plan-wording item already deferred. The Change is ready to
advance to Close.

Next permitted transition:
`codepatrol-close 2026-07-24-backlog-subsystem commit|rollback on codepatrol/2026-07-24-backlog-subsystem`.
