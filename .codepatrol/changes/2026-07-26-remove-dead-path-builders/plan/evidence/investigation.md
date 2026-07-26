# Plan evidence — dead path-builder helpers

Verified by direct commands run during this Plan attempt. All paths
relative to repo root, checked against `main` @ `948905d`.

## Zero-caller re-confirmation

```
$ grep -rn "changeDirectory\b" src/ --include="*.ts"
src/change/store.ts:11:export function changeDirectory(workspace: string, workId: string): string { return resolveInside(workspace, `.codepatrol/changes/${workId}`); }

$ grep -rn "changeRoot\b" src/ --include="*.ts"
src/shared/state.ts:17:export function changeRoot(workspace: string): string {

$ grep -rn "changeDirectory\b\|changeRoot\b" src/ --include="*.test.ts"
(no output)
```

Exactly one match each — the declaration line itself. No test file
references either name. Consistent with the findings originally surfaced
during `2026-07-26-architecture-assessment-v3` (this Change's source
backlog item), re-verified fresh rather than trusted from memory.

## Both files read in full

- `src/change/store.ts` (34 lines) — every export besides `changeDirectory`
  (`changeRecordPath`, `readChangeRecord`, `writeChangeRecord`,
  `appendChangeEvent`, `listWorkingTreeChangeIds`) has active callers in
  `src/change/orchestrator.ts` and elsewhere. `listWorkingTreeChangeIds`
  (line 30-33) is the one function that needs a `.codepatrol/changes` path
  and builds it via a raw literal at line 31, not via `changeDirectory`.
- `src/shared/state.ts` (23 lines) — every export besides `changeRoot`
  (`STATE_VERSION`, `stateRoot`, `graphStatePath`, `lockPath`,
  `stageSessionPath`) has active callers (confirmed in the prior
  architecture assessment and re-spot-checked here).

## Precedent

`2026-07-25-remove-duplicate-reader` (closed, `main`@`932edcc`) is this
repo's precedent for a tightly-scoped, single-finding dead/unsafe-code
removal Change. This Change follows the same shape for a simpler (pure
dead code, zero behavior change vs. that Change's unsafe-reader fix) case.
