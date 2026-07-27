# Specification — Honest graph exports, call confidence, and test relations

## Intent

- Origin: improve-codebase
- Mode: architecture
- Target baseline: `main` at `deb2f8c68bf09272017aef9cd4826f07d2a44f69`; Change branch `codepatrol/2026-07-27-src-architecture-audit`; clean production tree at start; `npm run verify` green with 236 tests and 0 failures.
- Governing constraints: `CONTEXT.md` definitions for Change, Stage Attempt, Stage Session, and Support Skill; `README.md:124-135` graph contract; `docs/runtime-state.md:3-25` requires graph state to remain ignored and rebuildable; `.codepatrol/config.json` requires `npm run verify` at Apply checkpoint. No ADR exists for this subsystem.
- Substrate state: graph synchronized during this Plan at the target production revision; 75 files, 2,352 symbols, 449 imports, 4,199 calls, 27 inheritance edges, and 154 derived test edges. `plan/evidence/investigation.md` records the verified direct evidence and limitations.
- Improvement signals: Review stage returned 2+ times — surface the top review defects to the next Plan and consider a pre-Review `assess-change` precondition.
- Improvement signals: Top error code: CHANGE_CONFLICT (8). Investigate the first occurrence's args and stage context.
- Improvement signals: Command "change.session" was invoked 133 times — consider caching or batching repeated invocations.
- Problem: graph extraction marks nested locals as exported, name-only repository guesses are traversed as ordinary inferred calls, and uncertain calls are promoted to extracted test relations. These behaviors overstate module API, blast radius, and affected tests. Correcting extraction alone would not reach existing caches because records are reused solely by source hash.
- Outcome: after an ordinary graph sync, exported symbols reflect module reachability, unbound global-name calls are excluded from default impact as ambiguous, and `tests` relations identify only test files with a resolved internal import of the target module.

## Scope

### In scope

- Correct TypeScript, TSX, and JavaScript export classification so only directly exported declarations and methods of directly exported classes are exported; nested locals remain internal.
- Preserve same-file and resolved-import call resolution, but classify every repository-wide fallback candidate as ambiguous, even when its name is unique.
- Derive file-level `tests` edges only from resolved internal import edges.
- Add an explicit extraction revision to the rebuildable `GraphDocument`; reject and rebuild missing or stale revisions on normal sync.
- Add focused direct tests for linker semantics, extraction reachability, cache invalidation, and default/opt-in impact behavior.

### Out of scope

- Implementing any of the eight independent trust, concurrency, Close, orchestration, or test-infrastructure findings recorded in `plan/evidence/investigation.md`; they are separate backlog items committed in `efcfbb4`.
- Consolidating CLI command registries, removing dead validators/error codes, or adding direct tests for `atomic-store.ts`, `languages.ts`, and `queries.ts`; existing backlog items own those concerns.
- Adding package-aware import resolvers for Go, Java, or Rust, or tracking named import bindings in extraction.
- Redesigning the graph query language, persisted location, public CLI command set, or JSON envelope shapes.
- Claiming runtime execution coverage. A `tests` edge means a resolved direct module dependency from a test file, not that every target symbol or branch executed.

## Current evidence

- `src/graph/extract.ts:122-135` walks upward to any enclosing `export_statement`; `src/graph/extract.test.ts:28-48` lacks a nested-local characterization. Imported call resolution trusts `symbol.exported` at `src/graph/link.ts:177-183`, so the defect crosses the extraction boundary.
- `src/graph/link.ts:168-193` gives a unique repository-wide name an `inferred` call edge without an import relationship. `src/graph/analysis.ts:9,79-98` traverses inferred edges in default impact.
- `src/graph/link.ts:219-232` derives `tests` edges from all import and call edges and labels each result `extracted`, regardless of call provenance or confidence.
- The current graph reports 14 test files for `src/graph/link.ts`, while a direct search of all `src/**/*.test.ts` imports finds no import of `link`; the same command correctly reports only `src/graph/render.test.ts` for `src/graph/render.ts`, which has a direct import.
- `src/graph/store.ts:108-121` reuses records solely by source hash. `src/graph/model.ts:49-56` and `src/graph/store.ts:54-67` have no extraction revision, so a semantic extractor change leaves existing records stale without `--force`.
- The baseline `npm run verify` passed: typecheck, 236 tests, build, compiled CLI smoke, and skill lint.
- Whole-`src/` investigation confirmed clean acyclic directory layering and no production import cycles. The selected graph correction is therefore a localized semantic repair, not a response to a broad dependency inversion.

