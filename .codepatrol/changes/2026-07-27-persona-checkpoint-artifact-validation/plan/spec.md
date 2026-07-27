# Specification — Validate artifact ownership and hash for persona Review/Verify checkpoints

## Intent

- Origin: improve-codebase
- Mode: bug
- Target baseline: `main` at `5698a92330832ecf0b991892dd5c9a82c897bff4`; Change branch `codepatrol/2026-07-27-persona-checkpoint-artifact-validation`; clean tree at start; `npm run verify` green.
- Governing constraints: `CONTEXT.md`'s Stage Session / persona-checkpoint model (parallel `review-<persona>`/`verify-<persona>` sub-checkpoints that must not prematurely advance the stage); `skills/codepatrol-review/SKILL.md` and `skills/codepatrol-verify/SKILL.md`, which document persona-specific reports (e.g. `review/report-security.md`) as a supported pattern. No ADR exists for this subsystem.
- Substrate state: graph synchronized at the target revision; no change.
- Problem: `buildCheckpointEvent` (`src/change/orchestrator.ts:254-298`) skips `validateWorkspaceArtifacts` entirely for any checkpoint that carries a `persona` field during Review or Verify. That function is the only code path that checks a declared artifact's stage-directory ownership (`binding.path.startsWith(prefix)`) and content hash (`sha256` matches actual file bytes). Independently reproduced in disposable sandboxes (full transcripts in `plan/evidence/investigation.md`): a persona checkpoint can declare a deliberately wrong `sha256` for its own legitimate report and have it accepted and permanently recorded (Exploit B), and a Review persona checkpoint can create and commit a file under `.codepatrol/changes/<workId>/apply/` — a different stage's own directory, before that stage has even begun — with no rejection (Exploit C). A third attempted exploit (declaring a real production/source path as a persona artifact) is already blocked by an unrelated, unconditional check and confirms the production/source-code boundary itself is sound; the gap is isolated to ownership and hash validation for paths inside the Change's own metadata directory.
- Outcome: a persona Review/Verify checkpoint's declared artifact paths are rejected unless each is owned by (prefixed under) the correct stage's own directory, and each declared `sha256` is rejected unless it matches the artifact's actual content at commit time — while every currently-passing multi-persona workflow (independent parallel personas, followed by a consolidating checkpoint) continues to behave identically.

## Scope

### In scope

- Add an `enforceCompleteness` control to the shared artifact-validation path (`src/change/validation.ts`) so its per-binding ownership and hash checks can run independently of its "every file in the directory must be declared" completeness check.
- Call the per-binding validation unconditionally from `buildCheckpointEvent` for every checkpoint, persona or not, passing `enforceCompleteness: false` only for persona checkpoints.
- Add direct characterization tests proving both reproduced exploits (forged hash, cross-stage-directory injection) are refused after the fix, and that the existing two-persona-plus-consolidation workflow in `orchestrator-parallel.test.ts` continues to pass unmodified.

### Out of scope

