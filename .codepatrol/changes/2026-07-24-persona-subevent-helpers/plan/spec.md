# Specification — Extract duplicated persona sub-event and divergence predicates into single helpers

## Intent

- Origin: improve-codebase
- Mode: architecture
- Target baseline: `main` @ `6fb2d8a117f1d07440c72dd9df7a1ce8d0659327`; clean worktree; `npm run verify` green at baseline.
- Governing constraints: `CONTEXT.md` domain vocabulary (Stage Attempt, persona sub-events, Approve/Fix-first/Rework); `AGENTS.md` parallel-persona rules (Review/Verify may contain persona-specific sub-events). No ADRs (`docs/adr/` absent). None block this design.
- Substrate state: graph synced (73 files, 1838 symbols); wiki absent (valid substrate state).
- Improvement signals (most recent report `docs/codepatrol/improvement-reports/2026-07-24-migration-normalizer.md`):
  - Command `change.transition` invoked 13 times — consider caching or batching repeated invocations. (Not addressed here; recorded.)
  - No returns or notable errors in that report.
- Problem: The persona sub-event predicate is duplicated three times in `transitionChangeLocked` (`src/change/orchestrator.ts:215, 226, 281`) and the "divergence" predicate twice (`:228, :281`). This is the scattered, subtle logic whose earlier gap produced the critical `CONSOLIDATION_AFTER_SUBEVENTS` defect (a stray no-persona checkpoint silently overriding a persona fix-first return). Two of the three consolidation behaviors are covered by `orchestrator-parallel.test.ts`, but the reason-aggregation site (`:281`) — which reuses both predicates to collect persona return reasons onto a consolidating non-persona return — has no test. This is assessment finding F4.
- Outcome: The persona sub-event filter and the divergence test each exist as a single named helper reused at all sites, and the previously untested reason-aggregation path is locked by a characterization test, with behavior unchanged and the full gate green.

## Scope

### In scope

- Two module-private helpers in `src/change/orchestrator.ts`: `personaSubEvents(events, stage, attempt)` (the shared persona checkpoint/return filter) and `isDivergentPersonaEvent(event)` (a persona return, or a checkpoint whose result is not `approve`/`commit`/`implemented`/`ready`).
- Replace the three inline persona-sub-event filters and the two inline divergence predicates with calls to these helpers, preserving exact behavior.
- One characterization test closing the coverage gap at `orchestrator.ts:281` (reason aggregation from persona sub-events onto a non-persona return).

### Out of scope

