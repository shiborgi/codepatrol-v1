# Plan — Faithful per-stage todo lists: reconcile the Stage Session from durable evidence

- Work id: `2026-07-25-session-handoff`
- Governing spec: `spec.md`
- Target baseline: `main` @ `c8d8ddc815dd19912ce91fb6973a703100083a3a`; clean worktree; `npm run verify` green.

## Goal and approach

Give every stage a real, dependency-ordered todo list (T1), make every derivation reconcile against the stage's durable artifacts so progress survives a harness swap and an unbacked claim does not (T2), feed item-level transitions into the existing trace → improvement-report → backlog pipeline (T3), align the written contract and the four session-priming skills (T4), then verify (T5). The Stage Session stays disposable, gitignored and non-governing throughout; no new store, no schema change.

## Global constraints

- `SessionItem`/`StageSession` schemas are frozen (`schema_version` stays `1`); every existing on-disk session must keep validating and must still be returned untouched by `loadOrDerive` (`session.ts:85-91`).
- Reconciliation is **read-only** and runs **only on derivation** (`primeStageSession` when no file exists, `discardAndRebuildSession` always) — never on the load path, so an in-flight `claimed` item is never disturbed.
- The trace stays fail-open: every new `trace.append` call is wrapped in try/catch and must never fail a claim or close (`orchestrator.ts:186` is the pattern to copy).
- The session's existing fail-closed validation, 256 KB bound (`session.ts:45`), dependency-cycle check (`:37-44`) and workspace locking (`:108`, `:128`) are untouched.
- No change to lifecycle transition semantics, event schema, checkpoint validation or `parseStatusPaths`.
- Gate: `npm run typecheck && npm test && npm run build && npm run smoke:cli && npm run lint:skills` (i.e. `npm run verify`).

## Simplicity proof

- Selected rung: direct local change — one existing function gains a stage table plus a predicate; two existing functions gain one traced line each; one existing report gains one aggregation.
- Reused capabilities: the per-stage artifact set already enumerated at `orchestrator.ts:254-259`; the `### T<n>` heading convention already parsed at `session.ts:53` and already mandated by `plan.md`'s `**Task result:**` field; the whole `trace.append` → `generateImprovementReport` → Close-hook → backlog pipeline, used unmodified; the existing session fixtures in `change.test.ts:99-190`.
- Forbidden speculative surface: no new store, no `resume` CLI verb, no schema field, no `docs/adr/` scaffold (DC-3), no session/trace merger (rejected in `spec.md` Alternatives), no `- Result:` prose parsing (rejected).
- Expected surface delta: modify `src/change/session.ts`, `src/change/trace.ts`, `src/change/improvement-report.ts`, `src/change/change.test.ts`, `src/change/improvement-report.test.ts`, `skills/_shared/SESSION.md`, `CONTEXT.md`, `skills/codepatrol-{plan,review,apply,verify}/SKILL.md`, `scripts/skills-contract.test.mjs`.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 (multi-item checklist per stage; apply/close unchanged) | T1 | `node --test --import jiti/register src/change/change.test.ts` |
| AC-2 (artifact present → `closed` with `result`; absent → `open`) | T2 | `change.test.ts` reconciliation cases |
| AC-3 (Apply `T<n>` closed iff journal has `### T<n>`) | T2 | `change.test.ts` partial-journal fixture (subset of plan tasks) |
| AC-4 (`rebuild` keeps backed progress, drops unbacked claims) | T2 | `change.test.ts` rebuild-after-partial-work case |
| AC-5 (one `{kind:"session"}` trace entry per claim/close; fail-open) | T3 | `change.test.ts` trace-assertion cases |
| AC-6 (abandoned-item recommendation present/absent) | T3 | `node --test --import jiti/register src/change/improvement-report.test.ts` |
| AC-7 (SESSION.md + CONTEXT.md + 4 skills + contract test) | T4 | `node --test --import jiti/register scripts/skills-contract.test.mjs`; `npm run lint:skills` |
| AC-8 (`npm run verify` exit 0) | T5 | `applyGate` |

## Dependency order

