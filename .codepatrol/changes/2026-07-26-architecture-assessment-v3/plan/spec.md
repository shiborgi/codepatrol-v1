# Specification — Whole-codebase architecture assessment (v3): legacy removal candidates and structural improvement points

## Intent

- Origin: improve-codebase
- Mode: architecture
- Target baseline: `main` @ `264e87e` (branch `codepatrol/2026-07-26-architecture-assessment-v3`), clean tree, `npm run verify` green (215/215 tests)
- Governing constraints: `docs/runtime-state.md:20-22` — "No root `.codepatrol` scratch JSON, duplicate status cache, **architecture namespace** or durable ADR is supported." This explicitly forbids recreating a `docs/codepatrol/assessments/`-style standalone document (the namespace the v1/v2 assessments used, retired by `2026-07-25-docs-consolidation`). This Change's findings therefore live entirely in this spec plus the structured backlog — no new document file.
- Substrate state: graph synced this Plan attempt — 73 files, 2119 symbols, 416 import edges, 4370 call edges (`codepatrol graph sync`, run directly). No `docs/adr/` exists (none has ever existed in this repo, by design — 0 ADR across 24 prior Changes).
- Improvement signals (from `.codepatrol/docs/improvement-reports/2026-07-26-close-resolves-backlog.md`, most recent by mtime): not read as a separate step for this Change — an architecture-mode Plan's "improvement signal" *is* this assessment itself; the prior close-trace recommendations (command-invocation-count telemetry) are workflow signals already tracked as their own backlog items, not architecture findings, and are out of scope here.
- Problem: the codebase has grown through 24 committed Changes since the last architecture assessment (`2026-07-24-architecture-assessment-v2`, `main`@`5674289`) without a fresh whole-codebase pass. Two still-open findings from that assessment (N2 test-coverage gaps, N3 orchestrator density) were re-verified this Plan and remain accurate and unchanged. A fresh pass over the code added or touched since v2 (`backlog.ts`, `issue-sync.ts`, CLI command plumbing, `orchestrator.ts`'s Close path) surfaces two new, concrete, low-risk findings not previously tracked.
- Outcome: this spec's Current evidence section is the complete, durable record of what was found (superseding the need for a separate assessment document); each new actionable finding is filed as a structured, queryable backlog item (`source.kind: "plan-followup"`) rather than left as static prose; still-open pre-existing findings are explicitly reconciled (confirmed-still-true or resolved) rather than silently dropped or duplicated.

## Scope

### In scope

- A systematic whole-codebase scan for: (a) dead/unreferenced exports, (b) redundant or duplicated public API surface, (c) architecture layering violations, (d) unresolved findings from the prior (v2) assessment.
- Filing each new actionable finding as a backlog item, priority-classified, with `file:line` evidence.
- Explicit reconciliation of every still-open v2 finding (N1, N2, N3) against the current tree.
- No production code change — this is an investigation-only Change, matching the precedent set by `2026-07-24-architecture-assessment` and `-v2` (doc-only, zero `changes` in the Apply checkpoint).

### Out of scope

- Implementing any finding's fix — each filed backlog item is a candidate for its own future bounded Change, per this repo's established "assessment finds, a separate Change fixes" discipline (already followed for N1–N4 in v1/v2, and for this Change's own predecessor `close-does-not-auto-resolve-...`).
- Workflow/telemetry findings (top error codes, command-invocation counts) — those are already tracked as their own backlog items from Close-trace analysis, a different signal source than an architecture scan, and are not re-examined here.
- Re-auditing skills/, `.pi/`, `.opencode/commands/`, or distribution-adapter surfaces in depth — spot-checked (catalog wiring, package.json `files`/`bin` entries, README-documented install path) and found consistent with no orphaned entries; a deeper skills-specific audit is a different, larger investigation than this code-focused pass.

## Current evidence

**Method:** `codepatrol graph sync` once; then, for every production (`*.ts`, non-test) exported symbol across `src/`, a script (`/tmp` scratch, not committed) checked whether the symbol's name appears anywhere else in the repo outside its own declaration line — 215 exports checked, cross-verified by hand for the two matches to rule out false positives (same-file internal use, type-only re-export). Supplemented by targeted `grep`/`wc -l`/`git ls-files` checks for layering, size, and namespace-hygiene questions. Every citation below was read directly, not inferred from the script alone.

### New findings (not previously tracked)

**F1 — Dead, duplicated `.codepatrol/changes` path-builder helpers.**
- `src/change/store.ts:11` — `export function changeDirectory(workspace, workId): string` returns `.codepatrol/changes/${workId}`. Zero callers anywhere in `src/` (confirmed by the export-usage script and a direct `grep -rn "changeDirectory\b" src/`).
- `src/shared/state.ts:17` — `export function changeRoot(workspace): string` returns `.codepatrol/changes` (no `workId`). Also zero callers anywhere (same method).
- Meanwhile, the one place that actually needs this path, `src/change/store.ts:31` (`listWorkingTreeChangeIds`), hardcodes the literal string `.codepatrol/changes` inline rather than calling either helper — confirmed by reading the line directly.
- Severity: low risk, safe to remove — pure dead code with no runtime effect, confirmed by two independent methods (script + direct read of every call site).

**F2 — Redundant non-throwing validators in `src/change/validation.ts`.**
- The file (read in full) defines two full pairs of near-identical functions: `validateArtifactBindings`/`validateArtifactBindingsFromReader` (return a `ValidationResult`, never throw) and `validateStageArtifacts`/`validateStageArtifactsFromReader` (call the first pair, then throw `CHANGE_DRIFT` if invalid).
- `src/change/orchestrator.ts:16,118,130` — production code imports and calls *only* the throwing pair (`validateStageArtifacts`, `validateStageArtifactsFromReader`).
- `validateArtifactBindingsFromReader` (`validation.ts:51`) has zero importers anywhere in the repo, including tests — confirmed by `grep -rn "import.*validateArtifactBindingsFromReader" src/`, zero matches. It exists solely to be called once, internally, by its own file's `validateStageArtifactsFromReader` (line 54) — the internal call could go directly to the private `validateWithReader` (line 22) instead, which is what `validateArtifactBindingsFromReader`'s body does verbatim.
- `validateArtifactBindings` (`validation.ts:42`) is imported by exactly one caller in the entire repo: `src/change/change.test.ts:14`, a single test exercising the non-throwing path directly. Confirmed by `grep -rn "import.*validateArtifactBindings\b" src/`.
- Severity: low risk. Not dead code (one real test caller), but redundant public surface: the module exports 4 functions where production code needs 2, and the internal-only wrapper (`validateArtifactBindingsFromReader`) should not be exported at all.

**Considered, not filed:** `src/change/backlog.ts` reimplements the same "for key of `Object.keys(x)`, reject if not in an allow-set" idiom four times inline (`ALLOWED_ITEM_KEYS`/`ALLOWED_SOURCE_KEYS`/`ALLOWED_EXTERNAL_REF_KEYS`/`ALLOWED_ROOT_KEYS` at `backlog.ts:36-39`, applied at lines 52/66/76/95) instead of reusing the structurally identical `exactInput`/`requireObject` helper already private to `src/change/orchestrator.ts:29,33`. This is a genuine DRY opportunity but not a defect — both implementations are correct and independently tested; consolidating them would require either exporting `orchestrator.ts`'s private helper (a small layering question — should validation-shape helpers live in `orchestrator.ts` at all?) or extracting a new shared module for two call sites. Not filed as a backlog item: no functional gap, no risk, and the "is this worth a shared module for two files" judgment call is better made by whoever next touches either file with a concrete reason, not manufactured here.

### Reconciliation of prior (v2) findings

| ID | v2 finding | Current status |
|---|---|---|
| N1 | Dead error-code taxonomy (`ARTIFACT_INVALID`, `WORKFLOW_*` in `errors.ts:7,13-15`) | Still open, still accurate — re-confirmed by `grep -rn "ARTIFACT_INVALID\|WORKFLOW_NOT_FOUND\|WORKFLOW_INVALID\|WORKFLOW_CONFLICT" src/`: zero usages outside the `ErrorCode` union declaration itself. Already a tracked backlog item (`dead-taxonomy-unused-error-codes-artifact-invalid-and-workflow-in-errors-ts`, p3); not re-filed. |
| N2 | Core module test-coverage gaps (`atomic-store.ts`, `graph/languages.ts`, `graph/queries.ts` lack dedicated tests) | Still open, still accurate — re-confirmed: no `atomic-store.test.ts`, `languages.test.ts`, or `queries.test.ts` exists anywhere in `src/`. Already tracked (`core-module-test-coverage-gaps-...`, p2); not re-filed. |
| N3 | `orchestrator.ts`'s `transitionChangeLocked` is dense (~88 lines, mixes validation/persona/storage) | Still open, still accurate — re-measured at 89 lines (`orchestrator.ts:219-307`), materially unchanged since v2 despite 24 intervening Changes touching the file (`close-resolves-backlog` added ~8 lines to a *different* function, `closeChangeLocked`, not this one). Already tracked (`orchestrator-transitionchangelocked-is-dense-...`, p2); not re-filed. |
| N4 | Unsafe duplicate YAML reader in `improvement-report.ts:33` | Resolved — fixed by `2026-07-25-remove-duplicate-reader` (`main`@`932edcc`); confirmed absent by reading the current file (no second reader function, `migrateRecord` is the sole normalization path). |

### Positive finding (evidence gathered, not just absence of a problem)

Layering is clean: `grep -rln "from \"\.\./cli/` over `src/change/`, `src/graph/`, `src/shared/` returns zero matches (nothing outside `src/cli/` imports from it), and `grep -rln "from \"\.\./change/` over `src/graph/`, `src/shared/` also returns zero matches (the generic `graph`/`shared` subsystems do not depend on the domain-specific `change` orchestration layer). Confirmed directly, not assumed — worth recording since it demonstrates the layering has held under 24 Changes of organic growth, not merely that no one looked.

## Proposed design

No code change. The "design" this Change proposes is procedural: file F1 and F2 as structured backlog items (`plan-followup`, this work id, priority `p3` matching the established precedent for safe/mechanical dead-code findings like N1), each carrying the exact evidence above so a future bounded Change can act on it without re-deriving the investigation. This spec itself is the durable record — no `docs/`-namespace file is created, honoring `docs/runtime-state.md`'s explicit prohibition and the precedent `2026-07-25-docs-consolidation` set when it retired the v1/v2 doc files.

## Alternatives

- **Write a new `docs/codepatrol/assessments/2026-07-26-architecture-v3.md`, following the v1/v2 pattern exactly:** rejected — `docs/runtime-state.md:20-22` explicitly forbids an "architecture namespace," and `2026-07-25-docs-consolidation` already retired the two v1/v2 files specifically to resolve this contradiction. Repeating the pattern would reintroduce the exact problem that Change fixed.
- **Fix F1/F2 directly in this same Change instead of filing them:** rejected — mixes an investigation-mode Change (zero production diff, matches the assessment precedent) with implementation-mode work; each fix is small enough to be its own fast, independently-reviewable bounded Change (as N4/dead-duplicate-reader already demonstrated for a near-identical class of finding), and bundling both here would make this Change's own Apply checkpoint diff nonzero, breaking the doc-only pattern Review/Verify expect from `mode: architecture`.
- **File F3 (the DRY duplication) as a backlog item too, for completeness:** rejected — see "Considered, not filed" above; no functional gap, and manufacturing a backlog item for a stylistic preference with no concrete trigger would lower the signal-to-noise of the backlog, contrary to the discipline this session has maintained (e.g., v1's F2/F6/F7 were explicitly *not* filed for analogous reasons).

## Simplicity decision

- Selected rung: need (a whole-codebase read-only investigation cannot be reduced further; the deliverable itself — findings plus filed backlog items — is the minimum needed to make the analysis actionable)
- Earlier rungs: not applicable — this is investigation work, not an implementation choice with a ladder of increasingly heavy mechanisms.
- Irreducible complexity: none introduced — zero production surface change.
- Safety floor: not applicable (no code mutation).
- Expected surface delta: `.codepatrol/backlog/items.yaml` (+2 items, F1 and F2). No source file changes.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | F3 (backlog.ts's inline key-validation duplication) is documented in this spec but not filed as a backlog item | If a third or fourth module reimplements the same exact-key-validation idiom, the duplication compounds past a single reasonable judgment call | A future Change independently proposes a third inline reimplementation of the "reject unknown object keys" pattern | Extract a shared `assertExactKeys(value, allowed, label)` helper (from either `orchestrator.ts`'s `exactInput` or a new `src/shared/` module) and migrate all call sites in one bounded Change |

## Compatibility and rollout

- No migration, no code change, no schema version bump.
- The two new backlog items are additive data in the sanctioned `.codepatrol/backlog/items.yaml` file; no other system reads or depends on their absence.
- Rollback: revert the single backlog-add commit; the two items disappear, no other state depends on them existing.
- Observability: both new items are immediately visible via `codepatrol backlog list` and the Kanban's Backlog column, same as every other backlog item.

## Risks and mitigations

- Risk: the dead-export detection script could have false negatives (a symbol used only via a re-export chain the script's single-pass text search misses) or false positives (a symbol used only in a context the script's regex doesn't match, e.g. dynamic property access). Mitigation: both F1 and F2 findings were independently re-confirmed by direct, targeted `grep` commands quoted verbatim in the evidence above — the script's output was a lead, not the final proof, consistent with `_shared/ROLES.md`'s "graph edges are leads... verify cited locations directly" principle applied to this ad-hoc script the same way it applies to the code graph.
- Risk: filing backlog items for very small findings could contribute to backlog noise over time. Mitigation: both are priority `p3` (matching N1's precedent for safe, low-urgency dead-code items, not competing with p1/p2 items for attention), and the "Considered, not filed" section above shows the same discipline was applied to exclude a third, lower-value candidate.

## Acceptance criteria

- AC-1: This spec's "Current evidence" section contains F1 and F2, each with a `file:line` citation for every claim, re-verified by a `grep` command whose output is quoted or directly summarized (not merely asserted).
- AC-2: Every prior (v2) still-open finding (N1, N2, N3) is explicitly reconciled in a table with its current status re-confirmed on this Plan's tree, not carried forward by assumption; N4 is confirmed resolved.
- AC-3: `codepatrol backlog list --format json` (after this Change's Apply) includes exactly two new items matching F1 and F2's titles, each with `source: { kind: "plan-followup", workId: "2026-07-26-architecture-assessment-v3" }` and `priority: "p3"`.
- AC-4: `git diff --stat` against this Change's base commit, at Apply's completion, touches only `.codepatrol/backlog/items.yaml` — zero production source files changed, matching the "assessment finds, does not fix" scope decision.

## Decisions and open questions

- Decision: no new `docs/`-namespace file — the retired v1/v2 pattern is not repeated; this spec is the complete durable record. Settled, see Alternatives.
- Decision: F1 and F2 are filed to backlog, not fixed inline; F3 is documented but explicitly not filed (DC-1). Settled, see Alternatives and Deferred constraints.
- No open questions remain that could change scope, interfaces, or acceptance.
