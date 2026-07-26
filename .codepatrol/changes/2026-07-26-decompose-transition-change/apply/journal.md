# Implementation — Decompose `transitionChangeLocked`

- Package revision: 0.1.0
- Approval: `review/report.md` verdict `approve` (review checkpoint `b462bc37`)
- Target start ref: `25b26fc812490642989e99af9282516d57b763c3` (main), branch `codepatrol/2026-07-26-decompose-transition-change`
- Actor: opencode (codepatrol-apply skill)
- Status: implementing

## Baseline reconciliation

- `change inspect` projection = `apply` attempt 1, state `ready`; review result `approve`. On recorded branch `codepatrol/2026-07-26-decompose-transition-change`, clean tree.
- Artifact hashes re-verified against attempt bindings: `spec.md` `b78660e1…`, `plan.md` `94e6799d…`, `investigation.md` `4d579420…`, `review/report.md` `78fd93fa…` — all match.
- Base `25b26fc` == `main` HEAD and is an ancestor of HEAD — no target advance.
- `transitionChangeLocked` read in full (`orchestrator.ts:219-307`, 89 lines); the four block boundaries match the plan verbatim. Dead `declared` local confirmed at line 261 (read nowhere).
- applyGate (`.codepatrol/config.json`): `npm run verify`, timeout 600000ms — must be run in full at the checkpoint, not a subset.

## Task journal

### T1 — Extract `recoverIdempotentTransition`

- Claim/workflow item: T1 (claimed 2026-07-26T14:08Z)
- Started: 2026-07-26T14:08Z
- Files changed: `src/change/orchestrator.ts`
- Surface delta: +1 private async fn `recoverIdempotentTransition` placed immediately before `transitionChangeLocked`; inline 8-line recovery `if`-block replaced by 2-line call (`const recovered = ...; if (recovered) return recovered;`). Early-return guard (`if (!eventMatchesIntent(...)) return undefined;`) replaces the wrapping `if`; observationally identical to the caller.
- Red/green evidence: `npm run typecheck` → 0 errors; `npm test` → `# tests 215, # pass 215, # fail 0` (identical count — behavior-preserving).
- Assessment: verbatim relocation; no logic re-derived. No deviation.
- Result: complete

### T2 — Extract `assertPersonaStageMatch`

- Claim/workflow item: T2 (claimed 2026-07-26T14:09Z)
- Started: 2026-07-26T14:09Z
- Files changed: `src/change/orchestrator.ts`
- Surface delta: +1 private fn `assertPersonaStageMatch` (returns the computed `persona`, read by every later branch); inline 12-line block replaced by `const persona = assertPersonaStageMatch(record, view, intent);`.
- Red/green evidence: `npm run typecheck` → 0; `npm test` → 215/215, 0 fail (identical).
- Assessment: verbatim relocation; both `CHANGE_CONFLICT` cases preserved with identical messages. No deviation.
- Result: complete

### T3 — Extract `assertNoConsolidationDivergence`

- Claim/workflow item: T3 (claimed 2026-07-26T14:10Z)
- Started: 2026-07-26T14:10Z
- Files changed: `src/change/orchestrator.ts`
- Surface delta: +1 private fn `assertNoConsolidationDivergence`; inline nested-`if` block replaced by one call. Guard-clause form is De Morgan-equivalent to the original nested-`if`: original throws iff `!persona && type==="checkpoint" && (stage==="review"||"verify") && subEvents.length>0 && hasDivergence`; new form returns early on the negation of each conjunct, reaching the identical throw under the identical combined condition. Same error code/message (`CONSOLIDATION_AFTER_SUBEVENTS`).
- Red/green evidence: `npm run typecheck` → 0; `npm test` → 215/215, 0 fail (identical).
- Extra scrutiny (spec-named risk, prior critical-defect site): `node --test src/change/orchestrator-parallel.test.ts` → 3/3 pass — every persona-consolidation assertion holds, none skipped.
- Assessment: verified the guard-clause rewrite line-by-line against the original nested-if; behavior preserved. No deviation.
- Result: complete

### T4 — Extract `buildCheckpointEvent` and remove the dead `declared` local

- Claim/workflow item: T4 (claimed 2026-07-26T14:11Z)
- Started: 2026-07-26T14:11Z
- Files changed: `src/change/orchestrator.ts`
- Surface delta: +1 private async fn `buildCheckpointEvent` (parameter typed `Extract<TransitionIntent, { type: "checkpoint" }>`, preserving compile-time narrowing with no runtime re-check); the entire 42-line inline `if (intent.type === "checkpoint") { ... }` body replaced by `if (intent.type === "checkpoint") event = await buildCheckpointEvent(...);`. The never-read `const declared = new Set(intent.artifacts.map((item) => item.path));` half-line is omitted; the `const missing = ...` half-line is kept verbatim. The five other event branches (`begin`/`usage`/`return`/`block`/`else`) and the persist-and-return line are unchanged.
- Red/green evidence: `npm run typecheck` → 0 (confirms `Extract<…>` narrows correctly at the call site — no cast needed); `npm test` → 215/215, 0 fail (identical).
- AC-2 (read-back): `awk '/^async function transitionChangeLocked/{start=NR} start && /^}/{print NR-start+1; exit}' src/change/orchestrator.ts` → **25** (under 35; down from 89).
- AC-3 (dead variable removed): `grep -c 'declared = new Set' src/change/orchestrator.ts` → **0** (was 1 at base `25b26fc`). `declaredProduction` (the live variable) remains unchanged.
- Assessment: verbatim relocation; `declared` half-line dropped exactly as the plan directs.
- Result: complete