`T1 → T2` (reconciliation applies to the items T1 derives; both edit `deriveItems` in `src/change/session.ts` — sequenced, never concurrent). `T3` depends on `T1` only for file ordering inside `session.ts` (it edits `claimSessionItem`/`closeSessionItem`, disjoint functions, but the same file — sequenced after T2 to avoid a same-file collision) and additionally edits `trace.ts` and `improvement-report.ts`, which are T3-exclusive. `T4` is independent of T1–T3 (docs and skills only, disjoint files). `T5` depends on all.

Sequence: `T1 → T2 → T3 → T5`, with `T4` runnable at any point (file-disjoint). File-ownership matrix: `src/change/session.ts` is shared by T1, T2, T3 and carries edges T1→T2→T3; `change.test.ts` is shared by T1, T2, T3 on the same chain; every other declared file is single-owner.

### T1 — Derive a real checklist for every stage

**Purpose:** Satisfies AC-1. Foundation for T2.

**Depends on:** None

**Files:**

- Modify: `src/change/session.ts` — `deriveItems` (`:48-62`)
- Modify: `src/change/change.test.ts` — derivation cases

**Interfaces:**

- Internal only. Add a module-level constant beside `deriveItems`:
  `const STAGE_ITEMS: Partial<Record<Stage, { id: string; title: string; artifact: string; dependencies: string[] }[]>>` keyed by stage, with entries (paths relative to `.codepatrol/changes/<work-id>/`):
  - `plan`: `spec` → `plan/spec.md` (deps `[]`); `plan` → `plan/plan.md` (deps `["spec"]`); `evidence` → `plan/evidence/` (deps `[]`)
  - `review`: `report` → `review/report.md` (deps `[]`)
  - `verify`: `report` → `verify/report.md` (deps `[]`)
  - `apply` and `close`: absent from the table (Apply keeps the `plan.md` parse; Close keeps its single item).
- `deriveItems` signature is unchanged.

**Simplicity proof:** Mirrors the artifact set `orchestrator.ts:254-259` already owns; no schema change (`SessionItem` shape reused exactly); a table plus a `.map` replaces the `:49` one-liner.

**Steps:**

1. Add `change.test.ts` cases: for a Change parked in `plan` attempt 1 with **no** plan artifacts on disk, `primeStageSession(..., "plan", 1)` returns items `["spec","plan","evidence"]` in that order with `plan` depending on `["spec"]` and all three `open`; the same for `review` → `["report"]` and `verify` → `["report"]`; `close` still returns exactly one item; the existing Apply assertion at `:124` (`[["T1",[]],["T2",["T1"]]]`) still holds unchanged.
2. Run `node --test --import jiti/register src/change/change.test.ts`.
   Expected red: the new plan/review/verify assertions fail because derivation still returns the single `<stage>-work` item (a failure naming `plan-work` or an item-count mismatch is the valid red; a module/import error is not).
3. Implement: add `STAGE_ITEMS`; in `deriveItems`, before the existing `stage !== "apply"` early return, look the stage up in the table and, on a hit, return its entries mapped to `SessionItem`s (`status: "open"`, dependencies from the table). Keep the existing single-item fallback for any stage absent from the table (`close`, and any future stage), and keep the Apply branch exactly as-is.
4. Run the test. Expected green.
5. Run `npm run typecheck`. Expected clean.

**Task result:** append to `apply/journal.md`.

### T2 — Reconcile derived items against durable evidence

**Purpose:** Satisfies AC-2, AC-3, AC-4 — the core of the Change.

**Depends on:** T1 (same function, `deriveItems`; sequenced)

**Files:**

- Modify: `src/change/session.ts` — new `itemIsDelivered` helper; `deriveItems` marks reconciled items
- Modify: `src/change/change.test.ts` — reconciliation and rebuild cases

**Interfaces:**

- `function itemIsDelivered(workspace: string, workId: string, stage: Stage, item: { id: string; artifact?: string }): boolean` (module-private):
  - artifact ending in `/` → resolve via `resolveInside` and return true when the directory exists and contains at least one entry;
  - other artifact → true when the file exists and its trimmed content is non-empty;
  - Apply item (`id` matches `/^T\d+$/`, no artifact) → true when `apply/journal.md` exists and its content matches `new RegExp(`^### ${id}\\b`, "m")`.