## Proposed design

### Export reachability

Keep `isExported` private to `extract.ts`, but replace bounded ancestor inheritance with explicit reachability rules for TypeScript-family languages:

1. A declaration is exported when its declaration node is directly wrapped by an `export_statement`.
2. A `method_definition` is exported when its owning `class_declaration` or `abstract_class_declaration` is directly wrapped by an `export_statement`.
3. Encountering an enclosing function or method never transfers that outer declaration's export status to a nested declaration.
4. Python, Go, Java, and Rust rules remain unchanged.

### Call confidence

Keep the existing resolution order and edge vocabulary:

1. A same-file target remains `extracted`.
2. Candidates in resolved imported files remain `inferred` when unique and `ambiguous` when multiple.
3. Repository-wide fallback candidates are always `ambiguous`, whether one or several candidates exist. Candidate caps and dropped-call accounting remain otherwise unchanged.

This retains low-confidence evidence for `--include-ambiguous` and `possiblyAffected` without allowing a name coincidence to drive default impact.

### Test relation

Build `tests` edges only from existing `imports` edges whose source is a test file and whose target is an internal non-test file. Deduplicate by test-file/target-file pair as today and keep confidence `extracted`, because `resolveImport` established the file dependency. Call edges no longer create `tests` edges; imported cross-file calls are already represented by their file import, while global-name guesses are not module-dependency evidence.

### Cache revision

- Add exported constant `GRAPH_EXTRACTION_REVISION = 1` in `src/graph/model.ts` and required literal field `extractionRevision` to `GraphDocument`.
- `emptyDocument()` writes the current revision.
- `store.loadAt` accepts a document only when both schema version and extraction revision match the current contract. Missing or stale revisions return no loaded document, causing the existing normal-sync path to rebuild every source record.
- `openSnapshot` does not serve a stale document. No migration is written because `.codepatrol/runtime/graph/graph.json` is explicitly disposable.

### Invariants and failures

- Graph JSON shape exposed by CLI commands does not gain or lose fields; only symbol flags, confidence values, relation sets, and affected results become more conservative.
- Resolved internal imports remain the authoritative file-dependency seam for direct test relations.
- Stale cache rejection is fail-rebuild for sync and fail-absent for read-only open; corrupt graph behavior remains unchanged.
- Parsing failures continue to degrade according to the current extraction contract; no new exception path is introduced.
- No new dependency, config option, durable state, or production path outside `src/graph/` is added.

## Alternatives

- **Fix only the nested-export predicate:** rejected because unchanged cached records would retain the incorrect flags and default impact/test relations would remain overconfident.
- **Delete repository-wide fallback calls:** rejected because they remain useful low-confidence discovery evidence, especially before package-aware resolvers exist. Ambiguous confidence preserves them behind explicit opt-in.
- **Keep call-derived tests edges but copy call confidence:** rejected because a `tests` relation is file-level and resolved imports already provide the reliable file dependency. A global name match, even labelled ambiguous, is not evidence that the test imports or executes that module.
- **Require operators to run `graph sync --force` after upgrade:** rejected because semantic validity must not depend on undocumented manual cache invalidation. The graph already owns rebuild behavior.
- **Introduce named-binding extraction and package resolvers now:** rejected as unnecessary for the acceptance criteria and substantially larger across every supported language.

## Simplicity decision

