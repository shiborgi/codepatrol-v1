# Plan — Revalidate `src/` structure: module cohesion, boundaries, testability and extensibility

- Work id: `2026-07-26-src-structure-revalidation`
- Governing spec: `spec.md`
- Target baseline: `main` @ `5f569db` (branch `codepatrol/2026-07-26-src-structure-revalidation`)

## Goal and approach

Investigation-only Change, matching the `mode: architecture` precedent set by
`2026-07-24-architecture-assessment`, `-v2`, and
`2026-07-26-architecture-assessment-v3`: **zero production code diff**. The
analysis is complete and recorded in `spec.md` (findings S1-S4 plus the
verified positive findings); this plan's only work is filing the four
findings as structured backlog items, committing them, and verifying the
gate stays green with no production diff.

## Global constraints

- No production source file may change.
- No new `docs/` file (forbidden by `docs/runtime-state.md:20-22`).
- Each item carries `source: { kind: "plan-followup", workId:
  "2026-07-26-src-structure-revalidation" }`; S1 and S2 at `p2`, S3 and S4
  at `p3` — the priorities the spec's AC-3 fixes.
- `.codepatrol/backlog/items.yaml` must be committed before the Apply
  checkpoint (the caller-commits contract; `backlog add` writes but does not
  commit).

## Simplicity proof

- Selected rung: need
- Reused capabilities: `codepatrol backlog add` (existing CLI command) and
  the caller-commits-the-backlog-file pattern used by every prior Plan that
  filed follow-ups.
- Forbidden speculative surface: no code change; no new document file; the
  `model.ts` double-import nit deliberately not filed (spec's Noted, not
  filed).
- Expected surface delta: `.codepatrol/backlog/items.yaml` (+4 items). No
  source files.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | (spec, already satisfied) | Inspect `spec.md`'s Current evidence section |
| AC-2 | (spec, already satisfied) | Inspect `spec.md`'s Method paragraph |
| AC-3 | T1 | `codepatrol backlog list --format json` filtered on this work id |
| AC-4 | T2 | `git diff --stat` against base |

## Dependency order

`T1 → T2`.

### T1 — File S1-S4 as backlog items

**Purpose:** Satisfies AC-3.

**Depends on:** None

**Files:**

- Modify: `.codepatrol/backlog/items.yaml` (via `codepatrol backlog add`,
  never a direct edit)

**Interfaces:**

- Consumes: `codepatrol backlog add --input -`
- Produces: four new `BacklogItem` entries
- Invariants: each `backlog add` returns `{"status":"candidate","count":1}`
  — a `count` above 1 would mean the title collided with an existing item's
  dedup key, which must be investigated rather than accepted silently.

**Simplicity proof:** Reuses the existing command exactly as every prior
follow-up filing has.

**Surface delta:** ~4 entries appended to one YAML file.

**Steps:**

1. File S1 (`p2`, recommended next pickup):

   ```bash
   echo '{"title":"Path-layout knowledge for .codepatrol/ has no owning module: ~28 hardcoded literals across 8 files, with change.yaml built in 2 places and the stage-artifact prefix in 3, despite shared/state.ts existing to own path construction","area":"architecture","priority":"p2","evidence":["src/shared/state.ts:5 (stateRoot, the designated home for path construction)","src/change/orchestrator.ts:24 and src/change/store.ts:11 both build .codepatrol/changes/<id>/change.yaml","src/change/orchestrator.ts:123, src/change/validation.ts:24, src/change/validation.ts:43 all build the .codepatrol/changes/<id>/<stage>/ prefix","src/change/backlog.ts:47 owns backlogPath but src/change/orchestrator.ts:265,269,292 re-inline the literal","src/change/orchestrator.ts:255-258 inline the 4 required stage-artifact paths; src/change/session.ts:123 independently hardcodes plan/plan.md","the F1 helpers removed by 2026-07-26-remove-dead-path-builders were abandoned attempts at exactly this centralization","fix will touch ~6 files including orchestrator.ts, the highest-blast-radius module"],"source":{"kind":"plan-followup","workId":"2026-07-26-src-structure-revalidation"}}' | codepatrol backlog add --input - --workspace "$PWD" --format json
   ```

2. File S2 (`p2`):

   ```bash
   echo '{"title":"The reject-unknown-keys schema guard is reimplemented 10 times across 6 files, including two byte-identical private functions under different names (orchestrator.ts exactInput and model.ts exactKeys)","area":"architecture","priority":"p2","evidence":["src/change/orchestrator.ts:33-35 (exactInput) and src/change/model.ts:10-12 (exactKeys) are byte-identical bodies","other sites: backlog.ts:52, backlog.ts:66, backlog.ts:76, backlog.ts:95, session.ts:25, session.ts:26, session.ts:33, usage.ts:17","companion non-empty-string idiom re-inlined 8x in backlog.ts, 2x in orchestrator.ts, 1x in cli/commands.ts","a shared helper must be parameterised on error code: INVALID_ARGUMENT exit 2 for CLI input vs CHANGE_INVALID exit 4 for persisted records","2026-07-26-architecture-assessment-v3 declined to file this at a 2-site count; the full-codebase count is 10 across 6 files"],"source":{"kind":"plan-followup","workId":"2026-07-26-src-structure-revalidation"}}' | codepatrol backlog add --input - --workspace "$PWD" --format json
   ```

