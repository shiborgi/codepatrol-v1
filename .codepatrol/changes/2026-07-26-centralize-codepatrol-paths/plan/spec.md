# Specification — Centralize `.codepatrol/` path-layout knowledge in `shared/state.ts`

## Intent

- Origin: improve-codebase
- Mode: architecture
- Target baseline: `main` @ `2e6549c` (branch `codepatrol/2026-07-26-centralize-codepatrol-paths`), clean tree, `npm run verify` green (215/215)
- Governing constraints: this Change touches `src/change/orchestrator.ts` again, immediately after `2026-07-26-decompose-transition-change` — the discipline established there (behavior-preservation proven by the unchanged 215-test suite, task-per-file with a test run after every task, never bundling multiple files into one uncheckpointed step) governs this Change identically.
- Substrate state: graph not re-synced — the exact call sites were located by direct `grep`/read during `2026-07-26-src-structure-revalidation` and re-verified fresh during this Plan attempt (all line numbers below reconfirmed against `main`@`2e6549c`, not carried forward from the prior assessment).
- Improvement signals (from `.codepatrol/docs/improvement-reports/2026-07-26-src-structure-revalidation.md`, most recent by mtime): `CHANGE_INVALID` (1 occurrence, self-explained) and `change.session` invocation count (17) — generic lifecycle telemetry, not actionable for this Change's scope.
- Problem: the repository's `.codepatrol/` directory layout (`changes/<id>/...`, `backlog/items.yaml`, `runtime/...`) is encoded as ~20 independent literal-string sites across 6 production files, even though `src/shared/state.ts` already exists specifically to own this knowledge (it holds `stateRoot`, `graphStatePath`, `lockPath`, `stageSessionPath` for the `runtime/` subtree). The same logical path is built independently in more than one place in several cases: `.codepatrol/changes/<id>/change.yaml` (twice), the `.codepatrol/changes/<id>/<stage>/` prefix (three times), `.codepatrol/backlog/items.yaml` (twice, plus its bare prefix twice more), and `.codepatrol/changes/<id>` itself (three times, including two now-deleted dead helpers that were abandoned attempts at exactly this centralization — `2026-07-26-remove-dead-path-builders`'s `changeDirectory`/`changeRoot`). This is backlog item S1, filed by `2026-07-26-src-structure-revalidation`.
- Outcome: `shared/state.ts` gains a small set of relative-path builders derived from three private, file-scoped constants (`CHANGES_DIR`, `BACKLOG_DIR`, `RUNTIME_DIR`); every consumer site across the six touched files calls the corresponding builder instead of re-typing the literal. Zero externally observable behavior change — every path string produced is byte-identical to today's, proven by the unchanged 215-test suite, not merely asserted from the refactor being "obviously" safe.

## Scope

### In scope

- Add 7 new exported relative-path-string builders to `src/shared/state.ts`, each deriving from one of three new private constants (`CHANGES_DIR = ".codepatrol/changes"`, `BACKLOG_DIR = ".codepatrol/backlog"`, `RUNTIME_DIR = ".codepatrol/runtime"`).
- Refactor `state.ts`'s four pre-existing exports (`stateRoot`, `graphStatePath`, `lockPath`, `stageSessionPath`) to derive from `RUNTIME_DIR` instead of their own inline `.codepatrol/runtime` literals — closing the loop so the constant has exactly one definition site even for the paths `state.ts` already owned.
- Update every identified consumer site in `src/change/store.ts`, `src/change/backlog.ts`, `src/change/validation.ts`, `src/change/session.ts`, and `src/change/orchestrator.ts` to call the new builders instead of re-typing the literal.

### Out of scope

