# Plan investigation evidence

Baseline: `main` @ `6fb2d8a117f1d07440c72dd9df7a1ce8d0659327`; branch `codepatrol/2026-07-24-persona-subevent-helpers`.

## Duplicated predicates (F4)

Persona sub-event filter — three copies in `transitionChangeLocked`:
- `src/change/orchestrator.ts:215` — guard: bare non-persona transition mid persona-round.
- `src/change/orchestrator.ts:226` — pre-consolidation divergence check.
- `src/change/orchestrator.ts:281` — reason aggregation onto a non-persona return.

Filter (identical): `(type === "stage-checkpointed" || type === "stage-returned") && (event as {persona?}).persona && stage === intent.stage && attempt === view.attempt`.

Divergence predicate — two copies:
- `src/change/orchestrator.ts:228` — `some(ev => ev.type === "stage-returned" || (stage-checkpointed && result ∉ {approve,commit,implemented,ready}))`.
- `src/change/orchestrator.ts:281` — same condition inline in the aggregation filter.

Note: `assertTransitionIntent` (`orchestrator.ts:59-62`) constrains a checkpoint's result to the expected stage result, so for persona checkpoints only returns actually diverge; the checkpoint branch of the divergence predicate is defensive. Behavior preserved regardless.

## foldChange persona handling (out of scope)

`src/change/model.ts:102-106, 122-126` — minimal short-circuits ("if the current event has a persona, keep the attempt active and break"). Distinct from the filter/divergence predicates; not duplicated; not touched.

## Existing vs missing coverage

- `src/change/orchestrator-parallel.test.ts:18-55` — happy path: two persona approves stay active; non-persona approve consolidates and advances to `apply`.
- `:57-84` — divergence: persona fix-first return then non-persona approve checkpoint → `CONSOLIDATION_AFTER_SUBEVENTS`.
- `grep "reasons" src/change/*.test.ts` → **none**. `foldChange` does not project `reasons` (only listed as an allowed key at `model.ts:77`), so the aggregation at `:281` is untested and observable only on the raw `change.yaml` event. This is the coverage gap this Change closes.

## Baseline health

- `npm run verify` exit 0 at `6fb2d8a` — established by the prior Change's Verify.