- Reconciled items are emitted `status: "closed"` with `result: \`reconciled: <evidence>\`` (e.g. `reconciled: plan/spec.md present`, `reconciled: apply/journal.md has ### T2`). `claim`/`artifacts` are left unset — a reconciled close was not claimed by any actor.

**Invariants:** reconciliation is read-only; it runs only inside `deriveItems` (reached from `primeStageSession` when no file exists and from `discardAndRebuildSession` always), never on the `loadOrDerive:85-91` return-valid-session path; `validate()` still runs on every write, so a reconciled session is held to the same schema.

**Simplicity proof:** One pure predicate over paths already inside the Change directory; reuses `resolveInside` and the `### T<n>` convention already parsed at `:53`.

**Steps:**

1. Add `change.test.ts` cases:
   (a) with `plan/spec.md` written non-empty and `plan/plan.md` absent, `primeStageSession(..., "plan", 1)` returns `spec` `closed` with a non-empty `result` and `plan` `open`;
   (b) with `plan/spec.md` present but **empty**, `spec` is `open` (non-empty content is required);
   (c) for Apply with a `plan.md` declaring `T1`/`T2`/`T3` and an `apply/journal.md` containing only `### T1 — …` and `### T2 — …`, derivation returns `T1`/`T2` `closed` and `T3` `open` (AC-3 boundary in both directions, one fixture);
   (d) rebuild fidelity: claim and close `T1` in memory *with* its journal section present, then `discardAndRebuildSession` → `T1` comes back `closed`; and a session whose `T3` was claimed with **no** journal section → after rebuild `T3` is `open` (AC-4, both directions).
