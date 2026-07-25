# Implementation — Structured, prioritized backlog under `.codepatrol/backlog/`

- Package revision: 1
- Approval: `review.md` verdict approve (attempt 2)
- Target start ref: `8b474386e91d68f320dedbe2cc8c91673f474aed`
- Actor: codepatrol-apply
- Status: implemented

## Baseline reconciliation

Artifact validation result: passed. Target drift checked: working tree clean at `8b47438`. Conclusion: ready.

### T1 — Amend governing docs to sanction `.codepatrol/backlog/`

- Claim/workflow item: T1
- Started: 2026-07-25T01:47:00Z
- Files changed: `AGENTS.md`, `docs/runtime-state.md`, `CONTEXT.md`
- Simplicity check: pure prose amendment; no new code; resolved the first Plan attempt's return.
- Surface delta: 3 docs amended; "global workflow ledger" phrase removed; `.codepatrol/backlog/items.yaml` sanctioned exception documented in all three.
- Red evidence: N/A (doc amendment).
- Green evidence:
  - `grep -n "global workflow ledger" AGENTS.md docs/runtime-state.md CONTEXT.md` → empty (the prohibition phrase is gone).
  - `grep -n "backlog" AGENTS.md docs/runtime-state.md CONTEXT.md` → hits in all three.
- Assessment: governance contract and implementation are now consistent — the implementation cannot contradict a source of truth.
- Result: complete

### T2 — Backlog module: schema, validation, dedup, priority, upsert, link, list

- Claim/workflow item: T2
- Started: 2026-07-25T01:48:00Z
- Files changed: created `src/change/backlog.ts`, created `src/change/backlog.test.ts`
- Simplicity check: pure leaf module; reuses `session.ts` exact-keys validation, `atomic-store.ts` atomic write, `yaml.stringify`.
- Surface delta: +1 new module + +1 test file; net +~250 LOC.
- Red evidence: tests red at first run (`Cannot find module './backlog.js'`).
- Green evidence: 9/9 unit tests pass (`node --test --import jiti/register src/change/backlog.test.ts`).
- Assessment: foundation for T3–T7. Dedup key (digit-strip + non-alphanumeric collapse), P0–P3 classification (keyword heuristic), upsert-bump-with-higher-priority, read-then-write atomicity, fail-closed schema validation.
- Result: complete

### T3 — CLI `backlog add` and `backlog list`

- Claim/workflow item: T3
- Started: 2026-07-25T01:50:00Z
- Files changed: `src/cli/args.ts`, `src/cli/output.ts`, `src/cli/commands.ts`, `src/cli/cli.test.ts`
- Simplicity check: pure CLI plumbing; reuses `args.ts` pattern and `output.ts` formatTable.
- Surface delta: +2 `COMMAND_OPTIONS` entries, +1 `ParsedArgs.status`, +1 `renderBacklogList`, +2 `case` branches, +1 test, +2 HELP lines.
- Red evidence: `Unknown command: backlog.add` / `backlog.list`.
- Green evidence: 10/10 CLI tests pass.
- Assessment: deterministic CLI surface for the backlog; matches the existing `next`/`change summary` pattern.
- Result: complete

### T4 — Close hook: auto-upsert non-filler recommendations

- Claim/workflow item: T4
- Started: 2026-07-25T01:55:00Z
- Files changed: `src/change/orchestrator.ts`, created `src/change/backlog-close-integration.test.ts`
- Simplicity check: reuses the existing best-effort `try/catch` at `orchestrator.ts:390`; re-calls the pure `generateImprovementReport` (no I/O side effects beyond the file write).
- Surface delta: +~10 LOC inside the try block; +1 test file; +1 line in `parseStatusPaths` to whitelist `.codepatrol/backlog/` (otherwise the close postcondition would fail when the hook writes the new item).
- Red evidence: existing close tests pass pre- and post-hook (no regression).
- Green evidence: 2/2 close-integration tests pass — non-filler recommendation creates a `close-trace` `p3` item with the correct `source.workId`; filler-only close adds nothing.
- Assessment: best-effort and non-blocking (matches the improvement-report precedent); the backlog item surfaces in `next --stage plan` and the Kanban Backlog column.
- Result: complete

### T5 — `change start` backlog linkage

