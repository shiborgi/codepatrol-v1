# Verification — codepatrol-git: two-way backlog/GitHub-issue sync

- Change: `2026-07-25-issue-tracker-sync`
- Verified revision: 2 (Apply attempt 1)
- Verifier: opencode (codepatrol-verify skill)
- Base ref: `932edcc79127c3fb84510e1a4b621efb9fc63774` (main)
- Head ref: `codepatrol/2026-07-25-issue-tracker-sync` @ `7f9796f` (Apply checkpoint transition `7f9796f`; Apply content checkpoint `43801af`, tree `620f69d`)
- Evidence date: 2026-07-26T01:21Z

## Scope and instruments

Artifacts read (hashes re-verified against attempt bindings): `plan/spec.md` `3b4a667d…`, `plan/plan.md` `643b490d…`, `plan/evidence/investigation.md` `c10bde51…`, `review/report.md` `3bc9ea6f…` (approve), `apply/journal.md` `cbd0e531…`. Journal claims treated as hypotheses; every gate below was re-executed in this session.

Candidate integrity: Apply checkpoint tree `620f69d` matches the declared binding; `git diff 43801af HEAD` is **only** `.codepatrol/changes/<id>/change.yaml` (the apply events) — zero production drift between the Apply checkpoint and HEAD. Tree clean at verify time.

Commands executed here: `npm run verify` (applyGate), focused `node --test` runs for each new/changed test file, `codepatrol graph impact --since-ref <base>`, `gh issue list`, `git diff --name-only/--stat` against base. Environment: darwin, `gh` 2.96.0 authenticated as `shiborgi`. Could not execute: real `gh` write paths (by design — `FakeGhAdapter`-only coverage; see residual risks).

## Plan conformance

Task-by-task audit of the diff (`git diff --stat 932edcc HEAD`, 11 files, +634/−13):

| Task | Plan intent | Diff evidence | Journaled? |
|---|---|---|---|
| T1 | Widen backlog schema additively | `backlog.ts`: `VALID_SOURCE_KINDS` +`github-issue`; `ALLOWED_ITEM_KEYS` +`externalRef`; new `ALLOWED_EXTERNAL_REF_KEYS`; `BacklogSource.workId?`; `ExternalRef`; `validateSource` branches (forbids `workId` for `github-issue`); new `validateExternalRef`. `backlog.test.ts` +15 lines | yes |
| T2 | `NodeGhAdapter` mirroring `NodeGitAdapter` | `issue-sync.ts:18-30`: `constructor(readonly workspace)`, `run` passes `cwd: this.workspace`, CANCELLED→OPERATION_FAILED. Review Finding 2 closed | yes |
| T3 | `syncIssues` + unit tests | `issue-sync.ts:62-188` (`ghFor` mirrors `gitFor`; pull/push machine; dryRun guards; never-re-push via `!externalRef`); `issue-sync.test.ts` +219 lines (11 tests) | yes |
| T4 | CLI arg wiring | `args.ts`: `direction`/`dryRun` in `KNOWN`, `dry-run` in `BOOLEAN_FLAGS`, `issues.sync` in `COMMAND_OPTIONS`, both in `ParsedArgs` + return | yes |
| T5 | Dispatch + render | `commands.ts`: optional `overrides?: CommandOverrides` consumed only by `issues.sync`; `INVALID_ARGUMENT` on bad direction. `output.ts`: `renderIssueSyncResult` + HELP section. `main.ts` untouched | yes |
| T6 | CLI integration test | `issues-sync.test.ts` +91 lines (3 tests, direct-import via `overrides.gh`) | yes |
| T7a | Skill + catalog + contract test | `skills/codepatrol-git/SKILL.md` (frontmatter `name`/`description` only); `catalog.yaml` +`codepatrol-git` (role support, line 95); `skills-contract.test.mjs` support array now 11 names | yes |
| T8 | Full gate + graph | no code; gate evidence below | yes |

