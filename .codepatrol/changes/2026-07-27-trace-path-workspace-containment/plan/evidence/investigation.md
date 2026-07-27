# Investigation — trace path containment

## Baseline and method

- Change: `2026-07-27-trace-path-workspace-containment`
- Target: `main` at `134f46d94fdeb729092509b8646bb22b2de744c1`
- Source: GitHub issue #17 / backlog id
  `trace-paths-accept-unchecked-cli-id-values-and-can-escape-codepatrol-runtime-or-the-workspace-through-parent-traversal`,
  filed as a `plan-followup` from `2026-07-27-src-architecture-audit`'s
  whole-`src/` investigation, selected because it is the only p1 backlog
  item with a security (not reliability/concurrency) impact: an unvalidated
  path escape, not a race condition or recovery gap.
- Graph: synced clean at baseline (76 files, no change).
- Gate: `npm run verify` green at baseline (241 tests) before this
  investigation began.

## The vulnerable seam

`src/change/trace.ts:13-15`:

```typescript
export function path(workspace: string, workId: string): string {
	return join(workspace, ".codepatrol", "runtime", "traces", `${workId}.jsonl`);
}
```

`workId` is concatenated directly into a `node:path` `join()` call with no
containment check. Every other work-id-consuming path builder in the project
goes through `resolveInside` instead:

- `src/shared/state.ts:21-23`, `stageSessionPath`: `resolveInside(workspace,
  `${RUNTIME_DIR}/sessions/${workId}/${stage}/${attempt}.json`)`
- `src/shared/state.ts:33-39`, `changeDirectoryRelativePath` /
  `changeRecordRelativePath`: relative strings that every caller resolves
  through `resolveInside` (`src/change/store.ts:31` and siblings)

`resolveInside` (`src/shared/workspace.ts:26-57`) resolves the candidate
against the realpath'd workspace and rejects it with
`CodepatrolError("INVALID_WORKSPACE", ...)` when `relative(workspace,
candidate)` starts with `..` or is absolute, and additionally rejects a
symlink ancestor that resolves outside the workspace. `trace.ts` is the one
work-id path builder in the codebase that bypasses this seam entirely.

## Blast radius: where the unchecked `workId` originates

`src/cli/main.ts:19-31`, `traceableWorkId`:

```typescript
function traceableWorkId(command: string, args: Record<string, unknown>): string | undefined {
	if (typeof args.id === "string" && args.id) return args.id;
	if (command === "change.start" && typeof args.input === "string" && args.input !== "-") { /* ... */ }
	return undefined;
}
```

`args.id` is `parseArgs`'s raw `--id` string with no format validation
(`src/cli/args.ts` accepts any non-empty string for `--id`). `main.ts:57-58`
calls `trace.append(workspace, traceWorkId, ...)` with this raw value
**before** `executeCommand` dispatches to any handler that would look up or
validate the id against `.codepatrol/changes/`. Any command that accepts
`--id` — `change inspect`, `change transition`, `change session`, `change
doctor`, `change close`, `change summary` — triggers this unchecked write
attempt, whether or not a Change with that id actually exists. `main.ts:72-76`
repeats the same unchecked call on the error path.

Two production modules also call `trace.*` with an already-resolved,
already-legitimate `workId` (not raw CLI input): `src/change/orchestrator.ts`
(lines 187, 202, 324, 427, 454) and `src/change/session.ts` (lines 198, 208),
plus a read at `src/change/improvement-report.ts:63`. These call sites are
not attacker-reachable with an arbitrary string — their `workId` always comes
from a Change record already loaded or just written by `change start`'s own
collision-safe slug generator — but they will still benefit from (and must
not be broken by) the fix, since they use the same `trace.path` internally.

## Reproduced escape (isolated sandbox, not the real repository)

Executed against a disposable temporary directory tree, never against this
repository's own workspace or any path outside the sandbox, using
`trace.append`/`trace.path` directly through `node --test --import
jiti/register`:

**Escape from the intended `.codepatrol/runtime/traces/` directory, staying
inside the workspace** (`workId = "../../escape-marker"`):

```
computed path: <workspace>/.codepatrol/escape-marker.jsonl
```

Two `..` segments cancel `runtime/traces`, landing the trace file directly
under `.codepatrol/` instead of the intended `runtime/traces/` subtree. The
file was confirmed written at that unintended location.

**Full escape outside the workspace root** (`workId =
"../../../../full-escape-marker"`):

```
computed path: <parent-of-workspace>/full-escape-marker.jsonl
```

Four `..` segments (one more than the four path components between the
workspace root and the trace file: `.codepatrol/runtime/traces/<id>.jsonl`)
walk entirely past the workspace root. The file was confirmed written
outside the sandboxed workspace directory, at a location the caller never
authorized. Both reproduction directories were deleted immediately after
confirming and recording these results.

This is a real, unauthenticated arbitrary-file-write primitive (bounded to
JSONL trace-entry content, path chosen by whoever controls `--id`) reachable
by any invocation of a `--id`-accepting command, before that id is ever
checked against a real Change.

## Why `read`, `open`, and `close` need individual treatment, not just `path`

- `append` (`trace.ts:54-71`) and `appendRaw` (`trace.ts:73-80`) already wrap
  their entire body, including the `path()` call, in `try { ... } catch
  (error) { process.stderr.write(...) }`. Once `path()` throws
  `CodepatrolError` for a containment violation, these two functions already
  swallow it via their existing best-effort contract — no external caller
  needs to change, and `main.ts`'s two call sites keep working unmodified.
- `read` (`trace.ts:82-95`) does **not** wrap `path()`; it calls `existsSync(p)`
  directly and returns `[]` only when the file is absent. Its one production
  caller, `src/change/improvement-report.ts:63`
  (`const entries = trace.read(workspace, workId);`), has no surrounding
  `try/catch`. Left unmodified, a `path()` throw would newly propagate out of
  `read` and could break Close's improvement-report generation for a
  (hypothetical, not currently reachable) workId that fails containment.
- `open` (`trace.ts:48-52`) and `close` (`trace.ts:97-105`) both call
  `path()` directly with no wrapping. `open` has no production caller today
  (test-only). `close`'s two production call sites
  (`src/change/orchestrator.ts:202,454`) already wrap it in `try { ... }
  catch { /* ... */ }`, so a new throw there is already handled by the
  existing caller-side contract.

## Existing test coverage

`src/change/trace.test.ts` (82 lines, read in full) exercises `path`,
`open`, `append`, `read`, `close`, and `redact` only with a literal safe
work id (`"w1"`, `"w2"`, `"missing"`, `"never-opened"`). No case constructs a
work id containing `..` or attempts to observe where the resulting path
lands relative to the workspace boundary.

## Scope decision

This is a single, localized containment fix at one already-established
seam (`resolveInside`, already used by every sibling path builder in
`state.ts`). No new abstraction is required: add one relative-path builder
to `state.ts` mirroring `stageSessionPath`, route `trace.ts`'s `path()`
through it, and adjust `read()`'s error handling to preserve its existing
"no trace" contract for a containment violation. No other finding from the
`2026-07-27-src-architecture-audit` backlog batch is bundled here; each
remains an independent, separately trackable concern (concurrency races,
recovery gaps, a documentation/implementation disagreement, and structural
concentration) with no shared file or seam with this fix.
