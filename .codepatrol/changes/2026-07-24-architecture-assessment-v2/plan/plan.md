# Plan — Fresh architecture, skills, and workflow re-assessment (v2)

- Work id: `2026-07-24-architecture-assessment-v2`
- Governing spec: `spec.md`
- Target baseline: `main` @ `3ba78c140712fbeb35dbc31ada0b4b62cc102d85`; clean worktree; `npm run verify` green.

## Goal and approach

Produce one durable v2 assessment document that reconciles the v1 findings and ranks the new findings discovered on the current tree, each with verified `file:line` evidence and a proposed bounded follow-up. Doc-only; no production code. One authoring task plus one verification task.

## Global constraints

- Markdown only; no code, dependencies, config, or events.
- Every cited `file:line` must resolve on the current tree before sealing.
- Do not amend the v1 assessment file; create a new dated v2 file.
- Gate that must stay green: `npm run typecheck && npm test && npm run build && npm run smoke:cli && npm run lint:skills`.

## Simplicity proof

- Selected rung: direct local change — one documentation file.
- Reused capabilities: existing assessment format (v1 doc as template), existing improvement reports, graph/grep evidence.
- Forbidden speculative surface: no code change, no v1-file edit, no implementation of any finding.
- Expected surface delta: create `docs/codepatrol/assessments/2026-07-24-architecture-v2.md`.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T1 | Inspect the doc: v1 reconciliation table + ranked new-findings table with evidence/severity/follow-up |
| AC-2 | T1 | Re-verify each cited `file:line` (`grep`/`sed -n`) against the working tree |
| AC-3 | T1 | Inspect the doc: explicit F2/F6/F7 disposition + accepted transition-count cost |
| AC-4 | T2 | `npm run verify` exits 0 |

## Dependency order

`T1 → T2`.

### T1 — Author the v2 assessment document

**Purpose:** Satisfies AC-1, AC-2, AC-3.

**Depends on:** None

**Files:**

- Create: `docs/codepatrol/assessments/2026-07-24-architecture-v2.md`

**Interfaces:**

- Produces: a document with (1) a v1 reconciliation table (F1 delivered, F2 external, F3 delivered [migration half] + carry [decomposition], F4 delivered, F5 delivered, F6 by-design, F7 adoption decision); (2) a ranked new-findings table N1–N4 with `file:line`, severity, area, and follow-up work-id; (3) an accepted-costs/decisions section; (4) a method note.

**Simplicity proof:** Pure documentation modeled on the v1 assessment; no code dependency.

**Steps:**

1. Write the document with the four sections from the spec's Proposed design. Cite only verified locations:
   - N1 dead codes: `src/shared/errors.ts:7` (`ARTIFACT_INVALID`), `:13-15` (`WORKFLOW_*`).
   - N2 coverage gaps: `src/shared/atomic-store.ts`, `src/graph/languages.ts`, `src/graph/queries.ts` (no direct test files).
   - N3 density: `src/change/orchestrator.ts:206-293` (`transitionChangeLocked`).
   - N4 reader: `src/change/improvement-report.ts:33`.
   - F6: `scripts/install-lib.mjs` (`symlinkSync`). F7: `src/cli/commands.ts:106` (`generateWiki`), `skills/catalog.yaml:95` (`codebase-wiki`). F2: `src/change/usage.ts`.
2. Re-verify every citation: for each `path:line`, run `sed -n '<line>p' <path>` (or `grep -n`) and confirm the construct matches; correct any drift.

**Task result:** append the created path and citation-verification evidence to `apply/journal.md`.

### T2 — Final verification and reconciliation

**Purpose:** Confirms AC-4 and whole-Change integrity.

**Depends on:** T1

**Files:**

- Modify: none (verification only)

**Steps:**

1. Map the delivered document back to AC-1…AC-3; confirm each is satisfied.
2. Run the full gate: `npm run verify`. Expected exit 0 (also enforced at the Apply `implemented` checkpoint by `.codepatrol/config.json` `applyGate`).
3. Inspect the final diff (`git diff --stat` vs base `3ba78c1`) for undeclared work; confirm only the one assessment document changed.
4. Reconcile actual surface delta with the spec forecast; explain any difference in the journal.
5. Record whether any `DC-N` trigger activated (expected: none).
6. Run `codepatrol graph sync`; wiki remains absent (valid) — no wiki refresh required.
7. State rollback (revert branch; no migration) and residual risks (N1–N4 remain proposed follow-ups; F2/F6/F7 dispositioned).

**Task result:** append the final reconciliation to `apply/journal.md`.
