# Specification — Enforce Apply checkpoint verify gate

- Change: `2026-07-24-apply-verify-gate`
- Branch: `codepatrol/2026-07-24-apply-verify-gate`
- Target / base: `main` @ `0737cdcaf988f2d9552c2cb8d43702abef25cf6f`
- Persona: Architect (Plan)

## Intent

Close the single highest-cost integrity gap in the Codepatrol lifecycle: an Apply
stage can seal an `implemented` checkpoint whose journal claims verification
success while the project's own full verification command (`npm run verify`)
actually fails. Nothing between the self-reported Apply journal and the
adversarial Verify stage machine-enforces the gate, so false "all tests passed"
journals pass through and are only caught after a full Verify round-trip.

### Evidence (why this is the principal critical point)

The most recent Change, `2026-07-24-aggregate-and-push`, required **3 Apply
attempts and 3 Verify attempts**. Both Verify returns were caused by exactly this
gap (source: `docs/codepatrol/improvement-reports/2026-07-24-aggregate-and-push.md`
and that Change's `verify/report.md`):

- Verify attempt 1: `apply/journal.md` claimed "all 144 tests passed", but a
  `skills-contract.test.mjs` regression meant `npm run verify` failed.
- Verify attempt 2: the fix passed `npm test` (which runs under `jiti/register`
  and **strips types**, hiding compile errors) while `npm run typecheck` and
  `npm run build` both failed (a missing `ErrorCode` union member and a missing
  import). `npm run verify` still failed.

Root enabler: `npm test` passing is **not** equivalent to `npm run verify`
passing, yet the Apply agent treated it as such — twice. Apply elapsed for that
Change was ~9.95M ms (≈2h46m), the dominant cost of the entire lifecycle, and two
full Verify round-trips were wasted. Relying on the agent to run the full chain
already failed repeatedly; the only durable fix is machine enforcement at the
Apply checkpoint seal.

### Improvement signals

Surfaced from the most recent mirror
`docs/codepatrol/improvement-reports/2026-07-24-aggregate-and-push.md`
(only two Recommendations bullets exist):

- Top error code `CHANGE_CONFLICT` (25 occurrences) — investigate the first
  occurrence's args and stage context. (Out of scope here; chronic session-claim
  friction, lower severity than the Apply/Verify integrity gap.)
- Command `change.session` invoked 109 times — consider caching or batching.
  (Out of scope here.)

This Change deliberately targets the Apply/Verify integrity gap, which is
higher-severity (correctness + largest time cost) than the two chronic-friction
signals above.

## Scope

In scope:

- A machine-enforced verification gate that runs during the Apply `checkpoint`
  seal and refuses to record a `stage-checkpointed` event when the gate command
  exits non-zero.
- The gate is **opt-in per workspace** via a new `.codepatrol/config.json`; when
  absent, behavior is byte-identical to today (preserves language-agnosticism and
  every existing test).
- Enabling the gate for this repository (`npm run verify`).
- The gate is computed and enforced by the orchestrator, not declared by the
  caller — the `TransitionIntent`, CLI surface, and skill call contract are
  unchanged.

Out of scope:

- The chronic `CHANGE_CONFLICT` / session-churn signals.
- Running gates at Plan, Review, or Verify checkpoints, or at persona sub-checkpoints.
- Remote/CI execution, hosted runtimes, or any Rejected Integration Surface.
- Changing `npm test`'s type-stripping behavior.

## Interfaces

### New workspace config `.codepatrol/config.json` (optional, tracked)

```jsonc
{
  "applyGate": {
    "command": ["npm", "run", "verify"],  // non-empty string[]; argv form, no shell
    "timeoutMs": 600000                     // optional positive integer; default 600000
  }
}
```

- Absent file ⇒ `{}` ⇒ gate disabled.
- `applyGate.command` must be a non-empty array of non-empty strings, else
  `CHANGE_INVALID`.
- `applyGate.timeoutMs`, if present, must be a positive safe integer, else
  `CHANGE_INVALID`.
