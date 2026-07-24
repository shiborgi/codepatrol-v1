# Verification — Enforce Apply checkpoint verify gate

- Change: `2026-07-24-apply-verify-gate`
- Verified revision: 1
- Verifier: claude-sonnet-5 (Auditor, fresh session, no Apply chat history)
- Base ref: `0737cdcaf988f2d9552c2cb8d43702abef25cf6f`
- Head ref (candidate content commit): `0962660a07c63032c24c1f94c1f5c50e6bbea649` (tree `84bd916a0b6d2a1e05273d051cd8b0665ecdd730`); wrapped by metadata commits `72f053f` (checkpoint apply) and my own `3282e4d` (begin verify) — `git diff 0962660..72f053f -- . ':!.codepatrol/changes'` and `git diff 72f053f..3282e4d -- . ':!.codepatrol/changes'` are both empty, confirming the candidate tree is unchanged.
- Evidence date: 2026-07-24T14:31:35Z – 2026-07-24T14:38:01Z

## Scope and instruments

Read in full: `plan/spec.md`, `plan/plan.md`, `review/report.md`, `apply/journal.md`, `change.yaml`. Read the complete diff `0737cdc..HEAD` for every changed file (13 production/doc/test files + `.codepatrol/config.json`). Ran `codepatrol change inspect`/`doctor` (valid: true), all three cited unit test files individually, the full `npm test` suite, the full `npm run verify` chain, `codepatrol graph impact` (twice — once against the stale graph, once after `codepatrol graph sync`), and manual `git diff`/`git log`/`git status` checks. No instrument was unavailable; no evidence gap in the cited scope.

## Plan conformance

| Task | Files | Verified independently |
|---|---|---|
| T1 loader | `src/shared/config.ts`, `config.test.ts` | Diff matches spec interface exactly (strict unknown-key rejection at both levels, non-empty command array, positive-integer `timeoutMs`, `{}` on `ENOENT`). Re-ran `node --test --import jiti/register src/shared/config.test.ts` — 5/5 pass. |
| T2 runner | `src/change/apply-gate.ts`, `apply-gate.test.ts` | `defaultGateRunner` uses `execFile` (argv, no shell), resolves (never throws) on non-zero exit, `AbortError` → `CANCELLED`. Re-ran `node --test --import jiti/register src/change/apply-gate.test.ts` — 2/2 pass, real child processes exit 3 and 0. |
| T3 types/model | `src/change/types.ts`, `src/shared/errors.ts`, `src/change/model.ts` | `GateResult.exit_code` is typed as the literal `0` (encodes "only successful gates are ever recorded" at the type level). `"gate"` added to `stage-checkpointed`'s allowed-key list. `APPLY_GATE_FAILED` added to `ErrorCode`. Fold regression test in `change.test.ts` ("gate field is allowed on stage-checkpointed") re-run as part of full suite — passes; this test is a legitimate red/green check (it would fail with `contains unknown field gate` before the `model.ts` edit). |
| T4 orchestrator | `src/change/orchestrator.ts` (`orchestrator.ts:253-268`), `apply-gate-enforcement.test.ts` | Read the insertion point directly: it sits inside the `intent.type === "checkpoint"` branch, guarded by `intent.stage === "apply" && intent.result === "implemented" && !personaCheckpoint`, placed after the "Apply changes do not match the complete candidate production delta" assertion (line 251) and before `git.add`/`git.commit` (line 270) — exactly as planned. Re-ran `node --test --import jiti/register src/change/apply-gate-enforcement.test.ts` — 1/1 pass, exercising AC-1/AC-2/AC-3/AC-4(review) against a real temp Git repo via `NodeGitAdapter`. |
| T5 dogfood config | `.codepatrol/config.json` | `git check-ignore .codepatrol/config.json` prints nothing (tracked, exit 1). Content matches spec exactly. Confirmed the globally-installed `codepatrol` binary on PATH resolves (`readlink -f`) to *this* repo's `bin/codepatrol.js` → `dist/src/cli/main.js`, so the CLI used throughout Plan/Review/Apply/Verify runs the dist built from this repo's own HEAD — the "stale dist ⇒ silent no-op" risk (spec R3) does not apply. |
| T6 docs | `AGENTS.md`, `skills/codepatrol-apply/SKILL.md` | Diffs read in full; both accurately describe the machine gate and warn against a type-stripped `npm test` substitute. `npm run lint:skills` re-run — pass. |
| T7 reconciliation | — | `git diff --name-only 0737cdc..HEAD` lists exactly the declared 13 production/doc/test paths plus 5 Change-owned governance artifacts (spec.md, plan.md, review/report.md, journal.md, change.yaml) = 18 total, matching the journal's reconciliation. No stray files found (`test-append.ts` correctly absent; `git ls-files --others --exclude-standard` is empty; `git status --porcelain` clean throughout). |