- `src/change/git.test-helper.ts` — test infrastructure (not production source), builds paths for temporary fixture directories in isolated test workspaces; no production behavior depends on it, and touching shared test infrastructure carries risk disproportionate to a cosmetic literal in a helper the tests already pass with.
- `src/graph/store.ts:133` — writes the literal string `.codepatrol/runtime` as a **metadata value** inside a JSON blob (`version.json`'s `storage` field, informational only, never read back as a path by any code, confirmed by reading the full file). This is not a path-construction duplication in the sense S1 evidenced; noted here as considered rather than silently missed, not filed as an extension since it carries no functional risk.
- `.codepatrol/docs/improvement-reports/<workId>.md` paths at `orchestrator.ts:384-385` — a different subsystem (the gitignored, rebuildable improvement-report mirror under `.codepatrol/docs/`, sanctioned by a separate contract in `docs/runtime-state.md`), not part of the `changes/`/`backlog/`/`runtime/` layout this Change centralizes.
- Any change to the *content* of any validation, error code, or control-flow order — this is a pure literal-to-function-call substitution. Every produced path string must be byte-identical to today's.
- F2 (redundant validators), S2 (schema-guard duplication), S3 (CLI registry), S4 (`link.ts` coverage) — independent, already-filed backlog items, unrelated files or unrelated concerns.

## Current evidence

All line numbers re-verified fresh against `main`@`2e6549c` during this Plan attempt (not carried forward from `2026-07-26-src-structure-revalidation`'s evidence, which was gathered against an earlier commit).

- `src/shared/state.ts` (19 lines, read in full) — `stateRoot`, `graphStatePath`, `lockPath`, `stageSessionPath` each independently inline `.codepatrol/runtime` or `.codepatrol/runtime/...`; no private constant exists yet.
- `.codepatrol/changes/<id>/change.yaml` built twice: `orchestrator.ts:24` (`relativeRecord`, relative string, ~15 call sites within the file) and `store.ts:11` (`changeRecordPath`, absolute via `resolveInside`, imported by `orchestrator.ts` and `improvement-report.ts`).
- `.codepatrol/changes/<id>` itself built at `orchestrator.ts:206-208` (`changeDirectoryForCleanup`, single caller at line 195, `rmSync` cleanup on start failure) and inside `store.ts:30-31` (`listWorkingTreeChangeIds`, both the bare root and the per-entry `change.yaml` existence check).
- `.codepatrol/changes/<id>/<stage>/` prefix built three times, byte-identical template: `orchestrator.ts:123` (inside `buildCheckpointEvent`), `validation.ts:24` (`validateWithReader`), `validation.ts:43` (`validateArtifactBindings`).
- `orchestrator.ts:255-258` — the `required` artifact-path map for `plan`/`review`/`apply`/`verify` inlines the same `.codepatrol/changes/<id>/<stage>/` shape per stage, four more instances of the pattern above.
- `session.ts:73` builds `.codepatrol/changes/<id>/` (no stage) independently; `session.ts:123` independently hardcodes `.codepatrol/changes/<id>/plan/plan.md` — the same literal one entry of `orchestrator.ts`'s `required.plan` array also encodes, for an unrelated purpose (Stage Session reconciliation vs. checkpoint validation).
- `.codepatrol/backlog/items.yaml` built twice: `backlog.ts:47` (`backlogPath`, absolute, the real accessor) and inlined again at `orchestrator.ts:265`; its bare `.codepatrol/backlog/` prefix inlined twice more at `orchestrator.ts:269` and `:292`.
- `.codepatrol/runtime/` re-inlined (despite `state.ts` owning `stateRoot`) at `orchestrator.ts:25` (`parseStatusPaths`, filtering git-status lines) and `orchestrator.ts:27` (`ensurePath`, rejecting unsafe checkpoint paths).
- `orchestrator.ts:384-385,408,413` (inside `closeChangeLocked`) build `.codepatrol/changes/<id>/close/receipt.md` and `.../close/improvement-report.md` and the bare `.../close` directory — the same `.codepatrol/changes/<id>` root as everything above, structurally identical to what `changeDirectoryForCleanup` already builds, just with a `close/...` suffix.
- `grep -rn '\.codepatrol/backlog\|\.codepatrol/changes\|\.codepatrol/runtime' src/ --include="*.ts" | grep -v test` confirms no production file outside the six named above and the two explicitly-excluded sites (`git.test-helper.ts`, `graph/store.ts:133`) contains any of these three literals.
- `src/change/backlog.ts` currently imports from `../shared/atomic-store.js`, `../shared/errors.js`, `../shared/workspace.js` only — no existing import from `../shared/state.js`, confirming a new import line (not an extension of an existing one) is needed there. `src/change/session.ts:7` already imports `stageSessionPath` from `../shared/state.js` — the new imports there extend that existing line. `src/change/validation.ts` has no existing import from `../shared/state.js` — a new import line is needed.
- Layering re-confirmed: `shared/` imports nothing from `change/` (`2026-07-26-src-structure-revalidation`'s evidence, re-spot-checked by reading `state.ts`'s current imports — only `./workspace.js`). Adding `change/*.ts → shared/state.js` imports introduces no cycle; `change → shared` is already the established, one-directional edge (24 existing imports along it).

## Proposed design

In `src/shared/state.ts`, introduce three private (unexported) constants and derive every export from them:

```typescript
const CHANGES_DIR = ".codepatrol/changes";
const BACKLOG_DIR = ".codepatrol/backlog";
const RUNTIME_DIR = ".codepatrol/runtime";
```

New exports, each a pure string builder (no I/O):

- `changesRootRelativePath(): string` → `CHANGES_DIR`
- `changeDirectoryRelativePath(workId: string): string` → `${CHANGES_DIR}/${workId}`
- `changeRecordRelativePath(workId: string): string` → `${CHANGES_DIR}/${workId}/change.yaml`
- `changeStageRelativePrefix(workId: string, stage: string): string` → `${CHANGES_DIR}/${workId}/${stage}/` (trailing slash preserved, matching every existing call site's expectation)
- `backlogRelativePrefix(): string` → `${BACKLOG_DIR}/`
- `backlogRelativePath(): string` → `${BACKLOG_DIR}/items.yaml`
- `runtimeRelativePrefix(): string` → `${RUNTIME_DIR}/`

The four pre-existing exports (`stateRoot`, `graphStatePath`, `lockPath`, `stageSessionPath`) keep their exact signatures and return values, only their bodies change to reference `RUNTIME_DIR` instead of repeating `.codepatrol/runtime` inline.

`stage` is typed `string`, not the `Stage` union from `change/types.ts` — `shared/` must not import from `change/`; this matches `stageSessionPath`'s existing `stage: string` parameter precedent in the same file. Callers passing an actual `Stage` value widen implicitly (a string-literal union is assignable to `string`); no cast needed.

Every consumer site listed in Current evidence is then updated to call the corresponding builder — full literal replacements, never a partial/computed hybrid, so each site's provenance is unambiguous. Where a function name already exists at the call site (`relativeRecord`, `changeRecordPath`, `changeDirectoryForCleanup`, `backlogPath`), that name and its signature are kept exactly as-is; only its body is redirected to the new shared builder, so every existing caller across the codebase (15+ for `relativeRecord` alone) needs zero changes.

## Alternatives

- **Move the absolute-path builders (`changeRecordPath`, `changeDirectoryForCleanup`'s logic, `backlogPath`) into `shared/state.ts` directly, rather than keeping them as thin wrappers in their current files:** rejected — `changeRecordPath` and `backlogPath` are actively imported by name from `store.ts`/`backlog.ts` by other files (`orchestrator.ts`, `improvement-report.ts`); moving them would require updating every import site for no behavioral gain, and `store.ts`/`backlog.ts` are the correct owners of "read/write a Change record" and "read/write the backlog" respectively — `shared/state.ts`'s role is the path *string*, not the file I/O built on top of it. This mirrors the existing, working split between `state.ts` (paths) and `session.ts`/`graph/store.ts` (I/O using those paths).
- **Introduce a single generic `codepatrolPath(...segments: string[])` builder instead of named functions per concern:** rejected — a generic join-and-return function does not encode *which* literal root (`changes`, `backlog`, `runtime`) or *which* shape (bare, per-id, per-stage) a call site needs, reintroducing the "caller must remember the exact literal" problem this Change fixes, just one level of indirection later. Named, shape-specific functions make an invalid call (e.g., passing a `stage` where none applies) a compile error instead of a silent typo.
- **Also fix `graph/store.ts:133`'s metadata-string duplication in this Change, since it's directly adjacent:** rejected — it is not a path-construction site (nothing resolves or compares against it), it is informational JSON content; bundling it would pull `graph/store.ts` into this Change's touched-file list for zero functional benefit, expanding blast radius without expanding value. See Scope's Out of scope.

## Simplicity decision

- Selected rung: direct local change
- Earlier rungs: not applicable to a pure literal-to-function-call substitution — there is no lighter mechanism between "keep the duplication" and "name the constant once and call it everywhere."
- Irreducible complexity: none added — the three constants and seven builders are strictly less total information than the ~20 independent literal instances they replace.
- Safety floor: byte-identical output is the explicit safety floor, verified by the unchanged 215-test suite after every task, not assumed from the substitution being "obviously" safe — the same discipline `2026-07-26-decompose-transition-change` required for this same file.
- Expected surface delta: `src/shared/state.ts` (+~25 lines: 3 constants, 7 new functions, 4 existing functions' bodies redirected), `src/change/store.ts` (~4 lines changed), `src/change/backlog.ts` (~2 lines changed, +1 import), `src/change/validation.ts` (~2 lines changed, +1 import), `src/change/session.ts` (~2 lines changed, extends 1 existing import), `src/change/orchestrator.ts` (~13 lines changed across 4 functions, +1 import). No new files, no dependency, no public interface removed (only additive exports plus body-only changes to existing ones).

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | `graph/store.ts:133`'s metadata-string duplication is noted but not fixed | If that JSON field is ever read back and compared against a real path (today it is write-only, informational), the duplication would become a real risk | A future Change starts reading `version.json`'s `storage` field programmatically | Import `runtimeRelativePrefix` (or a similarly-shaped builder) from `shared/state.js` at that point — `graph/store.ts` already imports from `shared/state.js`, so no new dependency edge would be needed |
| DC-2 | `git.test-helper.ts`'s literal paths are left as-is | If the `.codepatrol/changes/` layout ever changes shape, this shared test fixture would silently build stale paths until its own tests caught the drift | A future layout change breaks tests using this helper in a way not obviously traced to the helper itself | Update the helper to use the same `shared/state.js` builders at that point — it is test infrastructure, not a production consumer, so it does not need to move in lockstep with this Change |

## Compatibility and rollout

- No migration: every produced path string is unchanged; this only changes *where* each literal is defined, not what it evaluates to.
- No config, schema, event, or checkpoint change.
- Rollback: revert the single commit (or the per-task commits, if Apply checkpoints per task); every touched file reverts to its current literal-inlining form, behavior-identical either way.
- Observability: not applicable — no runtime-visible behavior changes.

## Risks and mitigations

- Risk: a subtle mismatch between an old inline literal and its new builder call (e.g., a missing trailing slash, an off-by-one in string concatenation) silently changes a produced path. Mitigation: every new builder's exact output is stated in Proposed design and cross-checked character-by-character against the literal it replaces in the plan's task steps; `npm test` after every task is the empirical proof, not the design description alone.
- Risk: this Change touches `orchestrator.ts` for the second time in quick succession, immediately after a large structural refactor there. Mitigation: this Change's edits are strictly narrower in kind (literal substitution only, no control-flow restructuring) than `2026-07-26-decompose-transition-change`'s function extraction, and are further split into three separate orchestrator.ts tasks aligned with the file's own existing function boundaries (`relativeRecord`/`parseStatusPaths`/`ensurePath`/`changeDirectoryForCleanup`; `buildCheckpointEvent`; `closeChangeLocked`), each independently gated by a full test run.
- Risk: `changeStageRelativePrefix`'s `stage: string` parameter accepts any string, not just valid `Stage` values, weakening compile-time safety at the few call sites that previously interpolated a `Stage`-typed variable directly. Mitigation: every actual call site already holds a `Stage`-typed value (from `record.identity`, `intent.stage`, or a stage-name string literal) and passes it in unchanged — TypeScript's structural typing means passing a `Stage` into a `string` parameter is exactly as safe as before, just no longer *additionally* constrained at this one interior call boundary; the value's origin is still `Stage`-typed everywhere it is produced.

## Acceptance criteria

- AC-1: `src/shared/state.ts` exports `changesRootRelativePath`, `changeDirectoryRelativePath`, `changeRecordRelativePath`, `changeStageRelativePrefix`, `backlogRelativePrefix`, `backlogRelativePath`, `runtimeRelativePrefix`, and its four pre-existing exports (`stateRoot`, `graphStatePath`, `lockPath`, `stageSessionPath`) reference the same private `RUNTIME_DIR` constant rather than an inline literal — confirmed by reading the file.
- AC-2: `grep -n '"\.codepatrol/changes\|`\.codepatrol/changes\|"\.codepatrol/backlog\|`\.codepatrol/backlog\|"\.codepatrol/runtime\|`\.codepatrol/runtime' src/change/store.ts src/change/backlog.ts src/change/validation.ts src/change/session.ts src/change/orchestrator.ts` returns zero matches — every consumer site in the five touched `change/` files calls a `shared/state.js` builder instead of inlining the literal (the three constants themselves remain, correctly, only inside `shared/state.ts`).
- AC-3: `npm run verify` (typecheck + full test suite + build + smoke-cli + lint-skills) passes with the identical test count as the base commit (215/215, 0 failures) — proving byte-identical behavior, not merely that it compiles.
- AC-4: `git diff --stat` against this Change's base commit touches exactly six files: `src/shared/state.ts`, `src/change/store.ts`, `src/change/backlog.ts`, `src/change/validation.ts`, `src/change/session.ts`, `src/change/orchestrator.ts` — no test file requires modification (pure internal refactor; the existing suite is the characterization).

## Decisions and open questions

- Decision: absolute-path builders stay in their current owning files as thin body-redirects; only the relative-string literals move to `shared/state.ts` — see Alternatives.
- Decision: named, shape-specific builder functions, not a generic path-join helper — see Alternatives.
- Decision: `git.test-helper.ts` and `graph/store.ts:133` are explicitly out of scope, recorded as DC-1/DC-2 rather than silently omitted.
- No open questions remain that could change scope, interfaces, or acceptance.
