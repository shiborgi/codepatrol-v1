# Review — Honest graph exports, call confidence, and test relations

- Change: `2026-07-27-src-architecture-audit`
- Incoming revision: 1
- Reviewed revision: 1
- Reviewer: claude-sonnet-5
- Evidence date: 2026-07-27T17:00:31.000Z

## Scope and evidence

Read `plan/spec.md`, `plan/plan.md`, `plan/evidence/investigation.md` in
full before touching code. Recomputed all three declared Plan artifact
SHA-256 values and matched `change.yaml`'s checkpoint `1a64ea2` exactly.
Confirmed clean checkout on the recorded branch.

Treated every G1-G4 claim as a hypothesis and independently re-derived it
against live source rather than trusting the citation:

- **G1 (nested locals falsely exported)**: read `extract.ts:121-134`'s
  `isExported` directly — confirmed the 4-hop ancestor walk with no
  distinction between a directly-exported declaration and one merely
  nested inside an exported function/class. Wrote and ran an independent
  fixture (not copied from the Plan) through `extractSource` directly:

  ```
  outer function true
  innerLocal function true   <- false positive
  innerConst const true      <- false positive
  Internal class false
  method method false
  ```

  Confirms the defect precisely as claimed.
- **G2 (unbound global-name guesses get non-ambiguous confidence)**: read
  `link.ts:168-193`'s `resolveName` directly — confirmed
  `if (global.length === 1) return { ..., confidence: "inferred" }` for the
  repository-wide fallback, with same-file and import-backed resolution
  unaffected (confirmed those branches are explicitly preserved by the
  design, matching the spec's own "Preserve the existing resolution
  order" statement).
- **G3 (uncertain calls promoted to certain test relations)**: read
  `link.ts:219-232` directly — confirmed the test-edge loop matches both
  `"imports"` and `"calls"` edges (`if (edge.kind !== "imports" &&
  edge.kind !== "calls") continue;`) and unconditionally emits
  `confidence: "extracted"` regardless of the source edge's own
  confidence. Reproduced the exact real-repository symptom, independently:

  ```
  $ codepatrol graph neighbors --file src/graph/link.ts --relation tests --format json
  14 test paths returned, including scripts/*, src/change/*, src/cli/*
  $ grep -rln "graph/link" src/**/*.test.ts
  (zero hits — no test actually imports link.ts)
  $ codepatrol graph neighbors --file src/graph/render.ts --relation tests --format json
  ["src/graph/render.test.ts"]   <- correct, single, import-backed relation
  ```

  Both counts (14 unrelated paths; the render.ts control showing exactly
  one correct relation) match the Plan's Current evidence and Reproduced
  observable symptoms sections exactly.
- **G4 (cache does not invalidate on semantic extractor changes)**: read
  `model.ts:48-56` (`GraphDocument` has only `version: 1`, no extraction
  revision) and `store.ts:54-67`/`108-121` directly — confirmed `loadAt`
  checks only `version !== 1`, and record reuse is purely
  `existing.hash === hash` with no semantic-version gate. Confirms that,
  without G4, correcting G1 would leave every already-cached file's stale
  `exported` flags unfixed until a manual `--force` sync — the defect
  chain the Plan's Scope decision explicitly argues for treating G1-G4 as
  one bounded unit.

**Design soundness**: the global-fallback confidence fix collapses two
existing branches (`=== 1` → inferred, `2..MAX_CANDIDATES` → ambiguous)
into one (`1..MAX_CANDIDATES` → ambiguous), leaving the over-cap
`undefined` (dropped) branch untouched — confirmed this is a minimal,
one-line-scale change to an already-present branch structure, not a
rewrite. The test-relation fix removes exactly one disjunct
(`"calls"`) from an existing `if` condition. Both are small, precisely
targeted edits at the seams the Plan's Goal and approach names
(`extract.ts` owns reachability, `link.ts` owns edge confidence/relation
derivation, `store.ts` owns cache validity) — consistent with this
backlog's established "smallest sufficient rung" discipline.

**Backlog follow-ups verified real, not merely asserted**: `git show
--stat efcfbb4` confirms the commit exists, is an ancestor of the current
branch HEAD, and its diff to `.codepatrol/backlog/items.yaml` adds exactly
8 new item ids — matching the Plan's Findings-split table row count
precisely.

## Findings

None. No major, minor, or nit findings survive independent re-verification.

## Artifact adjustments

None required.

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T2 | yes — new fixture matrix distinguishes direct vs. nested export at both function and class-method granularity | covered |
| AC-2 | yes | T3 | yes — fixture asserts ambiguous confidence, default-impact exclusion, and `includeAmbiguous` inclusion as three distinct assertions | covered |
| AC-3 | yes | T3 | yes — fixture directly reproduces the real repository symptom (import-backed test relation present, unbound-call test relation absent) | covered |
| AC-4 | yes | T1 | yes — current/missing/stale revision cases plus a second-sync zero-extraction assertion, both red-before-green per the task's own step ordering | covered |
| AC-5 | yes | T4 | yes — exact repository command against `link.ts`/`render.ts`, independently reproduced above with identical results | covered |
| AC-6 | yes | T1-T4 | yes — full gate plus explicit diff-path reconciliation step (T4 step 7-8) | covered |

## Simplicity axis

- Selected rung: confirmed — direct local change at existing ownership
  seams; no new abstraction, provenance type, or edge kind introduced.
- Safety floor: default impact conservatism (false negatives surfaced via
  `possiblyAffected`/`includeAmbiguous` rather than silently dropped) is
  explicit in both the spec's Invariants and the design's own stated
  rationale; the full project gate remains mandatory at T4.
- Surface delta: 7 files (6 modified, 1 new), all inside `src/graph/`,
  matches between `spec.md`'s Simplicity decision and `plan.md`'s
  Simplicity proof exactly — no discrepancy between the two documents.
- DC-1 (no `export { name }` list-binding support) and DC-2 (no
  package-aware Go/Java/Rust resolvers) both have concrete ceilings,
  observable triggers, and upgrade paths; both are genuinely deferred, not
  silently dropped — the design explicitly keeps repository-wide fallback
  candidates available under `--include-ambiguous` rather than deleting
  them, which is what makes both deferrals safe.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| n/a | — | no removable surface found; every proposed edit is load-bearing for G1-G4 | — | none |

## Executability audit

Every task's Files/Interfaces/Steps content was independently re-verified
against the live tree and found accurate: cited line ranges match current
source, the red-before-green ordering in T1-T3 is genuine (each step names
a specific, checkable red signal before the corresponding production
edit), and T4's final verification enumerates concrete, reproducible
commands rather than vague "confirm it works" language. Dependency
ordering (`T3` depends on `T1` for its typed fixture's required
`extractionRevision` field) is a real, necessary type-level dependency,
not an arbitrary sequencing choice. No external evidence trigger — this is
an internal semantic correction to code and tests already in the
repository.

## Verdict

`approve`

Every load-bearing claim (G1 through G4, both reproduced symptoms, the
backlog-follow-up commit) was independently re-derived against live
source or a fresh, non-copied reproduction — none was accepted on the
Plan's word alone. The design is minimal, precisely scoped to the four
named defects, correctly reuses existing ownership seams and the existing
confidence/rebuild vocabulary, and explicitly defers two adjacent
concerns (DC-1, DC-2) with real ceilings rather than expanding scope. The
eight independent findings surfaced during investigation are correctly
routed to backlog rather than bundled. No corrections are required before
Apply.

## External evidence sufficiency

not required (internal graph-extraction/linking semantics; no external
technology, library, or protocol claim governs this design).

## Residual concerns and evidence gaps

None. Both the confidence-fallback fix and the test-relation fix were
traced to single, minimal edits in already-read code, and the two
reproduced repository symptoms (link.ts's 14 false test relations;
render.ts's correct single relation) independently confirm the Plan's own
diagnosis rather than merely restating it.
