# Apply journal — Enforce Apply checkpoint verify gate

- Work id: `2026-07-24-apply-verify-gate`
- Attempt: 1
- Implementer: opencode (T1–T6), resumed and closed by claude-sonnet-5 (T7 + reconciliation)

Task claims T1–T6 were closed by an `opencode` session against the exact plan
scope, with no journal evidence appended at the time. Resuming per the
fresh-eyes rule (upstream claims are hypotheses, not premises): every produced
file and diff was re-read in full and independently re-verified below before
this journal treats any task as complete.

## T1 — Workspace config loader

- Files: `src/shared/config.ts` (create), `src/shared/config.test.ts` (create)
- Re-verified: `loadConfig` matches the spec interface exactly; absent file →
  `{}`; strict unknown-key rejection at both top level and `applyGate`; array/
  non-empty-string/positive-integer checks all present.
- Check run: `node --test --import jiti/register src/shared/config.test.ts` —
  5/5 pass (part of the full `npm test` run below).
- Result: complete, matches AC-5.

## T2 — Default gate runner

- Files: `src/change/apply-gate.ts` (create), `src/change/apply-gate.test.ts` (create)
- Re-verified: `defaultGateRunner` uses `execFile` (argv form, no shell),
  `cwd`/`timeout`/`maxBuffer`/`signal` mirroring `git.ts`'s pattern; a non-zero
  child exit resolves (does not throw) with `exitCode` from `error.code`;
  `AbortError` is the only rejection path (`CANCELLED`), preserving existing
  cancellation semantics.
- Check run: `node --test --import jiti/register src/change/apply-gate.test.ts` —
  2/2 pass.
- Result: complete, matches AC-6.

## T3 — Types, error code, event-key allowance

- Files: `src/change/types.ts`, `src/shared/errors.ts`, `src/change/model.ts` (modify)
- Re-verified diffs directly: `GateResult` added; `StageCheckpointedEvent.gate?`
  and `OperationOptions.gate?: GateRunner` added; `"APPLY_GATE_FAILED"` added to
  `ErrorCode`; `"gate"` added to the `stage-checkpointed` allowed-key list in
  `model.ts`'s `specific` map (line with `exactKeys`).
- Regression test added: `src/change/change.test.ts` — "gate field is allowed on
  stage-checkpointed" (fold does not throw `contains unknown field gate`).
- Check run: full `npm test` includes this file — pass.
- Result: complete.

## T4 — Orchestrator enforcement at the Apply checkpoint seal

- Files: `src/change/orchestrator.ts` (modify), `src/change/apply-gate-enforcement.test.ts` (create)
- Re-verified insertion point: the gate block sits inside
  `transitionChangeLocked`'s `intent.type === "checkpoint"` branch, immediately
  after the "Apply changes do not match the complete candidate production
  delta" assertion and before `git.add`/`git.commit` — matches the plan exactly.
  Guarded by `intent.stage === "apply" && intent.result === "implemented" &&
  !personaCheckpoint`; reads `loadConfig(workspace).applyGate`; uses
  `options.gate ?? defaultGateRunner`; non-zero exit throws
  `APPLY_GATE_FAILED` before any commit/event; zero exit embeds `gate` on the
  `stage-checkpointed` event.
- Enforcement test (`apply-gate-enforcement.test.ts`) drives a full
  Plan→Review→Apply lifecycle against a real temp Git repo with `NodeGitAdapter`
  and an injected `gate` runner, covering:
  - AC-1: injected failing runner (`exitCode: 1`) → `transitionChange` rejects
    with `APPLY_GATE_FAILED`; `change.yaml` has zero `apply` `stage-checkpointed`
    events afterward (ledger unaffected).
  - AC-2: injected passing runner (`exitCode: 0`) → checkpoint seals; the
    recorded event's `gate.exit_code === 0` and `gate.command === "x"`.
  - AC-4 (review checkpoint): injected runner asserted `calledReview === 0` for
    a `review` `approve` checkpoint.
  - AC-3/AC-4 (apply, no config): config removed, injected runner asserted
    `calledApplyNoConfig === 0` and the resulting event has `gate === undefined`.