3. File S3 (`p3`):

   ```bash
   echo '{"title":"CLI command registration is split across three parallel registries with no compile-time link: args.ts COMMAND_OPTIONS, commands.ts switch, output.ts help text","area":"architecture","priority":"p3","evidence":["src/cli/args.ts:41 (COMMAND_OPTIONS), the executeCommand switch in src/cli/commands.ts, and the help block in src/cli/output.ts must be edited together","currently in sync: 19 case labels and 19 COMMAND_OPTIONS keys, set-difference empty both directions","latent not live: sync is held by discipline, not by the type system","lived evidence: 2026-07-26-backlog-resolve Apply hit Unknown command: backlog.resolve because the case landed before the args.ts entry"],"source":{"kind":"plan-followup","workId":"2026-07-26-src-structure-revalidation"}}' | codepatrol backlog add --input - --workspace "$PWD" --format json
   ```

4. File S4 (`p3`):

   ```bash
   echo '{"title":"graph/link.ts (235 lines) has no direct test, extending the known N2 coverage gap which names only atomic-store.ts, languages.ts and queries.ts","area":"architecture","priority":"p3","evidence":["src/graph/link.ts is the largest production file in the repo with no test file importing it","it owns edge resolution: turning extracted symbols into imports/calls/inherits edges","silent misbehaviour would degrade graph impact blast-radius output that Verify stages rely on","extends existing backlog item core-module-test-coverage-gaps-atomic-store-ts-graph-languages-ts-graph-queries-ts-lack-dedicated-tests rather than duplicating it","cli/main.ts and cli/output.ts also lack direct tests but are legitimately covered by subprocess CLI tests; version.ts is a one-line constant"],"source":{"kind":"plan-followup","workId":"2026-07-26-src-structure-revalidation"}}' | codepatrol backlog add --input - --workspace "$PWD" --format json
   ```

   Expected for each of steps 1-4:
   `{"ok":true,...,"data":{"id":"...","status":"candidate","count":1}}`. A
   `count` greater than 1 means a dedup-key collision — stop and
   investigate rather than proceeding.
5. Verify AC-3 by re-reading the persisted file (not by trusting the four
   command return values):

   ```bash
   codepatrol backlog list --workspace "$PWD" --format json | python3 -c "
   import json,sys
   items=[i for i in json.load(sys.stdin)['data'] if i['source'].get('workId')=='2026-07-26-src-structure-revalidation']
   print(len(items))
   for i in items: print(i['priority'], i['status'], i['id'][:60])
   "
   ```

   Expected: `4`, with exactly two `p2` and two `p3` entries, all
   `candidate`.
6. Commit the backlog file:

   ```bash
   git add .codepatrol/backlog/ && git commit -m "chore(codepatrol): backlog follow-ups from 2026-07-26-src-structure-revalidation (S1-S4)"
   ```

**Task result:** the four item ids, the step-5 verification output, and the
commit hash are appended to `apply/journal.md`.

### T2 — Final verification (no code touched)

**Purpose:** Satisfies AC-4 — confirms this investigation-only Change
produced zero production diff.

**Depends on:** T1

**Files:** None

**Steps:**

1. Run `npm run verify` (typecheck + full test suite + build + smoke-cli +
   lint-skills). Expected: all steps pass, 215/215 tests, 0 failures —
   unchanged from the base commit's already-green state, since no source
   file changed.
2. Run `git status --porcelain` and `git diff --stat <base>..HEAD -- ':!.codepatrol'`.
   Expected: the second command produces **no output** (zero non-`.codepatrol`
   paths changed); the first shows only this Change's own Apply-owned
   `apply/` directory as untracked.
3. Confirm AC-1 and AC-2 by re-reading `spec.md`'s Current evidence and
   Method sections (satisfied at Plan time; re-confirmed at the point of
   sealing rather than assumed carried forward).
4. Confirm neither `DC-1` nor `DC-2` trigger fired during this Change (no
   finding was fixed rather than filed; no non-`src/` structural issue was
   surfaced that would need its own pass).
5. Graph sync: not required — no code changed, so the graph has nothing to
   pick up. State this explicitly rather than running it needlessly.
6. Rollback check: confirm `git revert` of the single backlog commit would
   cleanly remove all four items, with no code or schema depending on them.

**Task result:** gate output, the diff confirmation, and the residual-risk
statement are appended to `apply/journal.md`.
