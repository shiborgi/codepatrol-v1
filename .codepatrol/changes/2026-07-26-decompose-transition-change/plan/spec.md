# Specification — Decompose `transitionChangeLocked`: separate validation, persona semantics, and storage responsibilities

## Intent

- Origin: improve-codebase
- Mode: architecture
- Target baseline: `main` @ `25b26fc` (branch `codepatrol/2026-07-26-decompose-transition-change`), clean tree, `npm run verify` green (215/215)
- Governing constraints: none beyond the general Change contract; no ADR exists in this repo. This function is the single highest-blast-radius seam in the codebase (every lifecycle transition — begin, usage, checkpoint, return, block, resume — across every stage, from every skill and test, funnels through it), so the governing discipline for this Change is **behavior-preservation, provable by the existing test suite, not a redesign**.
- Substrate state: graph not re-synced for this investigation — the target function and its exact boundaries were located and read directly (`src/change/orchestrator.ts:219-307`), which is more precise than a graph-derived estimate for a single-function line-range question.
- Improvement signals: not applicable — this Change was picked directly from the backlog (`orchestrator-transitionchangelocked-is-dense-and-mixes-validation-persona-semantics-and-storage-responsibilities`), not from a fresh improvement-report read; the item has been open and re-confirmed unchanged across three prior assessments (v1 2026-07-24, v2 2026-07-24, v3 2026-07-26) without ever being picked up until now.
- Problem: `transitionChangeLocked` (`orchestrator.ts:219-307`) is 89 lines and interleaves four genuinely distinct concerns inline: (1) idempotent-retry recovery when a transition is re-submitted after a partial prior success, (2) persona-aware stage-matching validation (parallel review/verify personas may submit sub-events out of strict stage lockstep), (3) a consolidation-divergence guard specific to persona sub-events, and (4) the entire checkpoint-sealing pipeline (required-artifact check, workspace artifact validation, undeclared-path detection, production-delta reconciliation, the Apply gate's process execution, the Git add/commit/tree sequence, and a final post-commit delta re-verification) — accounting for 42 of the 89 lines by itself. A fifth, incidental defect was found while reading this exact block: a local variable `declared` (`orchestrator.ts:261`, `new Set(intent.artifacts.map(...))`) is computed but never read anywhere in the function — confirmed by `grep -n "\bdeclared\b" src/change/orchestrator.ts` returning only its own definition line, distinct from the separately-used `declaredProduction` variable.
- Outcome: `transitionChangeLocked` becomes a short orchestrating dispatcher (target: under 35 lines, down from 89) that calls four newly-named, single-responsibility private helper functions, each directly addressing one of the concerns the backlog title names. Zero externally observable behavior changes — every error code, message, control-flow branch, and side-effect ordering is preserved exactly. The dead `declared` variable is removed as a zero-risk incidental fix within the same touched block.

## Scope

### In scope

- Extract `recoverIdempotentTransition` (storage/idempotency concern) from `orchestrator.ts:223-230`.
- Extract `assertPersonaStageMatch` (persona semantics) from `orchestrator.ts:231-242`.
- Extract `assertNoConsolidationDivergence` (persona semantics) from `orchestrator.ts:244-250`.
- Extract `buildCheckpointEvent` (storage responsibilities) from `orchestrator.ts:252-294`.
- Remove the dead `declared` local variable as part of the `buildCheckpointEvent` extraction (it was never read; removing it during the move it already required is zero-risk and directly in the touched block).
- All four extractions are private (module-internal, unexported) functions placed immediately before `transitionChangeLocked`, matching this file's existing top-down convention (every other helper — `assertCurrentBranch`, `validateCheckpointLineage`, `materializeBaseline`, etc. — is defined before its first caller in the same file, never exported).

### Out of scope

- Extracting the function's ~3-line preamble (git-adapter setup, record read, branch/lineage/candidate assertions, `orchestrator.ts:220-222`) — short enough that extracting it would add indirection without reducing real density; a judgment call favoring the earliest sufficient rung over exhaustive decomposition.
- Extracting the final persist-and-return line (`orchestrator.ts:306`) or the five short non-checkpoint event-builder branches (`begin`/`usage`/`return`/`block`/`resume`, `orchestrator.ts:295-305`) — each is already 1-3 lines; extracting one-liners into named functions would not improve readability, matching the same judgment call.
- Any change to the *content* of any validation, error code, error message, or control-flow order — this is a pure structural move, not a logic change. If any evidence surfaced during Apply suggested a genuine behavior difference were needed, that is a contract defect requiring a return to Plan, not a silent "while I'm here" fix.
- Further decomposing `buildCheckpointEvent` itself (still ~42 lines after extraction) into smaller pieces — its sub-steps (artifact validation, production-delta computation, gate execution, Git commit, final re-verification) are tightly sequentially coupled around shared local state (`paths`, `allowed`, `prior`, `declaredProduction`); splitting further would require threading that state through additional function boundaries for a shrinking readability return, an over-decomposition risk explicitly warned against by this repo's `codebase-design` vocabulary.
- Any other open backlog item (F2 validation.ts, N1 dead taxonomy, N2 test-coverage gaps, workflow telemetry items) — independent, unrelated files.

## Current evidence

- `src/change/orchestrator.ts:219-307` — `transitionChangeLocked`, 89 lines, read in full. Confirmed by `awk '/^async function transitionChangeLocked/{start=NR} start && /^}/{print NR-start+1; exit}' src/change/orchestrator.ts` → `89`.
- `src/change/orchestrator.ts:223-230` — idempotent recovery block: `eventMatchesIntent` check, `git.status`/`parseStatusPaths`, two early-return-`view` cases, one `commitMetadata`-then-return case, one `CHANGE_CONFLICT` throw case. Self-contained: reads only `record`, `view`, `intent`, `git`, `workId`, `options`; the only external function calls (`eventMatchesIntent`, `parseStatusPaths`, `commitMetadata`, `relativeRecord`) are already module-level helpers callable from anywhere in the file.
- `src/change/orchestrator.ts:231-242` — persona/stage-match validation. Reads `intent`, `view.stage`, `view.attempts`, `record.events`; calls `personaSubEvents` (already a module helper, `orchestrator.ts:80`). Computes and needs to return `persona` (`(intent as { persona?: string }).persona`), since every subsequent branch in the original function (lines 244, 260, 269, 294, 302, 304) reads that same `persona` value — confirmed by `grep -n "\bpersona\b" src/change/orchestrator.ts` showing 9 uses after its computation at line 231, all within `transitionChangeLocked`.
- `src/change/orchestrator.ts:244-250` — consolidation-divergence guard. Reads `persona` (from the block above), `intent`, `record.events`, `view.attempt`; calls `personaSubEvents` and `isDivergentPersonaEvent` (`orchestrator.ts:83`), throws `CONSOLIDATION_AFTER_SUBEVENTS` — the exact error code memory records as the site of a prior critical defect (`2026-07-24-aggregate-and-push`'s Verify returns), making this block's isolation and preservation especially important to get right.
- `src/change/orchestrator.ts:252-294` — the checkpoint-sealing pipeline, 42 lines (roughly half the function). Self-contained: every local it declares (`required`, `personaCheckpoint`, `declared` [dead], `missing`, `paths`, `allowed`, `prior`, `dirty`, `committed`, `candidate`, `unexpected`, `actualProduction`, `declaredProduction`, `gateSummary`, `committedPaths`, `checkpoint`, `tree`, `finalDelta`, `unexpectedFinal`, `finalProduction`) is read only within these 42 lines — confirmed by reading the surrounding code (lines 295-306) and finding zero references to any of these names outside the block. It calls `validateWorkspaceArtifacts` (`orchestrator.ts:117`), `ensurePath` (`orchestrator.ts:26`), `baselineRef` (`orchestrator.ts:100`), `loadConfig` (imported), `defaultGateRunner`/`gateOutputTail` (imported), `eventBase` (`orchestrator.ts:22`) — all already module-level or imported, callable from an extracted function identically.
- `grep -n "\bdeclared\b" src/change/orchestrator.ts` → exactly 2 lines: the definition (`261`) and an unrelated variable with a similar name, `declaredProduction` (`269`, `293`) which the grep's word-boundary correctly distinguishes as a *different* identifier (`declared` vs `declaredProduction` — the `\b` boundary means `declared` alone never matches inside `declaredProduction`, confirmed the two greps return disjoint line sets). `declared` itself is read nowhere.
- `TransitionIntent`'s checkpoint variant (`src/change/types.ts:48`) — `{ type: "checkpoint"; actor: string; stage: Exclude<Stage, "close">; result: StageCheckpointedEvent["result"]; artifacts: ArtifactBinding[]; changes?: string[]; nextAction: string; persona?: string }`. `Extract<TransitionIntent, { type: "checkpoint" }>` is the precise type for the extracted `buildCheckpointEvent`'s `intent` parameter, preserving the same compile-time narrowing the original inline `if (intent.type === "checkpoint")` provided, with no redundant runtime re-check needed inside the extracted function.
- Regression surface (files whose tests exercise `transitionChange` end-to-end, confirmed by reading their imports): `src/change/change.test.ts`, `src/change/orchestrator-parallel.test.ts`, `src/change/apply-gate.test.ts`, `src/change/apply-gate-enforcement.test.ts`, `src/change/close-integration.test.ts`, `src/change/close-push.test.ts`, `src/change/git.test.ts`, `src/change/backlog-close-integration.test.ts`, `src/change/start-backlog-link.test.ts` — none require modification (pure internal refactor; they characterize behavior, they do not test internal structure), but each is explicitly named here as the regression surface this Change's single verification gate (`npm run verify`, full 215-test suite) must keep green.
- Precedent: `2026-07-24-persona-subevent-helpers` (closed) already extracted `personaSubEvents`/`isDivergentPersonaEvent` from inline duplication in this exact function for the same reason (behavior-preserving DRY extraction in a high-stakes area); this Change follows the identical discipline for the remaining dense blocks. `2026-07-24-migration-normalizer` established the "characterization tests, no new test file" pattern for a behavior-preserving internal refactor in this codebase, reused here.

## Proposed design

Insert four new private functions in `src/change/orchestrator.ts`, placed immediately before `transitionChangeLocked` (after `assertCurrentBranch`, matching the file's top-down helper-before-caller convention):

1. `async function recoverIdempotentTransition(git: GitAdapter, workId: string, record: ChangeRecordV2, view: ChangeView, intent: TransitionIntent, options: OperationOptions): Promise<ChangeView | undefined>` — body is `orchestrator.ts:223-230` verbatim, restructured as an early-return guard (`if (!eventMatchesIntent(...)) return undefined;`) instead of a wrapping `if`. Caller: `const recovered = await recoverIdempotentTransition(git, workId, record, view, intent, options); if (recovered) return recovered;`
2. `function assertPersonaStageMatch(record: ChangeRecordV2, view: ChangeView, intent: TransitionIntent): string | undefined` — body is `orchestrator.ts:231-242` verbatim, returning the computed `persona` value. Caller: `const persona = assertPersonaStageMatch(record, view, intent);`
3. `function assertNoConsolidationDivergence(record: ChangeRecordV2, view: ChangeView, intent: TransitionIntent, persona: string | undefined): void` — body is `orchestrator.ts:244-250` verbatim (guard-clause restructured, same throw). Caller: `assertNoConsolidationDivergence(record, view, intent, persona);`
4. `async function buildCheckpointEvent(git: GitAdapter, workspace: string, workId: string, record: ChangeRecordV2, view: ChangeView, intent: Extract<TransitionIntent, { type: "checkpoint" }>, persona: string | undefined, options: OperationOptions): Promise<ChangeEvent>` — body is `orchestrator.ts:252-294` verbatim, with the dead `const declared = new Set(...)` line dropped, ending in `return { ...eventBase(...), type: "stage-checkpointed", ... };` instead of assigning to `event`. Caller: `if (intent.type === "checkpoint") event = await buildCheckpointEvent(git, workspace, workId, record, view, intent, persona, options);` (replacing the entire former inline branch).

`transitionChangeLocked` becomes: preamble (unchanged) → `recoverIdempotentTransition` call with early return → `persona = assertPersonaStageMatch(...)` → `assertNoConsolidationDivergence(...)` → the `if/else if` event-type dispatch (checkpoint branch now one line calling `buildCheckpointEvent`; the five other branches unchanged, already short) → the unchanged persist-and-return line.

## Alternatives

- **Redesign the state machine / transition contract itself** (e.g., a formal state-machine library, or restructuring the event-type dispatch into a lookup table of handler functions): rejected — explicitly out of scope per this backlog item's own framing (v2's assessment scoped this finding as "decomposition, NOT the state machine redesign", and `2026-07-24-migration-normalizer`'s Plan independently re-confirmed this same scoping decision when it worked adjacent to this function). A redesign changes the contract's shape, not just its internal structure, and this codebase's highest-blast-radius function is the wrong place to combine a structural cleanup with a design change.
- **Extract every block, including the 3-line preamble and the five one-line event branches**: rejected — see Scope's Out of scope; extracting one-to-three-line blocks trades zero real density for pure indirection, failing the "earliest sufficient rung" test.
- **Write new unit tests directly against the four new private functions** (would require exporting them): rejected — every other helper in this file is private and tested only indirectly through the public `transitionChange`/`startChange`/`closeChange` surface; exporting these four purely to unit-test them would be a scope-creeping interface change unrelated to the stated goal (reducing density/mixing), and the existing 215-test suite already exercises every branch these functions preserve, verbatim, as characterization coverage.

## Simplicity decision

- Selected rung: direct local change
- Earlier rungs: not applicable to a pure structural refactor — there is no "ladder" of increasingly heavy mechanisms for extracting existing logic into named functions within the same file.
- Irreducible complexity: the checkpoint-sealing pipeline's 42 lines remain inherently sequential and stateful (artifact validation → production-delta check → gate execution → Git commit → post-commit re-verification) — this is real, load-bearing complexity the Change contract requires, not accidental complexity to eliminate; the extraction gives it a name and a boundary without pretending it can be smaller than the job it does.
- Safety floor: zero behavior change is the explicit safety floor for this Change — verified by the unchanged 215-test suite, not merely assumed from the refactor being "obviously" safe.
- Expected surface delta: `src/change/orchestrator.ts` only (no other file). Net line count: roughly unchanged in total (extraction moves lines, does not remove logic, except for the 1-line dead `declared` removal) — `transitionChangeLocked` itself shrinks from 89 to an estimated ~25-30 lines; four new named functions totaling roughly the same line count appear immediately above it.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | `buildCheckpointEvent` (42 lines) is extracted as one function, not decomposed further | If the checkpoint-sealing pipeline grows further (e.g., a second gate type, a new validation phase), it could re-approach the density this Change is fixing | A future Change needs to add a materially new phase to checkpoint sealing and finds the function hard to extend cleanly | Decompose `buildCheckpointEvent` at that point along the new phase boundary, informed by the actual new requirement rather than speculatively now |

## Compatibility and rollout

- No migration, no runtime behavior change (this is proven, not merely claimed, by AC-4's identical test count).
- No config, no schema, no event, no checkpoint, no public interface change — `transitionChange`'s exported signature and every `TransitionIntent`/`ChangeEvent` shape are untouched.
- Rollback: revert the single commit; the four helpers disappear and their bodies return inline, byte-identical to today.
- Observability: not applicable — no runtime-visible behavior changes.

## Risks and mitigations

- Risk: a subtle behavior change during the manual move (e.g., an operator precedence slip, a dropped `await`, a wrong variable captured by closure). Mitigation: the plan's Apply task is written as a literal copy-and-relocate instruction citing exact original line ranges, not a re-derivation from description — the implementer transcribes, does not re-implement; the full 215-test suite (this function's comprehensive existing characterization) is the acceptance gate, run after every extraction step, not just once at the end.
- Risk: this exact function has hosted a prior critical defect (the `CONSOLIDATION_AFTER_SUBEVENTS` incident referenced in project memory, `2026-07-24-aggregate-and-push`). Mitigation: `assertNoConsolidationDivergence` (the block containing that exact error code) is extracted with explicit extra scrutiny in the plan's steps — its guard-clause restructuring is checked against the original's nested-if form line by line, not just "looks equivalent."
- Risk: `Extract<TransitionIntent, { type: "checkpoint" }>` might not narrow as expected if `TransitionIntent`'s union shape changes incompatibly. Mitigation: `npm run typecheck` (part of `npm run verify`) would fail loudly on any narrowing mismatch — a compile-time safety net, not a runtime one, appropriate for a type-level risk.

## Acceptance criteria

- AC-1: `transitionChangeLocked`'s body no longer contains the four extracted logic blocks inline; each is replaced by a call to its correspondingly-named helper (`recoverIdempotentTransition`, `assertPersonaStageMatch`, `assertNoConsolidationDivergence`, `buildCheckpointEvent`), confirmed by reading the post-refactor function.
- AC-2: `transitionChangeLocked`'s own line count (measured the same way as the Current evidence baseline, `awk '/^async function transitionChangeLocked/{start=NR} start && /^}/{print NR-start+1; exit}'`) is under 35, down from 89.
- AC-3: `grep -n "\bdeclared\b" src/change/orchestrator.ts` no longer matches the dead `declared` variable (the `declaredProduction` occurrences remain, correctly distinct).
- AC-4: `npm run verify` (typecheck + full test suite + build + smoke-cli + lint-skills) passes with the identical test count as the base commit (215/215, 0 failures) — proving zero behavior change, not merely that it compiles.
- AC-5: `git diff --stat` against this Change's base commit touches only `src/change/orchestrator.ts` — no test file requires any modification.

## Decisions and open questions

- Decision: pure structural extraction only, explicitly not a state-machine redesign — see Alternatives, matching this backlog item's own historical scoping across three prior assessments.
- Decision: the four extraction boundaries (not more, not fewer) target exactly the three concerns the backlog title names (persona semantics ×2, storage responsibilities ×2 [idempotency recovery + checkpoint sealing]) while leaving genuinely-short blocks inline — see Scope.
- Decision: no new test file; the existing 215-test suite is the characterization gate — see Alternatives.
- No open questions remain that could change scope, interfaces, or acceptance.
