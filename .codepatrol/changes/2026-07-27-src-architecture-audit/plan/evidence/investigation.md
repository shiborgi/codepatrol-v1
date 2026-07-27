# Investigation — `src/` architecture, modules, extensibility, and tests

## Baseline and method

- Change: `2026-07-27-src-architecture-audit`
- Target: `main` at `deb2f8c68bf09272017aef9cd4826f07d2a44f69`
- Production baseline: clean before `change start`; no `src/` path changed during Plan.
- Graph: `codepatrol graph sync` scanned 75 graphable repository files and produced 2,352 symbols, 449 import edges, 4,199 call edges, 27 inheritance edges, and 154 derived test edges. The graph is a lead source; every selected finding below was confirmed by direct source/test inspection.
- Gate: `npm run verify` passed at the baseline with 236 tests, 0 failures, a successful typecheck/build/compiled CLI smoke test, and valid skill lint.
- Inventory: `src/` contains 36 production TypeScript modules, 25 `*.test.ts` files, one test helper, and four YAML fixtures. Static production imports form 117 internal edges with no circular strongly connected component.
- Documentation: `CONTEXT.md`, `README.md`, `docs/runtime-state.md`, `docs/smoke-tests.md`, `skills/catalog.yaml`, and all `docs/adr/*.md` were checked. No ADR directory exists.
- Improvement report: the newest mirror by mtime is `.codepatrol/docs/improvement-reports/2026-07-27-local-close-squash-remote-sync.md`. Its first three recommendations are carried into `spec.md` as required improvement signals.
- Prior assessments: the Plans for `2026-07-26-architecture-assessment-v3` and `2026-07-26-src-structure-revalidation` were read and reconciled against the current tree rather than copied forward.

## Structural facts

### Positive properties

- Dependency direction is acyclic and coherent: `shared` depends only on `shared`; `change` and `graph` depend on their own modules plus `shared`; `cli` is the composition layer and depends on all domains. No production module imports back from `cli`.
- `src/shared/` remains a focused primitives layer: atomic persistence, config, errors, locking, repository file enumeration, state paths, and workspace containment have distinct owners.
- The graph pipeline has a recognizable direction: CLI -> service -> store/analysis; store -> extract/link/model; extract -> languages/queries. Tree-sitter objects do not cross the extraction boundary (`src/graph/extract.ts:1-7`).
- The Change domain has a durable event-log model (`src/change/model.ts:52-140`), a separate YAML store (`src/change/store.ts:12-28`), and an explicit Git adapter (`src/change/git.ts:7-31`).
- Tests are colocated by domain, the baseline gate is green, and no `TODO`, `FIXME`, `@ts-ignore`, or coverage-disable marker was found in `src/`.

### Scale and concentration

- `src/change/orchestrator.ts` is the principal concentration point: 493 lines, 180 graph symbols, fan-out 15, and fan-in 12. It combines payload validation, checkpoint policy, lifecycle mutation, inspection, Close recovery, reporting, and backlog integration (`src/change/orchestrator.ts:27-493`).
- Six test suites exceed 200 lines; the largest mix parser, process, persistence, orchestration, and integration responsibilities. `src/change/change.test.ts` and `src/change/git.test.ts` create 36 temporary Git workspaces without removing their roots.
- Seven production modules lack a direct test importer. The highest-risk one is `src/graph/link.ts`; existing backlog items already cover it and the lower-risk `atomic-store.ts`, `languages.ts`, and `queries.ts` gaps.

## Selected current defects: graph semantic fidelity

### G1 — nested locals are falsely exported

`isExported` walks up four ancestors and returns true when it encounters any enclosing `export_statement` (`src/graph/extract.ts:122-135`). A local declaration inside an exported function can therefore inherit the function's export marker even though it is not reachable from another module. `src/graph/extract.test.ts:28-48` checks top-level declarations and an exported class method but has no nested-local case.

This is not only presentation: cross-file call resolution filters imported candidates by `symbol.exported` (`src/graph/link.ts:177-183`). A false export can become a cross-file target.

Required correction: TypeScript/TSX/JavaScript declarations are exported only when their declaration is directly exported, except methods whose owning class declaration is directly exported. Function-local declarations remain internal even when an outer function or class is exported.

### G2 — unbound global-name guesses become normal impact edges

`resolveName` first checks same-file and resolved-import candidates, then falls back to every repository symbol with the same name (`src/graph/link.ts:168-193`). A unique repository-wide match receives `inferred` confidence even when the source file has no import relationship. `impact` traverses every non-ambiguous call edge by default (`src/graph/analysis.ts:9,79-98`), so a name collision can inflate blast radius and affected-test recommendations.