Three journaled deviations, all verified transparent and non-semantic:
1. **T7a session invisibility** — `session.ts:126` regex `/^### (T\d+)\s+[—-]\s+(.+)$/` rejects letter-suffix ids; T7a executed under T8 with full evidence. Parser/plan-id mismatch, not a contract/scope change. Recommended follow-up (rename T7a→T7 or relax regex) is correctly out of scope.
2. **T1 message-prefix alignment** — `validateSource`/`validateExternalRef` messages gained `CHANGE_INVALID: ` prefix to match the existing `validate()` style (`backlog.ts:94-98`). Verified: only the human `message` changed; error `code` ("CHANGE_INVALID") and exit (4) unchanged; the codebase was already inconsistent (`validateItem` at `backlog.ts:75-89` remains unprefixed); no test pins the message text (full suite green). Cosmetic, intent-preserving.
3. **Stray-scratch cleanup** — removed an untracked 2-line JSONL trace at `.codepatrol/changes/.codepatrol/runtime/traces/…` (raw scratch AGENTS.md excludes from Changes; `.gitignore` covers `.codepatrol/runtime/`). Correct hygiene; no lifecycle/production/user-data touched.

No deviation is a contract or scope change; none warrants a return.

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of the journal |
|---|---|---|---|
| AC-1 | `node --test src/change/issue-sync.test.ts` (11/11) — "AC-1: pull dismisses a candidate whose linked issue closed" | pass | yes |
| AC-2 | `node --test src/change/issue-sync.test.ts` (11/11) — dismissed↔open reopen | pass | yes |
| AC-3 | `node --test src/change/issue-sync.test.ts` (11/11) — scheduled/done immunity | pass | yes |
| AC-4 | `node --test src/change/issue-sync.test.ts` (11/11) — open unlinked import, `gh-issue-<n>`, no `workId`, `externalRef` set | pass | yes |
| AC-5 | `node --test src/change/issue-sync.test.ts` (11/11) — closed unlinked never imported | pass | yes |
| AC-6 | `node --test src/change/issue-sync.test.ts` (11/11) — exactly one `createIssue`, `externalRef` set | pass | yes |
| AC-7 | `node --test src/change/issue-sync.test.ts` (11/11) — done→completed, dismissed→not planned | pass | yes |
| AC-8 | `node --test src/change/issue-sync.test.ts` + `src/cli/issues-sync.test.ts` (3/3) — dryRun zero gh-mutation + zero backlog-write, result still shaped | pass | yes |
| AC-9 | `npm run verify` (typecheck + 205/205 + build + smoke + lint:skills) | pass | yes |

## Wider suite

`npm run verify` (the configured `applyGate`, run in this session) — all parts exit 0:
- `npm run typecheck` → 0.
- `npm test` → `# tests 205, # pass 205, # fail 0` (duration ~16.6s).
- `npm run build` → 0.
- `npm run smoke:cli` → `Compiled CLI smoke passed (0.1.0).`
- `npm run lint:skills` → `Skill catalog, frontmatter, dependencies, portability, and relative links are valid.`

## Blast radius

`codepatrol graph impact --since-ref 932edcc --workspace $PWD` → **21 seeds, 45 affected files** (depth 1-2). Directly impacted non-test source: `board.ts`, `improvement-report.ts`, `model.ts`, `orchestrator.ts`, `main.ts`, `analysis.ts`, `extract.ts` (depth 1); `session.ts`, `store.ts`, graph `link/render/service/store` (depth 2). Every impacted module's test ran in the 205/205 suite and passed — no impacted seam lacks exercise. The blast radius is exactly the `backlog.ts` consumer graph plus the CLI graph; no seam the plan did not list is materially impacted (the `backlog.ts` widening is additive and its consumers' tests confirm no regression). Ambiguous-edge candidates (`scripts/lint-skills.mjs`, `trace.ts`, `validation.ts`, `repo-files.ts`) cleared via `lint:skills` (valid) and the passing test suite.

