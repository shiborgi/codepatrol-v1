# Plan — Enforce Apply checkpoint verify gate

- Work id: `2026-07-24-apply-verify-gate`
- Governing spec: `spec.md`
- Target baseline: `main` @ `0737cdcaf988f2d9552c2cb8d43702abef25cf6f`

## Goal and approach

Add an orchestrator-enforced verification gate to the Apply `checkpoint` seal.
When a workspace declares `applyGate` in `.codepatrol/config.json`, the
orchestrator runs that command against the live Apply candidate working tree
immediately before committing the checkpoint. A non-zero exit throws
`APPLY_GATE_FAILED` and no `stage-checkpointed` event is appended, so an Apply
attempt can no longer seal an `implemented` checkpoint while the project's own
`npm run verify` fails. The gate is opt-in, computed server-side by the
orchestrator (not part of `TransitionIntent`), and injected through a
`GateRunner` seam so tests never spawn a real process. When no config exists,
behavior is byte-identical to today.

## Global constraints

- TypeScript, ESM, Node built-ins only; no new runtime dependencies.
- Child process execution uses `execFile` (argv form, **no shell**), mirroring
  the existing `src/change/git.ts` pattern (`execFile`, `timeout`, `maxBuffer`,
  `signal`).
- No behavior change for any workspace without `.codepatrol/config.json`; every
  existing test must stay green unchanged.
- Strict validation parity: reject unknown config keys, matching the Change
  record's `exactKeys` discipline in `src/change/model.ts`.
- The caller-facing contract (`TransitionIntent`, CLI args, skill call shape) is
  unchanged. The gate is derived server-side and excluded from
  `eventMatchesIntent`.
- `npm run verify` must pass in full at the end.

## Simplicity proof

- Selected rung: opt-in, config-gated enforcement at the single existing Apply
  checkpoint seal — the minimum that machine-enforces the invariant the two
  documented Verify returns needed.
- Reused capabilities: the `execFile` pattern from `src/change/git.ts`; the
  injectable-adapter seam pattern already used for `OperationOptions.git` and
  `LockIo`; the existing `exactKeys`/event-fold machinery in `model.ts`; the
  existing full-lifecycle test harness in `src/change/`.
- Forbidden speculative surface: no gate at other stages, no CI/remote hooks, no
  per-stage config matrix, no shell interpolation, no new dependency, no
  pluggable gate registry.
- Expected surface delta: +4 files (`src/shared/config.ts`,
  `src/shared/config.test.ts`, `src/change/apply-gate.ts`,
  `src/change/apply-gate.test.ts`, `src/change/apply-gate-enforcement.test.ts`
  — 5 new), edits to `src/change/types.ts`, `src/change/orchestrator.ts`,
  `src/change/model.ts`, `src/shared/errors.ts`; new tracked
  `.codepatrol/config.json`; doc edits to `skills/codepatrol-apply/SKILL.md` and
  `AGENTS.md`. No new dependency or external runtime state.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T4 | `node --test --import jiti/register src/change/apply-gate-enforcement.test.ts` (failing-gate case) |
| AC-2 | T4 | same file, passing-gate case asserts `gate.exit_code === 0` on the event |
| AC-3 | T4 | same file, no-config case asserts runner never called and no `gate` field |
| AC-4 | T4 | same file, plan/review/verify + persona cases assert runner never called |
| AC-5 | T1 | `node --test --import jiti/register src/shared/config.test.ts` |
| AC-6 | T2 | `node --test --import jiti/register src/change/apply-gate.test.ts` |
| AC-7 | T5, T7 | `npm run verify` |

## Dependency order

`T1 → T2 → T3 → T4 → {T5, T6} → T7`. T5 and T6 are independent of each other and
own disjoint files.

---

### T1 — Workspace config loader

**Purpose:** Satisfies AC-5 by loading and strictly validating optional
`.codepatrol/config.json`.

