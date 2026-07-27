# Apply journal

## T1 — Add `enforceCompleteness` to the shared artifact validator

- Red first: new `change.test.ts` case `enforceCompleteness skips only the undeclared-file loop, never the per-binding checks` failed with `false !== true` — the sixth argument is ignored by the current signatures, so the completeness error for the undeclared `review/b.md` still fired. (Runtime-ignored extra arg is the plan's accepted red form under jiti.)
- Production (`src/change/validation.ts`): `validateWithReader`, `validateArtifactBindings`, and `validateStageArtifacts` each gained trailing `enforceCompleteness: boolean = true`, threaded through the chain; only the `Undeclared durable artifact` loop is wrapped in `if (enforceCompleteness)`. Per-binding checks (ownership prefix, hash match, baseline create/modify/delete consistency) remain unconditional. `validateArtifactBindingsFromReader`/`validateStageArtifactsFromReader` and their `validateWithReader` call are untouched (default `true`).
- Green: `node --test --import jiti/register src/change/change.test.ts` 31/31 pass — default still flags `b.md` undeclared; `false` tolerates it while a wrong-hash binding still reports `Artifact hash drift`. `npm run typecheck` clean.
- Changed paths: `src/change/validation.ts`, `src/change/change.test.ts`.

## T2 — Enforce validation for persona checkpoints and reproduce the exploits as red tests

- Red first: 3 new `orchestrator-parallel.test.ts` cases (plus a shared `advanceToReview` setup helper). Exactly the two exploit cases failed pre-fix — the forged-`sha256` (`"f".repeat(64)`) persona checkpoint and the cross-stage `apply/journal.md` persona checkpoint both *fulfilled* instead of rejecting, confirming `assert.rejects` red; the legitimate-artifact case and both pre-existing tests passed as predicted characterizations.
- Production (`src/change/orchestrator.ts`): `validateWorkspaceArtifacts` gained trailing `enforceCompleteness: boolean = true`, threaded into its `validateStageArtifacts` call; `buildCheckpointEvent`'s guarded call became unconditional — `await validateWorkspaceArtifacts(..., options.signal, !personaCheckpoint)`. Nothing else in the function changed: `missing[]`, "undeclared worktree paths", both production-delta checks, and commit staging keep their exact persona-exemption behavior.
- Green: `node --test --import jiti/register src/change/orchestrator-parallel.test.ts src/change/change.test.ts` 37/37 pass — both exploits now reject with `CHANGE_DRIFT` before any commit (rev-list count unchanged across the rejection), the legitimate persona artifact still seals with the attempt `active`, and the two-persona-plus-consolidation workflow passes unmodified (AC-4). `npm run typecheck` clean.
- Changed paths: `src/change/orchestrator.ts`, `src/change/orchestrator-parallel.test.ts`.

## T3 — Final verification

- Focused suite: `change.test.ts` + `orchestrator-parallel.test.ts` 37/37 pass.
- `npm run verify` (the configured `applyGate`): typecheck, 251/251 tests (247 baseline + 1 validator characterization + 3 persona cases), build, compiled CLI smoke, skill lint — 0 failures. `git diff --check` clean.
- Working-tree surface is exactly the four declared paths — `src/change/validation.ts`, `src/change/orchestrator.ts`, `src/change/change.test.ts`, `src/change/orchestrator-parallel.test.ts` — plus Change-owned `apply/journal.md`; no dependency or configuration change.
- AC mapping: AC-1 → cross-stage persona case rejects `CHANGE_DRIFT` pre-commit; AC-2 → forged-hash persona case rejects `CHANGE_DRIFT` pre-commit; AC-3 → legitimate persona artifact seals with attempt `active` alongside sibling tolerance; AC-4 → two-persona-plus-consolidation test passes unmodified; AC-5 → default `enforceCompleteness: true` characterization + unchanged non-persona call sites; AC-6 → this gate + path reconciliation.
- DC-1/DC-2: neither fired — no need to retain persona bindings on the projected view, and no need to narrow the undeclared-worktree-paths allowance, to satisfy any criterion.
- Rollback: reverting the implementation commit restores prior unvalidated persona-checkpoint behavior; no persisted schema changed. Residual risks: only the accepted DC-2 ceiling (correct-hash sibling attestation), with its own trigger and follow-up.