- Selected rung: direct local change
- Earlier rungs: the need is established by reproducible false exported/test relations; runtime/stdlib and installed tree-sitter capabilities already provide the required AST/import evidence but cannot correct the project's linking policy without local code changes.
- Irreducible complexity: the project must own the semantic boundary between syntactic extraction, cross-file inference, and user-facing impact. `extract.ts` owns reachability, `link.ts` owns edge confidence/relation derivation, and `store.ts` owns cache validity.
- Safety floor: default impact must prefer false negatives surfaced as `possiblyAffected` over false certainty; cache updates remain atomic and rebuildable; no source or credential data is added to durable Change artifacts; the full gate remains mandatory.
- Expected surface delta: modify `src/graph/extract.ts`, `src/graph/extract.test.ts`, `src/graph/link.ts`, `src/graph/model.ts`, `src/graph/store.ts`, and `src/graph/store.test.ts`; create `src/graph/link.test.ts`; no dependency, CLI option, configuration, durable schema, or external runtime state.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | Export reachability recognizes direct declaration exports and exported-class methods, not later `export { name }` bindings | A separately declared symbol later exported by a list remains internal in graph metadata | A fixture or real module uses `export { name }` and graph consumers require that symbol as a cross-file target | Extract explicit export bindings and resolve them to declaration records before linking |
| DC-2 | Go, Java, and Rust repository-wide name matches remain ambiguous rather than gaining package-aware resolution | Default impact may under-report cross-file calls for languages whose imports are not internally resolved | A supported-language fixture demonstrates a package/module import that can be resolved from repository files but remains only `possiblyAffected` | Add a bounded resolver for that language and promote only import-scoped targets to inferred confidence |

## Compatibility and rollout

- Existing CLI commands and JSON object shapes remain compatible. Corrected result sets can shrink; this is the intended behavioral correction.
- The first normal sync after deployment rebuilds all graphable source files once because the old document lacks `extractionRevision`. Subsequent syncs resume content-hash reuse.
- No migration or operator action is required. The runtime graph remains ignored and rebuildable.
- Observability: `graph sync` reports all current graphable files as extracted on first upgrade sync; focused graph commands then show corrected export counts, test relations, and impact classification.
- Rollback: reverting the production commit restores prior semantics. The added extraction field is ignored by the old loader because it checks only existing required fields; operators may also delete runtime graph state and resync.

## Risks and mitigations

- Risk: exported-class members could be incorrectly demoted while fixing nested locals. Mitigation: characterize direct exported functions/classes, exported and internal class methods, nested functions, and nested constants before implementation.
- Risk: changing unique global calls to ambiguous reduces default recall for languages without internal import resolution. Mitigation: retain candidates under `possiblyAffected` and `--include-ambiguous`; record the package-resolver trigger in DC-2.
- Risk: import-only `tests` relations can omit tests that load code through runtime conventions or generated registries. Mitigation: define the relation honestly as direct resolved dependency and keep the full project gate as the final verification, never using graph suggestions as the sole test gate.
- Risk: cache revision logic could repeatedly rebuild or serve stale data. Mitigation: test current, missing, and stale revisions; assert the second sync returns to unchanged/hash reuse.
- Risk: direct linker tests could overfit current tree-sitter output. Mitigation: build `GraphDocument` fixtures from plain records for linker semantics, keeping parser behavior isolated in `extract.test.ts`.

## Acceptance criteria

- AC-1: Given TypeScript-family source containing an exported top-level function/class with nested declarations and methods, extraction marks only the directly exported declarations and methods of the directly exported class as exported; nested locals and methods of an internal class are internal.
- AC-2: Given a call whose only target is a same-named symbol in an unimported file, linking emits an ambiguous call edge; default impact excludes the caller from `affected` and includes it in `possiblyAffected`, while `includeAmbiguous` includes it in `affected`.
- AC-3: Given one test that directly imports a production file and another test that only contains an unbound same-name call, linking emits exactly one `tests` relation from the importing test to the production file and none from the unbound test.
- AC-4: Given a persisted graph document with a missing or stale extraction revision, `openSnapshot` refuses it and normal `syncGraph` re-extracts all graphable files into the current revision; a second unchanged sync extracts zero files.
- AC-5: After a forced sync of this repository, `graph neighbors --file src/graph/link.ts --relation tests` does not report unrelated tests, while the directly imported `src/graph/render.test.ts` relation for `src/graph/render.ts` remains present.
- AC-6: Focused graph tests and `npm run verify` pass with no modified production paths outside the declared `src/graph/` files and no dependency/configuration changes.

## Decisions and open questions

- Decision: implement G1-G4 as one bounded graph semantic correction because cache revision is required for the extraction fix to take effect and link/test confidence shares one policy boundary.
- Decision: ambiguous repository-wide edges remain available rather than being deleted.
- Decision: `tests` means a resolved direct module dependency, not runtime coverage.
- Decision: independent whole-`src/` findings are backlog follow-ups, not bundled refactors.
- No open question remains that can materially change scope, interfaces, or acceptance.