**Depends on:** none

**Files:**

- Create: `src/shared/config.ts`
- Create: `src/shared/config.test.ts`

**Interfaces:**

- Produces:
  ```ts
  export interface ApplyGate { command: string[]; timeoutMs?: number }
  export interface CodepatrolConfig { applyGate?: ApplyGate }
  export function loadConfig(workspace: string): CodepatrolConfig;
  ```
- Invariants/errors: absent file ⇒ `{}`. `applyGate.command` must be a non-empty
  array of non-empty strings; `applyGate.timeoutMs`, if present, a positive safe
  integer; unknown top-level or `applyGate` keys rejected. All violations throw
  `CodepatrolError("CHANGE_INVALID", …, 4)`. Read via
  `resolveInside(workspace, ".codepatrol/config.json")` and `readFileSync`;
  `ENOENT` ⇒ `{}`; malformed JSON ⇒ `CHANGE_INVALID`.

**Simplicity proof:** Reuse `resolveInside` (`src/shared/workspace.ts`) and
`CodepatrolError`; no schema library — a handful of explicit checks mirroring
`exactKeys` in `model.ts`.

**Surface delta:** +2 files; no dependency or runtime state added.

**Steps:**

1. Add the tests below at the public seam.

   ```ts
   test("absent config returns empty object", () => {
     assert.deepEqual(loadConfig(tmpWorkspaceWithout()), {});
   });
   test("valid applyGate is parsed", () => {
     // write .codepatrol/config.json {"applyGate":{"command":["npm","run","verify"],"timeoutMs":1000}}
     assert.deepEqual(loadConfig(ws).applyGate, { command: ["npm", "run", "verify"], timeoutMs: 1000 });
   });
   test("empty command array is rejected", () => {
     assert.throws(() => loadConfig(wsWith({ applyGate: { command: [] } })), /CHANGE_INVALID/);
   });
   test("unknown key is rejected", () => {
     assert.throws(() => loadConfig(wsWith({ applyGate: { command: ["x"] }, bogus: 1 })), /CHANGE_INVALID/);
   });
   test("non-positive timeoutMs is rejected", () => {
     assert.throws(() => loadConfig(wsWith({ applyGate: { command: ["x"], timeoutMs: 0 } })), /CHANGE_INVALID/);
   });
   ```

2. Run `node --test --import jiti/register src/shared/config.test.ts`.
   Expected red: `loadConfig` is missing (module not found / undefined export).
   A syntax or harness failure is not accepted.
3. Implement the smallest `loadConfig` satisfying the interface and invariants.
4. Run the same command. Expected green: all cases pass.

**Task result:** changed paths, red/green evidence, deviations, and assessment
are appended to `apply/journal.md`.

---

### T2 — Default gate runner

**Purpose:** Satisfies AC-6 by executing the declared command and mapping a
non-zero child exit to a non-throwing `GateRunResult`.

**Depends on:** T1 (imports `ApplyGate`)

**Files:**

- Create: `src/change/apply-gate.ts`
- Create: `src/change/apply-gate.test.ts`

**Interfaces:**

- Produces:
  ```ts
  export interface GateRunResult { exitCode: number; output: string; elapsedMs: number }
  export type GateRunner = (gate: ApplyGate, workspace: string, signal?: AbortSignal) => Promise<GateRunResult>;
  export const defaultGateRunner: GateRunner;
  export function gateOutputTail(output: string, limit?: number): string; // bounded tail for error messages
  ```
- Invariants/errors: `defaultGateRunner` uses `execFile(gate.command[0],
  gate.command.slice(1), { cwd: workspace, timeout: gate.timeoutMs ?? 600000,
  maxBuffer: 8 * 1024 * 1024, signal, encoding: "utf8" })`. It resolves (never
  rejects) for the gate's own failure: on the callback `error`, resolve with
  `exitCode = error.code ?? 1` (numeric child exit) or `1` for spawn/timeout
  errors, combining stdout+stderr into `output`. `elapsedMs` measured with
  `Date.now()`. An aborted `signal` is the only case that may reject
  (`CANCELLED`), matching existing cancellation semantics.

