# Verification — Honest graph exports, call confidence, and test relations

- Change: `2026-07-27-src-architecture-audit`
- Verified revision: 1
- Verifier: claude-sonnet-5
- Base ref: `deb2f8c68bf09272017aef9cd4826f07d2a44f69`
- Head ref: working tree on `codepatrol/2026-07-27-src-architecture-audit`, Apply checkpoint `e3876878665a4bf09a853861ceb097bcfb02547e`, tree `05bf071aa76bface91840d4d082ced53d93a5333`
- Evidence date: 2026-07-27T17:35:00.000Z

## Scope and instruments

Read the accepted `plan/spec.md`, `plan/plan.md`, `review/report.md` (my own
prior Review, treated as a hypothesis like any other upstream claim), and
`apply/journal.md` in full before touching the diff. All commands below were
executed in this session against the live repository; none is copied from the
journal.

## Plan conformance

| Task | Journal claim | Independently confirmed |
|---|---|---|
| T1 (cache revision) | `model.ts`/`store.ts` gain `GRAPH_EXTRACTION_REVISION`; `loadAt` rejects missing/stale | Read full diff: `model.ts` adds the constant and required field, writes it in `emptyDocument()`; `store.ts` `loadAt` now checks `document.extractionRevision !== GRAPH_EXTRACTION_REVISION` alongside `version !== 1`. Matches exactly. |
| T2 (export reachability) | 4-hop walk replaced by direct-parent + class-owner rule | Read full diff: `defNode.parent?.type === "export_statement"` direct check; `method_definition` walks exactly to `defNode.parent?.parent` (class_body's parent) and requires that owner be `class_declaration`/`abstract_class_declaration` directly wrapped by `export_statement`. No hop-counting remains. Matches exactly. |
| T3 (linker confidence/tests) | global fallback always ambiguous (1..MAX); tests edges import-only | Read full diff: the two-branch `=== 1`/`>= 2` split in `resolveName`'s global fallback collapsed into one `>= 1 && <= MAX_CANDIDATES` branch; test-edge loop condition changed from `!== "imports" && !== "calls"` to `!== "imports"`. Matches exactly. |
| T4 (rebuild + verification) | forced sync, neighbor checks, full gate, path reconciliation | Independently re-executed below; results match the journal's reported counts. |

No task deviated from its planned design. No task was journaled as returning
to Plan or requiring a scope change.

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of the journal |
|---|---|---|---|
| AC-1 | `node --test --import jiti/register src/graph/extract.test.ts` (part of full run below) + a fresh, non-journal `export default class Foo { method(){} }` repro via a scratch test file | pass — reachability matrix green; default-export class and its method both correctly `exported: true`, nested local under exported function correctly `false` | yes |
| AC-2 | `src/graph/link.test.ts` test 1 (full run below) | pass — import-backed call `inferred`, unbound repository-wide call `ambiguous` | yes |
| AC-3 | `src/graph/link.test.ts` test 2 (full run below) | pass — exactly one `tests` edge from `direct.test.ts`, none from `unbound.test.ts` | yes |
| AC-4 | `src/graph/store.test.ts` new case (full run below) | pass — missing/stale both refused and rebuilt; second sync `extracted: 0` | yes |
| AC-5 | `codepatrol graph sync --force` then `graph neighbors --file src/graph/link.ts --relation tests` and the `render.ts` control, run directly in this session | pass — `link.ts` → `["src/graph/link.test.ts"]` only; `render.ts` → `["src/graph/render.test.ts"]` preserved | yes |
| AC-6 | `git diff --name-status deb2f8c...HEAD -- . ':!.codepatrol'` + `npm run verify` | pass — exactly the 7 declared `src/graph/` paths, no undeclared surface; gate green | yes |

## Wider suite

- `npm run verify` (re-run fresh in this session): typecheck clean, **241/241**
  tests, 0 failures, build clean, compiled CLI smoke passed, skill lint clean.
  Matches the journal's reported 241/241 (236 baseline + 5 new) exactly.
- `codepatrol graph sync --force --workspace "$PWD" --format json`: `scanned:
  76, extracted: 76, unchanged: 0`. Matches journal's 76/76.
- `codepatrol graph sync` (normal, immediately after): `extracted: 0,
  unchanged: 76` — confirms hash reuse resumed after the one-time revision
  rebuild, independently reproducing the journal's second-sync claim.

## Blast radius

`codepatrol graph impact --since-ref deb2f8c68bf09272017aef9cd4826f07d2a44f69
--workspace "$PWD" --format json`: `affectedTests` = `cli.test.ts`,
`issues-sync.test.ts`, `analysis.test.ts`, `extract.test.ts`, `link.test.ts`,
`render.test.ts`, `store.test.ts` — all seven are part of the 241 passing in
the full gate re-run above, so every graph-reported affected test was actually
exercised, not merely predicted. `possiblyAffected` lists 14 files at depth
beyond the direct seam (change/session.ts, change/sync.test.ts, and other
lower-confidence CLI/change consumers); these are downstream of `src/graph/`
only through the CLI composition layer, not through any changed symbol
directly, and the full gate — which runs unconditionally regardless of graph
confidence — already covers them. No impacted seam outside `src/graph/` and
its already-declared consumers was found.

## Regressions

- Independently reproduced a case the Plan's own fixture matrix did not
  explicitly name: `export default class Foo { method() {} }`. Wrote and ran
  a fresh scratch test (not from the journal) through `extractSource`
  directly — both `Foo` and `method` correctly resolve `exported: true`,
  confirming the new direct-parent/class-owner rule generalizes correctly to
  default exports and is not overfit to the named-export fixture shape.
- Compared `edgesByKind.tests` before and after: baseline investigation
  recorded 154 derived test edges; the post-fix forced sync reports 74 — a
  large, expected reduction consistent with removing call-derived
  false-positive test relations (G3), not a sign of any new gap.
- No other production path outside `src/graph/` shows a diff; `git status
  --short` is clean after all re-verification commands (the graph runtime
  file remains `.gitignore`-covered, confirmed via `git check-ignore -v
  .codepatrol/runtime/graph/graph.json`).

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| (none) | — | Diff is exactly the 7 declared `src/graph/` paths; no unplanned change found. |

## Findings

None. No critical, major, or minor finding survives independent
re-verification.

## Residual risks and evidence gaps

- DC-1 (`export { name }` list-binding) and DC-2 (Go/Java/Rust package-aware
  resolution) both carry their stated ceilings from the Plan; neither trigger
  fired during Apply, and neither is newly introduced or worsened by this
  diff.
- `tests` relations now mean "resolved direct import dependency," explicitly
  not runtime coverage — this is a stated, intentional definition narrowing,
  not a gap; the full project gate remains the authoritative correctness
  check regardless of graph-suggested test scope.
- No evidence gap: every AC was re-executed independently in this session,
  not accepted from the journal's word, including one case (default-export
  class) the Plan's own fixture did not explicitly enumerate.

## Verdict

`commit`

Every task's diff was read in full and matches its planned design exactly;
every acceptance criterion was re-executed independently in this session,
including one edge case (default-exported class methods) beyond the Plan's
own fixture, and passed. The full project gate is green at 241/241 with no
undeclared surface. Candidate binds to Apply attempt 1, checkpoint
`e3876878665a4bf09a853861ceb097bcfb02547e`, tree
`05bf071aa76bface91840d4d082ced53d93a5333`, on branch
`codepatrol/2026-07-27-src-architecture-audit`. Advances to Close.
