# Specification — Remove dead `.codepatrol/changes` path-builder helpers (`changeDirectory`, `changeRoot`)

## Intent

- Origin: improve-codebase
- Mode: architecture
- Target baseline: `main` @ `948905d` (branch `codepatrol/2026-07-26-remove-dead-path-builders`), clean tree, `npm run verify` green (215/215)
- Governing constraints: none beyond the general Change contract; no ADR exists in this repo, none needed for a dead-code removal
- Substrate state: graph not re-synced — this is a mechanical removal of two zero-caller functions, confirmed by direct `grep`, no symbol-level design decision depends on a fresh graph snapshot
- Improvement signals (from `.codepatrol/docs/improvement-reports/2026-07-26-architecture-assessment-v3.md`, most recent by mtime): top error code `CHANGE_CONFLICT` (1 occurrence) and `change.transition` invocation count (14) — the `CHANGE_CONFLICT` occurrence is self-explained (the prior Change's first Apply-checkpoint attempt incorrectly declared `.codepatrol/backlog/items.yaml` in `changes`, corrected on resubmission; not a code defect, no action needed here); the invocation-count signal is generic Change-lifecycle telemetry, not actionable for this Change's scope.
- Problem: `src/change/store.ts:11` exports `changeDirectory(workspace, workId)` and `src/shared/state.ts:17` exports `changeRoot(workspace)` — both build a `.codepatrol/changes...` path string. Neither has any caller anywhere in the repository (confirmed by `grep -rn` for each name, zero matches outside their own declaration line, including test files). The one place that actually needs this path, `src/change/store.ts:31` (`listWorkingTreeChangeIds`), hardcodes the literal string `.codepatrol/changes` inline instead of calling either helper. This was identified as finding F1 during `2026-07-26-architecture-assessment-v3` and filed as backlog item `dead-duplicated-codepatrol-changes-path-builder-helpers-...` (p3), which this Change is started against.
- Outcome: both dead functions are removed. No other file changes — every caller-side behavior is byte-identical, since nothing called either function.

## Scope

### In scope

- Delete `changeDirectory` from `src/change/store.ts`.
- Delete `changeRoot` from `src/shared/state.ts`.
- Re-verify (immediately before removal, as a red-capable characterization step) that neither function has any caller anywhere in the repo, including test files, so the removal is provably behavior-preserving.

### Out of scope

- F2 (redundant non-throwing validators in `validation.ts`) — a separate, already-filed backlog item (`redundant-non-throwing-validators-in-validation-ts-...`, p3), independent file, independent Change per this repo's established one-finding-per-Change discipline.
- Consolidating `.codepatrol/changes` path construction into a single shared helper that `store.ts:31` (and any future caller) would use — no evidence a shared helper is needed now that both existing attempts at one are dead; a new consolidation would be speculative, not a defect fix. If a future caller needs this path, it can inline the literal string (as `store.ts:31` already does) or introduce a helper at that point, informed by the actual new call site.
- Any other open backlog item (top-error-code items, N2 test-coverage gaps, N3 orchestrator density) — independent, unrelated files.

## Current evidence

- `src/change/store.ts:11` — `export function changeDirectory(workspace: string, workId: string): string { return resolveInside(workspace, \`.codepatrol/changes/${workId}\`); }`. `grep -rn "changeDirectory\b" src/ --include="*.ts"` returns exactly one match: this declaration line. No production or test caller.
- `src/shared/state.ts:17-19` — `export function changeRoot(workspace: string): string { return resolveInside(workspace, ".codepatrol/changes"); }`. `grep -rn "changeRoot\b" src/ --include="*.ts"` returns exactly one match: this declaration line. No production or test caller.
- `src/change/store.ts:30-33` (`listWorkingTreeChangeIds`, read in full) — the only function in the repo that needs a `.codepatrol/changes` path, and it builds it via a raw template literal (`resolveInside(workspace, ".codepatrol/changes")` at line 31) rather than calling either helper above — confirms neither helper is even the "intended" path-builder for this use case, just orphaned scaffolding.
- `src/shared/state.ts` read in full (23 lines) — the other three exports in the same file (`stateRoot`, `graphStatePath`, `lockPath`, `stageSessionPath`) are all actively imported elsewhere (`src/change/session.ts`, `src/graph/store.ts`, `src/shared/lock.ts`, confirmed during the prior architecture-assessment's evidence gathering); `changeRoot` is the only dead export in that file.
- `src/change/store.ts` read in full (34 lines) — every other export (`changeRecordPath`, `readChangeRecord`, `writeChangeRecord`, `appendChangeEvent`, `listWorkingTreeChangeIds`) is actively used across `src/change/orchestrator.ts` and elsewhere; `changeDirectory` is the only dead export in that file.
- `grep -rn "changeDirectory\b\|changeRoot\b" src/ --include="*.test.ts"` — zero matches. No test exercises either function directly, so no test file requires modification.
- Precedent: `2026-07-25-remove-duplicate-reader` removed a different class of dead/unsafe code (a duplicate YAML reader bypassing `migrateRecord`) as its own tightly-scoped, single-finding Change — same shape and discipline this Change follows for a simpler (pure dead-code, zero behavior change) case.

## Proposed design

Delete both function declarations. No caller-side change is needed anywhere, since neither has a caller. This is the smallest possible correction: remove code that provably does nothing.

## Alternatives

- **Consolidate instead of delete** (keep one helper, make `listWorkingTreeChangeIds` call it): rejected — there is no current second call site that would justify a shared helper; introducing one now, with only one caller, is exactly the kind of speculative abstraction `solution-simplification` and this repo's simplicity ladder reject. If a second caller appears later, that Change can introduce the helper informed by both real call sites.
- **Leave the dead code in place**: rejected — it is the exact finding this Change was filed to fix (backlog item F1); leaving it defeats the purpose of filing and picking up the finding.

## Simplicity decision

- Selected rung: direct local change
- Earlier rungs: not applicable — deletion has no "ladder" of increasingly heavy mechanisms; the correction is inherently minimal.
- Irreducible complexity: none — this reduces total surface, it does not add any.
- Safety floor: re-verify zero callers immediately before deletion (this Plan's evidence, re-confirmed at Apply time per the plan's task steps) so the removal is provably behavior-preserving, not merely assumed safe from stale evidence.
- Expected surface delta: `src/change/store.ts` (-1 line), `src/shared/state.ts` (-3 lines). No new files, no dependency, no public interface added — only two removed.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | No shared path-builder helper introduced to replace the two deleted ones | If a second real call site for a `.codepatrol/changes` (or `.codepatrol/changes/<workId>`) path appears, it will either duplicate `store.ts:31`'s inline literal or need a new helper | A future Change adds a second caller needing this exact path shape | Extract a shared helper at that point, informed by both real call sites' exact needs, rather than speculatively now with zero real call sites |

## Compatibility and rollout

- No migration, no runtime behavior change (both functions are unreachable today; removing unreachable code cannot change any observable behavior).
- No config, no schema version bump.
- Rollback: revert the single commit; both functions reappear, still unused, status quo ante.
- Observability: not applicable — no runtime path is affected.

## Risks and mitigations

- Risk: a caller exists that the `grep`-based evidence missed (e.g., dynamic property access, a string-built import). Mitigation: both names are unusual enough (`changeDirectory`, `changeRoot`) that a dynamic-access false negative is implausible in this codebase's style (confirmed by reading every file in `src/change/` and `src/shared/` during the prior architecture assessment — no dynamic import or reflection pattern exists anywhere in this codebase); the Apply task re-runs the same `grep` immediately before deletion as an explicit red-capable check, and `npm run typecheck`/`npm test` after deletion would fail loudly (a missing import, not a silent behavior change) if evidence were somehow wrong.
- Risk: none identified beyond the above — this is as low-risk a change as exists in this codebase (pure removal of code with zero callers).

## Acceptance criteria

- AC-1: `src/change/store.ts` no longer exports a function named `changeDirectory`; `grep -n "changeDirectory" src/change/store.ts` returns no matches.
- AC-2: `src/shared/state.ts` no longer exports a function named `changeRoot`; `grep -n "changeRoot" src/shared/state.ts` returns no matches.
- AC-3: `npm run verify` (typecheck + full test suite + build + smoke-cli + lint-skills) passes with the same test count as the base commit (215/215) — proving the removal introduced zero regression, not merely that it compiles.
- AC-4: `git diff --stat` against this Change's base commit touches only `src/change/store.ts` and `src/shared/state.ts` — no other file changes.

## Decisions and open questions

- Decision: delete outright rather than consolidate into a shared helper — see Alternatives and DC-1.
- Decision: F2 (the other architecture-assessment finding) is a separate Change, not bundled here — matches the one-finding-per-Change discipline already established.
- No open questions remain that could change scope, interfaces, or acceptance.
