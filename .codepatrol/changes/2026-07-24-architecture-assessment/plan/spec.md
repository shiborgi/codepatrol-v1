# Specification — Architecture, skills, and workflow assessment with Stage-Session ergonomics fix

## Intent

- Origin: improve-codebase
- Mode: architecture
- Target baseline: `main` @ `415f779bde14e57ad0af7ac4cd25657bcea00fcd`; clean worktree; `npm run verify` green at baseline (exit 0).
- Governing constraints: `CONTEXT.md` domain vocabulary (Stage Session, Change, Public Workflow); `AGENTS.md` sources-of-truth and ownership rules. No ADRs exist (`docs/adr/` absent). None block this design.
- Substrate state: graph revision synced (73 files, 1804 symbols, 41ms); wiki absent (valid substrate state per `wiki status` `exists:false`).
- Improvement signals (most recent report `docs/codepatrol/improvement-reports/2026-07-24-apply-verify-gate.md`):
  - Top error code INVALID_WORKSPACE (2) on `change.session prime` — investigate first occurrence args/stage.
  - Command `change.session` invoked 18 times — consider caching or batching repeated invocations. Reinforced by `2026-07-24-aggregate-and-push.md`: 109 `change.session` invocations and CHANGE_CONFLICT "Session item is not ready" as the top error (25).
- Problem: Two distinct needs. (1) The maintainer asked for a whole-project assessment — architecture, skills, and workflow — validating the highest-value improvement points, not just a single artifact. (2) The project's own telemetry names Stage-Session interaction as the dominant remaining operator friction: agents invoke `change.session` 100+ times per Change and repeatedly hit `CHANGE_CONFLICT: Session item is not ready` because the CLI surfaces no claimable-item projection and the claim failure never names the blocking dependency.
- Outcome: A durable, ranked architecture/skills/workflow assessment exists under `docs/codepatrol/`, and the #1 finding (Stage-Session ergonomics) is implemented behind a read-only `status` action and a dependency-naming claim error, with the full gate green.

## Scope

### In scope

- A durable assessment document ranking findings across architecture, skills, and workflow, each with `file:line` evidence, severity, and one proposed bounded follow-up Change.
- A read-only `change session ... {"action":"status"}` projection returning claimable (`ready`) items and, for each blocked open item, its unclosed dependencies with their status.
- A read-only session accessor that never writes when the session file is absent.
- An enriched `claimSessionItem` failure that names the specific blocking dependency (or the missing/wrong-status cause) while preserving the `CHANGE_CONFLICT` code.
- `skills/_shared/SESSION.md` documenting the `status` action and the blocking-dependency feedback so agents stop re-priming to poll.

### Out of scope

- Batch claim/close of multiple items in one call — deliberately excluded to preserve the claim-one-before-mutation invariant that keeps parallel writes safe (`session.ts` `claimSessionItem`).
- Refactoring `transitionChangeLocked` / centralizing compat migrations (assessment finding F3; higher regression risk — recorded as a follow-up Change, not implemented here).
- Wiring authoritative per-run token/character usage (finding F2; externally constrained by harness capabilities — recorded as a follow-up).
- CLI JSON-vs-path input detection (finding F5) and copy-install portability (finding F6) — recorded as follow-ups.
- Any change to lifecycle order, checkpoint validation, Git/ref safety, or the persona sub-event state machine.

## Current evidence

- `src/change/session.ts:73` `readySessionItems` already computes ready items (open + every dependency closed) but nothing surfaces it through the CLI; `src/cli/commands.ts:124-133` `change.session` supports only `prime|claim|close|rebuild` and prints only `data.next_action`, hiding item state.
- `src/change/session.ts:74-80` `claimSessionItem` throws `CHANGE_CONFLICT: Session item is not ready: ${itemId}` with no reason. Confidence: high (read directly).
- `src/change/session.ts:60-72` `primeStageSession` writes a fresh session when absent (`write(...)`), so it is not a read-only status source. Confidence: high.
- No test asserts the current "not ready" message string (`grep` over `src/**/*.test.ts` returned none), so enriching it is safe. Confidence: high.
- `scripts/skills-contract.test.mjs:30` already asserts `SESSION.md` content, providing a natural place to lock the new documentation. Confidence: high.
- Telemetry: `docs/codepatrol/improvement-reports/2026-07-24-aggregate-and-push.md` (109 `change.session`, CHANGE_CONFLICT "not ready" ×25) and `2026-07-24-apply-verify-gate.md` (18 `change.session`, INVALID_WORKSPACE ×2). Confidence: high (durable artifacts).
- Baseline health: `npm run verify` exit 0 at `415f779` (typecheck + 144 tests + build + smoke + lint:skills). Confidence: high (executed).
- Assessment findings (see Proposed design) each cite verified locations in `src/change/orchestrator.ts`, `src/change/model.ts`, `src/change/usage.ts`, `scripts/install-lib.mjs`.