No deviation from `plan.md` beyond what the journal already declared (removal of one unplanned scratch file before the Apply seal).

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of the journal |
|---|---|---|---|
| AC-1 | `node --test --import jiti/register src/change/apply-gate-enforcement.test.ts` | pass — injected `exitCode:1` runner rejects with `APPLY_GATE_FAILED`; zero `stage-checkpointed`/apply events afterward | yes |
| AC-2 | same file | pass — injected passing runner seals; recorded event `gate.exit_code === 0`, `gate.command === "x"` | yes |
| AC-3 | same file (id2, config removed) | pass — runner never called (`calledApplyNoConfig === 0`), `ev.gate === undefined` | yes |
| AC-4 | same file (review checkpoint case) + structural read of `orchestrator.ts:254` | pass — `calledReview === 0`; guard requires `intent.stage === "apply"`, which structurally excludes plan/review/verify by construction (not merely by test) | yes |
| AC-5 | `node --test --import jiti/register src/shared/config.test.ts` | pass, 5/5 (absent→`{}`, valid parse, empty-array reject, unknown-key reject, non-positive timeout reject) | yes |
| AC-6 | `node --test --import jiti/register src/change/apply-gate.test.ts` | pass, 2/2 — real child exit 3 → `exitCode:3`, output matches `/boom/`; exit 0 → `exitCode:0` | yes |
| AC-7 | `npm run verify` (fresh run, this session) | pass, exit 0, 153/153 tests, clean typecheck/build/smoke/lint | yes |

## Wider suite

`npm test` (fresh run): **153/153 pass** (144 baseline + 9 new — 5 config, 2 apply-gate, 1 enforcement, 1 model-fold regression), matching the journal's count. `npm run verify` (fresh run, full chain `typecheck && test && build && smoke:cli && lint:skills`): **exit 0**, ~16s wall clock. `git status --porcelain` clean after every run (build output goes to gitignored `dist/`).

## Blast radius

`codepatrol graph impact --since-ref 0737cdcaf988f2d9552c2cb8d43702abef25cf6f`, re-run after a fresh `codepatrol graph sync` (73 files scanned, 10 extracted, graph was stale on new files before sync): affected set is entirely within `src/change/`, `src/shared/`, `src/cli/`, `src/graph/`, `src/wiki/` and their existing test suites (24 `affectedTests` after sync) — all of which are members of the `npm test` run already executed and green. No unexpected surface (e.g. no `bin/`, `scripts/install-*`, or package-metadata seam touched). `graph sync` itself only wrote to gitignored `.codepatrol/runtime/graph/`; tree stayed clean.

## Regressions

