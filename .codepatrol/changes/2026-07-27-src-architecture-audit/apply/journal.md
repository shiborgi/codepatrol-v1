# Apply journal

## T1 — Version extraction semantics in the graph cache

- Red first: new `store.test.ts` case `stale or missing extraction revision is refused and rebuilt by a normal sync` failed with `missing revision must not be served` (actual: a served GraphSnapshot) — the planned valid red, proving the stale document was reused.
- Production: `model.ts` adds `GRAPH_EXTRACTION_REVISION = 1 as const`, required `extractionRevision` on `GraphDocument`, and writes it in `emptyDocument()`; `store.ts` `loadAt` requires exact revision equality alongside `version === 1`, returning `undefined` on missing/stale so normal sync rebuilds.
- Green: `node --test --import jiti/register src/graph/store.test.ts` 12/12 pass, including fresh-document revision, missing + stale refusal, full rebuild (6 extracted), revision rewritten, and second-sync hash reuse (0 extracted / 6 unchanged). `npm run typecheck` clean; no manually constructed `GraphDocument` fixture needed the new field.
- Changed paths: `src/graph/model.ts`, `src/graph/store.ts`, `src/graph/store.test.ts`.

## T2 — Make TypeScript-family export reachability explicit

- Red first: new `extract.test.ts` reachability matrix (`REACHABILITY_FIXTURE`: exported function with nested function/const, exported class with method + method-local, internal class with method, exported arrow const) failed with `nested function inside an exported function stays internal` — the planned valid red; all pre-existing top-level assertions stayed green.
- Production: `extract.ts` `isExported` TypeScript/TSX/JavaScript branch replaced the 4-hop ancestor walk with explicit rules — direct `export_statement` parent, or `method_definition` whose owning `class_declaration`/`abstract_class_declaration` is directly export-wrapped; everything else internal. Python/Go/Java/Rust branches untouched.
- Green: `node --test --import jiti/register src/graph/extract.test.ts` 10/10 pass (nested function/const/method-local and internal-class method now `false`; direct exports and exported-class method `true`). `npm run typecheck` clean.
- Changed paths: `src/graph/extract.ts`, `src/graph/extract.test.ts`.

## T3 — Make linker uncertainty and test relations honest

- Red first: new `link.test.ts` plain-record fixture (`src/target.ts` exporting `target`; `src/direct.test.ts` importing `./target` and calling it; `src/unbound.test.ts` calling the same unique name with no import) failed on all three planned signals: unbound call confidence `inferred` (expected `ambiguous`), an extracted `tests` edge from the unbound test (expected none), and default impact marking `src/unbound.test.ts` affected (expected excluded + `possiblyAffected`).
- Production (`src/graph/link.ts` only): repository-wide fallback in `resolveName` now returns `ambiguous` for 1..MAX_CANDIDATES (same-file and import-backed branches unchanged; over-cap drop unchanged); the tests-edge loop now considers `imports` edges only. The module confidence comment and the tests-edge comment were updated to match.
- Fixture edge counts after fix: direct call `inferred` ×1, unbound call `ambiguous` ×1, exactly one `tests` edge `file:src/direct.test.ts → file:src/target.ts` (extracted), zero tests edges from the unbound test; default impact excludes the unbound test and lists it in `possiblyAffected`, `includeAmbiguous: true` includes it.
- Green: `node --test --import jiti/register src/graph/link.test.ts src/graph/store.test.ts src/graph/analysis.test.ts src/graph/extract.test.ts` 33/33 pass. `npm run typecheck` clean.
- Changed paths: `src/graph/link.ts`, `src/graph/link.test.ts` (created).

## T4 — Rebuild the repository graph and run final verification

- Focused suite: `extract.test.ts` + `link.test.ts` + `store.test.ts` + `analysis.test.ts` 33/33 pass.
- `codepatrol graph sync --force`: 76/76 files extracted under the current revision, 0 removed, no warnings.
- AC-5: `graph neighbors --file src/graph/link.ts --relation tests` → exactly `["src/graph/link.test.ts"]` (the 14 unrelated baseline test paths are gone); `graph neighbors --file src/graph/render.ts --relation tests` → `["src/graph/render.test.ts"]` preserved (import-backed control).
- Second normal `graph sync`: `extracted: 0`, `unchanged: 76` — hash reuse resumed after the revision rebuild.
- `npm run verify`: typecheck, 241/241 tests (236 baseline + 1 store + 1 extract + 3 link), build, compiled CLI smoke, skill lint — 0 failures.
- `git diff --check` clean; working-tree surface is exactly the seven declared `src/graph/` paths (`extract.ts`, `extract.test.ts`, `link.ts`, `link.test.ts` (new), `model.ts`, `store.ts`, `store.test.ts`) plus Change-owned `apply/journal.md`; no `dist/` or runtime file tracked or dirty.
- AC mapping: AC-1→T2 matrix, AC-2/AC-3→T3 fixture, AC-4→T1 revision cases + T4 sync counts, AC-5→T4 neighbor JSON, AC-6→T4 gate + path reconciliation.
- DC-1/DC-2: neither trigger fired — no `export { name }` fixture required, no import-backed Go/Java/Rust resolver gap discovered.
- Rollback: reverting the implementation commit restores prior graph semantics; `.codepatrol/runtime/graph/graph.json` is disposable and rebuilds on next sync. Residual risks: none beyond the plan's recorded DC ceilings.
