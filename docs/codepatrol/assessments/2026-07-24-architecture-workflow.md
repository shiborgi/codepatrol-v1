# Architecture, skills, and workflow assessment

This document provides a ranked assessment of the current Codepatrol architecture, skills, and workflow based on project telemetry and codebase inspection at baseline `415f779bde14e57ad0af7ac4cd25657bcea00fcd`.

## Ranked findings

| Finding | Area | Severity | Evidence | Proposed follow-up work id |
|---|---|---|---|---|
| **F1 — Stage-Session ergonomics** | Workflow | High | `src/change/session.ts:73`, `src/cli/commands.ts:124-133` | (Implemented in this Change) |
| **F2 — Usage/cost subsystem hollow** | Architecture | High | `src/change/usage.ts:1`, `src/change/model.ts:1` (aggregateUsage) | `2026-07-25-usage-adapter` |
| **F3 — Orchestrator density / scattered migrations** | Architecture | Medium | `src/change/orchestrator.ts:200-287`, `src/change/model.ts:59-61` | `2026-07-25-orchestrator-refactor` |
| **F4 — Persona consolidation logic risk** | Architecture | Medium | `src/change/orchestrator.ts:225-231`, `src/change/orchestrator.ts:281` | `2026-07-25-persona-state-machine` |
| **F5 — CLI input ergonomics** | Workflow | Low | `src/cli/commands.ts:46` | `2026-07-25-cli-input-ergonomics` |
| **F6 — Distribution portability** | Architecture | Low | `scripts/install-lib.mjs:1` | `2026-07-25-distribution-portability` |
| **F7 — Wiki subsystem unused** | Workflow | Low | `wiki status` (exists:false) | `2026-07-25-wiki-adoption` |

## Detailed findings

### F1 — Stage-Session ergonomics (Implemented)
Agents invoke `change.session` 100+ times per Change and repeatedly hit `CHANGE_CONFLICT: Session item is not ready` because the CLI surfaces no claimable-item projection and the claim failure never names the blocking dependency. This thrash wastes tokens and time. This finding is implemented in the current Change (`2026-07-24-architecture-assessment`) by exposing a read-only `status` action and enriching the claim error message.

### F2 — Usage/cost subsystem hollow
Out of 58 recent recorded runs, 55 report `status: unavailable` versus only 3 `measured`. The provenance and cost tracking value proposition is currently unrealized. We need a per-harness usage adapter or coordinator-supplied usage input to make the telemetry reliable and actionable.

### F3 — Orchestrator density / scattered compat migrations
The `transitionChangeLocked` function is dense (~90 lines with nested ternaries). Data schema migrations are split across `model.ts` (finalize→close) and `orchestrator.ts` (`recordFromYaml` tokens→characters). Extracting validation, persona rules, and reconciliation seams into dedicated modules will reduce regression risk.

### F4 — Persona consolidation logic risk
The `CONSOLIDATION_AFTER_SUBEVENTS` guard logic is spread across `orchestrator.ts` and the `model.ts` fold logic. Historically, this caused a critical Verify defect. Unifying the persona sub-event state machine with focused tests is recommended to prevent future state corruption.

### F5 — CLI input ergonomics
JSON passed inline instead of via `--input -` resolves as a filesystem path, resulting in an obscure `INVALID_WORKSPACE` error. The CLI should detect JSON-looking input strings and emit an actionable error.

### F6 — Distribution portability
The installer symlinks skills into the repo (`scripts/install-lib.mjs`). `../_shared` and sibling-skill references resolve only through the symlink-into-repo. A copy-based install would break relative doc references. Validate or document the copy-install path.

### F7 — Wiki subsystem unused
`wiki status` reports `exists:false` with uncovered sources. We should decide on the wiki scope or explicitly defer its adoption to avoid maintaining unused surface area.

## Method note
- Baseline: `main` @ `415f779bde14e57ad0af7ac4cd25657bcea00fcd`
- Telemetry sources: `docs/codepatrol/improvement-reports/2026-07-24-apply-verify-gate.md` and `2026-07-24-aggregate-and-push.md`
- Code graph: synced (73 files, 1804 symbols, 41ms)
- Wiki: absent (valid substrate state)
- Gates: `npm run verify` exits 0