Full `npm test` (153/153) and `npm run verify` (exit 0) cover the entire affected set with no unplanned red. No behavior drift observed at any surviving interface: `TransitionIntent`/CLI checkpoint shape is unchanged (`assertTransitionIntent`'s checkpoint field list at `orchestrator.ts:49` has no `gate` key — a caller cannot inject one), and `eventMatchesIntent` (`orchestrator.ts:82`) does not compare `gate`, so idempotent-retry semantics are unaffected.

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| (none found) | — | `git diff --name-only` matches the declared 13-path production/doc/test surface plus the 5 Change-owned governance artifacts exactly; no undeclared path. |

## Findings

None blocking. Two residual observations recorded below (neither is a correctness defect introduced by this diff).

## Residual risks and evidence gaps

- **Pre-existing ordering, not introduced here.** `assertTransitionIntent` (CLI-level input validation, `orchestrator.ts:44-61`) does not check that a checkpoint's `result` matches the stage-specific expected value (`ready`/`approve`/`implemented`/`commit`); that check only happens later in `foldChange`, called from `appendChangeEvent`, which runs *after* the git checkpoint commit is already created (`orchestrator.ts:270-274` precede `appendChangeEvent` at line 286). Since the new gate guard is a literal `intent.result === "implemented"` check, a malformed caller that sent `stage:"apply"` with a wrong `result` value would skip the gate and still produce an orphan git commit before failing at fold time. This is pre-existing orchestrator architecture (the same ordering already existed for every other checkpoint field before this Change) and is out of scope of this spec; the only real callers (the `codepatrol-apply` skill and this Change's own tests) always send `result:"implemented"` for Apply. Flagging as residual risk, not a defect of this diff.
- **AC-4 unit coverage is partial by test, complete by construction.** `apply-gate-enforcement.test.ts` explicitly exercises only the `review` checkpoint case for "runner never called on non-Apply stages"; `plan` and `verify` checkpoints and a genuine "Apply persona sub-checkpoint" are not separately exercised. This is not a functional gap: the guard's first conjunct (`intent.stage === "apply"`) structurally excludes plan/review/verify by construction, and `personaCheckpoint` (`persona && (stage==="review"||stage==="verify")`) can never be true when `stage==="apply"`, so Apply has no persona-sub-checkpoint category in this codebase at all. Noted as a minor test-thoroughness gap, not a blocking finding.
- **Dogfood/self-enforcement verified as real, not vacuous.** The Apply attempt's own `stage-checkpointed` event in `change.yaml` carries `gate: {command: "npm run verify", exit_code: 0, elapsed_ms: 15986, at: "2026-07-24T14:28:47.200Z"}`. This is independently corroborated: my own fresh `npm run verify` run in this session took ~16s wall-clock (matching 15986ms), and the gate's `at` timestamp lands 57ms before the enclosing `stage-checkpointed` event's own timestamp (`14:28:47.257Z`) — consistent with the gate having actually executed synchronously just before the event was created, not fabricated after the fact. `npm run verify`'s script definition (`package.json:42`) chains every step with `&&` (fail-fast), so the configured gate is a real, non-vacuous check capable of catching exactly the typecheck/build failures that caused the two prior Verify returns on `2026-07-24-aggregate-and-push`.

## Verdict

`commit`

Every task (T1–T7) and every acceptance criterion (AC-1–AC-7) was independently re-derived from the diff and re-run from fresh commands in this session, not copied from the journal. The orchestrator gate insertion is correctly placed (after production-delta validation, before the git commit) and correctly guarded (apply + implemented + non-persona only); the new `gate` field is properly typed, added to `model.ts`'s allowed-key list, excluded from the caller-facing `TransitionIntent`/`eventMatchesIntent` contract, and does not break existing event folding (verified via a legitimate red/green fold test). `.codepatrol/config.json`'s `applyGate` is a real, fail-fast, non-vacuous command, and the change.yaml event data itself proves the gate executed for real during this very Apply checkpoint's own seal, with timing that independently corroborates against my own fresh measurement. The full project gate passes (153/153 tests, clean typecheck/build/smoke/lint), blast radius is fully covered by the executed test suite, no unplanned changes exist, and Git/ref safety holds (no fetch/push, `main` unchanged, only local branch commits). Advancing to Close with next action `codepatrol-close 2026-07-24-apply-verify-gate commit|rollback on codepatrol/2026-07-24-apply-verify-gate`.