## Proposed design

Two coordinated deliverables.

### A. Assessment document

Write `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md`. It ranks findings and, for each, records severity, `file:line` evidence, impact, and one proposed bounded follow-up Change work-id. Ranked findings:

- **F1 — Stage-Session ergonomics (implemented in this Change).** 100+ `change.session` invocations/Change; `CHANGE_CONFLICT: not ready` top error. Evidence: `session.ts:73`, `commands.ts:124-133`, improvement reports.
- **F2 — Usage/cost subsystem hollow.** 55 `status: unavailable` vs 3 `measured` across recorded changes; the provenance/cost value proposition is unrealized. Evidence: `src/change/usage.ts`, `model.ts` `aggregateUsage`, `change.yaml` grep. Follow-up: per-harness usage adapter or coordinator-supplied usage input.
- **F3 — Orchestrator density / scattered compat migrations.** `transitionChangeLocked` (~90 lines, nested ternaries) `orchestrator.ts:200-287`; migrations split across `model.ts:59-61` (finalize→close) and `orchestrator.ts:292-298` (`recordFromYaml` tokens→characters). Follow-up: extract validation/persona/reconciliation seams; centralize record normalization.
- **F4 — Persona consolidation logic risk.** `CONSOLIDATION_AFTER_SUBEVENTS` guard spread across `orchestrator.ts:225-231`, return reason-aggregation `orchestrator.ts:281`, and `model.ts` fold; historically caused a critical Verify defect. Follow-up: unify the persona sub-event state machine with focused tests.
- **F5 — CLI input ergonomics.** JSON passed inline instead of via `--input -` resolves as a filesystem path → `INVALID_WORKSPACE` (`commands.ts:46`). Follow-up: detect JSON-looking input and emit an actionable error.
- **F6 — Distribution portability.** Installer symlinks skills into the repo (`scripts/install-lib.mjs`); `../_shared` and sibling-skill references resolve only through the symlink-into-repo. A copy-based install would break relative doc references. Follow-up: validate or document the copy-install path.
- **F7 — Wiki subsystem unused.** `wiki status` reports `exists:false` with uncovered sources. Follow-up: decide wiki scope or explicitly defer.

### B. Stage-Session ergonomics implementation

In `src/change/session.ts`:

- Add pure projection `sessionStatus(session: StageSession): SessionStatusView` where `SessionStatusView = { ready: SessionItem[]; blocked: BlockedItem[]; claimed: SessionItem[]; closed: SessionItem[] }` and `BlockedItem = { id: string; title: string; blockedBy: { id: string; status: SessionItem["status"] | "missing" }[] }`. `ready` reuses `readySessionItems`; `blocked` = open items with ≥1 dependency whose status is not `closed`.
- Extract private `loadOrDerive(workspace, workId, stage, attempt, now): { session: StageSession; fromDisk: boolean }` from the current `primeStageSession` body (existing behavior preserved: valid on-disk session is returned, otherwise a derived one is built). `primeStageSession` calls it and writes only when `!fromDisk`.
- Add read-only `readStageSession(workspace, workId, stage, attempt, now?): StageSession` that returns `loadOrDerive(...).session` and never writes.
- Enrich `claimSessionItem`: when the target is not ready, compute the cause via `sessionStatus` — missing item, non-open status, or listed unclosed dependencies — and throw `CHANGE_CONFLICT` with a message naming the blocker, keeping the `Session item is not ready: <id>` prefix.

In `src/cli/commands.ts`:

- Add `action: "status"` to the `change.session` switch: call `readStageSession` + `sessionStatus`; return `{ session, status }` as `data`; render a text summary listing ready item ids and each blocked item with its blocker(s).

In `skills/_shared/SESSION.md`:

- Document the read-only `status` action (use it to discover claimable items instead of re-priming) and that a failed claim reports the blocking dependency.

In `scripts/skills-contract.test.mjs`:

- Assert `SESSION.md` documents the `status` action (locks the doc against regression).

Dependency direction is unchanged: CLI → session module → shared; no new module depends on the orchestrator. `status` is read-only and additive; no existing action semantics change.

## Alternatives