Required correction: retain repository-wide guesses as discoverable evidence, but mark every such edge `ambiguous`, including a single candidate. Default impact then excludes it and reports its source under `possiblyAffected`; `--include-ambiguous` remains the explicit opt-in.

### G3 — uncertain calls are promoted to extracted test coverage

`link` derives `tests` edges from both imports and calls without checking call confidence, then labels every derived edge `extracted` (`src/graph/link.ts:219-232`). The current graph consequently reports 14 test files for `src/graph/link.ts`, while no `*.test.ts` imports `./link.js` or `graph/link`. By contrast, the direct relation for `src/graph/render.ts` correctly reports only `src/graph/render.test.ts`.

Required correction: derive file-level `tests` relations only from resolved internal import edges. Imported calls add no file-level information beyond their import edge; global-name calls are not evidence that a test exercises the target module.

### G4 — extraction semantic changes do not invalidate cached records

Normal sync reuses an existing file record solely when its source hash matches (`src/graph/store.ts:108-121`). The persisted `GraphDocument` has only schema `version: 1` (`src/graph/model.ts:43-56`), and `loadAt` accepts it without an extractor revision (`src/graph/store.ts:54-67`). Changing export semantics would therefore leave old `exported` flags in every unchanged cached file until a manual `--force` sync.

Required correction: add an explicit extraction revision to `GraphDocument`, require the current value when loading, and rebuild normally when the field is absent or stale. The graph is rebuildable runtime state, so no compatibility migration is required.

## Reproduced observable symptoms

- `codepatrol graph neighbors --file src/graph/link.ts --relation tests --format json` returned 14 test paths, including unrelated Change, CLI, installer, package, and skill tests.
- Searching all `src/**/*.test.ts` imports found no direct import of `src/graph/link.ts`.
- `codepatrol graph neighbors --file src/graph/render.ts --relation tests --format json` returned the expected single path, `src/graph/render.test.ts`, showing that import-derived test relations are sufficient for the direct-test use case.
- Current graph impact for `src/change/orchestrator.ts`, `src/cli/commands.ts`, and `src/graph/service.ts` selected nearly the complete repository test surface, consistent with global-name inference and inflated test edges.

## Findings split to backlog

The following independent concerns exceed one bounded implementation and were added with `source.kind: plan-followup` and this work id, then committed in `efcfbb4`:

| Priority | Backlog id | Concern |
|---|---|---|
| p1 | `trace-paths-accept-unchecked-cli-id-values-and-can-escape-codepatrol-runtime-or-the-workspace-through-parent-traversal` | Uncontained trace path from CLI `--id` |
| p1 | `persona-review-and-verify-checkpoints-skip-artifact-ownership-and-sha-validation-before-committing-submitted-paths` | Persona checkpoint ownership/hash bypass |
| p1 | `checkpoint-and-close-git-yaml-transactions-lack-complete-recovery-for-failures-between-content-commits-events-enrichment-commits-and-tags` | Partial checkpoint/Close recovery |
| p1 | `backlog-read-modify-write-operations-are-atomic-per-file-but-unlocked-across-concurrent-cli-lifecycle-and-issue-sync-writers` | Backlog lost-update race |
| p1 | `stage-session-prime-and-rebuild-can-overwrite-concurrent-claimed-or-closed-progress-because-they-bypass-the-per-session-mutation-lock` | Stage Session rebuild race |
| p1 | `close-implementation-and-governing-contracts-disagree-on-squash-versus-fast-forward-integration-and-committed-branch-retention-versus-deletion` | Close contract split requiring an explicit product decision |
| p2 | `test-infrastructure-leaks-temporary-git-workspaces-duplicates-lifecycle-fixtures-and-emits-git-test-helper-ts-in-the-production-build` | Test cleanup, fixture duplication, and build leakage |
| p2 | `orchestrator-ts-remains-a-line-high-fan-out-facade-mixing-lifecycle-policy-inspection-checkpoint-validation-close-finalization-and-auxiliary-reporting` | Remaining orchestration concentration |

Existing open backlog items remain the owners for CLI registry consolidation, atomic/language/query direct tests, redundant validators, and dead error taxonomy. The current Change implements the behavior requested by the existing direct-`link.ts` test item, but backlog status reconciliation is not bundled into its source correction; it does not resolve the broader core-module coverage item.

## Scope decision

The smallest coherent implementation is G1-G4 together. G1 and G2 correct the source/link semantics; G3 prevents uncertain edges from becoming certainty at the test relation; G4 guarantees users actually receive G1 after an ordinary sync. Splitting G4 would knowingly ship a correction that existing runtime caches do not observe. Combining any backlog finding above would cross an unrelated trust, concurrency, lifecycle, or test-infrastructure boundary and make rollback and diagnosis materially harder.