2. Run `node --test --import jiti/register src/change/change.test.ts`.
   Expected red: every reconciliation case fails with the item `open` (and case (d)'s first half fails after rebuild), because `deriveItems` still emits everything `open`.
3. Implement `itemIsDelivered` and apply it inside `deriveItems` for both the `STAGE_ITEMS` branch and the Apply branch, setting `status`/`result` per the interface above.
4. Run the test. Expected green.
5. Run `node --test --import jiti/register src/change/change.test.ts src/cli/cli.test.ts` and `npm run typecheck`. Expected green/clean — no CLI surface changed, so `cli.test.ts` is a regression check only.

**Task result:** append to `apply/journal.md`.

### T3 — Item-level trace entries and the abandoned-item signal

**Purpose:** Satisfies AC-5, AC-6 — the one session/trace unification the spec justifies.

**Depends on:** T2 (same file, `session.ts`; sequenced. `trace.ts` and `improvement-report.ts` are T3-exclusive.)

**Files:**

- Modify: `src/change/trace.ts` — `TraceEntry` union (`:4-7`)
- Modify: `src/change/session.ts` — `claimSessionItem` (`:107-125`), `closeSessionItem` (`:127-133`)
- Modify: `src/change/improvement-report.ts` — recommendation generation (`:133-152`)
- Modify: `src/change/change.test.ts` — trace-emission cases
- Modify: `src/change/improvement-report.test.ts` — abandoned-item recommendation cases

**Interfaces:**

- `TraceEntry` gains `| { kind: "session"; at: string; stage: string; attempt: number; item: string; action: "claimed" | "closed" }`.
- `claimSessionItem`/`closeSessionItem` each append exactly one such entry immediately before returning `write(...)`, inside the existing lock, wrapped in `try { … } catch { /* trace is fire-and-forget */ }`.
- `generateImprovementReport` gains one recommendation when the trace holds a `claimed` entry with no later `closed` entry for the same `(stage, attempt, item)`: `` `Session item(s) claimed but never closed: <ids>. A harness stopped mid-stage; re-prime the session to resume.` ``

**Simplicity proof:** Reuses the trace's existing append/read/redact machinery and the report's existing recommendation array; no new file, no new pipeline — the Close hook already upserts every non-filler recommendation into the backlog.

**Steps:**

1. Add tests: in `change.test.ts`, assert `trace.read(...)` after a claim contains exactly one `{kind:"session", action:"claimed", item:"T1"}` entry with the right `stage`/`attempt`, and one `action:"closed"` after the close; in `improvement-report.test.ts`, a trace with a claimed-and-never-closed item yields a recommendation matching `/claimed but never closed/` naming that item, and a trace where every claimed item was closed yields no such recommendation.
2. Run `node --test --import jiti/register src/change/change.test.ts src/change/improvement-report.test.ts`.
   Expected red: no `session` entries exist in the trace, and the recommendation is absent.
3. Implement the `TraceEntry` variant, the two appends, and the report aggregation.
4. Run both test files. Expected green.
5. Verify fail-open: confirm by inspection that both appends are inside try/catch and that no `await` on trace precedes the session `write`, so a trace failure cannot fail or reorder a claim; run `node --test --import jiti/register src/change/trace.test.ts` as a regression check on the existing trace behavior.

**Task result:** append to `apply/journal.md`.

### T4 — Align the written contract and the session-priming skills

**Purpose:** Satisfies AC-7.

**Depends on:** None (docs/skills only; file-disjoint from T1–T3)

**Files:**

- Modify: `skills/_shared/SESSION.md`
- Modify: `CONTEXT.md` — the Stage Session term
- Modify: `skills/codepatrol-plan/SKILL.md`, `skills/codepatrol-review/SKILL.md`, `skills/codepatrol-apply/SKILL.md`, `skills/codepatrol-verify/SKILL.md`
- Modify: `scripts/skills-contract.test.mjs`

**Steps:**

1. Add to `scripts/skills-contract.test.mjs`, beside the existing SESSION.md assertions (`:30-31`): `assert.match(session, /reconcil/i)` and `assert.match(session, /re-?prime/i)`.
2. Run `node --test --import jiti/register scripts/skills-contract.test.mjs`. Expected red: SESSION.md contains neither word.
3. Edit `skills/_shared/SESSION.md`: state that priming and `rebuild` **derive items from the stage's declared artifacts and reconcile each against the durable evidence on disk**, so delivered work returns `closed` and an unbacked claim does not survive a rebuild; and that a harness resuming a stage another harness began must re-prime the session first and treat its `status` projection as the resume point. Keep the existing disposability sentences verbatim (`never own lifecycle`, `Losing it cannot change the Change stage`) so the current assertions keep passing.
4. Edit `CONTEXT.md`'s **Stage Session** term to say it is derived from and reconciled against the Change's durable artifacts, keeping "It never owns lifecycle."
5. Edit the four session-priming skills to instruct re-priming the Stage Session when resuming a stage a previous harness began, and reading its `status` projection before claiming. (`codepatrol-close` primes no session and is not edited.)
6. Run `node --test --import jiti/register scripts/skills-contract.test.mjs` and `npm run lint:skills`. Expected green/clean.

**Task result:** append to `apply/journal.md`.

### T5 — Final verification and reconciliation

**Purpose:** Confirms AC-8 and whole-Change integrity.

**Depends on:** T1, T2, T3, T4

**Files:**

- Modify: none (verification only)

**Steps:**

1. Map delivered paths back to AC-1…AC-8; confirm each passed.
2. Run the full gate: `npm run verify`. Expected exit 0 (also enforced at Apply `implemented` by `.codepatrol/config.json` `applyGate`).
3. End-to-end handoff rehearsal on **this** Change's own Apply session: after at least one task is journaled, run `codepatrol change session --id 2026-07-25-session-handoff --input -` with `{"stage":"apply","attempt":1,"action":"rebuild"}` and confirm the journaled tasks come back `closed` and the rest `open` — the live proof of the user-facing outcome. Record the exact output in the journal.
4. `git diff --stat c8d8ddc` — inspect for undeclared work; confirm the changed set matches this plan's Expected surface delta.
5. Reconcile actual surface delta with the spec forecast; explain any difference in the journal.
6. Record whether any `DC-N` trigger activated (expected: none).
7. `codepatrol graph sync`.
8. State rollback (revert the branch; sessions are disposable so no state needs repair) and residual risks (DC-1 cross-machine handoff, DC-2 unrelated backlog items, DC-3 no ADR).

**Task result:** append the final reconciliation to `apply/journal.md`.