- The minimal persona short-circuits inside `foldChange` (`src/change/model.ts:102-106, 122-126`) — distinct, non-duplicated logic; not touched.
- Any change to persona semantics, consolidation rules, divergence definition, the `CONSOLIDATION_AFTER_SUBEVENTS` behavior, event schema, or lifecycle.
- The broader `transitionChangeLocked` decomposition (assessment F3's other half) — deferred.
- Findings F2, F6, F7 — separate follow-ups (F2 remains an external data gap).

## Current evidence

- `src/change/orchestrator.ts:215` — persona sub-event filter (guard against a bare non-persona transition arriving mid-persona-round).
- `src/change/orchestrator.ts:226-229` — identical filter, then divergence check that throws `CONSOLIDATION_AFTER_SUBEVENTS`.
- `src/change/orchestrator.ts:281` — same filter combined with the same divergence predicate to aggregate persona return `reasons` onto a non-persona `stage-returned` event.
- Filter predicate (all three): `(type === "stage-checkpointed" || type === "stage-returned") && persona && stage === intent.stage && attempt === view.attempt`. Divergence predicate (both sites): `type === "stage-returned" || (type === "stage-checkpointed" && result ∉ {approve, commit, implemented, ready})`. Confidence: high (read).
- `src/change/orchestrator-parallel.test.ts:18-55` — locks the happy path: two persona approves stay active, then a non-persona approve consolidates and advances the stage. `:57-84` — locks divergence: a persona fix-first return then a non-persona approve checkpoint throws `CONSOLIDATION_AFTER_SUBEVENTS`. Confidence: high.
- `grep "reasons"` over `src/change/*.test.ts` → none; `foldChange` does not project `reasons` (it appears only in the validation key list at `model.ts:77`), so the aggregation at `:281` is untested and observable only on the raw `change.yaml` event. Confidence: high.
- A persona checkpoint's result is constrained to the expected stage result by `assertTransitionIntent` (`orchestrator.ts:59-62`), so the checkpoint branch of the divergence predicate is defensive for persona sub-events (only returns actually diverge) — behavior preserved regardless. Confidence: high.
- Baseline: `npm run verify` exits 0 at `6fb2d8a`. Confidence: high.

## Proposed design

Add to `src/change/orchestrator.ts` (with the other module-private helpers):

- `function personaSubEvents(events: ChangeEvent[], stage: Stage, attempt: number): ChangeEvent[]` — returns events matching the shared filter, using the same `(event as { persona?: string })` cast as today.
- `function isDivergentPersonaEvent(event: ChangeEvent): boolean` — returns the shared divergence predicate, using the same `(event as { result?: string })` cast.

Rewrite the three sites:
- `:215` → `personaSubEvents(record.events, intent.stage, view.attempt)`.
- `:226-228` → `const subEvents = personaSubEvents(...); const hasDivergence = subEvents.some(isDivergentPersonaEvent);`.
- `:281` → `persona ? [intent.reason] : personaSubEvents(record.events, intent.stage, view.attempt).filter(isDivergentPersonaEvent).map((ev) => (ev as { reason?: string }).reason ?? "").filter((r) => r)`.

Helpers stay module-private (no export); the three integration behaviors plus the new characterization test exercise every call site. Dependency direction unchanged.

## Alternatives

- **Export the helpers and unit-test them directly.** Rejected: widens the module surface for a behavior-preserving refactor; the three call sites are fully exercised by integration tests, matching the file's existing private-helper style.
- **Move the helpers and the persona logic into `model.ts` / a new module.** Rejected: the logic is orchestrator-transition-specific; relocating it expands blast radius without benefit.
- **Full persona state-machine rewrite.** Rejected: higher regression risk on safety-critical code; the duplication is the concrete, bounded debt to remove now.
- **Leave as-is.** Rejected: three/two copies of the predicate that caused a past critical defect, with the aggregation site untested.

## Simplicity decision

- Selected rung: local reuse — two helpers consolidating five inline predicate copies in one function.
- Earlier rungs: need is real (scattered, partly untested, safety-critical); no runtime/stdlib/platform/dependency provides these domain predicates.
- Irreducible complexity: the persona sub-event filter and the divergence test; hidden behind two named helpers.
- Safety floor: preserve exact consolidation/divergence/aggregation behavior, `CONSOLIDATION_AFTER_SUBEVENTS`, event schema, and lifecycle. Full gate green.
- Expected surface delta: modify `src/change/orchestrator.ts` (two helpers added, three sites rewritten) and `src/change/orchestrator-parallel.test.ts` (one test added). No new files, dependencies, config, events, or exports.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | Helpers stay module-private | No direct unit test of the predicates in isolation | A future site needs the predicate outside `orchestrator.ts` | Export the helpers and add focused unit tests |
| DC-2 | Divergence keeps its defensive checkpoint-result branch | The branch is unreachable for today's persona checkpoints (result is constrained) | Persona checkpoints gain a non-accepted result form | Tighten or document the predicate for the new form |

## Compatibility and rollout

- Pure behavior-preserving refactor plus added test coverage; no on-disk schema, event, lifecycle, persona, or Git change. Every existing and new behavior is identical. Rollback = revert the branch; no migration. No security/privacy/performance/accessibility impact.

## Risks and mitigations

- The extraction subtly changes a predicate. Mitigation: helpers reproduce the inline predicates verbatim (same casts, same conditions); the two existing consolidation tests plus the new aggregation test cover all three sites; the full 157+ test suite runs.
- The reason-aggregation test observes the wrong event. Mitigation: read the raw `change.yaml`, select the non-persona `stage-returned` event, assert its `reasons` array contains the persona return reason.

## Acceptance criteria

- AC-1: After a persona fix-first `return` (reason `R`) followed by a non-persona `return` to plan, the recorded non-persona `stage-returned` event carries a `reasons` array containing `R` (locks `orchestrator.ts:281`).
- AC-2: The existing divergence behavior is preserved — a persona fix-first return followed by a non-persona approve checkpoint throws `CONSOLIDATION_AFTER_SUBEVENTS`.
- AC-3: The existing happy-path is preserved — two persona approves stay active and a subsequent non-persona approve checkpoint advances the stage to `apply`.
- AC-4: The persona sub-event filter and the divergence predicate each have exactly one definition (`personaSubEvents`, `isDivergentPersonaEvent`); the previously inline copies at `orchestrator.ts:215, 226, 228, 281` are replaced by calls.
- AC-5: `npm run verify` exits 0 on the candidate (enforced at Apply seal by `.codepatrol/config.json` `applyGate`).

## Decisions and open questions

- Decided (maintainer, this session): next fix = F4, scoped to extracting the duplicated predicates + closing the reason-aggregation coverage gap (not a full persona state-machine rewrite), after confirming F2 is externally blocked and F6/F7 need product decisions.
- Decided: helpers stay module-private; verification is behavioral via the three call-site integration tests.
- No open question can materially change scope, interfaces, or acceptance.
