# Plan — Honest graph exports, call confidence, and test relations

- Work id: `2026-07-27-src-architecture-audit`
- Governing spec: `spec.md`
- Target baseline: `main` at `deb2f8c68bf09272017aef9cd4826f07d2a44f69`

## Goal and approach

Correct the graph at its existing ownership seams rather than introducing a new abstraction layer. `extract.ts` will classify module reachability explicitly, `link.ts` will distinguish import-backed calls from repository-name guesses and derive test relations only from imports, and `store.ts` will invalidate cached extraction records when those semantics change. Plain-record linker fixtures and parser-specific extraction fixtures keep failures attributable to one layer.

## Global constraints

- Preserve the current acyclic dependency direction and the existing CLI command/JSON envelope shapes.
- Modify only the declared `src/graph/` paths. Do not implement the independent backlog findings recorded by this Plan.
- Add no dependency, config option, durable data, migration, compatibility shim, or new runtime location.
- Keep `.codepatrol/runtime/graph/graph.json` disposable; stale documents are rebuilt, never migrated in place.
- Treat graph edges as conservative evidence. Default impact must not promote an unbound name match to certainty; ambiguous candidates remain available through `possiblyAffected` and `includeAmbiguous`.
- Use tabs and the existing Node test/assert style. Do not add a test framework or coverage package.
- Each implementation task starts with its declared red test, records the valid red/green signals in `apply/journal.md`, and stops for re-planning if the interface or acceptance contract must change.
- Final verification must run the configured `npm run verify` Apply gate.

## Simplicity proof

- Selected rung: direct local change
- Reused capabilities: existing tree-sitter AST nodes, `GraphDocument`, confidence vocabulary, `impact` ambiguous-edge handling, `resolveImport`, atomic graph store, Node test runner, and project gate.
- Forbidden speculative surface: named-binding extraction, new confidence kinds, package-aware Go/Java/Rust resolvers, graph migrations, CLI flags, generalized registries, or production changes outside `src/graph/`.
- Expected surface delta: modify six files (`extract.ts`, `extract.test.ts`, `link.ts`, `model.ts`, `store.ts`, `store.test.ts`) and create one file (`link.test.ts`); no dependency, configuration, durable schema, or external runtime state.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T2 | `node --test --import jiti/register src/graph/extract.test.ts` |
| AC-2 | T3 | `node --test --import jiti/register src/graph/link.test.ts` |
| AC-3 | T3 | `node --test --import jiti/register src/graph/link.test.ts` |
| AC-4 | T1 | `node --test --import jiti/register src/graph/store.test.ts` |
| AC-5 | T4 | forced graph sync plus exact `graph neighbors` inspections for `link.ts` and `render.ts` |
| AC-6 | T1, T2, T3, T4 | focused tests, `npm run verify`, and final path/diff inspection |

## Dependency order

`T1` and `T2` are independent and own different files; `T3` depends on `T1` because its typed `GraphDocument` fixture includes the new extraction revision; `T4` depends on `T1`, `T2`, and `T3`.

### T1 — Version extraction semantics in the graph cache

**Purpose:** Satisfies AC-4 and ensures the semantic corrections from later tasks reach existing workspaces through an ordinary sync.

**Depends on:** None

**Files:**

- Modify: `src/graph/model.ts` — extraction revision constant and `GraphDocument` field
- Modify: `src/graph/store.ts` — reject missing/stale extraction revisions
- Modify: `src/graph/store.test.ts` — cache revision characterization and rebuild tests

**Interfaces:**

- Produces: `export const GRAPH_EXTRACTION_REVISION = 1 as const`
- Changes: `GraphDocument` gains required `extractionRevision: typeof GRAPH_EXTRACTION_REVISION`
- Preserves: `GraphDocument.version`, `syncGraph`, `openSnapshot`, `SyncReport`, graph path, atomic write behavior, and public CLI output shape
- Invariants/errors: current-revision documents retain hash reuse; missing/stale revisions are not served; normal sync rebuilds them; a second unchanged sync returns to zero extraction

**Simplicity proof:** Extends the existing document validity check with one semantic revision. It reuses the current rebuild path and adds no migration or parallel cache mechanism.

**Surface delta:** Three modified files; one exported internal graph-contract constant; one persisted runtime-only field.

**Steps:**

1. Extend `store.test.ts` before production changes:
   - Assert a newly synced raw document contains `extractionRevision === GRAPH_EXTRACTION_REVISION`.
   - After a successful sync, rewrite the runtime JSON once without `extractionRevision` and once with a different numeric revision.
   - For each invalid form, assert `openSnapshot(root)` returns `undefined`, then assert normal `syncGraph(root)` reports every graphable fixture file as extracted and writes the current revision.
   - Immediately sync again and assert `extracted === 0` and all fixture files are unchanged.