- Claim/workflow item: T5
- Started: 2026-07-25T01:58:00Z
- Files changed: `src/change/types.ts`, `src/change/orchestrator.ts`, created `src/change/start-backlog-link.test.ts`
- Simplicity check: additive optional field; pre-branch validation reuses `findBacklogItem`; post-branch `linkBacklogItem` reuses the T2 helper.
- Surface delta: +1 optional field on `StartChangeInput`; +1 allowed field in `assertStartInput`; +4 LOC in `startChangeLocked`; +4 new tests.
- Red evidence: validation test (missing `backlogItemId`) failed at first run with `INVALID_ARGUMENT: Backlog item not found…` — message lacked the code prefix; fixed by including `INVALID_ARGUMENT:` and `CHANGE_CONFLICT:` prefixes in the throw messages.
- Green evidence: 4/4 tests pass — valid `backlogItemId` links + schedules; missing id fails with `INVALID_ARGUMENT` pre-branch; dismissed id fails with `CHANGE_CONFLICT` pre-branch; no `backlogItemId` is unchanged.
- Assessment: the linkage lives in `items.yaml`, not on the immutable `change-started` event; the Kanban Backlog column surfaces the linkage.
- Result: complete

### T6 — `next --stage plan` renders the prioritized backlog

- Claim/workflow item: T6
- Started: 2026-07-25T02:01:00Z
- Files changed: `src/cli/commands.ts`, `src/cli/output.ts`, `src/cli/cli.test.ts`
- Simplicity check: optional `backlog` parameter on `renderNext`; non-plan stages ignore it.
- Surface delta: +1 case branch payload field; +1 `renderNext` parameter; +1 Backlog table rendering; +1 CLI test.
- Red evidence: `--stage verify` text did not match `Backlog:` regex — initially did match by accident from the stderr header; tightened the test to use `doesNotMatch`.
- Green evidence: 11/11 CLI tests pass — `next --stage plan` JSON has `data.backlog`; text matches `Backlog:`; `next --stage verify` has no `Backlog:`.
- Assessment: harness-agnostic projection of the prioritized backlog at the plan entry, exactly matching the `next`/`change summary` reproduce-verbatim pattern.
- Result: complete

### T7 — Kanban "Backlog" column with item↔Change flow

- Claim/workflow item: T7
- Started: 2026-07-25T02:03:00Z
- Files changed: `src/change/board.ts`, `src/change/board.test.ts`, `src/cli/commands.ts` (status case at `:54`), `scripts/render-kanban.mjs`
- Simplicity check: `projectKanban` stays pure — accepts an optional `backlogItems?: BacklogItem[]` parameter; both render-path callers (`status` CLI + `render-kanban.mjs`) pass `readBacklog(workspace).items`.
- Surface delta: `KanbanRow.backlog: string`; `projectKanban` gains optional `backlogItems` parameter + linkage (`Map<workId, BacklogItem>`) + backlog-only row append; `renderKanbanMarkdown` header gains a "Backlog" column; `scripts/render-kanban.mjs` imports `readBacklog` and passes `.items`; updated `board.test.ts` for new header.
- Red evidence: existing `board.test.ts` "Kanban columns and ordering are deterministic" failed (old header mismatch); fixed.
- Green evidence: 7/7 board tests pass — backlog-only row, promoted-linkage (no duplicate row), mixed promotion + backlog, no-backlogItems fallback, header check. Live verification: `node scripts/render-kanban.mjs --workspace /tmp/cp-t9c --format markdown` correctly renders `| test-item Test item | - | p2 · candidate | - | - | - | - | - | - |`.
- Assessment: both Kanban render paths now show the new column and agree; backlog-only items appear as additional rows with lifecycle cells `-`; promoted items flow into the linked Change row's Backlog cell.
- Result: complete

### T8 — Wire `codepatrol-plan/SKILL.md` + lock via skills-contract

- Claim/workflow item: T8
- Started: 2026-07-25T02:07:00Z
- Files changed: `skills/codepatrol-plan/SKILL.md`, `scripts/skills-contract.test.mjs`
- Simplicity check: mechanical per-skill prose addition; existing assertion pattern.
- Surface delta: +1 line in `codepatrol-plan/SKILL.md` entry + +1 paragraph for plan-split follow-ups; +1 `assert.match(skill("codepatrol-plan"), /backlog/)` in the skills-contract test.
- Red evidence: `assert.match(skill("codepatrol-plan"), /backlog/)` failed before the SKILL edit.
- Green evidence: 8/8 skills-contract tests pass; `npm run lint:skills` reports "Skill catalog, frontmatter, dependencies, portability, and relative links are valid."
- Assessment: the wiring is locked at the contract seam; future skill edits that drop the backlog reference fail the test.
- Result: complete

### T9 — Final verification and reconciliation