**Simplicity proof:** Reuse the exact `execFile` invocation shape from
`src/change/git.ts`; no new dependency.

**Surface delta:** +2 files.

**Steps:**

1. Add the test below.

   ```ts
   test("non-zero child exit resolves with exitCode !== 0 and captured output", async () => {
     const r = await defaultGateRunner({ command: ["node", "-e", "process.stderr.write('boom');process.exit(3)"] }, process.cwd());
     assert.equal(r.exitCode, 3);
     assert.match(r.output, /boom/);
     assert.equal(typeof r.elapsedMs, "number");
   });
   test("zero exit resolves exitCode 0", async () => {
     const r = await defaultGateRunner({ command: ["node", "-e", "process.exit(0)"] }, process.cwd());
     assert.equal(r.exitCode, 0);
   });
   ```

2. Run `node --test --import jiti/register src/change/apply-gate.test.ts`.
   Expected red: `defaultGateRunner` missing.
3. Implement `defaultGateRunner` and `gateOutputTail`.
4. Run the same command. Expected green.

**Task result:** appended to `apply/journal.md`.

---

### T3 — Types, error code, and event-key allowance

**Purpose:** Supporting surface for AC-1/AC-2/AC-4 — declares the recorded gate
summary, the test seam, the new error code, and the event-fold key allowance.

**Depends on:** T2 (references `GateRunner`)

**Files:**

- Modify: `src/change/types.ts` — add `GateResult`; add `gate?: GateResult` to
  `StageCheckpointedEvent`; add `gate?: GateRunner` to `OperationOptions`
  (import type from `./apply-gate.js`).
- Modify: `src/shared/errors.ts` — add `"APPLY_GATE_FAILED"` to the `ErrorCode`
  union.
- Modify: `src/change/model.ts` — add `"gate"` to the `stage-checkpointed`
  allowed-keys array in the per-event `specific` map (currently
  `["result","checkpoint","tree","artifacts","changes","next_action","persona"]`).

**Interfaces:**

- Produces:
  ```ts
  export interface GateResult { command: string; exit_code: 0; elapsed_ms: number; at: string }
  // StageCheckpointedEvent.gate?: GateResult
  // OperationOptions.gate?: GateRunner
  ```
- Invariants/errors: `exact_keys` fold must accept a `stage-checkpointed` event
  carrying `gate`; `StageAttempt` need not surface `gate` (informational on the
  event only).

**Simplicity proof:** Reuse existing union/interface/`exactKeys` structures; no
new machinery.

**Surface delta:** three edited files; no new file, dependency, or runtime state.

**Steps:**

1. Add a fold test asserting a `stage-checkpointed` event with a `gate` field
   folds without `contains unknown field` (extend `src/change/change.test.ts` or
   the nearest model fold test). Expected red before the `model.ts` key is added:
   `Change event contains unknown field gate`.
2. Apply the three edits.
3. Re-run the fold test. Expected green. Run
   `node --test --import jiti/register src/change/change.test.ts`. Expected: all
   pass.

**Task result:** appended to `apply/journal.md`.

---

### T4 — Orchestrator enforcement at the Apply checkpoint seal

**Purpose:** Satisfies AC-1, AC-2, AC-3, AC-4 — runs the gate and blocks the seal
on failure, embedding the summary on success.

**Depends on:** T1, T2, T3

**Files:**

- Modify: `src/change/orchestrator.ts` — import `loadConfig` from
  `../shared/config.js` and `defaultGateRunner` from `./apply-gate.js`; insert
  the gate block inside the `if (intent.type === "checkpoint")` branch of
  `transitionChangeLocked`, **after** the production-delta assertion
  (`"Apply changes do not match the complete candidate production delta."`) and
  **before** `await git.add(...)`.