## Regressions

- `backlog.ts` schema widening: existing consumers (`orchestrator.ts` `backlogItemId` linkage, `upsertBacklogItem`, `linkBacklogItem`, `improvement-report.ts`, `board.ts`) unchanged in signature; their tests (`backlog-close-integration`, `start-backlog-link`, `close-integration`, `close-push`, `improvement-report`, `board`, `orchestrator-parallel`, `apply-gate*`) all pass. Existing `.codepatrol/backlog/items.yaml` records (all `close-trace`/`plan-followup` with `workId`) still validate — confirmed by `backlog.test.ts` 10/10 and the integration suite.
- CLI surface: `main.ts` call site unchanged (`overrides` optional); `cli.test.ts`, `main.test.ts` pass. New `issues.sync` case does not alter any other case (verified by the switch-scoped `overrides` consumption).
- `codepatrol issues sync --dry-run --direction both` behavior (no writes, no gh mutations) verified structurally in `issue-sync.ts:108-139` and by `issues-sync.test.ts`.

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| `src/change/backlog.test.ts` | implicit in plan T1 step 1 (add test to existing file); spec's "1 new test file" referred to `issue-sync.test.ts` | accepted — journaled deviation (surface-delta note) |
| `src/cli/issues-sync.test.ts` | plan T6 explicitly allowed "or a new adjacent file" | accepted — journaled (cli.test.ts uses a subprocess helper that can't inject FakeGhAdapter) |
| all other 9 paths | yes | match forecast exactly |

No undeclared production surface. `git diff --name-only 932edcc HEAD -- ':!.codepatrol'` returns exactly the 11 declared paths.

## Findings

None blocking. The three journaled deviations are verified transparent, intent-preserving, and non-semantic (conformance notes above, not defects). No `DC-N` trigger activated: DC-1 (`--limit 1000` ceiling) and DC-2 (fixed `area: "workflow"`) remain accepted deferred constraints, neither silently worked around.

## Residual risks and evidence gaps

- `FakeGhAdapter`-only coverage is structurally blind to `NodeGhAdapter`'s real-subprocess behavior. Verified here by static audit against `git.ts:33-36` (`cwd: this.workspace` present) and the journal's Apply-time `gh … --help` re-check (no drift on `gh` 2.96.0 vs `investigation.md`). Real `gh` write paths were not exercised in any test (by design).
- Zero real `gh` writes confirmed: `gh issue list --state all --json number,title,state,url --limit 5` → `[]`, byte-identical to the pre-Change baseline — AC-9's hard requirement met.
- DC-1/DC-2 ceilings not exercised (no repo with >1000 issues; no miscategorized-area signal). Triggers and upgrade paths stated in `spec.md`.
- The T1 message-prefix change leaves `validateItem` (`backlog.ts:75-89`) unprefixed — cosmetic inconsistency only; no behavioral or contractual impact.
- Concurrent `items.yaml` write races remain a pre-existing property of every `backlog.ts` writer; not introduced or worsened.

## Verdict

`commit`

Apply attempt 1 conforms to the approved Plan across all eight tasks; all nine acceptance criteria pass on independently re-executed commands; the full applyGate (`npm run verify`: typecheck + 205/205 + build + smoke + lint:skills) is green; the candidate is intact (Apply checkpoint tree `620f69d`, zero production drift to HEAD); the production delta is exactly the 11 declared paths with no unplanned surface; zero real `gh` writes occurred; and the blast radius is fully covered by the passing suite. The three journaled deviations are transparent, non-semantic, and correctly scoped. The candidate is ready to advance to Close.

Next permitted transition: checkpoint Verify with result `commit`; next action `codepatrol-close 2026-07-25-issue-tracker-sync commit|rollback on codepatrol/2026-07-25-issue-tracker-sync`.
