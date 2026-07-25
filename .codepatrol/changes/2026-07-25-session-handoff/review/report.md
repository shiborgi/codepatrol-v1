# Review — Faithful per-stage todo lists: reconcile the Stage Session from durable evidence

- Change: `2026-07-25-session-handoff`
- Incoming revision: 3 (Plan attempt 3)
- Reviewed revision: 3
- Reviewer: claude-sonnet-5 (default persona)
- Evidence date: 2026-07-25T17:20:30Z

## Scope and evidence

Reviewed at branch `codepatrol/2026-07-25-session-handoff`, Plan attempt 3 checkpoint `0ba351b` (transition commit `ff58bcc`), base `c8d8ddc` (`main`, unchanged), clean worktree. This attempt is Plan's response to **Apply attempt 2's contract-defect return** (Apply ran 40 s, found the defect before mutation, returned to Plan).

Declared Plan-attempt-3 artifact hashes re-computed and matched `change.yaml` exactly:

- `plan/spec.md` → `4769da26…91e4f4` (modify) ✓
- `plan/plan.md` → `50c66f34…5e424e` (modify) ✓
- `plan/evidence/investigation.md` → `ce2f9a2d…ae1245` (modify) ✓

History reconciled with the projection: Plan 1 & 2 invalidated; Review 1 & 2 invalidated (both prior `approve`s superseded); Apply 1 & 2 `returned`; Plan 3 completed; Review 3 active. The two Apply returns are distinct contract defects (read from `change.yaml` `stage-returned` events):

- **Apply 1 → Plan 2**: the dependency-parser defects (reviewed and approved in Review 2; superseded).
- **Apply 2 → Plan 3 (this attempt)**: T6 step 3 hardcoded `{"stage":"apply","attempt":1,...}` for the rehearsal, but the active Apply attempt was 2 → `CHANGE_CONFLICT: Session apply/1 is not the current attempt`.

Plan 3's diff (`4b99624` → `0ba351b`, plan content) was read in full. It makes three changes:

