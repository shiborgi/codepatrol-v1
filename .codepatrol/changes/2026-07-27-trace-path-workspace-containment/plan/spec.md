# Specification — Contain trace paths derived from CLI `--id`

## Intent

- Origin: improve-codebase
- Mode: bug
- Target baseline: `main` at `134f46d94fdeb729092509b8646bb22b2de744c1`; Change branch `codepatrol/2026-07-27-trace-path-workspace-containment`; clean tree at start; `npm run verify` green with 241 tests.
- Governing constraints: `CONTEXT.md`'s Change/state model; `src/shared/workspace.ts`'s `resolveInside` containment contract, which every other work-id path builder in `src/shared/state.ts` already uses. No ADR exists for this subsystem.
- Substrate state: graph synchronized at the target revision; no change.
- Problem: `src/change/trace.ts`'s `path()` builds the per-Change trace file location by concatenating an unvalidated `workId` into `node:path` `join()`, instead of going through the `resolveInside` containment check every sibling path builder (`stageSessionPath`, `changeRecordRelativePath`, ...) already uses. `src/cli/main.ts` derives that `workId` directly from the raw `--id` CLI argument, before any command dispatch validates it against a real Change record. A crafted `--id` containing `..` segments can therefore make the CLI write a trace JSONL entry outside `.codepatrol/runtime/traces/`, or entirely outside the workspace, on any command that accepts `--id`.
- Outcome: every code path that derives a trace file location for a `workId` is contained to `.codepatrol/runtime/traces/<workId>.jsonl` inside the workspace, exactly like every other work-id path in the project; a containment violation is refused rather than silently honored, and every existing best-effort/no-trace contract (`append`, `appendRaw`, `read`) is preserved for legitimate ids.

## Scope

### In scope

- Add a workspace-contained trace path builder to `src/shared/state.ts`, mirroring the existing `stageSessionPath` pattern.
- Route `src/change/trace.ts`'s `path()` through that builder instead of raw `join()`.
- Preserve `append`/`appendRaw`'s existing best-effort (swallow-and-log) contract for a containment violation.
- Change `read()` to return `[]` for a containment violation, matching its existing "no trace file" contract for a missing file.
- Add direct characterization tests proving both the escape-from-`traces/`-directory case and the full-workspace-escape case are refused, and that every legitimate `YYYY-MM-DD-slug` work id is unaffected.

### Out of scope

- The other seven `2026-07-27-src-architecture-audit` follow-up findings (persona checkpoint artifact validation, backlog/session concurrency races, checkpoint/Close partial-failure recovery, the Close contract/README disagreement, orchestrator concentration, test-infrastructure leaks, core-module test-coverage gaps) — each is an independent concern with no shared file or seam with this fix.
- Changing `--id`'s CLI-level format validation in `args.ts`. The fix is containment at the path-construction boundary, matching how every other work-id consumer in the project is protected (`resolveInside`), not input-format rejection at the argument parser.
- Changing `trace.open`'s or `trace.close`'s error-propagation contract beyond what containment requires; both already throw for other filesystem failures today and have no established best-effort contract to preserve.
- Any change to `TraceEntry`'s shape, `redact`, trace rotation (`MAX_TRACE_BYTES`), or the CLI's JSON/text output envelopes.

## Current evidence