- Claim/workflow item: T9
- Started: 2026-07-25T02:09:00Z
- Files changed: none (verification only)
- Simplicity check: read-only.
- AC mapping:
  - AC-1: `src/change/backlog.test.ts` (9/9) + `src/cli/cli.test.ts` backlog test → pass.
  - AC-2: `src/cli/cli.test.ts` list/filter → pass.
  - AC-3: `src/change/backlog-close-integration.test.ts` (2/2) → pass.
  - AC-4: `src/cli/cli.test.ts` next-plan/next-verify → pass.
  - AC-5: `src/change/start-backlog-link.test.ts` (4/4) → pass.
  - AC-6: `src/change/board.test.ts` (7/7) + live `codepatrol status --format json` + live `render-kanban.mjs --format markdown` (both render the "Backlog" column, both views agree) → pass.
  - AC-7: grep "global workflow ledger" → empty; grep "backlog" in all 3 governing docs → hits; `codepatrol-plan/SKILL.md` mentions backlog; skills-contract asserts `/backlog/`. → pass.
  - AC-8: `npm run verify` exit 0 → pass.
- Full gate: `npm run verify` exit 0; typecheck + 173 tests + build + smoke:cli + lint:skills. Test count went from 151 → 173 (+22: 9 backlog.test + 2 backlog-close-integration + 4 start-backlog-link + 5 board.test + 1 cli.test backlog test + 1 cli.test next-backlog test).
- `codepatrol graph sync` → 70 files, 1797 symbols (was 66 / 1640 at prior Change's Verify; +4 files = backlog.ts + 3 new test files; +157 symbols).
- `bin/` and `docs/codepatrol/assessments/` untouched (AC-4).
- DC-N triggers: none activated (DC-1 promote / DC-2 priority ceiling / DC-3 semantic dedup / DC-4 backfill all remain as documented ceilings).
- Rollback: revert the branch; `.codepatrol/backlog/items.yaml` is new (no migration); existing Changes are unaffected.

## Final verification

- Affected checks run: `backlog.test.ts`, `backlog-close-integration.test.ts`, `start-backlog-link.test.ts`, `board.test.ts`, `change.test.ts`, `close-integration.test.ts`, `close-push.test.ts`, `apply-gate*.test.ts`, `cli.test.ts`, `skills-contract.test.mjs`, `package-contract.test.mjs`, `npm run typecheck`, `npm run build`, `npm run smoke:cli`, `npm run lint:skills`.
- Full gate: `npm run verify` exit 0; 173 tests pass.
- Graph refreshed via `codepatrol graph sync`. Wiki remains absent.
- Residual risks: DC-1 (one-command promote deferred), DC-2 (auto-priority ceiling, close-trace items never exceed p1), DC-3 (digit-strip only dedup), DC-4 (no backfill). Per-run provider tokens: `unavailable` (no harness hook).
- Rollback: Revert the branch.

## Surface delta

All changes match the spec forecast exactly:

**Created (4):**
- `src/change/backlog.ts` (T2)
- `src/change/backlog.test.ts` (T2)
- `src/change/backlog-close-integration.test.ts` (T4)
- `src/change/start-backlog-link.test.ts` (T5)

**Modified (14):**
- T1: `AGENTS.md`, `docs/runtime-state.md`, `CONTEXT.md`
- T2: (none — T2 is creation only)
- T3: `src/cli/args.ts`, `src/cli/output.ts`, `src/cli/commands.ts`, `src/cli/cli.test.ts`
- T4: `src/change/orchestrator.ts`
- T5: `src/change/types.ts`
- T6: (T6 changes were already in `src/cli/commands.ts`/`src/cli/output.ts`/`src/cli/cli.test.ts` from T3; the additional `case "next"` payload field is in T3's edits)
- T7: `src/change/board.ts`, `src/change/board.test.ts`, `src/cli/commands.ts` (status case at `:54`), `scripts/render-kanban.mjs`
- T8: `skills/codepatrol-plan/SKILL.md`, `scripts/skills-contract.test.mjs`

**Other touched (no spec change in scope, but in path):**
- `src/change/board.test.ts` updated for the new Backlog column header (existing test header expectation).

No unforecasted dependencies, config, or events added. No DC-N triggers activated.

## Notes

- T7's `parseStatusPaths` was extended to whitelist `.codepatrol/backlog/` (the Close postcondition otherwise fails when the hook writes a new item). This is documented as part of T4 (the hook is in T4; the postcondition fix is the natural complement).
- The `assert.throws` regex tests required error messages to include the error code prefix (`CHANGE_INVALID:`, `INVALID_ARGUMENT:`, `CHANGE_CONFLICT:`) so the regex matches against the message text. This is consistent with the prior CLI-ergonomics and migration-normalizer Changes' conventions.
- Test count: 151 → 173 (+22 tests). The +4 file count: `backlog.ts` + 3 new test files. The +157 symbol count reflects the new module's exports + tests + renderers.
