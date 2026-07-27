# Plan — Document `transition.json` and `close.json` exact payload shapes

- Work id: `2026-07-26-document-transition-close-payloads`
- Governing spec: `spec.md`
- Target baseline: `main` @ `d088fdb` (branch `codepatrol/2026-07-26-document-transition-close-payloads`)

## Goal and approach

`skills/_shared/CODEPATROL-CLI.md` documents `session.json`'s full shape but
not `transition.json`'s six variants or `close.json`'s four fields — the
two payloads a harness most often gets `INVALID_ARGUMENT` on, per aggregated
evidence across 9+ Changes. Add a field table plus fenced worked examples
for both (including the optional `changes`/`persona`/`reasons` fields
`transition.json`'s `checkpoint`/`return` variants accept), transcribed
directly from `src/change/types.ts`/`orchestrator.ts`, mirroring
`session.json`'s existing treatment. Doc-only; no code change.

## Global constraints

- Every field name and enum value in the new examples must match current
  `src/change/types.ts`/`src/change/orchestrator.ts` source exactly — no
  invented or memorized shapes.
- `skills/_shared/CODEPATROL-CLI.md`'s existing content (all 49 current
  lines) stays byte-identical outside the two new inserted sections.
- `npm run lint:skills` must pass after the edit.

## Simplicity proof

- Selected rung: direct local change (documentation only)
- Reused capabilities: `session.json`'s existing example's prose pattern and
  placement convention (one intro sentence + fenced JSON), applied to the
  two payloads that lack it.
- Forbidden speculative surface: no CLI-boundary validator changes (DC-1), no
  command-name-typo handling (DC-2), no restructuring of existing prose.
- Expected surface delta: `skills/_shared/CODEPATROL-CLI.md` only, +~90
  lines.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T1 | Read the field table and seven new `transition.json` examples against `types.ts:45-51` |
| AC-2 | T1 | Read the `checkpoint` example/prose for the stage-locked result mapping and apply-only `changes` |
| AC-3 | T2 | Read the new `close.json` example against `types.ts:54` |
| AC-4 | T3 | `npm run lint:skills` |
| AC-5 | T3 | Side-by-side diff of every new field/enum against current source |

## Dependency order

`T1 → T2 → T3` (sequential: both doc sections land in the same file, T3 is
final verification of the fully-assembled diff).

### T1 — Add `transition.json` section

**Purpose:** Document all six `TransitionIntent` variants, including every
optional field each accepts. Satisfies AC-1, AC-2.

**Depends on:** None

**Files:**

- Modify: `skills/_shared/CODEPATROL-CLI.md`

**Steps:**

1. Re-read `src/change/types.ts:45-51` (`TransitionIntent`) and
   `src/change/orchestrator.ts:47-72` (`assertTransitionIntent`) fresh,
   immediately before writing, to guarantee the transcription is from
   current source, not memory.
2. Insert, directly after the existing `session.json` block (after line 38,
   before the "Lifecycle commands require an explicit work id" paragraph),
   a new block:

    Write the following as top-level Markdown at that location. Do not wrap
    the section in an outer `markdown` fence: every `json` fence below is an
    independent fence in the target document.

   `transition.json` for `change transition` has six `type` variants, each
   with its own exact field set (no variant accepts a field outside its own
   list):

   | Variant | Required fields | Optional fields |
   |---|---|---|
   | `begin` | `type`, `actor`, `stage`, `nextAction` | — |
   | `usage` | `type`, `actor`, `stage`, `run` | — |
   | `checkpoint` | `type`, `actor`, `stage`, `result`, `artifacts`, `nextAction` | `changes` (required when `stage: "apply"`, forbidden otherwise), `persona` |
   | `return` | `type`, `actor`, `stage`, `toStage`, `reason`, `nextAction` | `persona`, `reasons` |
   | `block` | `type`, `actor`, `stage`, `reason`, `nextAction` | — |
   | `resume` | `type`, `actor`, `stage`, `nextAction` | — |

   `persona` (checkpoint/return) marks a per-persona sub-checkpoint or
   sub-return within a parallel Review/Verify (e.g. `review-security`,
   `review-architecture`). `reasons` (return only) is populated on a later
   *consolidating* (non-persona) return that aggregates each sub-persona's
   individual reason string — it is not set on a single-persona return.

   ```json
   { "type": "begin", "actor": "claude-sonnet-5", "stage": "plan", "nextAction": "codepatrol-review <work-id> on codepatrol/<work-id>" }
   ```

   ```json
   { "type": "usage", "actor": "claude-sonnet-5", "stage": "plan", "run": { "id": "plan-1", "started_at": "2026-01-01T00:00:00Z", "finished_at": "2026-01-01T00:05:00Z", "elapsed_ms": 300000, "characters": { "status": "unavailable", "reason": "harness exposes no authoritative per-run token/character usage hook" } } }
   ```

   ```json
   { "type": "checkpoint", "actor": "claude-sonnet-5", "stage": "plan", "result": "ready", "artifacts": [ { "path": ".codepatrol/changes/<work-id>/plan/spec.md", "sha256": "<64-hex>", "intent": "create" } ], "nextAction": "codepatrol-review <work-id> on codepatrol/<work-id>" }
   ```

   ```json
   { "type": "checkpoint", "actor": "claude-sonnet-5", "stage": "apply", "result": "implemented", "artifacts": [ { "path": ".codepatrol/changes/<work-id>/apply/journal.md", "sha256": "<64-hex>", "intent": "create" } ], "changes": ["src/example.ts"], "nextAction": "codepatrol-verify <work-id> on codepatrol/<work-id>" }
   ```

   ```json
   { "type": "return", "actor": "claude-sonnet-5", "stage": "review", "toStage": "plan", "reason": "fix-first: <concrete reason>", "nextAction": "codepatrol-plan <work-id> on codepatrol/<work-id>" }
   ```

   ```json
   { "type": "block", "actor": "claude-sonnet-5", "stage": "apply", "reason": "<external blocker>", "nextAction": "<corrective action>" }
   ```

   ```json
   { "type": "resume", "actor": "claude-sonnet-5", "stage": "apply", "nextAction": "codepatrol-apply <work-id> on codepatrol/<work-id>" }
   ```

   `checkpoint`'s `result` is stage-locked: `plan`→`"ready"`,
   `review`→`"approve"`, `apply`→`"implemented"`, `verify`→`"commit"`
   (`close` never checkpoints via `transition`). Each `artifacts[]` entry's
   `intent` is `"create"`, `"modify"`, or `"delete"` — no default, no
   `"update"`. `return`'s `stage` is only `review`/`apply`/`verify`; its
   `toStage` is only `plan`/`apply`.