- The six other `2026-07-27-src-architecture-audit` follow-up findings still open (backlog/session concurrency races, checkpoint/Close partial-failure recovery, the Close contract/README disagreement, orchestrator concentration, test-infrastructure leaks, core-module test-coverage gaps) — each is an independent concern with no shared file or seam with this fix.
- Changing the "undeclared worktree paths" check (`orchestrator.ts:268-269`) or the mid-flight `actualProduction`/`declaredProduction` check (`orchestrator.ts:270-271`) — both are intentionally persona-exempt for a legitimate, unrelated reason (incremental multi-persona commits), confirmed by tracing why the existing two-persona test depends on that tolerance; changing them is not required to close this gap and would risk breaking that workflow.
- Changing the "required artifact" check (`orchestrator.ts:262`) that exempts personas from declaring the stage's single canonical report filename — personas legitimately use freeform filenames; this is not a security concern.
- Changing `model.ts`'s persona-event fold (artifacts not retained on the projected attempt) — the persona's declared bindings living only in the raw event log, not the projected `ChangeView`, is an existing, separate design choice unrelated to whether those bindings were ever validated in the first place; not required to close this gap.
- Any change to the production/source-path boundary (`finalProduction`/`declaredProduction`, `orchestrator.ts:296-297`, and `model.ts`'s Apply-only restriction on `intent.changes`) — independently confirmed already sound via Exploit A.

## Current evidence

- `src/change/orchestrator.ts:261,264`: `const personaCheckpoint = persona && (intent.stage === "review" || intent.stage === "verify"); ... if (!personaCheckpoint) await validateWorkspaceArtifacts(...)` — the entire ownership+hash validation call is skipped for any persona checkpoint.
- `src/change/validation.ts:23-41`, `validateWithReader`: performs, per binding, an ownership-prefix check (line 28), a hash-match check (line 34), and baseline create/modify/delete consistency (lines 35-37) — all independent of any other file's presence — followed by a separate completeness loop (line 39) that requires every file currently under the stage prefix to be declared by the same call.
- `src/change/model.ts:122-126`: a persona `stage-checkpointed` event's `artifacts` are never assigned to the projected attempt (`current().status = "active"; break;`, skipping the `Object.assign` that the non-persona branch performs) — persona-declared bindings exist only in the raw event log, never re-validated by any later pass.
- `src/change/orchestrator-parallel.test.ts` (111 lines, read in full): its own passing multi-persona test proves the completeness check is the specific, narrow reason the original implementation bypassed the whole function — persona 2's checkpoint would otherwise see persona 1's already-committed sibling file (`findings-security.md`) and reject it as undeclared.
- Reproduced directly against the real orchestrator in disposable sandbox repositories (full transcripts in `plan/evidence/investigation.md`):
  - **Exploit A (blocked, confirms an existing defense, not a gap)**: a persona artifact declared at a real production path (`src/change/rogue.ts`) is rejected with `CHANGE_CONFLICT: Checkpoint commit does not match its declared artifact and production paths.` — the unconditional `orchestrator.ts:296-297` check plus `model.ts:116-118`'s Apply-only restriction on `intent.changes` already close this vector.
  - **Exploit B (accepted, real gap)**: a Review persona checkpoint declares `sha256: "f".repeat(64)` for `review/findings-security.md`, whose real content hashes to a completely different value. Accepted with no error; the forged hash becomes the permanent record in `change.yaml`.
  - **Exploit C (accepted, real gap)**: a Review persona checkpoint declares and commits `.codepatrol/changes/<id>/apply/journal.md` — under Apply's own directory, before Apply has started. Accepted with no error; `git show --stat HEAD~1` on the checkpoint's own content commit confirms the file was actually created and committed there.
- `src/change/change.test.ts:14,121` is the only existing direct caller of `validateArtifactBindings` outside `orchestrator.ts` itself, exercising a single `delete`-intent case; no dedicated `validation.test.ts` exists.

## Proposed design

1. `src/change/validation.ts`: add an `enforceCompleteness: boolean = true` parameter, threaded through `validateWithReader` → `validateArtifactBindings` → `validateStageArtifacts` → (unchanged) `validateStageArtifactsFromReader`/`validateArtifactBindingsFromReader` keep their own default (`true`, unchanged call sites, unchanged behavior for Verify's re-validation of already-accepted attempts). Inside `validateWithReader`, wrap only the completeness loop (current line 39: `for (const path of reader.files(prefix)) if (!declared.has(path)) ...`) in `if (enforceCompleteness) { ... }`. Every per-binding check (ownership prefix, hash match, baseline create/modify/delete consistency) remains unconditional, for every caller.
2. `src/change/validation.ts`: add the same `enforceCompleteness: boolean = true` parameter to `validateWorkspaceArtifacts`, passed through to `validateStageArtifacts`.
3. `src/change/orchestrator.ts`, `buildCheckpointEvent`: replace the guarded call (`if (!personaCheckpoint) await validateWorkspaceArtifacts(...)`) with an unconditional call that always runs, passing `enforceCompleteness: !personaCheckpoint`:
   ```typescript
   await validateWorkspaceArtifacts(git, workspace, record, intent.stage, intent.artifacts, undefined, options.signal, !personaCheckpoint);
   ```
   Every other line in `buildCheckpointEvent` is unchanged: the `missing[]` required-artifact check, the "undeclared worktree paths" check, the mid-flight and final production-delta checks all keep their exact current persona-exemption behavior, confirmed sound and out of scope above.

### Invariants and failures

- Every checkpoint — persona or not — now rejects a declared artifact whose path does not start with that stage's own directory prefix (`.codepatrol/changes/<workId>/<stage>/`), throwing `CodepatrolError("CHANGE_DRIFT", "Artifact is not owned by <stage>: <path>", ...)`, matching the exact error the non-persona path has always produced.
- Every checkpoint — persona or not — now rejects a declared artifact whose `sha256` does not match the artifact's actual file content at commit time, throwing the same `CodepatrolError("CHANGE_DRIFT", "Artifact hash drift: <path>", ...)` the non-persona path has always produced.
- A persona checkpoint still does not require every file in the stage directory to be declared by the same call — an already-committed sibling persona's artifact is not flagged. This tolerance is unchanged and is not itself a validated-hash claim about that sibling file (it was validated at ITS OWN checkpoint time, under this same fix).
- The consolidating (non-persona) checkpoint's behavior is completely unchanged: it always ran with `enforceCompleteness: true` before this fix (since `personaCheckpoint` was already false for it) and continues to.
- No new error code, CLI flag, or persisted schema field is introduced; the same `CHANGE_DRIFT` code and the same underlying `validateWithReader` error messages are reused for the newly-enforced persona case.

## Alternatives

- **Also enforce the completeness check for persona checkpoints, requiring each persona to re-declare every sibling's already-committed artifact:** rejected — this would require every persona harness to discover and re-hash files it does not own before checkpointing its own report, coupling independent parallel personas to each other's completion order and breaking the existing, intentionally order-independent multi-persona test. The completeness check's purpose (catch an accidentally-undeclared file in the SAME commit) is already served for the one commit each persona actually controls; it does not need to also police siblings it has no authority over.
- **Validate ownership and hash only for Verify personas, not Review personas (since Verify is closer to Close):** rejected — both reproduced exploits used a Review persona, and the same code path (`buildCheckpointEvent`, `personaCheckpoint` computed identically for `review`/`verify`) is shared; there is no seam that would make one stage's persona checkpoints trustworthy and the other's not.
- **Fix this only by changing `model.ts` to retain persona artifacts on the projected attempt, relying on a later consolidation-time re-check instead:** rejected — the reproduced exploits show real content is committed to git (`git show --stat HEAD~1` in Exploit C) at persona-checkpoint time, before any later consolidation happens; retaining the projection alone would not stop the initial forged commit from landing, and a consolidator is not guaranteed to re-declare and thus re-check every prior persona's file (nothing requires it to).
- **Add a wholly separate `validatePersonaArtifacts` function instead of parameterizing the existing one:** rejected — the per-binding checks (ownership, hash, baseline consistency) are identical logic for persona and non-persona callers; duplicating them would create two implementations of the same security-relevant check that could silently drift apart. One function with one narrow, explicit toggle is the smaller surface.

## Simplicity decision

- Selected rung: local reuse
- Earlier rungs: no runtime/stdlib primitive or installed dependency is needed; the exact validation logic required (`validateWithReader`'s per-binding checks) already exists and is already exercised correctly by every non-persona checkpoint. The only need is to stop skipping it for personas while preserving the one specific, legitimate reason it was skipped (completeness).
- Irreducible complexity: `validation.ts` must remain the single place that knows how to check an artifact binding against real file content and stage ownership; `orchestrator.ts` must remain agnostic of those specifics and only decide *when* completeness is expected.
- Safety floor: no checkpoint (persona or not) may seal a commit containing a declared artifact whose path is not owned by its own stage directory or whose declared hash does not match its real content; the existing production/source-path boundary (confirmed sound) and the existing multi-persona completeness tolerance (confirmed necessary) must not regress; the full project gate remains mandatory.
- Expected surface delta: modify `src/change/validation.ts`, `src/change/orchestrator.ts`, and `src/change/orchestrator-parallel.test.ts`; no new file, dependency, configuration, or public interface beyond one new optional, defaulted parameter on two existing functions.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | A persona checkpoint's declared artifact bindings still are not retained on the projected `ChangeView.attempts[stage][].artifacts` (`model.ts`'s existing persona fold is unchanged) | A tool or harness that inspects only the projected view (not the raw event log) cannot see what a persona validated and sealed, even though it is now known-correct at commit time | A future need to programmatically audit persona-level artifact history without parsing the raw event log | Extend `model.ts`'s persona fold to also record validated persona bindings in a dedicated projected field (e.g. `personaArtifacts`), separate from the single consolidated `artifacts` field, as its own bounded Change |
| DC-2 | The "undeclared worktree paths" and mid-flight production-delta checks remain persona-exempt exactly as before; this fix does not narrow that exemption to "declared-by-this-persona or already-validated-by-a-prior-sibling-persona-this-attempt" | A persona checkpoint could still declare, alongside its own legitimate artifact, an *additional* artifact that happens to already exist with correct hash and correct stage-directory ownership but that it has no real authority to attest to (e.g., a `review-security` persona correctly re-declaring `review-architecture`'s already-committed, unmodified file with its real, matching hash) | A persona checkpoint observed declaring a sibling persona's artifact with a technically-correct hash but no legitimate authorship claim over it | Narrow the "undeclared worktree paths" allowance to exactly `{declared-by-this-call} ∪ {already-declared-by-a-prior-persona-sub-event-this-attempt}`, rejecting any persona-declared path that is neither, as its own bounded Change |

## Compatibility and rollout

- No CLI command, JSON envelope, or public interface signature changes visible to any external caller; `validateWorkspaceArtifacts`/`validateArtifactBindings`/`validateStageArtifacts`/`validateWithReader` all gain one new optional, defaulted parameter — every existing call site (including the `FromReader` variants used by Verify's re-validation of prior stages) compiles and behaves identically without modification.
- Every currently-valid persona checkpoint (one that legitimately declares only its own artifact, under its own stage directory, with a correct hash) continues to succeed identically; only a checkpoint that would have failed the same ownership/hash checks a non-persona checkpoint has always enforced newly fails.
- Rollback: reverting the implementation commit restores prior (unvalidated) persona-checkpoint behavior with no durable-data migration; no persisted schema changes.
- Observability: a persona checkpoint with a bad ownership or hash claim now fails loudly with the same `CHANGE_DRIFT` error and message shape the non-persona path has always produced, instead of silently succeeding — a strictly more informative failure mode for exactly the callers (persona review/verify harnesses) that were previously unchecked.

## Risks and mitigations

- Risk: enabling ownership+hash validation for persona checkpoints could reject a currently-passing legitimate multi-persona workflow if any of its declared artifacts happens to fail the per-binding checks for a reason unrelated to this fix (e.g. a baseline create/modify mismatch specific to persona timing). Mitigation: independently traced `orchestrator-parallel.test.ts`'s existing passing test against the per-binding logic (ownership prefix matches `review/`; hash is computed from real content via the test's own `binding()` helper; `intent: "create"` correctly has no baseline match at persona-checkpoint time) before proposing the fix — the existing test is expected to remain green unmodified, and is kept as the regression guard.
- Risk: the new `enforceCompleteness` parameter could be threaded incorrectly and accidentally weaken the `FromReader` path used by Verify's re-validation of already-accepted Plan/Review/Apply artifacts. Mitigation: `validateStageArtifactsFromReader`/`validateArtifactBindingsFromReader` are explicitly left unmodified at their current call sites (both omit the new parameter, so it defaults to `true`, identical to today); no code path reachable from Verify's re-validation logic passes `false`.
- Risk: characterizing Exploit B/C as direct orchestrator-level tests (rather than narrower `validation.ts`-level unit tests) could make the red/green signal noisier or slower. Mitigation: pair both a focused `validation.ts`-level test (asserting `enforceCompleteness: false` still enforces ownership/hash on a single binding) and an orchestrator-level regression test reproducing the exact two exploits end-to-end, so the fix is verified at both the unit boundary and the real integration boundary the exploits were found at.

## Acceptance criteria

- AC-1: Given a persona checkpoint (Review or Verify) that declares an artifact whose path is not prefixed under that stage's own directory, the transition is rejected with `CodepatrolError` code `CHANGE_DRIFT` and no commit is created for that content.
- AC-2: Given a persona checkpoint that declares an artifact whose `sha256` does not match the artifact's actual file content at commit time, the transition is rejected with `CodepatrolError` code `CHANGE_DRIFT` and no commit is created for that content.
- AC-3: Given a persona checkpoint that declares only its own legitimately-owned, correctly-hashed artifact, the transition succeeds identically to before this Change (same event shape, same commit behavior), even when a sibling persona's already-committed artifact exists undeclared in the same stage directory.
- AC-4: Given the existing `orchestrator-parallel.test.ts` two-persona-plus-consolidation workflow, it continues to pass unmodified after this fix.
- AC-5: Given a non-persona checkpoint (Plan, Apply, or a consolidating Review/Verify checkpoint), its validation behavior — including the completeness check — is unchanged from before this Change.
- AC-6: `npm run verify` passes with no modified production paths outside `src/change/validation.ts` and `src/change/orchestrator.ts`, and no dependency/configuration change.

## Decisions and open questions

- Decision: fix by parameterizing the existing shared validation function (`enforceCompleteness`), not by writing a separate persona-specific validator, keeping ownership/hash-checking logic in exactly one place.
- Decision: the "undeclared worktree paths" and production-delta checks remain persona-exempt exactly as today; narrowing them (DC-2) is a genuinely separate, more speculative concern deferred with its own trigger.
- Decision: retaining persona artifact bindings on the projected `ChangeView` (DC-1) is explicitly out of scope — this Change closes the *validation* gap (was it checked at all), not the *visibility* gap (can a later reader see what was checked without parsing the raw log).
- No open question remains that can materially change scope, interfaces, or acceptance.