- `src/change/trace.ts:13-15`: `path()` does `join(workspace, ".codepatrol", "runtime", "traces", `${workId}.jsonl`)` with no containment check.
- `src/shared/state.ts:21-23`: `stageSessionPath` is the existing sibling pattern — `resolveInside(workspace, `${RUNTIME_DIR}/sessions/${workId}/${stage}/${attempt}.json`)`. `trace.ts` is the one work-id path builder that bypasses this.
- `src/shared/workspace.ts:26-57`: `resolveInside` rejects a candidate whose relative path from the workspace starts with `..` or is absolute, and rejects a symlink ancestor resolving outside the workspace, throwing `CodepatrolError("INVALID_WORKSPACE", ...)`.
- `src/cli/main.ts:19-31,57-58,72-76`: `traceableWorkId` returns raw `args.id` unchanged; both call sites invoke `trace.append` with it before `executeCommand` validates the id against any real Change record. Reachable by any `--id`-accepting command (`change inspect`, `change transition`, `change session`, `change doctor`, `change close`, `change summary`).
- Reproduced in an isolated sandbox (never against this repository's own workspace), full transcript in `plan/evidence/investigation.md`:
  - `workId = "../../escape-marker"` → file written at `<workspace>/.codepatrol/escape-marker.jsonl`, outside the intended `runtime/traces/` subtree but still inside the workspace.
  - `workId = "../../../../full-escape-marker"` → file written at `<parent-of-workspace>/full-escape-marker.jsonl`, entirely outside the sandboxed workspace directory.
- `src/change/trace.test.ts` (82 lines, read in full) covers only literal safe work ids (`"w1"`, `"w2"`, `"missing"`, `"never-opened"`); no case constructs a `..`-bearing id.
- `append`/`appendRaw` (`trace.ts:54-80`) already wrap their full body, including the `path()` call, in `try { ... } catch (error) { process.stderr.write(...) }` — a `path()` throw is already absorbed by their existing best-effort contract with no caller change required. `read` (`trace.ts:82-95`) does not wrap `path()`, and its one production caller, `src/change/improvement-report.ts:63`, has no surrounding `try/catch`.

## Proposed design

1. `src/shared/state.ts`: add `tracePath(workspace: string, workId: string): string`, returning `resolveInside(workspace, `${RUNTIME_DIR}/traces/${workId}.jsonl`)`. Same private `RUNTIME_DIR` constant already used by `graphStatePath`, `lockPath`, and `stageSessionPath`; no new exported constant.
2. `src/change/trace.ts`: `path()` calls `tracePath(workspace, workId)` instead of its own `join()` expression. Its signature and return type (`string`) are unchanged; it now can throw `CodepatrolError("INVALID_WORKSPACE", ...)` for a containment-violating `workId`, exactly as every `resolveInside`-backed path builder already does elsewhere in the project.
3. `src/change/trace.ts`: `read()` wraps its `path()` call (and the subsequent `existsSync`/`readFileSync`) in a `try { ... } catch (error) { if (error instanceof CodepatrolError) return []; throw error; }`, so a containment violation is treated identically to "no trace file for this work id" — its existing documented behavior for a missing file. Any other unexpected error (not a containment `CodepatrolError`) continues to propagate unchanged; this is not a blanket catch-all.
4. `append`/`appendRaw`: no code change. Their existing `try/catch` already wraps the `path()`/`ensureDir()` calls and already logs `[trace] append failed: ...` / `[trace] appendRaw failed: ...` to stderr for any thrown error, so a containment violation is silently refused with no file written, and no exception reaches `main.ts`'s call sites — matching current behavior for any other I/O failure.
5. `open()`/`close()`: no code change. Both continue to throw directly for a containment violation, matching their current behavior for other filesystem failures (they have no established best-effort contract). `close()`'s two production callers (`orchestrator.ts:202,454`) already wrap it in `try/catch`.

### Invariants and failures

- Every trace file a running command can produce resolves to a path inside `<workspace>/.codepatrol/runtime/traces/`, verified through the same `resolveInside` containment logic used by every other work-id-derived path in the project. No trace-related code path can create or open a file outside the workspace.
- A containment violation never crashes command dispatch: `append`/`appendRaw` remain fire-and-forget (log to stderr, no file written, caller unaffected); `read` returns `[]`; only `open`/`close`, which have no production caller reachable with unvalidated CLI input, may throw, and their sole production callers already handle that.
- Every currently valid work id — the collision-safe `YYYY-MM-DD-slug` shape `change start` generates, and any other id that does not contain `..` or resolve outside the workspace — produces byte-identical trace paths and behavior to before this change.
- No new dependency, configuration option, or durable data shape is introduced. `resolveInside` is an existing, already-tested primitive.

## Alternatives

- **Validate `--id`'s format at the CLI argument parser (`args.ts`):** rejected as the primary fix because other work-id consumers (`session.ts`, `orchestrator.ts`) already pass already-legitimate ids through `resolveInside`-backed builders without relying on upstream CLI validation; fixing containment at the path-construction boundary protects every caller uniformly, including any future one, rather than only the CLI entry point. Format validation at the parser is not excluded by this Change but is not required to close the vulnerability and is left to a separate, narrower concern if ever desired.
- **Wrap only `trace.append`'s call site in `main.ts` with a manual containment check:** rejected because it would leave `open`, `read`, and `close` — and any future caller — unprotected, duplicating containment logic instead of reusing the project's one existing seam.
- **Delete the raw `join()` and inline `resolveInside` directly in `trace.ts` instead of adding a `state.ts` builder:** rejected because every sibling work-id path (`stageSessionPath`, `changeRecordRelativePath`, ...) is centralized in `state.ts`; keeping `tracePath` there preserves one place that knows the on-disk layout and avoids `trace.ts` importing `resolveInside` directly for a concern `state.ts` already owns.

## Simplicity decision

- Selected rung: local reuse
- Earlier rungs: no runtime/stdlib primitive or installed dependency change is needed; the containment check (`resolveInside`) already exists in the project and is already used by every sibling path builder. The only need is to route one remaining unguarded builder through it.
- Irreducible complexity: `state.ts` must remain the single place that knows how a `workId` maps to an on-disk path inside `.codepatrol/runtime/`; `trace.ts` must remain agnostic of that layout and only consume the resulting path.
- Safety floor: no trace-related code path may write or open a file outside the workspace; existing best-effort semantics for `append`/`appendRaw` must not regress into propagating exceptions to command dispatch; the full project gate remains mandatory.
- Expected surface delta: modify `src/shared/state.ts`, `src/change/trace.ts`, and `src/change/trace.test.ts`; no new file, dependency, configuration, or public interface.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | `--id` retains no CLI-level format validation; containment is enforced only at path construction | A malformed `--id` still reaches `executeCommand` and fails there with whatever error that command's own id lookup produces, rather than failing earlier with a dedicated "invalid work id format" message | A user-facing report that an invalid `--id` produces a confusing downstream error instead of an immediate, specific complaint | Add explicit `workId` shape validation in `args.ts` or `commands.ts` before dispatch, independent of this containment fix |

## Compatibility and rollout

- No CLI command, JSON envelope, or public interface signature changes. `trace.path`'s return type and `append`/`appendRaw`/`read`/`close`/`open`'s signatures are unchanged.
- Every legitimate work id in use today (all `.codepatrol/changes/*` directories are named with the collision-safe `YYYY-MM-DD-slug` pattern) continues to resolve to the exact same trace path as before; no data migration.
- Rollback: reverting the implementation commit restores prior (unguarded) behavior with no durable-data migration; `.codepatrol/runtime/traces/` remains disposable runtime state exactly as before.
- Observability: a containment violation on `append`/`appendRaw` now surfaces as `[trace] append failed: Path escapes the workspace: ...` (or the equivalent `resolveInside` message) on stderr instead of silently succeeding outside the workspace — a strictly more informative failure mode, not a new one, since these functions already print a failure message for any other I/O error today.

## Risks and mitigations

- Risk: `read()`'s new `try/catch` could accidentally swallow a real, non-containment error (e.g. a permissions failure) and misreport it as "no trace." Mitigation: the catch only returns `[]` when the caught value is `instanceof CodepatrolError` (the exact type `resolveInside` throws); every other error re-throws unchanged.
- Risk: routing `path()` through `resolveInside` could reject a currently-valid but unusual work id (e.g. containing characters `resolveInside` treats specially). Mitigation: characterize the exact `YYYY-MM-DD-slug` shape `change start` produces and confirm it round-trips unchanged before touching any call site.
- Risk: `open()`/`close()` newly throwing for a containment violation could surface in an untested production path. Mitigation: confirmed by direct read that `open()` has no production caller and both `close()` call sites already wrap it in `try/catch`; no behavior change for those callers.

## Acceptance criteria

- AC-1: Given a `workId` whose derived path would resolve outside `.codepatrol/runtime/traces/` but still inside the workspace (e.g. containing `..` segments), `trace.path` throws `CodepatrolError("INVALID_WORKSPACE", ...)` instead of returning the escaped path.
- AC-2: Given a `workId` whose derived path would resolve entirely outside the workspace root, `trace.path` throws the same error; no file is created anywhere outside the workspace.
- AC-3: Given the same containment-violating `workId` as AC-1/AC-2, `trace.append` and `trace.appendRaw` do not throw, do not write any file, and their existing stderr diagnostic fires — matching their current behavior for any other internal I/O failure.
- AC-4: Given the same containment-violating `workId`, `trace.read` returns `[]`, matching its existing behavior for a work id with no trace file.
- AC-5: Given any work id in the collision-safe `YYYY-MM-DD-slug` shape `change start` produces, every `trace.*` function's observable behavior (returned path, file contents, read results) is unchanged from before this Change.
- AC-6: `npm run verify` passes with no modified production paths outside `src/shared/state.ts` and `src/change/trace.ts`, and no dependency/configuration change.

## Decisions and open questions

- Decision: fix containment at the path-construction boundary (`state.ts`/`trace.ts`), not by adding CLI-level `--id` format validation; this matches how every other work-id consumer in the project is already protected and closes the vulnerability for every current and future caller of `trace.*`, not only the CLI entry point.
- Decision: `append`/`appendRaw` keep their best-effort contract (no propagated exception); `read` gains an equivalent best-effort contract limited to containment errors; `open`/`close` are left throwing, matching their existing untouched contract with their only production callers.
- Decision: CLI-level `--id` format validation (DC-1) is explicitly deferred as a separate, narrower concern, not required to close this vulnerability.
- No open question remains that can materially change scope, interfaces, or acceptance.
