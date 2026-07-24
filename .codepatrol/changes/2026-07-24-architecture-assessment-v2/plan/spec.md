# Specification — Fresh architecture, skills, and workflow re-assessment (v2)

## Intent

- Origin: improve-codebase
- Mode: architecture
- Target baseline: `main` @ `3ba78c140712fbeb35dbc31ada0b4b62cc102d85`; clean worktree; `npm run verify` green at baseline.
- Governing constraints: `CONTEXT.md` domain vocabulary; `AGENTS.md` sources-of-truth and ownership. No ADRs (`docs/adr/` absent). None block this design.
- Substrate state: graph synced (73 files, 1869 symbols); wiki absent (valid substrate state).
- Improvement signals (most recent report `docs/codepatrol/improvement-reports/2026-07-24-persona-subevent-helpers.md`):
  - Command `change.transition` invoked 13 times — consider caching or batching repeated invocations. (Recurring across reports; recorded as an accepted design cost — one event per transition.)
  - No returns or notable errors in that report.
- Problem: Four Changes have landed since the v1 assessment (baseline moved `415f779`→`3ba78c1`): F1 (Stage-Session ergonomics), F5 (CLI input ergonomics), F3 (migration normalizer), F4 (persona sub-event helpers). The v1 finding list is drained of clean bounded code fixes — F2 is an external data gap, F6 is by-design, F7 is an adoption decision — so the project needs a fresh, evidence-based scan of the current tree to reconcile the v1 backlog and surface the next actionable improvement points.
- Outcome: A new durable v2 assessment document exists under `docs/codepatrol/`, reconciling every v1 finding and ranking new findings with `file:line` evidence, severity, and disposition (delivered / new-fix / carry / by-design / decision).

## Scope

### In scope

- A durable v2 assessment document that: (a) reconciles the v1 findings (F1/F3/F4/F5 delivered; F2 external; F6 by-design; F7 adoption decision); (b) ranks the new findings discovered on the current tree, each with `file:line` evidence, severity, and one proposed bounded follow-up work-id; (c) records the recurring transition/session invocation-count signal as an accepted design cost with rationale.

### Out of scope

- Any production code change — this is a pure architecture scan; the only durable artifact is the assessment document.
- Implementing any finding (each new finding names a bounded follow-up Change instead).
- Re-deriving the v1 findings' internals already recorded in `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md`.

## Current evidence

New findings verified on the current tree:

