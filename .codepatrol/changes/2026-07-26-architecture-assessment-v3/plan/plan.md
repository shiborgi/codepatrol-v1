# Plan — Whole-codebase architecture assessment (v3): legacy removal candidates and structural improvement points

- Work id: `2026-07-26-architecture-assessment-v3`
- Governing spec: `spec.md`
- Target baseline: `main` @ `264e87e` (branch `codepatrol/2026-07-26-architecture-assessment-v3`)

## Goal and approach

Investigation-only Change, matching the precedent set by
`2026-07-24-architecture-assessment`/`-v2`: zero production code diff. The
spec's "Current evidence" section is the complete durable record (no
`docs/`-namespace file — forbidden by `docs/runtime-state.md`, per spec's
Alternatives). This plan's only work is filing the two new findings (F1, F2)
as structured backlog items and committing them, then verifying the gate
stays green with no production diff.

## Global constraints

- No production source file may change in this Change's Apply.
- Both new backlog items must carry `source: { kind: "plan-followup",
  workId: "2026-07-26-architecture-assessment-v3" }` and `priority: "p3"`
  (matching N1's precedent for safe, low-urgency dead-code findings).
- `.codepatrol/backlog/items.yaml` must be committed before the Apply
  checkpoint (the caller-commits contract already established by every
  prior Plan that called `backlog add`).

## Simplicity proof

- Selected rung: need
- Reused capabilities: `codepatrol backlog add` (existing CLI command); the
  exact caller-commits-the-backlog-file pattern already used by every prior
  Plan session that filed follow-ups.
- Forbidden speculative surface: no code change; no new document file; F3
  intentionally not filed (spec's DC-1).
- Expected surface delta: `.codepatrol/backlog/items.yaml` (+2 items). No
  source files.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | (spec, already satisfied) | Inspect `spec.md`'s Current evidence section |
| AC-2 | (spec, already satisfied) | Inspect `spec.md`'s Reconciliation table |
| AC-3 | T1 | `codepatrol backlog list --format json` shows both items |
| AC-4 | T2 | `git diff --stat` against base touches only `.codepatrol/backlog/items.yaml` |

## Dependency order

`T1 → T2`.

### T1 — File F1 and F2 as backlog items

**Purpose:** Satisfies AC-3.

**Depends on:** None

**Files:**

- Modify: `.codepatrol/backlog/items.yaml` (via `codepatrol backlog add`,
  not a direct edit)

**Interfaces:**

- Consumes: `codepatrol backlog add --input -` (existing CLI command)
- Produces: two new `BacklogItem` entries

**Simplicity proof:** Reuses the existing `backlog add` command exactly as
every prior Plan session's follow-up filing has.

**Steps:**

1. Run:

   ```bash
   echo '{"title":"Dead, duplicated .codepatrol/changes path-builder helpers: changeDirectory (store.ts) and changeRoot (state.ts) are both unreferenced; the one real caller hardcodes the literal path instead","area":"architecture","priority":"p3","evidence":["src/change/store.ts:11 (changeDirectory, zero callers)","src/shared/state.ts:17 (changeRoot, zero callers)","src/change/store.ts:31 (listWorkingTreeChangeIds hardcodes the literal path instead of using either helper)"],"source":{"kind":"plan-followup","workId":"2026-07-26-architecture-assessment-v3"}}' | codepatrol backlog add --input - --workspace "$PWD" --format json
   ```

   Expected: `{"ok":true,...,"data":{"id":"...","status":"candidate","count":1}}`.
2. Run:

   ```bash
   echo '{"title":"Redundant non-throwing validators in validation.ts: validateArtifactBindingsFromReader has zero callers anywhere; validateArtifactBindings is only imported by one test, never by production code","area":"architecture","priority":"p3","evidence":["src/change/validation.ts:51 (validateArtifactBindingsFromReader, zero importers anywhere)","src/change/validation.ts:42 (validateArtifactBindings, imported only by src/change/change.test.ts:14)","src/change/orchestrator.ts:16,118,130 (production code calls only the throwing pair, validateStageArtifacts/validateStageArtifactsFromReader)"],"source":{"kind":"plan-followup","workId":"2026-07-26-architecture-assessment-v3"}}' | codepatrol backlog add --input - --workspace "$PWD" --format json
   ```

   Expected: `{"ok":true,...,"data":{"id":"...","status":"candidate","count":1}}`.
3. Run `codepatrol backlog list --format json --workspace "$PWD"` and
   confirm both new items are present with `priority: "p3"`,
   `source.kind: "plan-followup"`, `source.workId:
   "2026-07-26-architecture-assessment-v3"`.
4. Commit the backlog file: `git add .codepatrol/backlog/ && git commit -m
   "chore(codepatrol): backlog follow-ups from
   2026-07-26-architecture-assessment-v3 (F1, F2)"` — required before the
   Apply checkpoint per the established caller-commits contract.

**Task result:** the two item ids, their full JSON, and the commit hash are
appended to `apply/journal.md`.

### T2 — Final verification (no code touched)

**Purpose:** Satisfies AC-4 — confirms this investigation-only Change
produced zero production diff, matching its declared scope.

**Depends on:** T1

**Files:** None

**Steps:**

1. Run `npm run verify` (typecheck + full test suite + build + smoke-cli +
   lint-skills). Expected: all steps pass, 0 failures — unchanged from the
   base commit's already-green state, since no source file changed.
2. Run `git status --porcelain` (or `git diff --stat` against the base
   commit for the working-tree-plus-committed delta) and confirm the only
   change anywhere in this Change's history is the one backlog-file commit
   from T1 — no `src/`, `skills/`, or config file touched.
3. Confirm AC-1–AC-4 all hold: AC-1/AC-2 by re-reading `spec.md` (already
   satisfied at Plan time, re-confirmed here); AC-3 by the T1 output; AC-4
   by step 2's diff check.

**Task result:** gate output and diff confirmation are appended to
`apply/journal.md`.