- Create: `src/change/apply-gate-enforcement.test.ts`

**Interfaces:**

- Consumes: `loadConfig` (T1), `defaultGateRunner`/`GateRunner` (T2),
  `GateResult`/`OperationOptions.gate` (T3).
- Produces (pseudocode at the insertion point):
  ```ts
  let gateSummary: GateResult | undefined;
  if (intent.stage === "apply" && intent.result === "implemented" && !personaCheckpoint) {
    const applyGate = loadConfig(workspace).applyGate;
    if (applyGate) {
      const runner = options.gate ?? defaultGateRunner;
      const result = await runner(applyGate, workspace, options.signal);
      if (result.exitCode !== 0) {
        throw new CodepatrolError(
          "APPLY_GATE_FAILED",
          `Apply gate \`${applyGate.command.join(" ")}\` failed (exit ${result.exitCode}); checkpoint not sealed.\n${gateOutputTail(result.output)}`,
          4,
        );
      }
      gateSummary = { command: applyGate.command.join(" "), exit_code: 0, elapsed_ms: result.elapsedMs, at: now(options).toISOString() };
    }
  }
  ```
  Then extend the event literal at the `stage-checkpointed` assignment with
  `...(gateSummary ? { gate: gateSummary } : {})`.
- Invariants/errors: throw occurs before `git.add`/`git.commit`, so no checkpoint
  commit and no appended event on failure; `eventMatchesIntent` is untouched
  (gate excluded from idempotency).

**Simplicity proof:** Single guarded block at the existing seal; reuses the
injected-runner and config seams from T1–T3.

**Surface delta:** one edited core file, +1 test file.

**Steps:**

1. In `src/change/apply-gate-enforcement.test.ts`, reuse the existing
   full-lifecycle harness (see the temp-workspace setup in
   `src/change/orchestrator-parallel.test.ts` and `src/change/change.test.ts`) to
   drive a Change to an Apply-active state, then exercise:

   ```ts
   // AC-1: failing gate blocks the seal
   writeConfig(ws, { applyGate: { command: ["x"] } });
   await assert.rejects(
     () => transitionChange(ws, id, applyCheckpointIntent, { git, gate: async () => ({ exitCode: 1, output: "fail", elapsedMs: 5 }) }),
     /APPLY_GATE_FAILED/,
   );
   assert.equal(readRecord(ws, id).events.filter(e => e.type === "stage-checkpointed" && e.stage === "apply").length, 0);

   // AC-2: passing gate seals with summary
   let called = 0;
   const view = await transitionChange(ws, id, applyCheckpointIntent, { git, gate: async () => (called++, { exitCode: 0, output: "", elapsedMs: 7 }) });
   const ev = lastApplyCheckpoint(ws, id);
   assert.equal(ev.gate.exit_code, 0);
   assert.equal(ev.gate.command, "x");

   // AC-3: no config ⇒ runner never called, no gate field
   // (fresh ws without config) called stays 0; ev.gate is undefined

   // AC-4: plan/review/verify + persona checkpoints never call the runner
   ```

2. Run `node --test --import jiti/register src/change/apply-gate-enforcement.test.ts`.
   Expected red: AC-1 does not reject (seal succeeds) and/or `ev.gate` is
   undefined in AC-2 — the enforcement block does not exist yet.
3. Implement the orchestrator block and event-field extension.
4. Re-run the same command. Expected green: all AC-1..AC-4 cases pass.
5. Run `codepatrol graph impact --since-ref 0737cdcaf988f2d9552c2cb8d43702abef25cf6f`
   to confirm blast radius is the `change`/`shared` modules only, then
   `node --test --import jiti/register $(find src -name '*.test.ts')`.
   Expected: all pass, no new warnings.

**Task result:** appended to `apply/journal.md`.

---

### T5 — Enable the gate for this repository

**Purpose:** Satisfies AC-7 (dogfood) by declaring this repo's own Apply gate.

**Depends on:** T4 (gate code must exist before the config self-enforces)

**Files:**

- Create: `.codepatrol/config.json`

**Interfaces:**

- Produces:
  ```json
  { "applyGate": { "command": ["npm", "run", "verify"], "timeoutMs": 600000 } }
  ```
- Invariants/errors: file is tracked (not matched by `.gitignore`, which only
  ignores `.codepatrol/runtime|workflows|code-graph|locks|eval-runs|wiki` and
  specific files). It must be declared as a production `changes` path in the Apply
  checkpoint.

**Simplicity proof:** Data-only enablement; no code.

**Surface delta:** +1 tracked config file.

**Rollout note (from spec R3):** The sealing Apply transition of *this* Change
must run an orchestrator build that contains the T4 code — run the CLI via `jiti`
from `src`, or `npm run build` before sealing (the gate's own `npm run verify`
includes `build`). A stale `dist/` would make the config a silent no-op.

**Steps:**

1. Write the config file exactly as above.
2. Verify `git check-ignore .codepatrol/config.json` prints nothing (tracked).
3. Confirm `loadConfig(process.cwd()).applyGate` returns the parsed gate
   (`node --import jiti/register -e "import('./src/shared/config.ts').then(m => console.log(m.loadConfig(process.cwd())))"`).

**Task result:** appended to `apply/journal.md`.

---

### T6 — Document the enforced gate

**Purpose:** Keep the Apply contract and top-level agent guide truthful about the
new machine gate.

**Depends on:** T4

**Files:**

- Modify: `skills/codepatrol-apply/SKILL.md` — state that an Apply `implemented`
  checkpoint is machine-gated by `.codepatrol/config.json`'s `applyGate` and
  cannot seal on a non-zero exit; the agent must run the full gate itself, not a
  type-stripped `npm test` subset.
- Modify: `AGENTS.md` — add a short note on the Apply verify gate and
  `.codepatrol/config.json`.

**Interfaces:** documentation only; no code contract change.

**Simplicity proof:** Text only; owns doc files disjoint from all other tasks.

**Surface delta:** two edited docs.

**Steps:**

1. Edit both files with the minimal accurate note.
2. Run `npm run lint:skills`. Expected: pass (no broken references).

**Task result:** appended to `apply/journal.md`.

---

### T7 — Final verification and reconciliation

**Purpose:** Prove every AC, confirm no undeclared work, and record rollback.

**Depends on:** T5, T6

**Files:** none created; inspection and gate execution only.

**Steps:**

1. Map each `AC-N` to delivered paths and the commands in the Acceptance mapping
   table; re-run each named test file to green.
2. Run the complete gate: `npm run verify`
   (`typecheck && test && build && smoke:cli && lint:skills`). Expected: exit 0,
   `144/144`+ tests (new tests added), clean typecheck and build.
3. Inspect the final diff (`git diff --stat main...HEAD`) and confirm it matches
   the declared surface delta: 5 new files, 4 edited source files,
   `.codepatrol/config.json`, and 2 edited docs — no undeclared paths.
4. Reconcile actual surface delta with the spec forecast; explain any difference.
5. Confirm no `DC-N` upgrade trigger was activated (none defined).
6. Run `codepatrol graph sync`; note that no wiki exists (`wiki status` = absent),
   so no wiki refresh is required; update `CONTEXT.md` only if a new public term
   was introduced (none — `applyGate` is config, not a glossary persona term).
7. Rollback and residual risk: deleting `.codepatrol/config.json` disables the
   gate with zero code change; the code paths remain inert without config.
   Residual risk R2 (local command execution) accepted per spec; R3 bootstrap
   handled by building before the sealing transition.

**Task result:** appended to `apply/journal.md`.
