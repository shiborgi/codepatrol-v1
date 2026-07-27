# Plan — Contain trace paths derived from CLI `--id`

- Work id: `2026-07-27-trace-path-workspace-containment`
- Governing spec: `spec.md`
- Target baseline: `main` at `134f46d94fdeb729092509b8646bb22b2de744c1`

## Goal and approach

Route `trace.ts`'s path construction through the same `resolveInside`
containment seam every other work-id path builder in `state.ts` already
uses, instead of leaving it as the one unguarded `join()`. Add one new
`state.ts` builder (`tracePath`, mirroring `stageSessionPath`), consume it
from `trace.ts`'s `path()`, and adjust only `read()`'s error handling so a
containment violation degrades to its existing "no trace file" contract
rather than throwing into `improvement-report.ts`'s unwrapped call site.
`append`/`appendRaw` need no code change: their existing try/catch already
absorbs the new throw.

## Global constraints

- Preserve `trace.ts`'s full public signature surface (`TraceEntry`, `redact`,
  `path`, `open`, `append`, `appendRaw`, `read`, `close`) — no parameter or
  return-type change.
- `read`'s new catch branch narrows on `error instanceof CodepatrolError`
  only; it must never swallow a non-containment error.
- No change to `args.ts`, `commands.ts`, `main.ts`, `orchestrator.ts`, or
  `session.ts` — every existing call site keeps working unmodified because
  the fix is fully contained inside `state.ts`/`trace.ts`.
- Use tabs and the existing Node test/assert style. Do not add a test
  framework or dependency.
- Each task starts with its declared red test, records valid red/green
  signals in `apply/journal.md`, and stops for re-planning if the interface
  or acceptance contract must change.
- Final verification must run the configured `npm run verify` Apply gate.

## Simplicity proof

- Selected rung: local reuse
- Reused capabilities: `resolveInside` (`src/shared/workspace.ts`), the
  existing `state.ts` relative-path-builder pattern (`stageSessionPath` is
  the direct precedent), `CodepatrolError`, Node test runner, project gate.
- Forbidden speculative surface: no new exported constant, no CLI-level
  `--id` format validation (DC-1, explicitly deferred), no change to
  `open`/`close`'s error contract beyond what containment already implies,
  no change to trace rotation or redaction.
- Expected surface delta: modify three files (`src/shared/state.ts`,
  `src/change/trace.ts`, `src/change/trace.test.ts`); no dependency,
  configuration, durable schema, or new runtime state.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T1, T2 | `node --test --import jiti/register src/change/trace.test.ts` |
| AC-2 | T1, T2 | `node --test --import jiti/register src/change/trace.test.ts` |
| AC-3 | T2 | `node --test --import jiti/register src/change/trace.test.ts` |
| AC-4 | T2 | `node --test --import jiti/register src/change/trace.test.ts` |
| AC-5 | T1, T2 | `node --test --import jiti/register src/change/trace.test.ts` |
| AC-6 | T3 | `npm run verify` and final path/diff inspection |

## Dependency order

`T1` (state.ts builder) has no dependency. `T2` (trace.ts consumption +
read() handling + full characterization suite) depends on `T1` because it
imports `tracePath`. `T3` (final verification) depends on `T1` and `T2`.

### T1 — Add a contained trace path builder to `state.ts`

**Purpose:** Satisfies the shared foundation for AC-1, AC-2, and AC-5 by
giving `trace.ts` a containment-checked path builder identical in shape to
every sibling work-id builder.

**Depends on:** None

**Files:**

- Modify: `src/shared/state.ts` — new `tracePath` export

**Interfaces:**

