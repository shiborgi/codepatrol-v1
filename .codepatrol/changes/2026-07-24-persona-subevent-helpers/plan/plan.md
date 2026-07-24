# Plan — Extract duplicated persona sub-event and divergence predicates into single helpers

- Work id: `2026-07-24-persona-subevent-helpers`
- Governing spec: `spec.md`
- Target baseline: `main` @ `6fb2d8a117f1d07440c72dd9df7a1ce8d0659327`; clean worktree; `npm run verify` green.

## Goal and approach

Consolidate the persona sub-event filter (3 copies) and divergence predicate (2 copies) in `transitionChangeLocked` into two module-private helpers, preserving exact behavior, and add one characterization test locking the previously untested reason-aggregation site. A behavior-preserving refactor: write the characterization test and confirm it is green against current code, refactor, confirm still green. One implementation task plus one verification task.

## Global constraints

- Node ESM + TypeScript; `.js` import specifiers; two-tab indentation; terse single-line style of `src/change/orchestrator.ts`.
- Preserve exact consolidation, divergence, `CONSOLIDATION_AFTER_SUBEVENTS`, and reason-aggregation behavior; no schema/lifecycle/persona change.
- Helpers stay module-private (no export). Reproduce the inline predicates verbatim (same `as` casts).
- No new files, dependencies, config keys, events.
- Gate that must stay green: `npm run typecheck && npm test && npm run build && npm run smoke:cli && npm run lint:skills`.

## Simplicity proof

- Selected rung: local reuse — two helpers replacing five inline predicate copies in one function.
- Reused capabilities: existing `ChangeEvent`/`Stage` types; existing `orchestrator-parallel.test.ts` fixtures (`initRepo`, `binding`, `at`).
- Forbidden speculative surface: no export, no new module, no persona-semantics change, no `transitionChangeLocked` decomposition, no `foldChange`/`model.ts` change.
- Expected surface delta: modify `src/change/orchestrator.ts`, `src/change/orchestrator-parallel.test.ts`.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T1 | `node --test --import jiti/register src/change/orchestrator-parallel.test.ts` (non-persona return aggregates persona reason into `reasons`) |
| AC-2 | T1 | same suite (existing divergence test throws `CONSOLIDATION_AFTER_SUBEVENTS`) |
| AC-3 | T1 | same suite (existing happy-path advances the stage) |
| AC-4 | T1 | inspection: one `personaSubEvents` + one `isDivergentPersonaEvent` definition; `grep -n` shows no inline persona-sub-event filter remains at the three sites |
| AC-5 | T2 | `npm run verify` exits 0 |

## Dependency order

`T1 → T2`. Single implementation task owns both files.

### T1 — Add the helpers, rewrite the three sites, add the reason-aggregation characterization test

**Purpose:** Satisfies AC-1, AC-2, AC-3, AC-4.

**Depends on:** None

**Files:**

- Modify: `src/change/orchestrator.ts` — add `personaSubEvents`, `isDivergentPersonaEvent`; rewrite the three sites
- Modify: `src/change/orchestrator-parallel.test.ts` — add the reason-aggregation characterization test

**Interfaces:**

- Produces (module-private):
  - `function personaSubEvents(events: ChangeEvent[], stage: Stage, attempt: number): ChangeEvent[]`
  - `function isDivergentPersonaEvent(event: ChangeEvent): boolean`
- Consumes: `ChangeEvent`, `Stage` (already imported in `orchestrator.ts`).
- Invariants/errors: behavior at the three sites is identical; no new error path.

**Simplicity proof:** Reproduce the two inline predicates once each; both types are already imported; helpers are not exported.

**Steps:**

