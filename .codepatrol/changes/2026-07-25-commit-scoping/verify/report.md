# Verification — Scope every lifecycle bookkeeping commit to its own intended paths

- Change: `2026-07-25-commit-scoping`
- Verified revision: 2 (Apply attempt 1)
- Verifier: claude-sonnet-5 (default persona)
- Base ref: `bcaa3c2bc5055cd5daa70f54210197adcc130f6b` (`main`)
- Head ref: `codepatrol/2026-07-25-commit-scoping` @ `dfa6dec` (HEAD; apply content checkpoint `35292fe`)
- Evidence date: 2026-07-25T16:14:00Z

## Scope and instruments

Read all durable stage artifacts directly: `plan/spec.md`, `plan/plan.md`, `plan/evidence/investigation.md` (attempt 2, hashes re-verified), `review/report.md` (attempt 2 `approve`), `apply/journal.md` (hash `2351cea7…` matches declared). Evaluated the candidate from artifacts only — no access to the Apply stage's chat history (Apply was run by a different session, `minimax/MiniMax-M3` via opencode).

Diff range audited: `bcaa3c2` → apply content checkpoint `35292fe` (the sealed candidate). HEAD `dfa6dec` is a Verify `begin` bookkeeping commit on top of the apply checkpoint; `git diff --stat 35292fe HEAD -- src/ scripts/` is empty, so production code at HEAD is identical to the sealed candidate.

Candidate binding confirmed: `git rev-parse 35292fe^{tree}` = `f649ecba011f5f6698766993b710509562d853f4`, equal to the recorded Apply tree; `35292fe` is an ancestor of HEAD; working tree porcelain empty; branch = `codepatrol/2026-07-25-commit-scoping`; `main` still at `bcaa3c2` (no target advance); no terminal tag exists.

Commands available and run in this session: `git`, `node --test --import jiti/register`, `npm run verify` (= `typecheck && test && build && smoke:cli && lint:skills`), `codepatrol graph {impact,sync}`, an isolated `git worktree` for the red-capability probe. Node v22.23.1, npm 10.9.8.

## Plan conformance

Task-by-task diff audit against `plan.md`. Every production change matches the approved plan; no deviation.