- **Batch claim/close in one call.** Rejected: weakens the claim-one-before-mutation invariant that guarantees parallel-write safety; the thrash is reduced sufficiently by eliminating status-polling re-primes.
- **Make `status` prime-then-project (write on read).** Rejected: violates the read-only expectation of a status query and would create sessions as a side effect of inspection.
- **Only enrich the claim error, no `status` action.** Rejected: the dominant cost is repeated `prime` polling to discover claimable items; without a read-only projection the invocation count stays high.
- **Change the `CHANGE_CONFLICT` code to a new `SESSION_NOT_READY`.** Rejected: adds taxonomy surface for no operator benefit; the message enrichment is sufficient and non-breaking.

## Simplicity decision

- Selected rung: direct local change (extend one module + its CLI seam + doc), reusing existing `readySessionItems` and `deriveItems`.
- Earlier rungs: need is real (top telemetry pain); no local reuse fully satisfies it because no CLI-surfaced projection exists; no runtime/stdlib/platform/dependency provides Change-session semantics.
- Irreducible complexity: computing per-item blocking dependencies and exposing them read-only; hidden behind `sessionStatus` + one CLI action.
- Safety floor: preserve claim-one-before-mutation, session-never-owns-lifecycle validation, current-attempt guard, atomic writes, and read-only guarantee of the new path. Full gate (typecheck/test/build/smoke/lint:skills) must stay green.
- Expected surface delta: modify `src/change/session.ts`, `src/cli/commands.ts`, `skills/_shared/SESSION.md`, `scripts/skills-contract.test.mjs`, tests in `src/change/change.test.ts` and `src/cli/cli.test.ts`; create `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md`. No new dependencies, no config keys, no lifecycle changes.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | Read-only `status` projection; no batch claim/close | One claim per CLI round-trip remains | A future report still shows >50 `change.session` invocations/Change dominated by claim/close (not prime polling) | Design a batch claim/close that preserves per-item atomic ownership |
| DC-2 | Findings F2–F7 recorded, not implemented | Strategic debt (hollow usage, orchestrator density, persona risk) persists | Maintainer schedules a follow-up work-id from the assessment | Execute the named bounded follow-up Change |

## Compatibility and rollout

- Additive CLI action and message enrichment; no existing action, event, checkpoint, or on-disk schema changes. Older sessions load unchanged. Rollback = revert the branch; no migration. Observability improves (clearer errors). No security, privacy, performance, or accessibility impact; new code is pure/read-only except the unchanged `prime` write path.

## Risks and mitigations

- Enriched claim message breaks an external matcher. Mitigation: no test asserts the string today; keep the `Session item is not ready: <id>` prefix. Early signal: `npm test` failure.
- `readStageSession` accidentally writes. Mitigation: dedicated test asserts the session file is absent after a `status` call on a never-primed session.
- `sessionStatus` misclassifies a transitively blocked item. Mitigation: unit test with a chain (T1 open → T2 depends T1) asserting `blockedBy`.
- Skills-contract assertion over-constrains wording. Mitigation: match a stable token (`status`) near session-action prose, not a full sentence.

## Acceptance criteria

- AC-1: Running `change session --id <id> --input '{"action":"status","stage":"apply","attempt":N}'` on a session with a ready item and a dependency-blocked item returns, in one call, the ready items and each blocked item's unclosed dependencies with status, and exits 0.
- AC-2: `claimSessionItem` on a not-ready item throws `CHANGE_CONFLICT` whose message names the specific blocking dependency (or the missing / non-open cause).
- AC-3: A `status` request (`readStageSession`) on a work id whose session file does not yet exist returns the derived items and writes no session file.
- AC-4: `skills/_shared/SESSION.md` documents the read-only `status` action and the blocking-dependency claim feedback, and `scripts/skills-contract.test.mjs` asserts it.
- AC-5: `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md` exists and ranks findings across architecture, skills, and workflow, each with `file:line` evidence, severity, and one proposed bounded follow-up, marking F1 as implemented in this Change.
- AC-6: `npm run verify` exits 0 on the candidate (enforced at Apply seal by `.codepatrol/config.json` `applyGate`).

## Decisions and open questions

- Decided (maintainer, this session): deliverable = ranked assessment document **plus** implementing the #1 finding now; #1 = Stage-Session ergonomics (chosen over F2 usage and F3 orchestrator for value × bounded × low-risk, grounded in the project's own recurring telemetry).
- Decided: preserve claim-one invariant; no batch mutation.
- No open question can materially change scope, interfaces, or acceptance.