1. Add the characterization test to `src/change/orchestrator-parallel.test.ts` (reuse `initRepo`, `binding`, `at`, and `import { parse } from "yaml"`), driving: plan checkpoint → review begin + usage → persona fix-first `return` (persona `review-security`, reason `"security: boundary gap"`) → non-persona `return` to plan (reason `"consolidated"`). Then read `.codepatrol/changes/<id>/change.yaml`, parse, and assert the non-persona `stage-returned` event's `reasons` contains the persona reason:

   ```typescript
   test("a non-persona return aggregates persona sub-event reasons into reasons[]", async () => {
     const workspace = mkdtempSync(join(tmpdir(), "codepatrol-parallel-"));
     try {
       initRepo(workspace);
       const id = "2026-07-24-parallel-reasons";
       await startChange(workspace, { workId: id, title: "Parallel reasons", targetBranch: "main", actor: "codex" }, at(1));
       mkdirSync(join(workspace, `.codepatrol/changes/${id}/plan`), { recursive: true });
       writeFileSync(join(workspace, `.codepatrol/changes/${id}/plan/spec.md`), "spec\n");
       writeFileSync(join(workspace, `.codepatrol/changes/${id}/plan/plan.md`), "plan\n");
       const planArtifacts = [binding(workspace, `.codepatrol/changes/${id}/plan/spec.md`), binding(workspace, `.codepatrol/changes/${id}/plan/plan.md`)];
       await transitionChange(workspace, id, { type: "usage", actor: "codex", stage: "plan", run: { id: "plan-usage", started_at: "2026-07-24T10:00:03.000Z", finished_at: "2026-07-24T10:00:04.000Z", elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, at(2));
       await transitionChange(workspace, id, { type: "checkpoint", actor: "codex", stage: "plan", result: "ready", artifacts: planArtifacts, nextAction: "review" }, at(3));
       await transitionChange(workspace, id, { type: "begin", actor: "codex", stage: "review", nextAction: "review" }, at(4));
       await transitionChange(workspace, id, { type: "usage", actor: "codex", stage: "review", run: { id: "review-base", started_at: "2026-07-24T10:00:05.000Z", finished_at: "2026-07-24T10:00:06.000Z", elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, at(5));
       mkdirSync(join(workspace, `.codepatrol/changes/${id}/review`), { recursive: true });
       writeFileSync(join(workspace, `.codepatrol/changes/${id}/review/findings-security.md`), "security review\n");
       await transitionChange(workspace, id, { type: "return", actor: "codex-security", stage: "review", toStage: "plan", reason: "security: boundary gap", nextAction: "review-consolidate", persona: "review-security" }, at(6));
       await transitionChange(workspace, id, { type: "return", actor: "codex", stage: "review", toStage: "plan", reason: "consolidated", nextAction: "plan" }, at(7));
       const record = parse(readFileSync(join(workspace, `.codepatrol/changes/${id}/change.yaml`), "utf8")) as { events: Array<Record<string, any>> };
       const consolidatedReturn = record.events.filter((e) => e.type === "stage-returned" && !e.persona).at(-1);
       assert.ok(consolidatedReturn, "expected a non-persona stage-returned event");
       assert.deepEqual(consolidatedReturn!.reasons, ["security: boundary gap"]);
     } finally { rmSync(workspace, { recursive: true, force: true }); }
   });
   ```

2. Run `node --test --import jiti/register src/change/orchestrator-parallel.test.ts`.
   Expected: **green against current code** — this is a characterization test that captures the existing `:281` behavior. (Its red form: if the aggregation predicate is broken, `reasons` is empty/missing and the assertion fails.)
3. Refactor `src/change/orchestrator.ts`: add the two module-private helpers near the existing helpers (e.g. after `eventMatchesIntent`):

   ```typescript
   function personaSubEvents(events: ChangeEvent[], stage: Stage, attempt: number): ChangeEvent[] {
     return events.filter((event) => (event.type === "stage-checkpointed" || event.type === "stage-returned") && (event as { persona?: string }).persona && event.stage === stage && event.attempt === attempt);
   }
   function isDivergentPersonaEvent(event: ChangeEvent): boolean {
     return event.type === "stage-returned" || (event.type === "stage-checkpointed" && (event as { result?: string }).result !== "approve" && (event as { result?: string }).result !== "commit" && (event as { result?: string }).result !== "implemented" && (event as { result?: string }).result !== "ready");
   }
   ```

   Then rewrite the three sites, preserving surrounding logic:
   - `:215` → `const personaSub = personaSubEvents(record.events, intent.stage, view.attempt); if (personaSub.length === 0) { … }`
   - `:226-229` → `const subEvents = personaSubEvents(record.events, intent.stage, view.attempt); if (subEvents.length > 0) { const hasDivergence = subEvents.some(isDivergentPersonaEvent); if (hasDivergence) throw new CodepatrolError("CONSOLIDATION_AFTER_SUBEVENTS", …); }`
   - `:281` → `const reasonList = persona ? [intent.reason] : personaSubEvents(record.events, intent.stage, view.attempt).filter(isDivergentPersonaEvent).map((ev) => (ev as { reason?: string }).reason ?? "").filter((r) => r);`
4. Run `node --test --import jiti/register src/change/orchestrator-parallel.test.ts`.
   Expected green: the new test and both existing consolidation tests pass unchanged.
5. Run `npm run typecheck`. Expected: clean.
6. Inspect (`grep -n "stage-checkpointed\" || " src/change/orchestrator.ts`) to confirm the inline persona-sub-event filter now appears only inside `personaSubEvents` and the divergence predicate only inside `isDivergentPersonaEvent`.

**Task result:** append changed paths, green-characterization evidence, and any deviation to `apply/journal.md`.

### T2 — Final verification and reconciliation

**Purpose:** Confirms AC-5 and whole-Change integrity.

**Depends on:** T1

**Files:**

- Modify: none (verification only)

**Steps:**

1. Map delivered paths back to AC-1…AC-5; confirm each check passed.
2. Run the full gate: `npm run verify`. Expected exit 0 (also enforced at the Apply `implemented` checkpoint by `.codepatrol/config.json` `applyGate`).
3. Inspect the final diff (`git diff --stat` vs base `6fb2d8a`) for undeclared work; confirm only the two declared files changed.
4. Reconcile actual surface delta with the spec forecast; explain any difference in the journal.
5. Record whether any `DC-N` trigger activated (expected: none).
6. Run `codepatrol graph sync`; wiki remains absent (valid) — no wiki refresh required.
7. State rollback (revert branch; no migration) and residual risks (findings F2/F6/F7 remain follow-ups).

**Task result:** append the final reconciliation to `apply/journal.md`.
