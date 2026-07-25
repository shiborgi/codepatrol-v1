# Implementation — codepatrol-git: two-way backlog/GitHub-issue sync

- Package revision: 0.1.0
- Approval: `review/report.md` verdict `approve` (review attempt 2, checkpoint `cfab0e51`)
- Target start ref: `932edcc79127c3fb84510e1a4b621efb9fc63774` (main), branch `codepatrol/2026-07-25-issue-tracker-sync`
- Actor: opencode (codepatrol-apply skill)
- Status: implementing

## Baseline reconciliation

- `change inspect` projection = `apply` attempt 1, state `ready`, next action `codepatrol-apply 2026-07-25-issue-tracker-sync on codepatrol/2026-07-25-issue-tracker-sync`; review attempt 2 result `approve`.
- Artifact hashes re-verified with `shasum -a 256` against the attempt-2 bindings: `spec.md` `3b4a667d…`, `plan.md` `643b490d…`, `investigation.md` `c10bde51…`, `review/report.md` `3bc9ea6f…` — all match.
- Branch: `codepatrol/2026-07-25-issue-tracker-sync` (HEAD `0c72ae9`, review-2 checkpoint `cfab0e5` is an ancestor). Base `932edcc` is an ancestor of HEAD — no target advance.
- `gh --version` → 2.96.0 (unchanged from Plan evidence); `gh auth status` → authenticated as `shiborgi`; `gh issue list --state all --json number,title,state,url --limit 5` → `[]` (zero existing issues, unchanged from baseline). `gh issue create/close`, `gh label create`, `gh issue list` flag surface re-verified against the installed version — matches `investigation.md` exactly.
- Stage Session primed: items T1, T2, T3, T4, T5, T6, T8 surfaced. **T7a did not surface**: `session.ts:126` parses task ids with `/^### (T\d+)\s+[—-]\s+(.+)$/`, which rejects letter-suffixed ids like `T7a`. The plan's intent for T7a is unambiguous (skill + catalog + `scripts/skills-contract.test.mjs`), it is required for AC-9, and the dependency ordering places it before T8. T7a will be executed as the skill/catalog sub-step of T8's verification scope, with evidence recorded under T8 below. This is a parser/plan-task-id mismatch, not a contract or scope deviation; flagged transparently here and in the final report rather than hidden.

## Task journal

### T1 — Widen the backlog schema