- **T1 (`src/change/git.ts`):** interface `commit` gains optional `paths?: string[]` 4th param; `NodeGitAdapter.commit()` signature gains `paths?: string[]` and appends `...(paths?.length ? ["--", ...paths] : [])` after `-m message`, composing with `--allow-empty`. Exactly as specified (plan T1 steps 1-2). No extra change.
- **T2 (`src/change/orchestrator.ts`, 4 call sites):** `commitMetadata` (`:97`) passes `paths`; checkpoint commit (`:289-290`) captures `const committedPaths = [...new Set([...paths, ...intent.artifacts.map((item) => item.path)])]` once and reuses it for both `git.add()` and `git.commit()` (directly realizes the spec's divergence-mitigation); Close receipt (`:401`) passes `[receiptPath]`; Close terminal (`:419`) passes `pathsToCommit`. Matches plan T2 steps 1-4. The checkpoint pre/post-commit validation (`:264-270`, `:291-292`) and `parseStatusPaths` are present in the diff only as unchanged context — preserved, as required.
- **T3 (`src/change/git.test.ts`, `src/change/close-integration.test.ts`):** new `"an unrelated file staged outside Codepatrol is never swept into a lifecycle bookkeeping commit"` test reproduces the incident class (raw `git add unrelated.txt` → `usage` transition); new `"close integration: commit scoping"` test force-stages `.codepatrol/runtime/unrelated.txt` before Close and asserts exclusion from receipt + terminal commits. Matches plan T3. Minor accompanying refactor: `transitionChange` moved from a dynamic `await import()` to a static top-level import in `close-integration.test.ts` (needed for the new test); behavior-neutral, journaled implicitly by the surface delta.
- **T4:** verification-only; the journal records AC mapping and gate results, which this report re-ran independently (below).

Surface delta = exactly the 4 declared production paths (`git.ts`, `orchestrator.ts`, `git.test.ts`, `close-integration.test.ts`), matching the spec forecast including the forecast companion Close-lifecycle test.

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of the journal |
|---|---|---|---|
| AC-1 (optional pathspec; byte-identical when omitted) | `node --test --import jiti/register src/change/git.test.ts` (14/14 incl. characterization); `npm run typecheck` | pass | yes |
| AC-2 (unrelated staged file excluded from `commitMetadata` commit, remains staged) | `node --test --import jiti/register --test-name-pattern="an unrelated file staged outside Codepatrol" src/change/git.test.ts` (ok); red probe below | pass | yes |
| AC-3 (receipt + terminal commits exclude unrelated staged content) | `node --test --import jiti/register src/change/close-integration.test.ts` → `ok 1 - unrelated staged content is excluded from receipt and terminal commits and remains staged` | pass | yes |
| AC-4 (checkpoint commit passes its own paths; existing validation untouched) | full gate below (checkpoint suite green); diff shows `:264-270`/`:291-292` unchanged | pass | yes |
| AC-5 (`npm run verify` exit 0) | `npm run verify` → `VERIFY_EXIT=0` | pass | yes |

Red-capability independently falsified (not copied from the journal): created an isolated `git worktree` at `35292fe`, reverted only the T2 `commitMetadata` change (`return git.commit(message, false, signal, paths)` → `return git.commit(message, false, signal)`), ran the AC-2 test → `not ok 1 - … AssertionError` (`# fail 1`) because `unrelated.txt` was swept into the bookkeeping commit. Restored by discarding the worktree (`git worktree remove --force` + `prune`); candidate checkout untouched (HEAD `dfa6dec`, porcelain empty). The test is load-bearing, not vacuous.

## Wider suite

- `npm run verify` (the configured `applyGate` and the plan's T4 gate): exit `0`.
  - `typecheck` (`tsc --noEmit`): clean.
  - `test`: `# tests 177 / # pass 177 / # fail 0`.
  - `build` (`clean-dist` + `tsc -p tsconfig.build.json`): clean.
  - `smoke:cli`: `Compiled CLI smoke passed (0.1.0)`.
  - `lint:skills`: `Skill catalog, frontmatter, dependencies, portability, and relative links are valid.`
- No warnings emitted by any gate step.

## Blast radius

`codepatrol graph impact --since-ref bcaa3c2` seeds: `src/change/{git,orchestrator}.ts` (+ the 4 change-owned artifacts and 2 test files). Depth-1 affected set is broad (~29 files) because `orchestrator.ts`/`git.ts` are central modules; `affectedTests` lists 25 test modules (`change.test.ts`, `apply-gate*.test.ts`, `close-integration.test.ts`, `close-push.test.ts`, `orchestrator-parallel.test.ts`, `backlog-close-integration.test.ts`, `start-backlog-link.test.ts`, `git.test.ts`, plus graph/cli/scripts tests). Every `affectedTests` entry was exercised by `npm test` (177/177) — no surviving interface drift. `possiblyAffected`: `scripts/skills-contract.test.mjs`, `src/change/backlog.ts` — both covered by the green suite. No impacted seam unlisted by the plan; the change is an additive optional parameter, so depth-1 dependents compile unchanged.

`codepatrol graph sync`: 70 files, 1826 symbols (baseline 1814 → +12 from the new test symbols), 0 removed, 0 added — consistent with the journal. No graph drift.

## Regressions

The full `npm test` (177/177, including every lifecycle/transition/checkpoint/close test and all `affectedTests`) is green on the candidate. The signature change is backward-compatible (optional 4th param); `FailInitialCommitGit`/`CoordinatedStartGit`/`ForeignWinnerGit` overrides (which declare fewer parameters) remain valid. No behavior drift at surviving interfaces. `git diff --check` clean.

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| `src/change/git.ts` | yes | accepted |
| `src/change/orchestrator.ts` | yes | accepted |
| `src/change/git.test.ts` | yes | accepted |
| `src/change/close-integration.test.ts` | yes (forecast companion Close-lifecycle test) | accepted |

`git diff --name-only bcaa3c2 35292fe -- src/ scripts/ docs/` returns exactly those 4 paths. No unplanned production change. No durable artifact outside `.codepatrol/changes/2026-07-25-commit-scoping/` and no runtime state leakage (durable tree contains only the 6 expected stage artifacts + `change.yaml`).

## Findings

None. The implementation conforms to the approved plan task-for-task, all five acceptance criteria independently pass, the full gate is green, the candidate commit/tree binding is intact, red-capability is falsified directly, and there are no unplanned or regressing changes.

DC-1 did not trigger: the other backlogged items and the transition-count recommendation remain untouched (confirmed: only the 4 declared production paths changed).

## Residual risks and evidence gaps

- **Residual risk (acknowledged in spec, not introduced by implementation):** because `paths` is optional for backward compatibility, a *future* call site added to `orchestrator.ts` that omits it would degrade to the prior unscoped behavior at that new site only — not a regression of this Change. The 4 current call sites are all scoped.
- **Per-event trace of the original incident** remains unrecoverable (deleted at Close by design); root-caused from durable artifacts of `2026-07-25-docs-consolidation`. Does not affect this candidate's verification.
- The Close-scoping test stages an ignored `.codepatrol/runtime/` path (force-added) so Close's clean-worktree guard permits the lifecycle to proceed while still exercising the commit-scoping behavior. This is a sound test design that isolates commit-scoping from the clean-tree guard, not a gap.
- No evidence gap blocks this verdict; every claim above cites a command executed in this session or an exact verified location.

## Verdict

`commit`

The candidate is implementation-complete and acceptance-complete: the diff conforms task-for-task to the approved plan, AC-1…AC-5 independently pass (AC-2 red-capability falsified in an isolated worktree), the full `applyGate`/`npm run verify` exits 0 with 177/177 tests, the blast radius is fully covered by the green suite, no unplanned or regressing change exists, and the Apply candidate commit `35292fe` / tree `f649ecba011f5f6698766993b710509562d853f4` is intact and bound. Next Change transition: checkpoint Verify with result `commit`, advancing to Close. Next action: `codepatrol-close 2026-07-25-commit-scoping commit|rollback on codepatrol/2026-07-25-commit-scoping`.
