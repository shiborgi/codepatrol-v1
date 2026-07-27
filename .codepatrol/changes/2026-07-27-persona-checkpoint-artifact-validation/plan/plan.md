# Plan — Validate artifact ownership and hash for persona Review/Verify checkpoints

- Work id: `2026-07-27-persona-checkpoint-artifact-validation`
- Governing spec: `spec.md`
- Target baseline: `main` at `08a43e5e85f5c617ba4d4b0d7abc89e6f7f03d85` (the Change's recorded immutable `base_commit`)

## Goal and approach

Add one narrow, explicit `enforceCompleteness` toggle to the existing
shared artifact-validation path in `validation.ts`, so its per-binding
ownership-prefix and hash-match checks can run unconditionally for every
checkpoint — persona or not — while its "every file in the directory must
be declared" completeness check remains skippable for the one case that
genuinely needs it (incremental multi-persona commits). Then make
`orchestrator.ts`'s `buildCheckpointEvent` call the validator
unconditionally, passing `enforceCompleteness: !personaCheckpoint` instead
of skipping the call outright for personas.

## Global constraints

- `validateWithReader`, `validateArtifactBindings`, and `validateStageArtifacts` (all three defined in
  `src/change/validation.ts`) and `validateWorkspaceArtifacts` (defined separately in
  `src/change/orchestrator.ts`) all gain the new parameter as `enforceCompleteness: boolean = true`
  (defaulted, so every existing call site compiles and behaves identically without modification).
- `validateStageArtifactsFromReader`/`validateArtifactBindingsFromReader` (the `FromReader` variants
  used by Verify's re-validation of already-accepted Plan/Review/Apply artifacts) are not modified at
  their call sites; they keep the default `true`.
- No change to `orchestrator.ts`'s `missing[]` required-artifact check, the "undeclared worktree paths"
  check, or either production-delta check — all three keep their exact current persona-exemption
  behavior (spec's Out of scope; confirmed necessary/sound in `plan/evidence/investigation.md`).
- No change to `model.ts`'s persona event fold.
- Use tabs and the existing Node test/assert style. Do not add a test framework or dependency.
- Each task starts with its declared red test, records valid red/green signals in
  `apply/journal.md`, and stops for re-planning if the interface or acceptance contract must change.
- Final verification must run the configured `npm run verify` Apply gate.

## Simplicity proof

- Selected rung: local reuse
- Reused capabilities: `validateWithReader`'s existing per-binding checks (ownership prefix, hash
  match, baseline consistency), `CodepatrolError`, the existing sandbox-repository test harness
  pattern from `orchestrator-parallel.test.ts`, Node test runner, project gate.
- Forbidden speculative surface: no new exported error code, no new persisted schema field, no change
  to `model.ts`'s persona fold (DC-1, deferred), no narrowing of the "undeclared worktree paths"
  allowance (DC-2, deferred), no separate persona-specific validator function.
- Expected surface delta: modify four files (`src/change/validation.ts`, `src/change/orchestrator.ts`,
  `src/change/orchestrator-parallel.test.ts`, `src/change/change.test.ts`); one new optional, defaulted
  parameter threaded through four existing functions across the first two files; no dependency,
  configuration, or durable schema change.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T1, T2 | `node --test --import jiti/register src/change/orchestrator-parallel.test.ts` |
| AC-2 | T1, T2 | `node --test --import jiti/register src/change/orchestrator-parallel.test.ts` |
| AC-3 | T2 | `node --test --import jiti/register src/change/orchestrator-parallel.test.ts` |
| AC-4 | T2 | `node --test --import jiti/register src/change/orchestrator-parallel.test.ts` |
| AC-5 | T1, T2 | `node --test --import jiti/register src/change/change.test.ts src/change/orchestrator-parallel.test.ts` |
| AC-6 | T3 | `npm run verify` and final path/diff inspection |

## Dependency order

`T1` (validation.ts parameter) has no dependency. `T2` (orchestrator.ts call-site change plus the
full exploit/regression test suite) depends on `T1` because its red tests exercise the new parameter
through the orchestrator. `T3` (final verification) depends on `T1` and `T2`.

### T1 — Add `enforceCompleteness` to the shared artifact validator

**Purpose:** Satisfies the shared foundation for AC-1, AC-2, and AC-5 by letting the completeness
check be skipped independently of the per-binding ownership/hash checks.

**Depends on:** None

**Files:**

- Modify: `src/change/validation.ts` — `validateWithReader`, `validateArtifactBindings`,
  `validateStageArtifacts` (all three are defined in this file; `validateWorkspaceArtifacts` is a
  separate, private helper defined in `orchestrator.ts` itself — its own signature change is T2's work)
- Modify: `src/change/change.test.ts` — one direct characterization case for the new parameter

**Interfaces:**

- Changes: `validateWithReader(record, stage, bindings, reader, baseline?, enforceCompleteness = true)`;
  `validateArtifactBindings(workspace, record, stage, bindings, baseline?, enforceCompleteness = true)`;
  `validateStageArtifacts(workspace, record, stage, bindings, baseline?, enforceCompleteness = true)`
- Preserves: `validateWithReader`'s per-binding checks (ownership prefix, hash match, baseline
  create/modify/delete consistency) run unconditionally regardless of `enforceCompleteness`;
  `validateStageArtifactsFromReader`/`validateArtifactBindingsFromReader` signatures and behavior
  (both omit the new parameter at their existing call sites, defaulting to `true`)
- Invariants/errors: `enforceCompleteness: false` skips only the "Undeclared durable artifact: ..."
  loop; every other error message and `CHANGE_DRIFT` throw shape is unchanged

**Simplicity proof:** One new defaulted parameter threaded through three existing functions, all in
one file; the completeness loop is wrapped in one `if`. No new function, no new error taxonomy.

**Surface delta:** Two modified files; no dependency change.

**Steps:**

1. Add a new `test(...)` block to `change.test.ts` (following the file's existing flat-test style, near
   the existing `validateArtifactBindings` case at line 119-123), reusing the file's existing
   `artifactBinding(record, relativePath, content)` and
   `writeStageArtifact(workspace, record, relativePath, content)` helpers, before any production change:
   - Using `recordAtStage("review")` (the file's existing stage-fixture helper) and a temp workspace,
     write two real files via `writeStageArtifact`: `review/a.md` (content `"a\n"`) and `review/b.md`
     (content `"b\n"`).
   - Call `validateArtifactBindings(workspace, record, "review", [artifactBinding(record, "review/a.md",
     "a\n")])` (declaring only `a.md`, not `b.md`) with `enforceCompleteness` explicitly omitted
     (default). Assert `result.valid === false` and `result.errors` contains an "Undeclared durable
     artifact" entry for `b.md`'s full path — this characterizes current, unchanged default behavior.
   - Call the same binding list with `enforceCompleteness: false` explicitly. Assert `result.valid ===
     true` — the completeness gap for `b.md` is tolerated, but the declared `a.md` binding is still
     fully checked.
   - Call `validateArtifactBindings(workspace, record, "review", [artifactBinding(record, "review/a.md",
     "wrong-content")], undefined, false)` (a binding whose `sha256` is computed from content that does
     not match the real file on disk, with `enforceCompleteness: false`). Assert `result.valid === false`
     with an "Artifact hash drift" error — proving the per-binding check still runs even when
     completeness is skipped.
2. Run `node --test --import jiti/register src/change/change.test.ts`.
   Expected red: the `enforceCompleteness: false` call fails (the function does not yet accept a sixth
   parameter, or ignores it and still reports the completeness error). A TypeScript compile error
   naming the extra argument is an acceptable form of this red signal.
3. In `validation.ts`, add the parameter to all three functions listed under Interfaces above, wrap the
   completeness loop (`validateWithReader`'s current final line) in `if (enforceCompleteness) { ... }`,
   and thread the parameter through each call in the chain (`validateArtifactBindings` →
   `validateWithReader`; `validateStageArtifacts` → `validateArtifactBindings`). Leave
   `validateArtifactBindingsFromReader`/`validateStageArtifactsFromReader` and their call to
   `validateWithReader` unchanged (they omit the new argument, so it defaults to `true`).
4. Run `node --test --import jiti/register src/change/change.test.ts`.
   Expected green: both new assertions and all pre-existing `change.test.ts` cases pass.
5. Run `npm run typecheck`.
   Expected: passes; no existing caller of any of the three functions is broken by the new optional
   parameter. `orchestrator.ts`'s `validateWorkspaceArtifacts` still calls `validateStageArtifacts`
   with its old two-argument-plus-baseline shape at this point — T2 updates that call site — so this
   typecheck is expected to still pass because the new parameter is optional/defaulted, not because
   T2's change has happened yet.

**Task result:** Record the red completeness/hash-drift assertions, green output, and changed paths in
`apply/journal.md`.

### T2 — Enforce validation for persona checkpoints and reproduce the exploits as red tests

**Purpose:** Satisfies AC-1 through AC-5 by closing the actual vulnerable call site and proving both
reproduced exploits are refused while the existing multi-persona workflow is unaffected.

**Depends on:** T1

**Files:**

- Modify: `src/change/orchestrator.ts` — `validateWorkspaceArtifacts`'s own signature (this function is
  defined in `orchestrator.ts`, not `validation.ts`), and `buildCheckpointEvent`'s validation call site
- Modify: `src/change/orchestrator-parallel.test.ts` — exploit and regression cases

**Interfaces:**

- Changes: `validateWorkspaceArtifacts(git, workspace, record, stage, bindings, checkpoint?, signal?,
  enforceCompleteness = true)`, threading the new parameter into its internal
  `validateStageArtifacts(...)` call
- Consumes: `validateStageArtifacts`'s new `enforceCompleteness` parameter from T1
- Preserves: `buildCheckpointEvent`'s own signature, the `missing[]` required-artifact check, the
  "undeclared worktree paths" check, both production-delta checks, and the commit-staging logic —
  none of these change
- Invariants/errors: a persona checkpoint declaring a path outside its stage's own directory, or a
  wrong `sha256` for any declared path, now throws `CodepatrolError` with code `CHANGE_DRIFT` before
  any commit is created for that content

**Simplicity proof:** One new defaulted parameter on `validateWorkspaceArtifacts`, threaded one level
deeper into its existing `validateStageArtifacts` call, plus the guarded call in `buildCheckpointEvent`
becoming unconditional with one new argument. No new branch, no new persona-detection logic beyond the
existing `personaCheckpoint` boolean already computed on the line above.

**Surface delta:** One production file modified (one new parameter plus one call-site change); one test
file extended.

**Steps:**

1. Add these cases to `orchestrator-parallel.test.ts`, reproducing both confirmed exploits from
   `plan/evidence/investigation.md` as red tests, plus one explicit regression case, before any
   production change. Reuse the file's existing `git`/`at`/`writeGitignore`/`initRepo`/`binding` helpers
   and its established Plan-then-Review-begin setup sequence (mirroring the file's first test through
   its `usage`/`begin review`/`usage review` steps):
   - `"a persona checkpoint declaring a wrong sha256 for its own artifact is rejected"`: after the
     standard Plan-then-Review-begin setup, write a real `review/findings-security.md`, then call
     `transitionChange` with a `checkpoint` intent, `persona: "review-security"`, and an artifact whose
     `path` is correct but whose `sha256` is a deliberately wrong 64-hex-character string. Wrap in
     `await assert.rejects(...)` asserting `(err) => err instanceof CodepatrolError && err.code ===
     "CHANGE_DRIFT"`.
   - `"a persona checkpoint declaring an artifact outside its own stage directory is rejected"`: same
     setup; write `.codepatrol/changes/<id>/apply/journal.md` (Apply's directory, not Review's) with
     real content and its own correct hash; call `transitionChange` with `persona: "review-security"`
     declaring that path. Wrap in `await assert.rejects(...)` asserting `code === "CHANGE_DRIFT"`; after
     the rejection, assert (via a direct `execFileSync("git", ["log", "--oneline"], ...)` call) that no
     new commit was created beyond the setup steps' commits — the content must never land in git, not
     merely be excluded from the accepted record.
   - `"a persona checkpoint declaring only its own legitimate artifact still succeeds"`: same setup;
     write `review/findings-security.md` with real content and its real, correctly-computed hash; call
     `transitionChange` with `persona: "review-security"` declaring exactly that path. Assert the
     returned view's `stage === "review"` and `attempts.review.at(-1)?.status === "active"` (unchanged
     from the file's existing first test's assertions after its first persona checkpoint) — this is the
     explicit AC-3 regression guard alongside the file's pre-existing two-persona test.
2. Run `node --test --import jiti/register src/change/orchestrator-parallel.test.ts`.
   Expected red: the two exploit cases currently resolve (do not reject) — `assert.rejects` fails
   because the promise fulfills instead of rejecting. The legitimate-artifact case and the file's
   pre-existing tests are expected to already pass (characterization of current correct behavior, not
   a red signal for this task).
3. In `orchestrator.ts`:
   - Add `enforceCompleteness: boolean = true` as a new trailing parameter to `validateWorkspaceArtifacts`
     (`orchestrator.ts:118`), and pass it through its internal call:
     `validateStageArtifacts(workspace, record, stage, bindings, baseline, enforceCompleteness)`.
   - Change line 264 (`buildCheckpointEvent`) from
     `if (!personaCheckpoint) await validateWorkspaceArtifacts(git, workspace, record, intent.stage, intent.artifacts, undefined, options.signal);`
     to
     `await validateWorkspaceArtifacts(git, workspace, record, intent.stage, intent.artifacts, undefined, options.signal, !personaCheckpoint);`
4. Run `node --test --import jiti/register src/change/orchestrator-parallel.test.ts`.
   Expected green: all new cases pass, and both of the file's pre-existing tests (the two-persona
   consolidation workflow, and the divergence/return workflow) continue to pass unmodified.
5. Run `npm run typecheck`.
   Expected: passes; `buildCheckpointEvent`'s own signature is unchanged.

**Task result:** Record the red exploit-rejection failures, the green output including both pre-existing
tests still passing, and the final changed paths in `apply/journal.md`.

### T3 — Final verification

**Purpose:** Satisfies AC-6 by proving no undeclared surface entered the candidate and the full gate is
green.

**Depends on:** T1, T2

**Files:** None

**Interfaces:**

- Consumes: completed implementation, `git diff`, the configured project gate
- Produces: Apply evidence only in `apply/journal.md`

**Simplicity proof:** Uses only existing commands; no verification-only helper is added.

**Surface delta:** No additional source files.

**Steps:**

1. Run the focused suite covering both modified files' direct test coverage:
   `node --test --import jiti/register src/change/change.test.ts src/change/orchestrator-parallel.test.ts`.
   Expected: all cases pass.
2. Run `npm run verify`.
   Expected: typecheck, all Node tests (including the new cases), build, compiled CLI smoke, and skill
   lint pass with 0 failures.
3. Run `git diff --name-status 08a43e5e85f5c617ba4d4b0d7abc89e6f7f03d85...HEAD -- . ':!.codepatrol'`.
   Expected: exactly `src/change/validation.ts`, `src/change/orchestrator.ts`,
   `src/change/orchestrator-parallel.test.ts`, and `src/change/change.test.ts` — no other production
   path differs.
4. Confirm DC-1 and DC-2 did not fire: no requirement emerged during implementation to retain persona
   artifacts on the projected `ChangeView`, and none to narrow the "undeclared worktree paths"
   allowance, to satisfy any acceptance criterion.
5. Rollback check: confirm reverting the implementation commit restores prior (unvalidated) persona
   checkpoint behavior with no durable-data migration; no persisted schema changed.

**Task result:** Record focused/full command outcomes, the final path list, AC mapping, DC-1/DC-2
status, rollback confirmation, and residual risks in `apply/journal.md`.