- Produces: `export function tracePath(workspace: string, workId: string): string`. Two independent gaps rule out both a bare `resolveInside` call and a lexical traces-root comparison on top of it: `resolveInside` alone only proves *workspace* containment (`resolveInside(workspace, ".codepatrol/runtime/traces/../../escape-marker.jsonl")` returns `<workspace>/.codepatrol/escape-marker.jsonl` without throwing), and even a `relative(tracesRoot, candidate)` comparison against two `resolveInside`-resolved paths is insufficient, because `resolveInside` returns the *lexical* candidate string, not a canonical/realpath — a pre-existing symlink inside the traces directory can make a lexically-contained candidate physically resolve outside it (directly confirmed in `plan/evidence/investigation.md`). Every legitimate work id is always a single flat path segment with no `/` or `\`. `tracePath` therefore rejects any `workId` containing `/` or `\` outright, before constructing any path, then calls `resolveInside(workspace, `${RUNTIME_DIR}/traces/${workId}.jsonl`)`. With no separator possible, the result can never contain a meaningful `..` traversal or descend through any intermediate (potentially symlinked) path component.
- Preserves: `RUNTIME_DIR`, every existing export, `resolveInside`'s own contract
- Invariants/errors: throws `CodepatrolError("INVALID_WORKSPACE", ...)` for a `workId` containing `/` or `\` (covering the `..`-segment, full-workspace-escape, and symlink-pivot cases alike) or whose derived path otherwise escapes the workspace; returns the identical string `trace.ts`'s current `join()` expression would return for any work id that escapes neither

**Simplicity proof:** One function in the same file as `stageSessionPath`,
one separator check plus one `resolveInside` call; no new pattern, no new
primitive beyond Node's own `path` module, no `relative()`/canonicalization
dance — the separator check makes that unnecessary.

**Surface delta:** One modified file; one new exported function; no
dependency change.

**Steps:**

1. `tracePath` has no independent test file of its own; its behavior is
   proven end-to-end by T2's `trace.test.ts` suite, which exercises it
   indirectly through `trace.path`. Proceed directly to implementation;
   T2's red tests (step 2 below, in the next task) are the red/green
   signal for this task too — do not add a separate scratch test here.
2. `state.ts` currently imports only `resolveInside` from
   `"./workspace.js"`. Add one import line:
   `import { CodepatrolError } from "./errors.js";`. Then add directly
   below `stageSessionPath` (spaces shown below for markdown rendering
   only; write real tabs in the actual file, matching every other function
   in `state.ts`):
   ```typescript
   export function tracePath(workspace: string, workId: string): string {
     if (workId.includes("/") || workId.includes("\\")) {
       throw new CodepatrolError("INVALID_WORKSPACE", `Work id must not contain a path separator: ${workId}`, 3);
     }
     return resolveInside(workspace, `${RUNTIME_DIR}/traces/${workId}.jsonl`);
   }
   ```
3. Run `npm run typecheck`.
   Expected: passes; no existing caller references the new export yet, so
   this step only confirms `state.ts` itself still compiles.

**Task result:** Record the added export and typecheck output in
`apply/journal.md`. Red/green evidence for its actual behavior is recorded
under T2, which is the first task that exercises it.

### T2 — Route `trace.ts` through the contained builder and characterize containment

**Purpose:** Satisfies AC-1 through AC-5 by making `trace.path` reject a
containment-violating work id, keeping `append`/`appendRaw`'s existing
best-effort contract, giving `read` an equivalent best-effort contract, and
proving every legitimate work id is unaffected.

**Depends on:** T1

**Files:**

- Modify: `src/change/trace.ts` — `path()` and `read()`
- Modify: `src/change/trace.test.ts` — containment characterization

**Interfaces:**

- Consumes: `tracePath` from T1
- Preserves: `TraceEntry`, `redact`, `open`, `append`, `appendRaw`, `close`
  signatures; `path`'s and `read`'s signatures (only their internal
  behavior for a containment-violating input changes)
- Invariants/errors: `path`/`open`/`close` throw `CodepatrolError` for a
  containment violation; `append`/`appendRaw` remain silent (stderr log, no
  throw, no file); `read` returns `[]`

**Simplicity proof:** Two small edits to one existing module — replace one
`join()` call, and wrap one function's body in a narrow catch. No new
abstraction, no new file beyond the existing test file.

**Surface delta:** Two modified files; no public interface change.

**Steps:**

1. `trace.test.ts` currently imports `{ existsSync, mkdtempSync,
   readFileSync, rmSync }` from `"node:fs"`. Add `mkdirSync` and
   `symlinkSync` to that import for the symlink fixture below. Add these
   cases to the existing `describe("trace", ...)` block:
   - `"path rejects a work id that escapes the traces directory but stays inside the workspace"`: call `trace.path(workspace, "../../escape-marker")` inside `assert.throws(...)`; assert the thrown error's `code` (via `CodepatrolError`) is `"INVALID_WORKSPACE"`; assert no file exists anywhere under the sandbox `workspace` root outside the expected `traces/` path afterward.
   - `"path rejects a work id that escapes the workspace entirely"`: same shape with `"../../../../full-escape-marker"`.
   - `"path rejects a work id that pivots through a symlink inside the traces directory"`: `mkdirSync` an `elsewhere` sibling directory inside the sandbox workspace; `mkdirSync(join(workspace, ".codepatrol/runtime/traces"), { recursive: true })`; `symlinkSync(join(workspace, "elsewhere"), join(workspace, ".codepatrol/runtime/traces/link"))`; call `trace.path(workspace, "link/trace")` inside `assert.throws(...)` asserting `code === "INVALID_WORKSPACE"`; assert no file was created under `elsewhere/` afterward. Reproduces the exact scenario in `plan/evidence/investigation.md`.
   - `"append is silent and writes nothing for a containment-violating work id"`: call `trace.append(workspace, "../../escape-marker", { kind: "command", at: "...", command: "x", args: {} })` directly (no `assert.throws` — it must not throw); assert `trace.read(workspace, "../../escape-marker")` (see next case) confirms nothing was recorded, and directly walk the sandbox directory tree to confirm no unexpected file was created anywhere under it.
   - `"read returns an empty array for a containment-violating work id"`: `assert.deepEqual(trace.read(workspace, "../../escape-marker"), [])`.
   - `"legitimate slug-shaped work ids are unaffected"`: run the existing `"w1"`-style append/read/close round trip using a realistic `YYYY-MM-DD-slug` id (e.g. `"2026-07-27-example-change"`) and assert identical behavior to the current `"w1"` cases (same path shape under `.codepatrol/runtime/traces/`, round-trips through append/read/close).
2. Run `node --test --import jiti/register src/change/trace.test.ts`.
   Expected red: the three escape cases (`..`-segment, full-workspace,
   symlink-pivot) fail because `trace.path` currently returns the escaped
   path instead of throwing (the assertion inside `assert.throws` fails,
   the escaped file is found to exist, or — for the symlink case — the
   file is found under `elsewhere/`); the containment-violation
   `append`/`read` cases fail because the file was actually written outside
   the intended location. The legitimate-id case is expected to already
   pass (it is a characterization of current correct behavior, not a red
   signal) — its presence guards against a regression introduced by the
   next step, not a bug being fixed now.
3. In `trace.ts`:
   - Add `import { tracePath } from "../shared/state.js";` and
     `import { CodepatrolError } from "../shared/errors.js";` (the exact
     specifier `orchestrator.ts:4` already uses).
   - Replace `path()`'s body: `return tracePath(workspace, workId);`. Remove
     `join` from the existing `import { dirname, join } from "node:path";`
     line, keeping `dirname` (`join` has exactly one call site in the file
     today — the line being replaced; `dirname` remains used by
     `ensureDir()`, called from `open()`/`append()`/`appendRaw()`, and
     directly inside `close()`).
   - Wrap `read()`'s body in `try { ... } catch (error) { if (error
     instanceof CodepatrolError) return []; throw error; }`, keeping its
     existing malformed-line handling (`process.stderr.write` on a JSON
     parse failure) unchanged inside the try block.
4. Run `node --test --import jiti/register src/change/trace.test.ts`.
   Expected green: all new and pre-existing cases in the file pass,
   including the unmodified `"w1"`/`"w2"`/`"missing"`/`"never-opened"`
   cases from before this task.
5. Run `npm run typecheck`.
   Expected: passes; no signature change is visible to any other module.

**Task result:** Record the red escape/violation assertions, the exact
`CodepatrolError` code observed, the green full-suite output, and the final
changed paths in `apply/journal.md`.

### T3 — Final verification

**Purpose:** Satisfies AC-6 by proving no undeclared surface entered the
candidate and the full gate is green.

**Depends on:** T1, T2

**Files:** None

**Interfaces:**

- Consumes: completed implementation, `git diff`, the configured project
  gate
- Produces: Apply evidence only in `apply/journal.md`

**Simplicity proof:** Uses only existing commands; no verification-only
helper is added.

**Surface delta:** No additional source files.

**Steps:**

1. Run `node --test --import jiti/register src/change/trace.test.ts` once
   more standalone.
   Expected: all cases pass.
2. Run `npm run verify`.
   Expected: typecheck, all Node tests (including the new `trace.test.ts`
   cases), build, compiled CLI smoke, and skill lint pass with 0 failures.
3. Run `git diff --name-status 134f46d94fdeb729092509b8646bb22b2de744c1...HEAD -- . ':!.codepatrol'`.
   Expected: exactly `src/shared/state.ts` and `src/change/trace.ts` and
   `src/change/trace.test.ts` — no other production path differs.
4. Confirm DC-1 did not fire: no requirement emerged during implementation
   to add CLI-level `--id` format validation to satisfy any acceptance
   criterion.
5. Confirm DC-2's accepted ceiling still holds: `tracePath` rejects
   separators and relies on `resolveInside`'s existing ancestor-realpath
   check for the traces directory itself, with no requirement discovered
   during implementation to additionally canonicalize the traces root.
6. Rollback check: confirm reverting the implementation commit restores the
   prior (unguarded) `join()`-based behavior with no durable-data migration;
   `.codepatrol/runtime/traces/` remains disposable runtime state.

**Task result:** Record focused/full command outcomes, the final path list,
AC mapping, DC-1 and DC-2 status, rollback confirmation, and residual risks
in `apply/journal.md`.