- **Dead `ErrorCode` members** — `src/shared/errors.ts:7` (`ARTIFACT_INVALID`), `:13-15` (`WORKFLOW_NOT_FOUND`, `WORKFLOW_INVALID`, `WORKFLOW_CONFLICT`) have zero references anywhere in `src`, `scripts`, or `skills` outside the union definition (`grep` confirmed 0 each). `PUSH_FAILED` (`git.ts:110`), `STATE_INCOMPATIBLE` (`wiki/record.ts:198`), and `GRAPH_NOT_FOUND` (2 uses) are live. Confidence: high.
- **Direct test-coverage gaps** — `src/shared/atomic-store.ts` (the crash-safety durability primitive) has no direct test; it is exercised only indirectly through `change/session.ts`, `change/store.ts`, `graph/store.ts`, `wiki/record.ts`. `src/graph/languages.ts` and `src/graph/queries.ts` also lack direct tests. Confidence: high (`find`/`grep`).
- **`transitionChangeLocked` density** — `src/change/orchestrator.ts:206-293` remains ~88 lines with mixed responsibilities (validation, persona routing, gate, git commit, delta reconciliation). The v1 F3 migration-centralization landed, but this decomposition (F3's other half) is still open. Confidence: high.
- **`improvement-report.ts` raw reader** — `src/change/improvement-report.ts:33` reads records without the new `migrateRecord` normalization (v1 F3 DC-2); it has a test file but not for legacy inputs. Confidence: high.
- **No `TODO`/`FIXME`/`HACK` markers** in `src` (clean). Confidence: high.

v1 reconciliation evidence:

- F1/F5/F3/F4 delivered — `codepatrol/committed/*` tags exist; behaviors covered by the 157→current test suite.
- F6 by-design — `scripts/install-lib.mjs` uses only `symlinkSync`; README documents only the symlink installer; no copy-install path is promised.
- F7 adoption decision — `src/wiki/*` (889 LOC) is wired (`wiki generate` CLI at `commands.ts:106`; `codebase-wiki` in `skills/catalog.yaml:95`) but unadopted (`wiki status` → `exists:false`).
- F2 external — `src/change/usage.ts` fully supports `measured`; no CLI-readable authoritative per-run usage source exists.

## Proposed design

Author `docs/codepatrol/assessments/2026-07-24-architecture-v2.md` with:

1. A reconciliation table for the v1 findings (F1–F7) with current disposition.
2. A ranked new-findings table — columns: id, area (architecture|skills|workflow), severity, `file:line` evidence, proposed follow-up work-id. Ranked new findings:
   - **N1 — Dead `ErrorCode` members** (Low, workflow/clarity): remove the four unused union members. Follow-up `2026-07-25-prune-error-codes`.
   - **N2 — Durability primitive untested** (Medium, architecture): add direct crash/rename tests for `atomic-store.ts` (and `graph/languages.ts`, `graph/queries.ts`). Follow-up `2026-07-25-atomic-store-tests`.
   - **N3 — `transitionChangeLocked` density** (Medium, architecture; carry of v1 F3): decompose into validation/persona/reconciliation seams. Follow-up `2026-07-25-transition-decomposition`.
   - **N4 — `improvement-report.ts` un-normalized reader** (Low, carry of v1 F3 DC-2): route through `migrateRecord`. Follow-up `2026-07-25-report-reader-normalize`.
3. A short "accepted costs / decisions" section: F2 external gap (spike or accept); F6 symlink-only by design (won't-fix); F7 wiki adoption decision (adopt via `wiki generate` or accept unused optional surface); the recurring transition-count signal (one event per transition — accepted).
4. A method note (baseline, graph revision, gate result, telemetry sources).

## Alternatives

- **Bundle a code fix (e.g. implement N1) into this Change.** Rejected: the maintainer chose a doc-only re-scan; keeping it doc-only preserves the bounded-Change boundary and lets each new finding become its own reviewable Change.
- **Skip the durable doc and report inline.** Rejected: the assessment's value is a durable, citable backlog that seeds future Changes and reconciles v1.
- **Amend the v1 assessment file in place.** Rejected: v1 is a historical record at its baseline; a new dated v2 file preserves provenance.

## Simplicity decision

- Selected rung: direct local change — one new documentation file; no code.
- Earlier rungs: need is real (v1 backlog drained; fresh evidence required); no reuse produces a current prioritized backlog.
- Irreducible complexity: capturing verified findings and dispositions; hidden behind the document structure.
- Safety floor: every cited `file:line` verified against the current tree; no production code touched; gate stays green.
- Expected surface delta: create `docs/codepatrol/assessments/2026-07-24-architecture-v2.md`. No code, dependencies, config, or events.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | Findings recorded, not implemented | The debt (N1–N4) persists until scheduled | Maintainer starts a follow-up work-id | Execute the named bounded follow-up Change |
| DC-2 | F2/F6/F7 dispositioned, not resolved | Usage stays hollow; wiki stays unadopted | A product decision is made | F2 spike; F7 `wiki generate`; F6 stays by-design |

## Compatibility and rollout

- Additive documentation only; no code, schema, lifecycle, or Git behavior change. Rollback = revert the branch. No security/privacy/performance/accessibility impact.

## Risks and mitigations

- A cited `file:line` drifts before sealing. Mitigation: the plan's authoring task re-verifies every citation against the working tree before checkpoint.
- A "dead" error code is actually referenced dynamically. Mitigation: the four were grep-confirmed across `src`/`scripts`/`skills` with zero hits; N1 is a recommendation, not executed here, so any miss is caught when its follow-up Change is planned.

## Acceptance criteria

- AC-1: `docs/codepatrol/assessments/2026-07-24-architecture-v2.md` exists and contains a v1 reconciliation table (F1–F7 with current disposition) and a ranked new-findings table, each new finding carrying `file:line` evidence, a severity, and a proposed follow-up work-id.
- AC-2: Every `file:line` cited in the document resolves to the described construct on the current tree (`3ba78c1`).
- AC-3: The document explicitly dispositions F2 (external), F6 (by-design/won't-fix), and F7 (adoption decision), and records the recurring transition/session invocation-count signal as an accepted design cost.
- AC-4: `npm run verify` exits 0 on the candidate (enforced at Apply seal by `.codepatrol/config.json` `applyGate`).

## Decisions and open questions

- Decided (maintainer, this session): direction = fresh re-scan producing a new prioritized assessment document (doc-only, no bundled code fix), after validating the v1 backlog is drained of clean bounded code fixes.
- Decided: F6 stays by-design; F7 is an adoption decision surfaced for the maintainer; F2 remains external.
- No open question can materially change scope, interfaces, or acceptance.