- Unknown top-level or `applyGate` keys ⇒ `CHANGE_INVALID` (strict, matching the
  Change record's `exactKeys` discipline).

### `src/shared/config.ts` (new)

```ts
export interface ApplyGate { command: string[]; timeoutMs?: number }
export interface CodepatrolConfig { applyGate?: ApplyGate }
export function loadConfig(workspace: string): CodepatrolConfig; // {} when file absent
```

### `src/change/apply-gate.ts` (new) — injectable runner seam

```ts
export interface GateRunResult { exitCode: number; output: string; elapsedMs: number }
export type GateRunner = (gate: ApplyGate, workspace: string, signal?: AbortSignal) => Promise<GateRunResult>;
export const defaultGateRunner: GateRunner; // execFile(command[0], command.slice(1), { cwd, timeout, maxBuffer, signal })
```

- Default runner uses `execFile` (no shell), `cwd = workspace`, `timeout =
  gate.timeoutMs ?? 600000`, `maxBuffer = 8 * 1024 * 1024`, honoring `signal`.
- A non-zero child exit resolves with `exitCode !== 0` (never throws for the
  gate's own failure); process spawn errors (ENOENT, timeout) also resolve with a
  non-zero `exitCode` and a descriptive `output`.
- `output` is the combined stdout+stderr; only a bounded tail is surfaced in the
  thrown error message.

### Types (`src/change/types.ts`)

```ts
export interface GateResult { command: string; exit_code: 0; elapsed_ms: number; at: string }
// StageCheckpointedEvent gains: gate?: GateResult
// OperationOptions gains:       gate?: GateRunner   // test seam, mirrors `git`
```

Only successful gates (`exit_code: 0`) are ever recorded, because a failing gate
throws before the event is created.

### New error code

`APPLY_GATE_FAILED` added to `ErrorCode` (`src/shared/errors.ts`), exit code 4.

## Behavior / invariants

1. The gate runs **only** when: `intent.type === "checkpoint"`,
   `intent.stage === "apply"`, `intent.result === "implemented"`, the checkpoint
   is not a persona sub-checkpoint, and `loadConfig(workspace).applyGate` is
   defined.
2. It runs **after** all existing artifact/`changes`/undeclared-path validation
   and **before** `git.add`/`git.commit`, against the live working tree that holds
   the Apply candidate.
3. Non-zero exit ⇒ throw `APPLY_GATE_FAILED` with the command and a bounded output
   tail; **no** commit is created and **no** `stage-checkpointed` event is
   appended (ledger unchanged, attempt stays `active`).
4. Zero exit ⇒ proceed exactly as today, additionally embedding a `gate` summary
   (`command`, `exit_code: 0`, `elapsed_ms`, `at`) into the `stage-checkpointed`
   event.
5. When no config exists, no runner is invoked and no `gate` field is written —
   observably identical to current behavior.
6. The gate never runs for Plan/Review/Verify checkpoints or persona
   sub-checkpoints.
7. The caller's `TransitionIntent` and the CLI/skill contract are unchanged; the
   gate is derived server-side and excluded from `eventMatchesIntent` idempotency
   comparison.

## Failures

| Condition | Result |
|---|---|
| Gate command exits non-zero (tests/typecheck/build/lint fail) | `APPLY_GATE_FAILED`; checkpoint not sealed |
| Gate binary missing / spawn error / timeout | `APPLY_GATE_FAILED` with descriptive tail |
| Malformed `.codepatrol/config.json` | `CHANGE_INVALID` |
| Config absent | Gate disabled; unchanged behavior |

## Rollout

- Land the runner + orchestrator enforcement + the `gate` event field together
  with this repo's `.codepatrol/config.json` enabling `npm run verify`.
- **Dogfood / self-enforcement risk:** once `.codepatrol/config.json` is present,
  this repo's own subsequent Apply `implemented` checkpoints enforce the gate,
  including this Change's Apply. The sealing Apply transition must execute the
  orchestrator build that contains the gate code (run the CLI via `jiti` from
  `src`, or `npm run build` before the sealing transition). If the transition runs
  a stale `dist/` lacking the gate, the config is silently a no-op — mitigated by
  building as part of the ordinary Apply flow (Apply runs `npm run verify`, which
  includes `build`, before sealing).
- Recoverable: deleting `.codepatrol/config.json` disables the gate with zero code
  change.

## Risks

- **R1 — Orchestrator core path.** The insertion is in the sensitive checkpoint
  seal. Mitigation: additive, guarded by stage/result/config predicates;
  injectable runner keeps tests deterministic (no real process spawn); `no-config`
  path proven byte-identical.
- **R2 — Arbitrary local command execution.** The gate runs a workspace-declared
  command. This is the same trust level as the orchestrator already running local
  `git`; execution is `execFile` (no shell), argv-only, timeout-bounded, opt-in.
- **R3 — Self-enforcement bootstrap.** Covered under Rollout (build before seal).
- **R4 — `model.ts` strict key validation.** `stage-checkpointed` uses `exactKeys`;
  the new `gate` key must be added to the allowed list or every record fails to
  fold. Captured as an explicit task.

## Acceptance criteria

- **AC-1** With a config whose gate runner returns a non-zero exit, an Apply
  `implemented` checkpoint transition throws `APPLY_GATE_FAILED` and appends **no**
  `stage-checkpointed` event (ledger byte-unchanged; attempt remains `active`).
- **AC-2** With a passing gate (exit 0), the Apply checkpoint seals and its
  `stage-checkpointed` event carries `gate` with `exit_code: 0`, the joined
  command, and a numeric `elapsed_ms`.
- **AC-3** With no `.codepatrol/config.json`, the Apply checkpoint result is
  observably identical to current behavior: the injected runner is never called
  and no `gate` field is present.
- **AC-4** The runner is never invoked for Plan/Review/Verify checkpoints or for
  Apply persona sub-checkpoints.
- **AC-5** `loadConfig` rejects malformed config (empty/non-array `command`;
  non-positive/ non-integer `timeoutMs`; unknown keys) with `CHANGE_INVALID`, and
  returns `{}` when the file is absent.
- **AC-6** `defaultGateRunner` maps a real non-zero child exit to `exitCode !== 0`
  and captures output, without throwing for the gate's own failure (probe:
  `["node","-e","process.stderr.write('x');process.exit(3)"]`).
- **AC-7** `npm run verify` passes in full (typecheck + test + build + smoke +
  lint:skills), with `.codepatrol/config.json` enabling the gate for this repo.