2. Run `node --test --import jiti/register src/graph/store.test.ts`.
   Expected red: the test cannot import `GRAPH_EXTRACTION_REVISION`, or the invalid document is served/reused and the rebuild extraction count is zero. A fixture setup or JSON syntax failure is not an accepted red.
3. In `model.ts`, add the constant, require its literal type on `GraphDocument`, and include it in `emptyDocument()`.
4. In `store.ts`, import the constant and require exact equality in `loadAt` alongside `version === 1` and the existing files-object check. Return `undefined` on missing/stale revision so `syncGraph` naturally calls `emptyDocument()`.
5. Run `node --test --import jiti/register src/graph/store.test.ts`.
   Expected green: existing store tests plus current/missing/stale revision cases pass; the second-sync hash reuse assertion remains green.
6. Run `npm run typecheck`.
   Expected: typecheck passes for existing code. If an existing manually constructed `GraphDocument` fixture is reported, add the current revision to that fixture rather than weakening the production field to optional; T3 will include the field when it creates its new fixture.

**Task result:** Record changed paths, valid red output, green test/typecheck output, and any typed fixture locations requiring the current revision in `apply/journal.md`.

### T2 — Make TypeScript-family export reachability explicit

**Purpose:** Satisfies AC-1 by preventing outer exports from leaking to nested declarations while preserving exported-class methods.

**Depends on:** None

**Files:**

- Modify: `src/graph/extract.test.ts` — reachability matrix
- Modify: `src/graph/extract.ts` — TypeScript/TSX/JavaScript export predicate

**Interfaces:**

- Consumes: tree-sitter `defNode.parent` relationships already available to `isExported`
- Preserves: `extractSource`, `extractFile`, `SymbolRecord`, language-specific non-TypeScript rules, and current query captures
- Invariants/errors: direct export wrappers are authoritative; exported class reachability applies to its methods only; an enclosing function/method never exports nested declarations

**Simplicity proof:** Tightens one private predicate at the parser boundary. It does not change queries, records, or add a symbol ownership model.

**Surface delta:** Two modified files; no public type or dependency change.

**Steps:**

1. Add a single focused TypeScript fixture/test that contains:
   - an exported top-level function with a nested function and nested constant;
   - an exported class with a method and a nested local inside that method;
   - an internal class with a method;
   - an exported arrow-function constant.
   Assert the top-level exported function/class/arrow and exported-class method are `exported: true`; every nested local and the internal-class method are `false`.
2. Run `node --test --import jiti/register src/graph/extract.test.ts`.
   Expected red: at least the nested function/constant under the exported function is incorrectly `true`; existing top-level assertions remain green. Parser failure or missing symbols is not an accepted red.
3. Replace the four-hop ancestor scan in `isExported` with explicit TypeScript-family rules:
   - return true when `defNode.parent?.type === "export_statement"`;
   - for `method_definition`, walk only to its owning `class_declaration` or `abstract_class_declaration` and return true only when that class node is directly wrapped by `export_statement`;
   - otherwise return false.
   Keep Python, Go, Java, and Rust branches unchanged.
4. Run `node --test --import jiti/register src/graph/extract.test.ts`.
   Expected green: the new reachability matrix and all existing five-language extraction tests pass.
5. Run `npm run typecheck`.
   Expected: no type regressions and no exported interface changes.

**Task result:** Record the fixture matrix, red false-export assertion, green output, and changed paths in `apply/journal.md`.

### T3 — Make linker uncertainty and test relations honest

**Purpose:** Satisfies AC-2 and AC-3, adds the missing direct linker seam, and prevents global name guesses from becoming default blast-radius or test certainty.

**Depends on:** T1

**Files:**

- Create: `src/graph/link.test.ts`
- Modify: `src/graph/link.ts` — global fallback confidence and import-only test derivation

**Interfaces:**

- Consumes: `GraphDocument`, `GRAPH_EXTRACTION_REVISION`, `link`, `impact`, existing confidence kinds, and resolved file imports
- Preserves: `link(document, tsPaths?)`, `GraphSnapshot`, same-file resolution, imported-file resolution, candidate cap, and `includeAmbiguous`
- Invariants/errors: repository-wide fallback is always ambiguous; direct resolved imports still produce extracted `tests` edges; call edges alone never produce a file-level `tests` edge

**Simplicity proof:** Changes two policy branches in the existing linker and uses the analysis layer's current ambiguous-edge semantics. No provenance type or new edge kind is needed.

**Surface delta:** One production file modified and one focused test file created.

**Steps:**