- Check run:
  `node --test --import jiti/register src/change/apply-gate-enforcement.test.ts` —
  1/1 pass (single `describe` covering all four assertions above).
- Result: complete, matches AC-1–AC-4.

## T5 — Enable the gate for this repository

- Files: `.codepatrol/config.json` (create):
  `{"applyGate":{"command":["npm","run","verify"],"timeoutMs":600000}}`.
- Re-verified: file is not matched by `.gitignore` (only `.codepatrol/runtime|
  workflows|code-graph|locks|eval-runs|wiki` and specific files are ignored);
  confirmed tracked-eligible via `git status --porcelain` (listed as `??`, not
  suppressed).
- Dogfood consequence (spec R3): this file now governs the sealing checkpoint of
  *this very Apply attempt* — `npm run build` was re-run immediately before
  sealing so the CLI's `dist/` reflects the T3/T4 code, avoiding a stale no-op
  gate.
- Result: complete, matches AC-7 precondition.

## T6 — Document the enforced gate

- Files: `AGENTS.md`, `skills/codepatrol-apply/SKILL.md` (modify)
- Re-verified diffs: both now state that an Apply `implemented` checkpoint is
  machine-gated by `.codepatrol/config.json`'s `applyGate` and refused on a
  non-zero exit; the SKILL.md addition explicitly warns against relying on a
  type-stripped `npm test` subset (the exact failure mode this Change fixes).
- Check run: `npm run lint:skills` — pass (catalog, frontmatter, dependencies,
  portability and relative links all valid).
- Result: complete.

## T7 — Final verification and reconciliation

- Removed one unplanned scratch artifact, `test-append.ts` (repo root): an
  earlier draft of the T3 regression test, superseded by the version already
  integrated into `src/change/change.test.ts`. Not part of the declared plan
  surface; deleted before checkpoint so no undeclared worktree path reaches the
  seal.
- Full gate run, this session, from a clean re-check of every command:
  - `npm run typecheck` — pass, 0 errors.
  - `npm test` — pass, **153/153** (144 baseline + 9 new: 5 config + 2
    apply-gate + 1 enforcement + 1 model-fold regression).
  - `npm run build` — pass.
  - `npm run smoke:cli` — pass, `Compiled CLI smoke passed (0.1.0).`
  - `npm run lint:skills` — pass.
  - `npm run verify` (the full chained command, run to completion, not a
    component substitute) — **pass, exit 0**.
- Blast radius: `codepatrol graph impact --since-ref 0737cdcaf988f2d9552c2cb8d43702abef25cf6f`
  confirms all affected files are within `src/change/`, `src/shared/`, and their
  existing test suites — no unexpected surface.
- Production delta reconciliation (`git diff --name-only <review-checkpoint>`
  plus untracked new files) — exactly 13 paths, matching the plan's forecast
  (5 new src files + `.codepatrol/config.json` + 4 core edits + 2 docs + 1 test
  extension):
  `AGENTS.md`, `skills/codepatrol-apply/SKILL.md`, `src/change/change.test.ts`,
  `src/change/model.ts`, `src/change/orchestrator.ts`, `src/change/types.ts`,
  `src/shared/errors.ts`, `.codepatrol/config.json`,
  `src/change/apply-gate-enforcement.test.ts`, `src/change/apply-gate.test.ts`,
  `src/change/apply-gate.ts`, `src/shared/config.test.ts`, `src/shared/config.ts`.
- No `DC-N` decision-complexity trigger was defined or activated.
- `codepatrol graph sync` was already run during Plan reconnaissance; `wiki
  status` is `absent` for this workspace, so no wiki refresh applies.
- Rollback: deleting `.codepatrol/config.json` disables the gate with zero code
  change; all new code paths are inert without it.
- Residual risks carried from spec: R2 (local command execution — same trust
  tier as the orchestrator's existing `git` `execFile` usage, argv-only, no
  shell, timeout-bounded, opt-in) and R3 (self-enforcement bootstrap — mitigated
  by rebuilding before this seal, as above).

## Deviations from plan

None material. One unplanned scratch file was found and removed (see T7); no
production behavior, interface, or task scope differed from `plan.md`.
