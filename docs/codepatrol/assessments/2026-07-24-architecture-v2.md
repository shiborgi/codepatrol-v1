# Architecture, skills, and workflow assessment (v2)

This document provides a fresh assessment of the Codepatrol architecture, skills, and workflow at baseline `3ba78c140712fbeb35dbc31ada0b4b62cc102d85`, following the delivery of four targeted changes.

## v1 Reconciliation

The previous assessment (`docs/codepatrol/assessments/2026-07-24-architecture-workflow.md`) highlighted seven findings. Their current status:

| v1 Finding | Status |
|---|---|
| F1 (Stage-Session ergonomics) | **Delivered** in `2026-07-24-architecture-assessment`. |
| F2 (Usage/cost subsystem hollow) | **External**. Requires harness coordination; no immediate internal fix. |
| F3 (Orchestrator density / scattered migrations) | **Partial**. `2026-07-24-migration-normalizer` delivered the migration half. Density carries over to v2. |
| F4 (Persona consolidation logic risk) | **Delivered** in `2026-07-24-persona-subevent-helpers`. |
| F5 (CLI input ergonomics) | **Delivered** in `2026-07-24-cli-input-ergonomics`. |
| F6 (Distribution portability) | **By-design**. The symlink installation is functioning exactly as intended for a development tool. We accept this design. |
| F7 (Wiki subsystem unused) | **Decision: Deferred**. Wiki adoption is deferred until broader usage validates its necessity. |

## Ranked new findings (v2)

| Finding | Area | Severity | Evidence | Proposed follow-up work id |
|---|---|---|---|---|
| **N1 — Dead taxonomy / unused error codes** | Architecture | Low | `src/shared/errors.ts:7`, `:13-15` | `2026-07-25-remove-dead-errors` |
| **N2 — Core module test coverage gaps** | Quality | Medium | `src/shared/atomic-store.ts`, `src/graph/languages.ts`, `src/graph/queries.ts` lack dedicated tests | `2026-07-25-core-test-coverage` |
| **N3 — Orchestrator transition density** | Architecture | Medium | `src/change/orchestrator.ts:206-293` | `2026-07-25-orchestrator-refactor` |
| **N4 — Unsafe duplicate YAML reader** | Architecture | High | `src/change/improvement-report.ts:33` | `2026-07-25-remove-duplicate-reader` |

## Detailed findings

### N4 — Unsafe duplicate YAML reader (High)
The file `src/change/improvement-report.ts` bypasses the centralized read boundary and parser. It directly imports `node:fs` and `yaml` and parses the record independently on line 33. This circumvents the newly established `migrateRecord` normalization seam and invariant validation, risking silent state corruption or crash on legacy records.

### N3 — Orchestrator transition density (Medium)
The `transitionChangeLocked` function remains highly dense and difficult to maintain safely, spanning lines 206 to 293 in `src/change/orchestrator.ts`. It still contains complex nesting and mixed validation, persona semantics, and storage responsibilities. This needs to be decomposed into distinct strategy or reducer patterns.

### N2 — Core module test coverage gaps (Medium)
Several core foundation files (`src/shared/atomic-store.ts`, `src/graph/languages.ts`, `src/graph/queries.ts`) lack dedicated `*.test.ts` suites. While currently exercised via integration paths like `smoke:cli`, direct characterization tests are needed to ensure future modifications are safe.

### N1 — Dead taxonomy / unused error codes (Low)
The `CodepatrolError` union in `src/shared/errors.ts` contains unused codes such as `ARTIFACT_INVALID` (line 7) and `WORKFLOW_*` (lines 13-15) which do not correspond to any active error throw in the codebase. Pruning these reduces API surface area.

## Accepted costs and decisions

1. **F2 (Usage):** The usage and cost subsystem remains hollow. We accept this constraint because providing authoritative token/cost data is the responsibility of the executing harness/coordinator.
2. **F6 (Portability):** The use of `symlinkSync` in `scripts/install-lib.mjs:192` is explicitly accepted as the correct distribution model for this development-stage CLI.
3. **F7 (Wiki adoption):** The wiki subsystem (e.g., `src/cli/commands.ts:106`, `skills/catalog.yaml:95`) remains unused. We accept this surface area for future evaluation.
4. **Transition-count cost:** We accept that an orchestration agent may perform several transitions. This is not considered a defect, provided each operation is atomic and fast.

## Method note
- Baseline: `main` @ `3ba78c140712fbeb35dbc31ada0b4b62cc102d85`
- Graph/grep tools used to confirm unused taxonomy and direct file dependencies.
- Gates: `npm run verify` exits 0 (165 tests, strict typechecking).
