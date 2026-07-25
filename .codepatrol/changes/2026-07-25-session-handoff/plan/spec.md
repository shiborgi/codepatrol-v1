# Specification — Faithful per-stage todo lists: reconcile the Stage Session from durable evidence so a stopped harness can be replaced mid-stage

## Intent

- Origin: improve-codebase
- Mode: architecture
- Target baseline: `main` @ `c8d8ddc815dd19912ce91fb6973a703100083a3a`; clean worktree; `npm run verify` green at baseline.
- Governing constraints: `CONTEXT.md`'s **Stage Session** term ("disposable task progress … It never owns lifecycle") and `skills/_shared/SESSION.md`'s rebuild promise ("the accepted Change artifacts reconstruct it") both govern this design and are *preserved*, not amended — the session stays disposable, gitignored and non-governing. `AGENTS.md`'s "Do not create a root progress file, a mutable status mirror" forbids the naive fix (a second, durable progress store) and drives the chosen one. `docs/adr/` is absent (no ADR to consult; none created — DC-3).
- Substrate state: graph synced at baseline (70 files, 1826 symbols).
- Improvement signals (most recent report `.codepatrol/docs/improvement-reports/2026-07-25-commit-scoping.md`):
  - "Top error code: CHANGE_CONFLICT (3). Investigate the first occurrence's args and stage context." (Pre-existing p1 backlog item; not actioned here. Notably, `CHANGE_CONFLICT` is the code `claimSessionItem` raises for a not-ready item — adjacent to this Change's area but a separate diagnosis.)
  - "Command \"change.transition\" was invoked 21 times — consider caching or batching repeated invocations." (Recurring, pre-existing, unrelated — not actioned here.)
- Problem: the Stage Session is the mechanism that is *supposed* to make a stage resumable by a different harness, and it fails at both ends. (a) `deriveItems` (`src/change/session.ts:48-62`) gives every stage except Apply a **single opaque item** (`"Complete <stage> stage contract"`) — Plan, Review, Verify and Close have no todo list, so there is no partial progress to represent, inspect or resume. (b) Every derived item is unconditionally `open`, and `discardAndRebuildSession` (`:135-139`) re-derives from `plan/plan.md` (what was *intended*) while never reading `apply/journal.md` (what was actually *done*) — so recovery is amnesiac and the session's claims are never cross-checked against durable evidence. `SESSION.md` already promises the opposite ("the accepted Change artifacts reconstruct it"); the implementation does not honor it. Both failure directions are recorded first-hand in this repository: `2026-07-25-docs-consolidation`'s Apply journal documents a session that asserted four closed items with no journal, no artifacts and no checkpoint behind them, whose only available remedy was a full discard.
- Outcome: every stage derives a real, dependency-ordered todo list, and every derivation is **reconciled against the stage's durable artifacts on disk** — an item backed by delivered evidence comes back `closed`, an unbacked claim does not survive a rebuild. A successor harness runs one command, sees exactly what is done and what remains, and continues. The session remains disposable, gitignored and non-governing; no new store is introduced. Session item transitions additionally emit one trace line each, so the existing improvement-report → backlog pipeline surfaces abandoned and re-claimed items automatically.

## Scope

### In scope

- **Dependency-parser hardening (T1):** `deriveItems`'s `**Depends on:**` parser (`session.ts:58`) stops producing dependencies that the plan never declared. Two defects, both found by Apply attempt 1 while priming this Change's own session against this Change's own `plan.md`: (a) every `/\bT\d+\b/` token on the line is extracted, so prose like `T3-exclusive` inside T3's own line yields a **self-dependency**, which `validate()` then rejects with `CHANGE_INVALID` — a hard block; (b) the `none|nothing` guard is tested against the whole trimmed line, so `None (file-disjoint from T1–T3)` misses the guard and silently extracts `T1` and `T3` as **phantom dependencies** of a task declared independent. Fix: filter self-references, and anchor the empty-guard to the line's leading token. This is the same failure class the Change exists to remove — a derived todo list that misrepresents reality — occurring inside the function T2/T3 already own.
- **Per-stage derived checklists (T2):** `deriveItems` returns a real list for every stage, not just Apply. Non-Apply stages derive one item per required durable artifact of that stage (`plan` → `spec.md`, `plan.md`, `evidence/`; `review` → `report.md`; `verify` → `report.md`), mirroring the artifact set already enumerated canonically at `orchestrator.ts:254-259`. Apply's existing `plan.md` `### T<n>` derivation (`session.ts:50-61`) is unchanged. `close` keeps its single item (its only artifact, `close/receipt.md`, is orchestrator-written, not agent-written).
- **Evidence reconciliation (T3):** a derived item is emitted `closed` when the stage's durable evidence on disk shows it delivered — for artifact-backed items, the file exists and is non-empty; for Apply's `T<n>` items, `apply/journal.md` contains a matching `### T<n>` section. Reconciliation runs on both derivation paths (`primeStageSession` when no file exists, and `discardAndRebuildSession` always), so `rebuild` becomes the honest recovery the contract already advertises instead of a reset. Reconciled-closed items carry a machine-set `result` naming the evidence that closed them.
- **Trace synergy (T4):** `claimSessionItem`/`closeSessionItem` append one `TraceEntry` each (new `kind: "session"` variant carrying `stage`, `attempt`, `item`, `action`), fire-and-forget like every other trace producer. `generateImprovementReport` gains one recommendation: items claimed but never closed (abandoned mid-stage work), so a handoff failure like the recorded incident is surfaced into the backlog automatically instead of having to be noticed by hand.
- **Contract and skill alignment (T5):** `skills/_shared/SESSION.md` states that derivation reconciles against durable artifacts and that a successor harness re-primes on resume; the four session-priming lifecycle skills (`codepatrol-plan`, `-review`, `-apply`, `-verify` — `codepatrol-close` primes no session and is untouched) instruct re-priming on resume; `scripts/skills-contract.test.mjs` asserts the wiring; `CONTEXT.md`'s Stage Session term reflects "derived and reconciled".
- **Final verification (T6).**

### Out of scope

- **Cross-machine / fresh-clone mid-stage handoff** — reconciliation reads working-tree artifacts, which are uncommitted until the stage checkpoint. Committing them mid-stage would collide with the checkpoint's declared-delta validation (`orchestrator.ts:266-270`, `:291-292`). Deferred (DC-1), not half-solved.
- **Merging the Stage Session and the trace into one store** — explicitly analysed and rejected in `plan/evidence/investigation.md`: their shapes (read-modify-write vs append-only), lifetimes (per-attempt vs per-Change, deleted at Close), and failure policies (fail-closed vs fail-open) are opposites; a merger reintroduces both behind one name and adds complexity. The simplification actually taken is removing the session's competing *claim* to be a source of truth, which needs no store change.
- Making the session governing, tracked, or capable of invalidating a checkpoint — forbidden by `SESSION.md` and `AGENTS.md`; the fix deliberately preserves disposability.
- Any change to lifecycle transition semantics, event schema, checkpoint validation, `parseStatusPaths`, or the claim/close locking protocol (`session.ts:107-133` control flow beyond the added trace lines).
- The four unrelated open backlog items and the recurring transition-count recommendation (DC-2).

## Current evidence

(All read on the working tree at base `c8d8ddc`; full detail and line citations in `plan/evidence/investigation.md`.)

- `src/change/session.ts:48-62` `deriveItems` — `:49` single opaque item for every non-Apply stage; `:50-61` Apply's `### T<n>` parse; every item unconditionally `open` (`:49`, `:51`, `:59`, `:61`). Confidence: high (read in full).
- `src/change/session.ts:135-139` `discardAndRebuildSession` — always re-derives, discarding all claims/closes; reads `plan/plan.md`, never `apply/journal.md`. Confidence: high (read).
- `src/change/session.ts:58` dependency parser — **two defects, both reproduced directly against this Change's own `plan.md` during Apply attempt 1**, which is how they were found. Running the literal line `T2 (same file, session.ts; sequenced. trace.ts and improvement-report.ts are T3-exclusive.)` through `[...line.matchAll(/\bT\d+\b/g)]` yields `["T2","T3"]` — a self-dependency for task T3, which `validate()` (`:36`) rejects: `CHANGE_INVALID: Session item T3 has invalid dependency T3`. Running the literal line `None (docs/skills only; file-disjoint from T1–T3)` yields `["T1","T3"]` because `/^(none|nothing)$/i` is tested against the whole trimmed line and therefore misses — producing **phantom dependencies with no error at all**. Confidence: high (both reproduced in a standalone `node -e` run this session; the first also observed as a live `codepatrol change session --action prime` failure).
- `skills/_shared/SESSION.md` promises "the accepted Change artifacts reconstruct it" — unimplemented. Confidence: high (contract and code both read).
- `.gitignore:6` (`.codepatrol/runtime/`) covers both the session and the trace; `git check-ignore -v` on a live session path confirms the rule hit. Confidence: high (executed).
- `.codepatrol/changes/2026-07-25-docs-consolidation/apply/journal.md` "Baseline reconciliation" — durable, git-tracked record of a session asserting four closed items with no corroborating artifact, remedied only by a full discard. Confidence: high (durable artifact in this repo).
- Journal `### T<n> — <title>` + `- Result: complete` convention verified across **two harnesses** (`2026-07-25-commit-scoping`, opencode/MiniMax-M3; `2026-07-25-docs-consolidation`, claude-sonnet-5) — stable, machine-readable, already mandated by `plan.md`'s `**Task result:**` field. Confidence: high (grepped both).
- `src/change/orchestrator.ts:254-259` `required` map — canonical per-stage durable artifact set, the model for T2's non-Apply derivation. Confidence: high (read).
- `src/change/trace.ts:4-7` `TraceEntry` union, `:53` `append`, `:67-69` fire-and-forget, `:96` deleted at Close; `src/cli/main.ts:58` traces command name and `ParsedArgs` only — the session `action`/`itemId` live in the stdin payload and are never traced. Confidence: high (read).
- `src/change/improvement-report.ts:133-152` recommendation generation — the extension point for T4's abandoned-item signal. Confidence: high (read).
- No `session.test.ts`; session coverage sits in `src/change/change.test.ts:99-190` (prime, Apply derivation, `sessionStatus`, no-write-on-read, claim). New tests land beside them. Confidence: high (grep + read).
- Baseline `npm run verify` green at `c8d8ddc` (the prior Change's terminal Close ran the same gate through `applyGate`). Confidence: high.

## Proposed design

**Dependency-parser hardening (T1).** `session.ts:58` currently reads:

```ts
const dependencies = /^(none|nothing)$/i.test(dependenciesLine.trim()) ? [] : [...dependenciesLine.matchAll(/\bT\d+\b/g)].map((item) => item[0]);
```

Two changes, both narrowing what the parser accepts as a dependency, neither widening it:
- **Empty-guard anchored to the leading token** — test the line's first whitespace-delimited token (`dependenciesLine.trim().split(/\s+/)[0]`) against `/^(none|nothing)[.,;:]?$/i` instead of testing the entire trimmed line. `None (file-disjoint from …)` then correctly yields `[]`.
- **Self-reference filtered** — the extracted token list drops any token equal to the owning task's own id, so a task can never depend on itself no matter what its prose says.

Both are defensive narrowings of an existing expression; the happy path (a bare `T1, T2` list, or a bare `None`) parses identically to today. Deduplication of repeated tokens comes free with the same pass and prevents a duplicate-dependency list.

**Per-stage templates (T2).** `deriveItems` gains a table of non-Apply stage checklists keyed by stage, each entry naming an item id, a title, and the relative artifact path that evidences it:

```
plan   → spec (plan/spec.md), plan (plan/plan.md, depends on spec), evidence (plan/evidence/)
review → report (review/report.md)
verify → report (verify/report.md)
close  → (unchanged: one item; its artifact is orchestrator-written)
apply  → (unchanged: plan.md ### T<n> parse, :50-61)
```

Dependencies stay minimal and honest: within Plan, `plan.md` depends on `spec.md` (the plan implements the spec); `evidence/` is independent. This preserves the existing `SessionItem` shape exactly — no schema change, no new field, no migration.

**Reconciliation (T3).** One pure predicate, `itemIsDelivered(workspace, workId, stage, item)`:
- artifact-backed item → the path exists and is non-empty (a directory item is satisfied by containing at least one file);
- Apply `T<n>` item → `apply/journal.md` exists and contains a `### T<n>` heading (the convention verified across harnesses).

`deriveItems` marks each derived item `closed` when the predicate holds, with `result` set to a short machine-authored string naming the evidence (e.g. `reconciled: plan/spec.md present`). Items whose evidence is absent stay `open`. This makes both `prime`-on-missing and `rebuild` faithful, and makes an unbacked claim non-survivable across a rebuild — closing the exact divergence recorded in the incident. Reconciliation never *re-opens* an item on the happy path: an on-disk session that validates is still returned as-is by `loadOrDerive` (`:85-91`), so an in-flight `claimed` item is not disturbed.

**Trace synergy (T4).** `TraceEntry` gains `{ kind: "session"; at; stage; attempt; item; action: "claimed" | "closed" }`. `claimSessionItem`/`closeSessionItem` append one such entry inside the existing lock, wrapped in try/catch to preserve the trace's fail-open policy (`trace.ts:67-69`) — a trace failure must never fail a claim. `generateImprovementReport` counts items claimed without a subsequent close for the same item and, when any exist, emits one recommendation naming them, which the existing Close hook upserts into the backlog with no further wiring.

**Contract alignment (T5).** `SESSION.md` gains the reconciliation statement and a resume instruction; the four session-priming lifecycle skills instruct re-priming on resume; `skills-contract.test.mjs` locks both; `CONTEXT.md`'s Stage Session term says "derived from and reconciled against the Change's durable artifacts".

**Dependency direction.** `session.ts` remains a leaf under `src/change/` (imports `store`, `model`, `types`, shared helpers) and gains only a `trace` import — the same fire-and-forget import `orchestrator.ts:10` already uses. `improvement-report.ts` already reads the trace; T3 adds one aggregation over an existing input. No new module, no new store, no dependency inversion.

## Alternatives

- **Make the Stage Session tracked/durable (commit it) so it travels with the branch.** Rejected: `AGENTS.md` explicitly forbids "a root progress file, a mutable status mirror", and `SESSION.md`/`CONTEXT.md` define the session as disposable and non-governing. It would also create a second durable progress record that can disagree with the stage artifacts — the very divergence this Change removes — and mid-stage commits collide with checkpoint delta validation.
- **Merge the session into the trace (derive the todo list by replaying trace entries).** Rejected: the trace is deleted at Close, is fail-open by policy, and is append-only; deriving mutable claim state from it requires a replay-and-fold layer that is strictly more machinery than reading the artifacts that already exist. Analysed in full in `investigation.md`'s synergy table.
- **Merge the trace into the session (one JSON store for both).** Rejected symmetrically: the session is validated fail-closed and bounded at 256 KB (`session.ts:45`), the trace rotates at 10 MB (`trace.ts:10`) and must never fail a command. One store cannot hold both policies.
- **Add a `resume` CLI verb that re-derives and prints a diff.** Rejected as unnecessary surface: `prime` and `rebuild` already exist and become correct once reconciliation lands; `status` already renders ready/blocked/claimed/closed. Adding a fourth verb for the same information is speculative surface with no new criterion.
- **Parse `- Result: complete` in addition to the `### T<n>` heading for Apply reconciliation.** Rejected as over-fitting: the heading is what `plan.md`'s `**Task result:**` field mandates and what both harnesses emit; requiring an exact result-line spelling couples reconciliation to prose that no format document constrains. A present section is the honest signal that the task was journaled.

## Simplicity decision

- Selected rung: direct local change — one existing function (`deriveItems`) gains a per-stage table and a reconciliation predicate; two existing functions gain one trace line each; one existing report gains one aggregation. No new module, no new store, no new CLI verb, no schema change, no dependency.
- Earlier rungs: no existing capability reconciles session items against durable evidence (verified: `deriveItems` is the only derivation path and reads only `plan.md`). Reuse is maximised — the artifact set comes from the same list `orchestrator.ts:254-259` already owns, the journal convention already exists and is already mandated, and the trace→report→backlog pipeline is used end-to-end without modification.
- Irreducible complexity: the mapping from "stage" to "what evidence proves this item delivered", hidden entirely behind `itemIsDelivered` and the stage table inside `session.ts`.
- Safety floor: the session stays disposable, gitignored and non-governing (contract preserved, not amended); reconciliation is read-only and never mutates artifacts; the trace stays fail-open so a trace failure cannot fail a claim; the session's existing fail-closed validation, 256 KB bound, dependency-cycle check and locking are untouched; full gate green.
- Expected surface delta: modify `src/change/session.ts`, `src/change/trace.ts`, `src/change/improvement-report.ts`, `src/change/change.test.ts`, `src/change/improvement-report.test.ts`, `skills/_shared/SESSION.md`, `CONTEXT.md`, the four session-priming `skills/codepatrol-{plan,review,apply,verify}/SKILL.md` files, `scripts/skills-contract.test.mjs`. No new files, no new dependencies, no config or runtime-state layout change.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | Reconciliation reads working-tree artifacts only | A successor harness on a *different* machine or fresh clone cannot see uncommitted mid-stage progress | Maintainer runs two harnesses on separate checkouts of one Change | Mid-stage artifact commits plus a checkpoint-validation rule that tolerates a declared in-progress path set |
| DC-2 | The 4 unrelated open backlog items and the transition-count recommendation stay backlogged | Independent concerns remain open | Maintainer picks one via `next --stage plan` | New Change scoped to the chosen item |
| DC-3 | No ADR is written for the "reject session/trace merger" decision | The rationale lives in this Change's spec + evidence, not in `docs/adr/` | A future Change revisits merging the two stores | `skills/domain-modeling` creates `docs/adr/0001-*.md` lazily from this spec's Alternatives section |

## Compatibility and rollout

Additive and backward-compatible: `SessionItem`/`StageSession` schemas are unchanged (`schema_version` stays `1`), so every existing on-disk session keeps validating and is still returned as-is by `loadOrDerive`. The only behavior change is at derivation time — a stage that previously derived one opaque `open` item now derives several, some already `closed`. `TraceEntry` gains a variant; `trace.read` (`trace.ts:81-94`) parses lines structurally and already tolerates unknown shapes, and `generateImprovementReport` filters by `kind`, so older traces without the new variant aggregate to zero abandoned items rather than erroring. No migration, no config change, no lifecycle/event/checkpoint change. Rollback = revert the branch; sessions are disposable by definition, so no state survives a revert to be repaired. No security/privacy impact (reconciliation reads only paths already inside the Change directory; the trace's existing redaction is untouched); negligible performance impact (a handful of `existsSync` calls plus one small file read per derivation, on a path that already reads `plan.md`).

## Risks and mitigations

- **Reconciliation marks an item `closed` on the strength of a stub artifact (file exists but the work is not really done).** Mitigation: the predicate requires non-empty content, and the reconciled `result` string names the evidence so a successor harness can see *why* an item is closed and re-open it by rebuilding after removing the stub. Crucially this is strictly better than today, where the same item would be closed on an unbacked in-memory claim with no evidence at all; and the stage's real gate (checkpoint artifact hashing plus, for Apply, `applyGate`) is unchanged and still catches stub work before it seals.
- **An in-flight `claimed` item is wrongly reset by reconciliation.** Mitigation: reconciliation runs only on derivation, never on the load path — `loadOrDerive:85-91` still returns a valid on-disk session untouched. `rebuild` remains the explicit, opt-in discard.
- **The Apply `### T<n>` journal convention drifts and reconciliation silently stops matching.** Mitigation: the same heading shape is already parsed from `plan.md` by the shipped code (`session.ts:53`), so a drift would already break Apply derivation today — this Change does not add a new fragile coupling, it reuses an existing one; T2's test asserts the journal path explicitly so drift fails loudly in CI.
- **A trace append inside the claim lock slows or fails a claim.** Mitigation: wrapped in try/catch, fire-and-forget, matching `orchestrator.ts:186`'s existing pattern; one appended line under an already-held lock.

## Acceptance criteria

- AC-1: `deriveItems` returns a dependency-ordered multi-item checklist for `plan` (spec/plan/evidence), `review` (report) and `verify` (report); `apply` keeps its `plan.md` `### T<n>` derivation with unchanged ids and dependencies; `close` keeps a single item.
- AC-2: In a workspace where a stage's artifact already exists and is non-empty, `prime` (no session file) and `rebuild` both return that stage's corresponding item as `closed` with a non-empty `result` naming the evidence; where the artifact is absent, the item is `open`.
- AC-3: For Apply, an item `T<n>` is returned `closed` exactly when `apply/journal.md` contains a `### T<n>` section, and `open` when it does not — asserted with a journal covering a strict subset of the plan's tasks, so the boundary is exercised in both directions in one fixture.
- AC-4: `rebuild` after partial work no longer resets delivered progress: given a session whose items were claimed/closed in memory *and* whose corresponding artifacts exist, `rebuild` returns those items `closed`; given claims with **no** corresponding artifact, `rebuild` returns them `open` (an unbacked claim does not survive).
- AC-5: A session `claim` and a session `close` each append exactly one `{kind:"session"}` trace entry carrying `stage`, `attempt`, `item` and `action`; a trace append failure does not fail the claim or close.
- AC-6: `generateImprovementReport` emits an abandoned-item recommendation naming the item(s) when the trace contains a `claimed` with no matching `closed` for the same item, and emits no such recommendation when every claimed item was closed.
- AC-7: `skills/_shared/SESSION.md` states that derivation reconciles against the Change's durable artifacts and that a resuming harness re-primes; `CONTEXT.md`'s Stage Session term matches; the four session-priming lifecycle `SKILL.md` files (`plan`, `review`, `apply`, `verify`) instruct re-priming on resume; `scripts/skills-contract.test.mjs` asserts the SESSION.md wiring and passes.
- AC-9: `deriveItems`'s dependency parser never emits a self-dependency and never emits a dependency from a line whose leading token is `None`/`Nothing`: parsing the two literal lines that broke Apply attempt 1 — `T2 (same file, session.ts; sequenced. trace.ts and improvement-report.ts are T3-exclusive.)` for a task whose id is `T3`, and `None (docs/skills only; file-disjoint from T1–T3)` — yields `["T2"]` and `[]` respectively; a bare `T1, T2` line and a bare `None` line parse exactly as they do today.
- AC-8: `npm run verify` exits 0 on the candidate (enforced at Apply seal by `.codepatrol/config.json`'s `applyGate`), with every pre-existing session test in `src/change/change.test.ts` still passing unmodified except where a derivation count assertion legitimately changes.

## Decisions and open questions

- Decided: the session stays disposable, gitignored and non-governing; the fix is reconciliation, not durability (Alternatives; `AGENTS.md`/`SESSION.md` constraints).
- Decided: session and trace are **not** merged; the analysed simplification is removing the session's competing claim to be a source of truth (`investigation.md` synergy table). The one unification built is the item-level trace line feeding the existing report→backlog pipeline.
- Decided: Apply reconciliation keys on the `### T<n>` journal section, not on a `- Result:` prose line (Alternatives).
- Decided (Plan attempt 2, after Apply attempt 1 returned a contract defect): the dependency-parser defects are fixed **in scope** as T1, not merely worked around by rewording this Change's own `plan.md`. Rewording alone is necessary but insufficient — it leaves the trap armed for every future plan author, and defect (b) fails silently, which is exactly the "todo list that misrepresents reality" this Change exists to eliminate. The fix lands in `deriveItems`, the same function T2/T3 already own, so it adds no new file, module or interface. This Change's own `plan.md` prose is *also* corrected, so the plan is self-consistently parseable by the mechanism it ships — under the current unhardened parser as well as the hardened one, since Apply primes from `plan.md` before T1 lands.
- Decided: cross-machine mid-stage handoff is deferred (DC-1) rather than half-solved, because mid-stage commits conflict with checkpoint delta validation.
- No open question can materially change scope, interfaces, or acceptance.