1. Create a plain-record `GraphDocument` fixture in `link.test.ts` with:
   - `src/target.ts`, exporting one `target` symbol;
   - `src/direct.test.ts`, resolving `./target` and calling `target`;
   - `src/unbound.test.ts`, importing nothing and calling the same unique name;
   - the current schema and extraction revision.
2. Add assertions before production changes:
   - the direct test's call resolves through its import and is not ambiguous;
   - the unbound test's repository-wide call is ambiguous;
   - only `file:src/direct.test.ts -> file:src/target.ts` exists as a `tests` edge;
   - `impact` from the target symbol excludes `src/unbound.test.ts` from default `affectedFiles`, includes it in `possiblyAffected`, and includes it in `affectedFiles` when `includeAmbiguous: true`.
3. Run `node --test --import jiti/register src/graph/link.test.ts`.
   Expected red: the unbound call is `inferred`, the unbound test has an extracted `tests` edge, and default impact treats it as affected. Fixture construction or a missing target symbol is not an accepted red.
4. In `resolveName`, change the repository-wide fallback so one through `MAX_CANDIDATES` candidates return `confidence: "ambiguous"`; leave same-file/import-backed branches and the over-cap drop unchanged. Update the module confidence comment to match.
5. In test-edge derivation, consider only `imports` edges. Preserve checks for test source, internal non-test target, pair deduplication, and extracted confidence.
6. Run `node --test --import jiti/register src/graph/link.test.ts src/graph/store.test.ts src/graph/analysis.test.ts`.
   Expected green: direct linker behavior, existing storage/link integration, and impact semantics all pass.
7. Run `npm run typecheck`.
   Expected: the new fixture uses the required extraction revision and no production interface changed.

**Task result:** Record the red confidence/relation/impact assertions, green focused output, and final edge counts for the fixture in `apply/journal.md`.

### T4 — Rebuild the repository graph and run final verification

**Purpose:** Satisfies AC-5 and AC-6 by proving the exact repository symptom is corrected, all criteria remain green, and no undeclared surface entered the candidate.

**Depends on:** T1, T2, T3

**Files:** None

**Interfaces:**

- Consumes: completed graph implementation, `codepatrol graph sync`, `graph neighbors`, Git diff, and the configured project gate
- Produces: Apply evidence only in `apply/journal.md`
- Invariants/errors: runtime graph may change but remains ignored; only declared production/test paths may differ from the accepted Plan checkpoint

**Simplicity proof:** Uses existing graph commands and the single project gate; no verification-only helper or snapshot artifact is added.

**Surface delta:** No additional source files.

**Steps:**

1. Run `node --test --import jiti/register src/graph/extract.test.ts src/graph/link.test.ts src/graph/store.test.ts src/graph/analysis.test.ts`.
   Expected: all focused parser, linker, cache, and impact tests pass.
2. Run `codepatrol graph sync --force --workspace "$PWD" --format json`.
   Expected: every currently graphable file is extracted under the current revision; command succeeds with no warning or stale-cache read.
3. Run `codepatrol graph neighbors --file src/graph/link.ts --relation tests --workspace "$PWD" --format json`.
   Expected: `src/graph/link.test.ts` is present and the 14 unrelated baseline test paths are absent.
4. Run `codepatrol graph neighbors --file src/graph/render.ts --relation tests --workspace "$PWD" --format json`.
   Expected: `src/graph/render.test.ts` remains present, proving direct import-derived relations were preserved.
5. Run normal `codepatrol graph sync --workspace "$PWD" --format json` again.
   Expected: `extracted` is `0`; unchanged hash reuse resumed after the revision rebuild.
6. Run `npm run verify`.
   Expected: typecheck, all Node tests including `link.test.ts`, build, compiled CLI smoke, and skill lint pass with 0 failures.
7. Run `git diff --check` and inspect `git diff --name-status deb2f8c68bf09272017aef9cd4826f07d2a44f69...HEAD` plus working-tree status.
   Expected: implementation paths match the seven declared `src/graph/` paths; other committed paths are only Change-owned artifacts and the Plan follow-up backlog commit; no generated `dist/` or runtime file is tracked or dirty.
8. Reconcile the actual surface against the spec forecast and map evidence to AC-1 through AC-6 in `apply/journal.md`. If any production path differs, stop and return to Plan rather than broadening the Apply checkpoint.
9. Confirm DC-1 and DC-2 triggers did not fire: no required explicit export-list support and no import-backed Go/Java/Rust fixture was discovered that changes the approved scope.
10. Rollback check: confirm reverting the implementation commit would restore prior graph semantics without durable-data migration; the runtime graph can be deleted/resynced independently.

**Task result:** Record focused/full commands and outcomes, repository neighbor JSON conclusions, extraction counts for forced and second sync, final path list, AC mapping, DC status, rollback, and residual risks in `apply/journal.md`.