3. No `npm test`/typecheck applicable (markdown-only edit). Confirm the file
   has no outer `markdown` fence around this section and every displayed
   `json` fence is independently opened and closed.

**Task result:** diff appended to `apply/journal.md`.

### T2 — Add `close.json` section

**Purpose:** Document `CloseInput`'s four fields. Satisfies AC-3.

**Depends on:** T1

**Files:**

- Modify: `skills/_shared/CODEPATROL-CLI.md`

**Steps:**

1. Re-read `src/change/types.ts:54` (`CloseInput`) and
   `src/change/orchestrator.ts:76-79` (`assertCloseInput`) fresh.
2. Insert, directly after T1's new `transition.json` block, a new block:

    Write the following as top-level Markdown directly after T1's section;
    do not wrap it in an outer `markdown` fence.

   `close.json` for `change close` carries exactly `outcome`
   (`"commit"|"rollback"`), `actor`, `authority` (a free-text justification
   for the action, not a fixed enum), and optional `push` (only meaningful
   when `outcome: "commit"`; opts into `git push origin <target>` after a
   successful fast-forward):

   ```json
   { "outcome": "commit", "actor": "claude-sonnet-5", "authority": "User selected commit+push via AskUserQuestion for <work-id>; Verify checkpointed candidate <sha> with result commit.", "push": true }
   ```

**Task result:** diff appended to `apply/journal.md`.

### T3 — Final verification

**Purpose:** Confirm both new sections are accurate and the file remains
valid. Satisfies AC-4, AC-5.

**Depends on:** T1, T2

**Files:** None (verification only)

**Steps:**

1. Run `npm run lint:skills`. Expected: passes unchanged (skill catalog,
   frontmatter, dependencies, portability, relative-links all still valid —
   this Change touches no frontmatter/catalog/link, only prose inside an
   already-linked file).
2. Side-by-side comparison: for every field name, required/optional status,
   and enum value in the new field table, the seven `transition.json`
   examples, and the one `close.json` example, confirm it appears verbatim
   in current `src/change/types.ts:11-12,45-51,54` or
   `src/change/orchestrator.ts:47-79`. Zero divergence expected. Confirm no
   field named in the table is missing from every example (each of
   `changes`, `persona`, `reasons` must appear in at least one example or
   the accompanying prose).
3. Run the structural fence check below. It extracts the new payload section,
   rejects an outer `markdown` fence, and requires eight independently closed
   JSON fences (seven transition examples and one close example):

   ```bash
   node --input-type=module -e 'import { readFileSync } from "node:fs"; const s = readFileSync("skills/_shared/CODEPATROL-CLI.md", "utf8"); const a = s.indexOf("`transition.json` for `change transition`"); const b = s.indexOf("Lifecycle commands require an explicit work id"); if (a < 0 || b < 0 || a >= b) process.exit(1); const section = s.slice(a, b); if (section.includes("```markdown")) process.exit(1); const opens = (section.match(/^```json$/gm) ?? []).length; const closes = (section.match(/^```$/gm) ?? []).length; if (opens !== 8 || closes !== 8) process.exit(1);'
   ```

   Expected: exits 0. Before the T1/T2 correction, the outer-fence form fails
   because it contains ` ```markdown ` and has an extra bare closing fence.
4. Confirm `git diff --stat` against base (`d088fdb`) touches exactly one
   file: `skills/_shared/CODEPATROL-CLI.md`.
5. Confirm the file's existing content (lines 1-38, the pre-existing
   `session.json` example and command list) is byte-identical to before —
   only new content was inserted, nothing existing was altered.

**Task result:** the lint output, diff-reconciliation table, and
`git diff --stat` output are appended to `apply/journal.md`.