1. **T6 step 3 fix (the actual Apply-2 defect):** the rehearsal now reads the current Apply attempt via `change inspect`'s `data.attempt` and uses `<that number>`, with an explicit note that hardcoding fails at `session.ts:83`/`:137`. Correct and complete.
2. **Finding 5 / AC-10 (attempt-scoped reconciliation) — a NEW latent defect in the Plan-2 design:** Plan-2's `itemIsDelivered` was attempt-blind — a prior *invalidated* attempt's artifact stays on disk and committed, so the current attempt would inherit a `closed` item for work it never did. Fix: a freshness gate (`staleHashes` built from `change.yaml`'s per-attempt `artifacts[].sha256`) — a candidate file counts only if its SHA-256 matches no prior-attempt binding for that path.
3. **Finding 6 / AC-11 (persona-aware evidence):** Plan-2 keyed items on one exact filename; parallel personas write `report-<persona>.md` (per the skills), which would read `open`. Fix: prefix matching (`<basename>.md` + `<basename>-*.md`).

## Verification of the new findings (executed this session)

- **Finding 5 is concretely real on this Change's own state right now.** `review/report.md` on disk hashes to `ec2f8295eb7fad97…`, which `change.yaml` records as review attempt 2's binding; review attempt 2 is invalidated. Under Plan-2's attempt-blind predicate, priming a review-3 session would derive the `report` item `closed` for an attempt that has produced nothing — exactly the "todo list misrepresents reality" failure this Change exists to eliminate, reintroduced by the Change's own fix. The freshness gate resolves this: `ec2f8295…` is in the stale set → `open` until attempt 3 writes fresh content.
- **The freshness gate is decidable from data already recorded.** `change.yaml` stores `artifacts[].sha256` per `stage-checkpointed` event (verified: review attempt 1 → `9dddb788…`, attempt 2 → `ec2f8295…` for the same path). `staleHashes(record, stage, attempt)` collects same-stage non-current-attempt bindings — no clocks, mtimes, or heuristics. Fail-safe direction confirmed: byte-identical content → `open` (re-derive rather than falsely skip).
- **Finding 6 citations verified.** `skills/codepatrol-review/SKILL.md:29` → `review/report-security.md`; `skills/codepatrol-verify/SKILL.md:28` → `verify/report-security.md`; `src/change/orchestrator-parallel.test.ts:35,41` exercises `review/findings-security.md` / `findings-architecture.md` (test-fixture naming). The design's prefix `<basename>-*.md` matches the skill-prescribed production convention (`report-*`).
- **ROLES.md:45** verified verbatim: "Independence is defined at the Stage Attempt level, not the vendor level." — grounds both the attempt-scoping rationale and the multi-harness compatibility note.
- **Record threading is zero-new-I/O.** `loadOrDerive:82` and `discardAndRebuildSession:136` already call `readChangeRecord`; Plan 3 keeps the raw record reference (before `foldChange`) and passes it to `deriveItems`. `ChangeRecordV2` is a type from `./types.js` (already a session.ts dependency) — no new import.

Code citations carried forward from Review 2 (production code unchanged at base `c8d8ddc`; Plan-only revision): `session.ts:48-62/58/85-91/107-133/135-139`, `trace.ts:4-7/53/67-69/81-94/96`, `orchestrator.ts:254-259/186`, `cli/main.ts:58`, `.gitignore:6`, `SESSION.md:11-12`, `CONTEXT.md:34`, `change.test.ts:99-190` — all still accurate. The two T1 parser defects remain reproduced (Review 2 evidence stands).

## Assessment of the scope expansion

The expansion is justified, not gold-plating. The attempt-blindness (Finding 5) is a genuine, serious defect: without it, the Change would ship a feature that demonstrably credits invalidated attempts' committed work — the precise failure class its spec's Problem statement condemns, applied to itself. Verify would very likely have caught it; Plan 3 fixing it proactively is correct. The persona-aware matching (Finding 6) shares the root cause (evidence bound to one fixed filename) and is a natural complement. Both fixes land inside T3's `itemIsDelivered` in `session.ts` (the file T3 already owns), add two module-private helpers + one internal parameter, introduce no new module/store/CLI verb/dependency, and preserve the frozen `SessionItem`/`StageSession` schemas. The surface delta does not grow beyond the Plan-2 forecast set. New ACs (AC-10, AC-11) are unambiguous and mapped to red-capable test cases (e) and (f).

## Findings

None that block approval. Minor observations recorded below; no bounded or material defect survives validation.

### minor — evidence (cosmetic, non-blocking) — AC list ordering

`spec.md` orders the criteria AC-1, AC-10, AC-11, AC-2…AC-9; `plan.md`'s acceptance-mapping table orders AC-9, AC-1…AC-4, AC-10, AC-11, AC-5…AC-8. All eleven criteria (AC-1…AC-11) are present, unambiguous, non-overlapping, and each maps to exactly one task and one red-capable verification. The reordering is purely typographical; no correction required for approval.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none | no blocking finding | none |
| `plan/plan.md` | none | no blocking finding | none |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 (multi-item checklist per stage; apply/close unchanged) | yes | T2 | yes — red: single `<stage>-work` item (count mismatch) | covered |
| AC-2 (artifact present→`closed` w/ `result`; absent→`open`) | yes | T3 | yes — red: items `open` today | covered |
| AC-3 (Apply `T<n>` closed iff journal has `### T<n>`) | yes | T3 | yes — strict-subset journal, both directions | covered |
| AC-4 (rebuild keeps backed progress, drops unbacked claims) | yes | T3 | yes — red: rebuild returns unbacked claim `closed` today | covered |
| AC-5 (one `{kind:"session"}` trace entry per claim/close; fail-open) | yes | T4 | yes — red: no `session` entries today | covered |
| AC-6 (abandoned-item recommendation present/absent) | yes | T4 | yes — both polarities asserted | covered |
| AC-7 (SESSION.md + CONTEXT.md + 4 skills + contract test) | yes | T5 | yes — contract test word mismatch; `lint:skills` | covered |
| AC-8 (`npm run verify` exit 0) | yes | T6 | yes — `applyGate` | covered |
| AC-9 (no self-dep; leading-token `None` guard; happy path unchanged) | yes | T1 | yes — reproduced this lineage: T3 self-dep throws; `None (…T1–T3)` → phantom `["T1","T3"]` | covered |
| AC-10 (attempt-scoped: prior-attempt artifact does not close the current item) | yes | T3 | yes — case (e): stale-hash fixture; red = item wrongly `closed` (demonstrated live on this Change's own `ec2f8295…` report) | covered |
| AC-11 (persona-aware evidence: `report-<persona>.md` counts) | yes | T3 | yes — case (f): two persona reports, no consolidated report; red = item `open` today | covered |

## Simplicity axis

- Selected rung: **confirmed** — still a direct local change. Plan 3 adds two module-private helpers (`staleHashes`, revised `itemIsDelivered`) and one internal parameter (`record`) to T3, all inside `session.ts`; no new module, store, CLI verb, schema field, or dependency. The freshness gate reuses `change.yaml` data already in memory; the prefix match reuses the existing artifact-entry shape.
- Safety floor preserved: session stays disposable/gitignored/non-governing; reconciliation read-only and only on derivation (`loadOrDerive:85-91` return path untouched); freshness gate is fail-safe (identical→`open`); trace stays fail-open; existing validation/256 KB bound/cycle-check/locking untouched; checkpoint validation and `parseStatusPaths` untouched.
- Surface delta unchanged from the Plan-2 forecast (`session.ts`, `trace.ts`, `improvement-report.ts`, `change.test.ts`, `improvement-report.test.ts`, `SESSION.md`, `CONTEXT.md`, 4 `SKILL.md`, `skills-contract.test.mjs`).

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| — | — | already sufficient | — | no finding survives validation on the simplicity axis |

Deferred constraints sound, including the new DC-4 (persona *item ids* not derived — pre-existing `claim review-security` failure, unchanged by this Change; upgrade path via coordinator-declared prime-time items or `personaSubEvents` derivation).

## Executability audit

- Paths/interfaces: all edits internal; `SessionItem`/`StageSession` frozen; `TraceEntry` gains one variant (`trace.read` tolerates unknown shapes). `deriveItems` gains `record` (already loaded — zero new I/O).
- **Path-normalization detail (implementation, decidable):** `change.yaml` artifact paths are workspace-relative (`.codepatrol/changes/<id>/review/report.md`) while `STAGE_ITEMS` artifact entries are change-dir-relative (`review/report.md`); `staleHashes` ↔ `itemIsDelivered` must normalize to compare. Not specified explicitly, but trivial and unambiguous — the implementer resolves it. Does not block.
- **Prefix over-matching (fail-safe):** `<basename>-*.md` would also match e.g. `report-draft.md`; such a file counts only if non-empty AND fresh, and only moves the item toward `closed` — the direction a reviewer intends. Acceptable.
- **Uncommitted-stale edge case (residual):** a prior attempt that wrote an artifact then crashed/returned *before* checkpointing leaves an uncommitted file not present in any `change.yaml` binding, so the freshness gate would not flag it. Bounded by other lifecycle guards (transitions require clean trees / the file would be swept or block the next checkpoint) and far rarer than the committed-stale case the gate does catch. Noted as residual, not blocking.
- Commands/gate: `npm run verify`, re-enforced at Apply seal via `applyGate`.
- Red/green: every task specifies a concrete falsifiable red (T1 throws/mis-derives; T2 count mismatch; T3 cases a–f each specified with expected red including the stale-hash `closed` and persona `open`; T4 no session trace + absent recommendation; T5 word mismatch). T6 step 3's hardcoded-attempt defect is fixed and explains the failure mode.
- Self-consistency: this Change's own `plan.md` `**Depends on:**` lines remain bare `None`/`T<n>` lists, so Apply can prime under the current parser before T1 lands.
- Rollback: revert the branch; sessions disposable.
- Unresolved assumption: none material.

## Verdict

`approve`

Plan attempt 3 resolves Apply-2's contract defect (T6's hardcoded attempt) and, in the same revision, fixes a genuine latent defect in the Plan-2 reconciliation design that would have made the Change's own feature credit invalidated attempts' committed work — concretely demonstrable on this Change's state today (the invalidated review-2 report on disk). The freshness-gate fix (AC-10) and the persona-aware prefix match (AC-11) are sound, decidable from data already recorded, fail-safe, red-capable, and localized to T3's file with no new module/store/dependency; the frozen session schemas, disposability, read-only-on-derivation invariant, and fail-open trace are all preserved. All eleven acceptance criteria are unambiguous and mapped to red-capable tasks; first-hand evidence (the live stale-report demonstration, the per-attempt hashes in `change.yaml`, the persona-naming skills, `ROLES.md:45`) checks out. The Plan is complete enough for an independent implementer. Next permitted transition: Review checkpoint with result `approve`, advancing to Apply. Next action: `codepatrol-apply 2026-07-25-session-handoff on codepatrol/2026-07-25-session-handoff`.

## External evidence sufficiency

Not required. No external/dependency/protocol claim governs the design. The semantics invoked — SHA-256 freshness comparison against recorded bindings, prefix-glob artifact matching, append-only trace feeding an aggregation — are internal to this codebase, established by its own conventions, and require no Reference Concept Analysis.

## Residual concerns and evidence gaps

- Uncommitted-stale edge case (above) — residual, bounded by other lifecycle guards; the freshness gate covers the documented, concretely-reproduced committed-stale threat.
- Path normalization between `change.yaml` (workspace-relative) and `STAGE_ITEMS` (change-dir-relative) is unspecified but trivially decidable at implementation time.
- The investigation's Finding 6 cites the parallel test's `findings-<persona>.md` fixtures alongside the skills' `report-<persona>.md` convention; the implemented prefix (`review/report`) matches the skill/production convention exercised by AC-11 case (f), not the test-only `findings-*` naming. Consistent with the production contract; recorded for completeness.
- Could not re-run the full baseline gate at `c8d8ddc` within this review (Review does not execute the candidate gate — Verify's role); baseline-green rests on the prior Change's terminal Close + clean typecheck of cited files. Does not block approval.