- Claim/workflow item: T1 (session claimed at 2026-07-25T23:01:57Z, closed at 2026-07-25T23:04Z)
- Started: 2026-07-25T23:02Z
- Files changed: `src/change/backlog.ts`, `src/change/backlog.test.ts`
- Simplicity check: additive schema change only; existing call sites unchanged.
- Surface delta: `BacklogSourceKind` gains `"github-issue"`; `BacklogSource.workId` becomes optional; new `ExternalRef` interface; `BacklogItem.externalRef?`; `ALLOWED_ITEM_KEYS` gains `"externalRef"`; new `ALLOWED_EXTERNAL_REF_KEYS`; `validateSource` branches on `github-issue` (forbids workId); new `validateExternalRef`; existing `validateSource` messages aligned to `CHANGE_INVALID: ` prefix (consistency with `validate()` at lines 75–79 so the plan's approved red/green regex `/CHANGE_INVALID/` works as written — no existing test pins the unprefixed text).
- Red evidence: `node --test --import jiti/register src/change/backlog.test.ts` → `pass 9, fail 1` (the new test fails on the third assertion because `"github-issue"` is not in `VALID_SOURCE_KINDS` and `"externalRef"` is not in `ALLOWED_ITEM_KEYS`).
- Green evidence: `node --test --import jiti/register src/change/backlog.test.ts` → `pass 10, fail 0`. `npm run typecheck` exits 0.
- Assessment: one typecheck iteration needed (`obj.number` was `unknown`); fixed with `as number` cast after the `Number.isSafeInteger` guard.
- Result: complete

### T2 — GhAdapter and NodeGhAdapter

- Claim/workflow item: T2 (claimed 2026-07-25T23:04:47Z, closed 2026-07-25T23:05Z)
- Started: 2026-07-25T23:04:47Z
- Files changed: `src/change/issue-sync.ts` (new)
- Simplicity check: direct structural mirror of `NodeGitAdapter` (`src/change/git.ts:32–49`); no new subprocess pattern.
- Surface delta: `RemoteIssue`, `GhAdapter` interface, `NodeGhAdapter` class. Constructor takes `workspace`; `run` passes `cwd: this.workspace` (Review Finding 2 closed); CANCELLED on signal.aborted, OPERATION_FAILED otherwise.
- Red evidence: not applicable (no test for this task per plan — behavior is exercised via T3's `FakeGhAdapter`-based unit tests, since asserting against `execFile` would require mocking `node:child_process` which the codebase does not do anywhere for `git.ts` either).
- Green evidence: `npm run typecheck` exits 0. `gh issue create --help`, `gh issue close --help`, `gh label create --help`, `gh issue list --help` re-run against installed `gh` 2.96.0 — flags match `investigation.md` exactly (no drift since Plan).
- Assessment: `assertAvailable` swallows the original `OPERATION_FAILED` and re-throws a specific guidance message (matches spec); `listIssues` lowercases `state` defensively; `createIssue` parses issue number from the URL printed to stdout via `/\/issues\/(\d+)/`.
- Result: complete

### T3 — syncIssues orchestration and unit tests

- Claim/workflow item: T3 (claimed 2026-07-25T23:05:04Z, closed 2026-07-25T23:06Z)
- Started: 2026-07-25T23:05:04Z
- Files changed: `src/change/issue-sync.ts` (modified — added `syncIssues`/types/`formatIssueBody`/`applyPull`/`ghFor`), `src/change/issue-sync.test.ts` (new)
- Simplicity check: single pass over one fetched snapshot; no caching, retry, rate-limit handling.
- Surface delta: `SyncDirection`, `IssueSyncOptions`, `IssueSyncResult` types; `syncIssues`, `formatIssueBody` exported; `applyPull` private; `ghFor` mirrors `orchestrator.gitFor` (the one place `NodeGhAdapter` is constructed with the real workspace — Review Finding 2's test-invisible invariant).
- Red evidence: `node --test --import jiti/register src/change/issue-sync.test.ts` → `pass 1, fail 10` (only the pure yaml round-trip test passes; the rest fail because `syncIssues` is undefined before this task).
- Green evidence: `node --test --import jiti/register src/change/issue-sync.test.ts` → `pass 11, fail 0`. `npm run typecheck` exits 0. `node --test --import jiti/register src/change/backlog.test.ts` still `pass 10, fail 0`.
- Assessment: tests cover AC-1..AC-8 plus the never-re-push regression, the "assertAvailable + listIssues called exactly once regardless of direction" invariant, and a yaml round-trip guard for `externalRef`. One typecheck iteration needed (`after.externalRef?.number` on a `Record<string, unknown>` return type — fixed with an inline cast at point of use).
- Result: complete

### T4 — CLI argument wiring

- Claim/workflow item: T4 (claimed 2026-07-25T23:06:55Z, closed 2026-07-25T23:07Z)
- Started: 2026-07-25T23:06:55Z
- Files changed: `src/cli/args.ts`
- Simplicity check: follows the exact existing pattern for every other command's options (`backlog.list`'s `--status`, etc.).
- Surface delta: `COMMAND_OPTIONS` gains `["issues.sync", new Set(["direction", "dry-run"])]`; `KNOWN` gains `"direction"`, `"dry-run"`; `BOOLEAN_FLAGS` gains `"dry-run"`; `ParsedArgs` gains `direction?: string; dryRun?: boolean`; return object populates both.
- Red evidence: not applicable (no dedicated `args.test.ts` exists; exercised via T6's CLI integration test).
- Green evidence: `npm run typecheck` exits 0.
- Assessment: none.
- Result: complete

### T5 — CLI command dispatch and output rendering

- Claim/workflow item: T5 (claimed 2026-07-25T23:07:30Z, closed 2026-07-25T23:09Z)
- Started: 2026-07-25T23:07:30Z
- Files changed: `src/cli/commands.ts`, `src/cli/output.ts`
- Simplicity check: one new `case` matching the existing switch's shape; one new render function matching `renderBacklogList`'s shape; minimal threading of an optional override parameter scoped to the one command that needs it.
- Surface delta: `executeCommand` gains an optional fourth parameter `overrides?: CommandOverrides` (`{ gh?: GhAdapter }`), consumed only by the `issues.sync` case — `main.ts:60` and every other case are unchanged. `renderIssueSyncResult` added in `output.ts`; `HELP` gains an "Issue sync commands:" section. New import: `syncIssues`, `GhAdapter`, `SyncDirection` from `../change/issue-sync.js`.
- Red evidence: not applicable (T6 supplies the integration test).
- Green evidence: `npm run typecheck` exits 0. (One self-caught iteration: the first edit dropped the indent on the `backlog.list` case by one tab; re-aligned to 2-tab case / 3-tab body to match the surrounding switch.)
- Assessment: invalid `--direction` throws `INVALID_ARGUMENT` before `syncIssues` is called, matching `backlog.list`'s `--status` validation style.
- Result: complete

### T6 — CLI integration test

- Claim/workflow item: T6 (claimed 2026-07-25T23:09:47Z, closed 2026-07-25T23:10Z)
- Started: 2026-07-25T23:09:47Z
- Files changed: `src/cli/issues-sync.test.ts` (new — separate from `cli.test.ts` because `cli.test.ts` uses a subprocess `run()` helper that cannot inject a `FakeGhAdapter` across the binary boundary)
- Simplicity check: minimal direct-import test of `parseArgs` + `executeCommand` via the new `overrides.gh` seam; no DI container.
- Surface delta: +1 test file. No production code changed.
- Red evidence: not applicable (the test file is itself the new evidence; failures would have surfaced before the T8 gate).
- Green evidence: `node --test --import jiti/register src/cli/issues-sync.test.ts` → `pass 3, fail 0`. `npm run typecheck` exits 0.
- Assessment: covers `issues sync --direction push` end-to-end (one `gh.createIssue`, label ensured, `data.pushed.created`, `text` matches `/Push: 1 created/` and `/created: feat-1/`); `--dry-run` with default `both` (zero gh mutations, would-be `pulled.created` + `pushed.created`, `dryRun: true`, `(dry run)` suffix in text); bad `--direction` throws `INVALID_ARGUMENT` before any gh call.
- Result: complete

### T7a — Skill and catalog (executed under T8's verification scope; session invisible — see Baseline reconciliation)

- Claim/workflow item: not a session item — `session.ts:126` parses task ids with `/^### (T\d+)\s+[—-]\s+(.+)$/`, which rejects letter-suffixed ids like `T7a`. Executed as a prerequisite sub-step of T8 (T8 depends on T7a per the plan's dependency order). Flagged here transparently rather than hidden.
- Started: 2026-07-25T23:11Z
- Files changed: `skills/codepatrol-git/SKILL.md` (new), `skills/catalog.yaml` (modified — new `codepatrol-git` entry in alphabetical position after `codebase-design`), `scripts/skills-contract.test.mjs` (modified — `support` array gains `"codepatrol-git"`, now eleven names).
- Simplicity check: thin wrapper matching `codepatrol-status`'s shape exactly; no lifecycle semantics, no Change mutation, no new trigger vocabulary.
- Surface delta: +1 skill directory with `SKILL.md` (frontmatter `name`/`description` only — passes `lint-skills.mjs`'s `keys.join(",") !== "description,name"` rule). Catalog entry: `role: support`, `invokedBy: []` (directly user-invoked, matching `codepatrol-status`'s own shape), `mayInvoke: []`, `consumes: [backlog items, GitHub issues on origin]`, `produces: [reconciled backlog items, reconciled GitHub issues]`, `mutation: artifacts`. Contract test `support` array now alphabetical eleven-name list.
- Red evidence: not applicable (skill/catalog/contract-test work is configuration/manifest, exercised by `npm run lint:skills` + `node --test scripts/skills-contract.test.mjs`).
- Green evidence: `npm run lint:skills` → `Skill catalog, frontmatter, dependencies, portability, and relative links are valid.` `node --test --import jiti/register scripts/skills-contract.test.mjs` → `pass 8, fail 0`.
- Assessment: the new skill is `role: support` (not `primary`) so `lint-skills.mjs`'s closed six-name primary-set assertion is unaffected. Not in `executionProtocolSkills` so `EXECUTION.md` reference is not required and would be unjustified surface; the SKILL.md body references `../_shared/ROLES.md` (exists, satisfies the relative-link check). The Plan note about a separate `T7b` turned out to be narrative-only — the plan body contains only `T7a` and `T8`, no `T7b` section.
- Result: complete

### T8 — Full verification and graph refresh

- Claim/workflow item: T8 (claimed 2026-07-25T23:10:30Z)
- Started: 2026-07-25T23:10:30Z
- Files changed: none (verification only)
- Simplicity check: n/a.
- Surface delta: none directly; T7a's three files were produced as T8's prerequisite (see above).
- Red evidence: n/a.
- Green evidence:
  - `npm run typecheck` → exits 0.
  - `npm test` → `# tests 205, # pass 205, # fail 0` (full suite, including the new backlog/issue-sync/issues-sync tests and the updated skills-contract test).
  - `npm run build` → `node scripts/clean-dist.mjs && tsc -p tsconfig.build.json` exits 0.
  - `npm run smoke:cli` → `Compiled CLI smoke passed (0.1.0).`
  - `npm run lint:skills` → `Skill catalog, frontmatter, dependencies, portability, and relative links are valid.`
  - `codepatrol graph sync` → `files: scanned 73, extracted 9, unchanged 64, removed 0; nodes: 73 files, 2059 symbols` (was 70 files / 1919 symbols at Plan baseline — delta matches the 3 new src files: `issue-sync.ts`, `issue-sync.test.ts`, `issues-sync.test.ts`; no new extraction errors).
  - Zero real `gh` writes confirmed: `gh issue list --state all --json number,title,state,url --limit 5` returns `[]`, byte-identical to the pre-Change baseline captured in `investigation.md`.
- Assessment: see Surface delta and Final verification below.
- Result: complete

## Deviations

1. **T7a session visibility (transparent, not semantic).** `session.ts:126`'s task-id parser regex `/^### (T\d+)\s+[—-]\s+(.+)$/` rejects letter-suffixed ids, so `T7a` did not surface in the primed Apply Stage Session. The plan's intent for T7a is unambiguous, it is required for AC-9, and the dependency order places it before T8. Executed as a prerequisite sub-step of T8 with full evidence recorded above. This is a parser/plan-task-id mismatch, not a contract or scope deviation. Recommended follow-up: either rename `T7a` to `T7` in `plan.md` or relax the parser to accept `T\d+[a-z]*` — out of scope here (would require a Plan correction or a session.ts change in a separate Change).
2. **T1 test regex alignment (transparent, minimal, intent-preserving).** The plan's approved T1 test uses `assert.throws(..., /CHANGE_INVALID/)` as regression guards for `validateSource`. The plan and Review believed these to be "green-before-and-after"; they were red-before because `validateSource`'s messages lacked the `CHANGE_INVALID: ` prefix that the codebase's own `validate()` function (lines 75–79) and `linkBacklogItem` (lines 148–149) already use. Rather than widen the regex (which would weaken the regression guard) or alter the test's semantics, the existing two `validateSource` messages were aligned to the convention already used elsewhere in `backlog.ts`. No existing test pins the unprefixed text (verified by content-search across the repo). The plan's INTENT — regression guards that pass green-before-and-after — is fully preserved.
3. **Pre-checkpoint cleanup of Review-stage stray scratch (transparent).** Removed an untracked 2-line JSONL transcript at `.codepatrol/changes/.codepatrol/runtime/traces/2026-07-25-issue-tracker-sync.jsonl` produced by a Review-stage `change summary` invocation that failed with `INVALID_WORKSPACE` at 2026-07-25T22:32:39Z (immediately after the review-2 checkpoint). The Review's own report flagged this exact path as "no longer present in this attempt's clean checkout; not relevant to this verdict"; it had re-appeared in the working tree by Apply time. It is exactly the "raw log/scratch payload" AGENTS.md says to keep out of Changes, the `.gitignore` already covers `.codepatrol/runtime/`, and the apply checkpoint's `git status --porcelain --untracked-files=all` filter would otherwise reject the path as undeclared. No lifecycle state, user data, or production code was touched.

No semantic deviation. No contract defect. No materially different design. Nothing here warrants a return to Plan.

## Acceptance evidence

| Criterion | Implementation | Verification | Result |
|---|---|---|---|
| AC-1 | `applyPull` candidate→dismissed transition in `src/change/issue-sync.ts` | `node --test src/change/issue-sync.test.ts` "AC-1: pull dismisses a candidate whose linked issue closed" | pass |
| AC-2 | `applyPull` dismissed→candidate transition | `node --test src/change/issue-sync.test.ts` "AC-2: pull reopens a dismissed item whose linked issue is open again" | pass |
| AC-3 | `applyPull` scheduled/done immunity | `node --test src/change/issue-sync.test.ts` "AC-3: pull leaves scheduled and done items untouched regardless of issue state" | pass |
| AC-4 | open unlinked import path; `id: gh-issue-<number>`, no `workId`, `externalRef` set | `node --test src/change/issue-sync.test.ts` "AC-4: pull imports an unlinked open issue as a new github-issue candidate" | pass |
| AC-5 | closed unlinked never imported; `skippedClosed` counter | `node --test src/change/issue-sync.test.ts` "AC-5: pull never imports a closed unlinked issue" | pass |
| AC-6 | push phase `!externalRef` filter; `ensureLabel` once; `createIssue` once; `externalRef` set | `node --test src/change/issue-sync.test.ts` "AC-6: push creates an issue for one unlinked candidate and records externalRef" | pass |
| AC-7 | done→`completed`, dismissed→`not planned` reason mapping | `node --test src/change/issue-sync.test.ts` "AC-7: push closes done and dismissed items whose linked issues are still open" | pass |
| AC-8 | `dryRun` short-circuits every gh mutation and every `writeBacklog`; result still describes would-be state | `node --test src/change/issue-sync.test.ts` "AC-8: dry-run both makes zero gh mutations and zero backlog writes while reporting the would-be result" + `src/cli/issues-sync.test.ts` "issues sync --direction both with --dry-run" | pass |
| AC-9 | all gate parts green; support array updated | `npm run verify` exits 0 (typecheck + 205/205 tests + build + smoke + lint:skills) | pass |

## Surface delta

Forecast (from `spec.md` "Expected surface delta"): 1 new source file, 1 new test file, 1 new skill file, 4 modified source files, `catalog.yaml`, `skills-contract.test.mjs`; no new npm dependency; no new public interface beyond the ones listed.

Actual:

| Path | Kind | Status |
|---|---|---|
| `src/change/issue-sync.ts` | new source | matches forecast |
| `src/change/issue-sync.test.ts` | new test | matches forecast |
| `skills/codepatrol-git/SKILL.md` | new skill | matches forecast |
| `src/change/backlog.ts` | modified source | matches forecast |
| `src/cli/args.ts` | modified source | matches forecast |
| `src/cli/commands.ts` | modified source | matches forecast (gained optional `overrides` parameter — within the "no new public interface beyond the ones listed" envelope, since `executeCommand` was internal-API already and `overrides` is consumed by exactly one case) |
| `src/cli/output.ts` | modified source | matches forecast |
| `skills/catalog.yaml` | modified data | matches forecast |
| `scripts/skills-contract.test.mjs` | modified test | matches forecast |
| `src/change/backlog.test.ts` | modified test | **+1 path vs forecast** — the plan's T1 step 1 directs adding the schema red/green test to this existing file. The spec's "1 new test file" referred to `issue-sync.test.ts`; T1's modification to `backlog.test.ts` is implicit but unambiguous in the plan. Stated, not silent. |
| `src/cli/issues-sync.test.ts` | new test | **+1 path vs forecast** — the plan's T6 explicitly allowed "or a new adjacent file, matching existing convention"; created because `cli.test.ts` uses a subprocess `run()` helper that cannot inject a `FakeGhAdapter` across the binary boundary. Stated, not silent. |

No `DC-N` trigger activated. DC-1 (`--limit 1000` ceiling) and DC-2 (fixed `area: "workflow"` for github-issue-sourced items) remain accepted deferred constraints with their ceilings stated in `spec.md`; neither was silently worked around.

No new npm dependency. No new credential handling in this codebase (auth is entirely `gh`'s own out-of-band session). The new outbound-network surface is exactly one CLI command (`issues sync`); every other command remains fully local.

## Final verification

- `npm run verify` (the configured `applyGate`) — exits 0; full output captured above in T8's Green evidence.
- `codepatrol graph sync` — clean (no new extraction errors; +3 files / +140 symbols vs Plan baseline, matching the 3 new src files).
- Zero real `gh issue create`/`gh issue close`/`gh label create` calls were made against `shiborgi/codepatrol` during Apply. `gh issue list --state all` returns `[]`, byte-identical to the pre-Change baseline.
- Rollback check: the schema widening is additive (`BacklogItem.externalRef` optional, `BacklogSource.workId` optional only for the new `github-issue` kind); every existing `items.yaml` record continues to validate unchanged. Reverting this single Apply commit restores the prior (no-`issues sync`) behavior with no data migration to undo.
- Residual risks (unchanged from `spec.md`, none newly introduced):
  - `FakeGhAdapter`-only coverage is structurally blind to `NodeGhAdapter`'s real-subprocess behavior (cwd, flag drift). Mitigated by direct comparison against `git.ts` for cwd (T2 step 2) and the Apply-time re-check of `gh` flags against `investigation.md` (done — no drift on `gh` 2.96.0). Verify should confirm the diff's flags still match the captured evidence.
  - DC-1: repos with >1000 total issues silently miss the overflow. Trigger and upgrade path stated in `spec.md`; not exercised here.
  - DC-2: github-issue-sourced items get a fixed `area: "workflow"`. Trigger and upgrade path stated in `spec.md`; not exercised here.
  - Concurrent sync races on `items.yaml` writes are a pre-existing property of every current `backlog.ts` writer (`upsertBacklogItem`, `linkBacklogItem`); not introduced or worsened here.
- Pre-checkpoint tree reconciliation: `git status --short` shows exactly the 7 modified + 4 untracked paths enumerated in the Surface delta table (after the stray-scratch cleanup noted in Deviations #3); no undeclared surface survives.
