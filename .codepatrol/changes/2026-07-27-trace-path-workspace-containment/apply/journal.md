# Apply journal

## T1 — Add a contained trace path builder to `state.ts`

- Added `import { CodepatrolError } from "./errors.js";` and `tracePath(workspace, workId)` directly below `stageSessionPath` in `src/shared/state.ts`: rejects any `workId` containing `/` or `\` with `CodepatrolError("INVALID_WORKSPACE", ...)`, then delegates to `resolveInside(workspace, \`${RUNTIME_DIR}/traces/${workId}.jsonl\`)`. No new exported constant; reuses the private `RUNTIME_DIR`.
- Per plan T1 step 1, no separate scratch test — T2's `trace.test.ts` suite is the red/green signal for this builder.
- `npm run typecheck` passes (no existing caller references the new export yet).
- Changed paths: `src/shared/state.ts`.

## T2 — Route `trace.ts` through the contained builder and characterize containment

- Red first: 6 new `trace.test.ts` cases added; exactly the planned 4 failed — `..`-segment escape, full-workspace escape, symlink-pivot (`link/trace` against a real `traces/link` symlink), and append/appendRaw writing outside — all because `trace.path` returned the escaped path instead of throwing and the escaped file was actually written. The `read` and legitimate-slug cases passed pre-change as predicted characterizations.
- Production (`src/change/trace.ts`): `path()` now returns `tracePath(workspace, workId)`; `join` dropped from the `node:path` import; `read()`'s body wrapped in `try/catch` that returns `[]` only for `error instanceof CodepatrolError` and re-throws anything else. `append`/`appendRaw`/`open`/`close` untouched — the existing best-effort wrappers absorb the new throw (`[trace] append failed: Work id must not contain a path separator: ...` observed on stderr during the append test).
- Test-only adjustment recorded for honesty: `tracePath` goes through `resolveInside`, which realpaths the workspace prefix (on macOS, tmpdir's `/var` → `/private/var`), so two path-prefix assertions compare against `realpathSync(workspace)` — the same canonicalization every sibling `state.ts` builder already exhibits (`stageSessionPath` et al.) and the pattern `cli.test.ts` already uses. No interface or acceptance-contract change; the file a legitimate id maps to is identical.
- Green: `node --test --import jiti/register src/change/trace.test.ts` 13/13 pass (7 pre-existing + 6 new). `npm run typecheck` clean.
- Changed paths: `src/change/trace.ts`, `src/change/trace.test.ts`.

## T3 — Final verification

- Standalone focused run: `node --test --import jiti/register src/change/trace.test.ts` 13/13 pass.
- `npm run verify` (the configured `applyGate`): typecheck, 247/247 tests (241 baseline + 6 new trace cases), build, compiled CLI smoke, skill lint — 0 failures. `git diff --check` clean.
- Working-tree surface is exactly the three declared paths — `src/shared/state.ts`, `src/change/trace.ts`, `src/change/trace.test.ts` — plus Change-owned `apply/journal.md`; no other production path, dependency, or configuration differs.
- AC mapping: AC-1 → T2 `..`-segment + symlink-pivot cases (both throw `INVALID_WORKSPACE`); AC-2 → full-workspace-escape case; AC-3 → append/appendRaw silent, zero files created, stderr diagnostic fires; AC-4 → `read` returns `[]`; AC-5 → legitimate-slug round trip + all 7 pre-existing cases unchanged; AC-6 → this gate + path reconciliation.
- DC-1: not fired — no CLI-level `--id` format validation was needed for any criterion. DC-2: ceiling holds — no requirement to canonicalize the traces root emerged; separator rejection plus `resolveInside` covered every red case.
- Rollback: reverting the implementation commit restores the prior unguarded `join()` behavior with no durable-data migration; `.codepatrol/runtime/traces/` stays disposable. Residual risks: only the accepted DC-2 ceiling (pre-existing traces-root symlink via separate local tampering).