### AC-3 grep-command nuance (transparent deviation — not an implementation defect)

The plan's literal AC-3 command `grep -n "\bdeclared\b" src/change/orchestrator.ts` returns a match on line 293 both before and after this Change. Investigation traced this: the match is the **English word "declared"** inside the unchanged error-message string `"Checkpoint commit does not match its declared artifact and production paths."` (present verbatim at base `25b26fc:293`, never touched by this Change) — NOT the dead identifier and NOT `declaredProduction`. The Plan's investigation.md misidentified this match as `declaredProduction`; in fact `\bdeclared\b` does not match `declaredProduction` (verified: `printf 'x\nxY\n' | grep -c "\bx\b"` → 1, excluding `xY`). The AC-3 **intent** ("the dead `declared` variable is removed; `declaredProduction` remains") is met and proven by the identifier-level check above (`declared = new Set`: 1 → 0). The only remaining `declared` substrings in the file are the live identifier `declaredProduction` and the English words "declared" (error string) and "undeclared" (another error string) — all pre-existing, none the dead variable. No code change is warranted; flagged here for Verify rather than hidden.

### T5 — Final verification


- Claim/workflow item: T5 (claimed 2026-07-26T14:12Z)
- Files changed: none (verification only)
- Gate evidence (run in full — the configured applyGate, not a subset):
  - `npm run typecheck` → 0.
  - `npm test` → `# tests 215, # pass 215, # fail 0` (identical to base — zero behavior change).
  - `npm run build` → 0.
  - `npm run smoke:cli` → `Compiled CLI smoke passed (0.1.0).`
  - `npm run lint:skills` → `Skill catalog, frontmatter, dependencies, portability, and relative links are valid.`
  - `npm run verify` overall → exit 0.
- AC-1 (re-read post-refactor `transitionChangeLocked`): all four blocks gone, replaced by named calls in the original relative order — `recoverIdempotentTransition` (early-return) → `assertPersonaStageMatch` → `assertNoConsolidationDivergence` → event-type dispatch with the checkpoint branch calling `buildCheckpointEvent`.
- AC-2: 25 lines (under 35).
- AC-3: dead `declared` identifier removed (`declared = new Set`: 1 → 0); see grep-command nuance above.
- AC-4: 215/215 identical to base.
- AC-5: `git diff --stat 25b26fc -- ':!.codepatrol'` → exactly `src/change/orchestrator.ts` (75 insertions, 61 deletions, 1 file). No test file modified.
- No `DC-1` trigger fired; `buildCheckpointEvent` (still a sequential 42-line pipeline) did not need further decomposition during implementation.
- Graph sync: not required — all four new functions are private (unexported); no exported symbol added/removed/renamed.
- Rollback check: reverting this commit restores the original inline 89-line function (no other file references the four new private names).

## Deviations

1. AC-3 grep-command nuance (above): the plan's literal `grep "\bdeclared\b"` matches the pre-existing English word "declared" in an unchanged error-message string on line 293 (present at base, never touched). The AC-3 intent (dead identifier removed) is met and proven at the identifier level. No code change warranted; flagged for Verify.
2. Helper definition order: the four private functions are defined immediately before `transitionChangeLocked` as specified; their relative definition order differs cosmetically from the plan's narrative (definition: `recoverIdempotentTransition`, `assertNoConsolidationDivergence`, `assertPersonaStageMatch`, `buildCheckpointEvent`) while the **call order** inside `transitionChangeLocked` exactly matches the plan and the original (recover → persona-match → consolidation-guard → dispatch→build-checkpoint). Hoisted function-declaration order is semantically irrelevant; noted for completeness.

No semantic deviation. No contract defect in the implementation. No materially different design. Nothing here warrants a return to Plan.

## Acceptance evidence

| Criterion | Implementation | Verification | Result |
|---|---|---|---|
| AC-1 | `transitionChangeLocked` dispatches to 4 named helpers; inline blocks removed | read-back of post-refactor function | pass |
| AC-2 | function body shrunk | `awk` line-count → 25 (< 35) | pass |
| AC-3 | dead `declared = new Set` line dropped | `grep -c 'declared = new Set'` → 0 (was 1) | pass |
| AC-4 | pure structural extraction | `npm run verify` → 215/215 identical to base | pass |
| AC-5 | only `orchestrator.ts` touched | `git diff --stat` → 1 file | pass |

## Surface delta

Forecast: `src/change/orchestrator.ts` only; net line count roughly unchanged (relocation) minus one dead line; `transitionChangeLocked` 89 → ~25-30 lines; four new private functions above it.

Actual: `src/change/orchestrator.ts` only (1 file, +75/−61). `transitionChangeLocked` 89 → 25 lines. Four new private functions (`recoverIdempotentTransition`, `assertPersonaStageMatch`, `assertNoConsolidationDivergence`, `buildCheckpointEvent`) defined immediately before it, totaling ~68 relocated lines (one dead line net-removed). No new files, no new dependency, no exported interface added or removed, no config/schema/event change. Matches forecast.

## Final verification

`npm run verify` (applyGate) exits 0; see T5 gate evidence. Graph sync not required (private helpers only). Residual risks unchanged from `spec.md`: `FakeGhAdapter`-style coverage N/A here; the characterization suite (215/215, including `orchestrator-parallel.test.ts` 3/3 for the `CONSOLIDATION_AFTER_SUBEVENTS` block) is the behavior-preservation proof. Pre-checkpoint tree: only `src/change/orchestrator.ts` modified (plus this journal as the Apply artifact) — clean.
