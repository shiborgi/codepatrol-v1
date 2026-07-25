# Plan — Remove unsafe duplicate YAML reader

- Work id: `2026-07-25-remove-duplicate-reader`
- Governing spec: `spec.md`
- Target baseline: `main` @ `5893504e8d417cc7a832aecbf0c10cbb65208d48`

## Goal and approach

Delete the private, duplicated `readChangeRecord`/`recordPathFor` pair in
`src/change/improvement-report.ts` and replace its single call site with a thin
existence-gated wrapper around the canonical `readChangeRecord` in `src/change/store.ts`. The
wrapper keeps the current name and signature so the rest of `generateImprovementReport` is
untouched; it returns `null` when `changeRecordPath(workspace, workId)` does not exist (preserving
the "Change never started" no-throw contract), and otherwise delegates fully to the canonical
reader, which applies `migrateRecord` normalization and `assertChangeRecord`/`foldChange`
validation. Add two regression tests: a legacy `"finalize"`-stage record that must fold into
`perStage.close`, and a present-but-corrupt `change.yaml` that must now throw `CodepatrolError`.

## Global constraints

- No change to `src/change/store.ts`, `src/change/model.ts`, or any exported signature of
  `generateImprovementReport`/`writeImprovementReport`/`mirrorImprovementReport`.
- `improvement-report.test.ts:63-74` (missing-file case) must continue to pass unmodified.
- No new dependency. No new file. Existing `bytesForDir`'s use of `existsSync`/`readdirSync`/
  `statSync` in the same file is untouched.
- Follow existing repo test style: `node:test` + `node:assert/strict`, `mkdtempSync` workspace
  fixtures, cleaned up in a `finally` block (matches every existing test in this file).

## Simplicity proof

- Selected rung: local reuse (import and delegate to `src/change/store.ts`'s existing
  `readChangeRecord`, add nothing new).
- Reused capabilities: `readChangeRecord` and `changeRecordPath` from `src/change/store.ts`
  (already exported, already used by `orchestrator.ts` and `session.ts`).
- Forbidden speculative surface: no new abstraction layer, no configurable read-tolerance flag, no
  generic "safe read" helper — the existence guard is inlined at the one call site that needs it.
- Expected surface delta: `src/change/improvement-report.ts` (imports and one function body
  changed, net negative lines); `src/change/improvement-report.test.ts` (two new test cases
  appended, no existing test changed).

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T1, T2 | `node --test src/change/improvement-report.test.ts` |
| AC-2 | T1, T2 | `node --test src/change/improvement-report.test.ts` |
| AC-3 | T1, T2 | `node --test src/change/improvement-report.test.ts` (existing test, must remain green) |
| AC-4 | T1 | `grep -n '"yaml"' src/change/improvement-report.ts` (expect no match); `npm run typecheck` |
| AC-5 | T3 | `npm run verify` |

## Dependency order

`T1 → T2`; `T3` depends on both `T1` and `T2` (final verification runs after the fix and its tests
exist).

### T1 — Replace the duplicate reader with a canonical-delegating wrapper

**Purpose:** Satisfies AC-4 (and is the precondition for AC-1/AC-2/AC-3) by routing every
`change.yaml` read in this file through `migrateRecord` + `assertChangeRecord`/`foldChange`.

**Depends on:** none

**Files:**

- Modify: `src/change/improvement-report.ts` — imports and the `readChangeRecord` function body

**Interfaces:**

- Consumes: `changeRecordPath`, `readChangeRecord` (aliased on import to avoid a name collision
  with the local wrapper) from `./store.js`; `ChangeRecordV2` type from `./types.js`
- Produces: unchanged local signature
  `function readChangeRecord(workspace: string, workId: string): ChangeRecordV2 | null`
- Invariants/errors: returns `null` iff `changeRecordPath(workspace, workId)` does not exist on
  disk; otherwise returns exactly what the canonical `readChangeRecord` returns, or propagates
  whatever `CodepatrolError` it throws (`CHANGE_NOT_FOUND` cannot occur here since existence was
  just checked; `CHANGE_INVALID` or an `assertChangeRecord`/`foldChange` validation error can).

**Simplicity proof:** Reuses the existing canonical reader verbatim; the only new code is the
one-line existence guard needed to keep the "no Change yet" contract that the canonical reader
does not itself provide (it always throws on a missing file).

**Surface delta:** 0 new files; ~10 lines removed (old `recordPathFor` + old `readChangeRecord`
body + the now-unused `parse` import), ~5 lines added (new import line + new wrapper body); the
`yaml` import is deleted entirely from this file.

**Steps:**

1. Confirm the current failing/absent behavior with a throwaway check (no test file yet — this
   is the red step for T1+T2 combined, executed after T2's tests are written in T2 step 1).
   Skip standalone red here; proceed to implement, then verify red/green together in T2.
2. In `src/change/improvement-report.ts`, change the import line

   ```typescript
   import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
   import { copyFileSync } from "node:fs";
   import { dirname, join } from "node:path";
   import { parse } from "yaml";
   import * as trace from "./trace.js";
   ```

   to

   ```typescript
   import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
   import { copyFileSync } from "node:fs";
   import { dirname, join } from "node:path";
   import { changeRecordPath, readChangeRecord as readCanonicalChangeRecord } from "./store.js";
   import type { ChangeRecordV2 } from "./types.js";
   import * as trace from "./trace.js";
   ```

   (drop `readFileSync` and the `yaml` import — no remaining use in this file; keep
   `existsSync`/`mkdirSync`/`readdirSync`/`statSync`/`writeFileSync`/`copyFileSync` for
   `bytesForDir` and `writeImprovementReport`/`mirrorImprovementReport`, all unchanged).

3. Delete the two functions:

   ```typescript
   function recordPathFor(workspace: string, workId: string): string {
   	return join(workspace, ".codepatrol", "changes", workId, "change.yaml");
   }

   function readChangeRecord(workspace: string, workId: string): { events: Array<Record<string, unknown>> } | null {
   	const p = recordPathFor(workspace, workId);
   	if (!existsSync(p)) return null;
   	try {
   		return parse(readFileSync(p, "utf8")) as { events: Array<Record<string, unknown>> };
   	} catch {
   		return null;
   	}
   }
   ```

   and replace with:

   ```typescript
   function readChangeRecord(workspace: string, workId: string): ChangeRecordV2 | null {
   	if (!existsSync(changeRecordPath(workspace, workId))) return null;
   	return readCanonicalChangeRecord(workspace, workId);
   }
   ```

4. Leave the call site at the former line 93 (`const record = readChangeRecord(workspace, workId);`)
   and everything after it in `generateImprovementReport` untouched — the loop's inline
   `as {...}` cast on each event (`const event = raw as {...}`) still narrows correctly since
   `ChangeRecordV2.events` is `ChangeEvent[]`, a superset of the previously-assumed loose shape.

### T2 — Add regression tests for legacy-stage folding and corrupt-file failure

**Purpose:** Satisfies AC-1, AC-2 and confirms AC-3 stays green; proves T1's fix with red-then-green
evidence.

**Depends on:** T1 (tests exercise the new wrapper's behavior; write them first for red, then
confirm green after T1's implementation)

**Files:**

- Modify: `src/change/improvement-report.test.ts` — two new `test(...)` blocks appended inside the
  existing `describe("improvement-report", ...)` block

**Interfaces:**

- Consumes: `report.generateImprovementReport` (existing export), `seedChange`-style fixture
  construction already used in this file (reuse the same `mkdtempSync`/`stringify`/`writeFileSync`
  pattern, not `seedChange` itself, since both new cases need a hand-built `change.yaml` that
  differs from the standard fixture).
- Produces: no new exports; test-only additions.
- Invariants/errors: new tests must independently create and clean up their own temp workspace
  (matching every existing test's `try { ... } finally { rmSync(...) }` pattern).

**Simplicity proof:** Reuses the file's existing fixture-construction idiom; no new test helper or
abstraction is introduced for two bounded cases.

**Surface delta:** 0 new files; ~40 lines appended to the existing test file.

**Steps:**

1. Add the first test below the existing tests, before T1 is implemented, to observe red:

   ```typescript
   test("generateImprovementReport folds legacy finalize-stage events into close", () => {
   	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-report-legacy-"));
   	try {
   		const id = "2026-07-24-legacy-finalize";
   		mkdirSync(join(workspace, ".codepatrol", "changes", id), { recursive: true });
   		const record = {
   			schema_version: 2,
   			identity: { work_id: id, title: "Legacy", created_at: "2026-07-23T00:00:00.000Z", branch: `codepatrol/${id}`, target_branch: "main", base_commit: "0".repeat(40) },
   			events: [
   				{ id: "1", type: "change-started", at: "2026-07-23T00:00:00.000Z", actor: "codex", stage: "plan", attempt: 1, next_action: "plan" },
   				{ id: "2", type: "run-recorded", at: "2026-07-23T00:00:30.000Z", actor: "codex", stage: "plan", attempt: 1, run: { id: "p1", started_at: "2026-07-23T00:00:00.000Z", finished_at: "2026-07-23T00:00:30.000Z", elapsed_ms: 30000, characters: { status: "unavailable", reason: "test" } } },
   				{ id: "3", type: "stage-checkpointed", at: "2026-07-23T00:00:31.000Z", actor: "codex", stage: "plan", attempt: 1, result: "ready", checkpoint: "a".repeat(40), tree: "b".repeat(40), artifacts: [], next_action: "review" },
   			],
   		};
   		writeFileSync(join(workspace, ".codepatrol", "changes", id, "change.yaml"), stringify(record));
   		const result = report.generateImprovementReport(workspace, id);
   		assert.equal(result.perStage.close?.attemptCount, 0);
   		assert.ok(!("finalize" in result.perStage));
   	} finally { rmSync(workspace, { recursive: true, force: true }); }
   });
   ```

   Note: this minimal fixture only reaches `plan` events — it exists to prove `perStage.finalize`
   never appears once a `"finalize"`-stage event is migrated away before the folding loop sees it.
   To actually exercise a `"finalize"`-stage event, extend the fixture with one further event using
   `stage: "finalize"` (the pre-migration name for `close`) and assert it lands in
   `perStage.close`, e.g. append
   `{ id: "4", type: "stage-checkpointed", at: "2026-07-23T00:05:00.000Z", actor: "codex", stage: "finalize", attempt: 1, result: "ready", checkpoint: "c".repeat(40), next_action: "done" }`
   only after confirming against `migrateRecord`'s actual normalized event shape (run
   `node --test` first to see the real assertion failure/pass, not a guessed one — do not hand-wave
   the exact expected `attemptCount`).

   Run: `node --test src/change/improvement-report.test.ts`
   Expected red (before T1): the test still passes today for the "no finalize key" assertion
   (since the un-migrated stage name is literally `"finalize"`, not folded, so `perStage.finalize`
   *would* exist) — confirm the assertion `assert.ok(!("finalize" in result.perStage))` fails
   against current `main`, proving the bug. If it does not fail, adjust the fixture until it does
   before proceeding (a red step that passes by accident is not acceptable).

2. Add the second test:

   ```typescript
   test("generateImprovementReport throws on a present but corrupt change.yaml", () => {
   	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-report-corrupt-"));
   	try {
   		const id = "2026-07-24-corrupt";
   		mkdirSync(join(workspace, ".codepatrol", "changes", id), { recursive: true });
   		writeFileSync(join(workspace, ".codepatrol", "changes", id, "change.yaml"), "not: [valid, yaml: structure");
   		assert.throws(() => report.generateImprovementReport(workspace, id), /CHANGE_INVALID|CHANGE_NOT_FOUND/);
   	} finally { rmSync(workspace, { recursive: true, force: true }); }
   });
   ```

   Run: `node --test src/change/improvement-report.test.ts`
   Expected red (before T1): this throws nothing today (`assert.throws` fails) because the old
   reader's `catch { return null; }` swallows the parse error into a silent empty report.

3. Implement T1.

4. Run `node --test src/change/improvement-report.test.ts`.
   Expected green: all 8 tests pass (6 existing + 2 new), including the unmodified
   missing-file test at (old) lines 63-74 (AC-3).

5. Run `node --test src/change/improvement-report.test.ts src/change/orchestrator*.test.ts
   src/change/close-integration.test.ts src/change/backlog-close-integration.test.ts
   src/change/close-push.test.ts`.
   Expected: all pass — confirms the Close-stage caller (`orchestrator.ts:409`) is unaffected
   (per the spec's risk note: any `change.yaml` that would newly throw here already throws earlier
   in the same Close transition).

### T3 — Full verification and graph refresh

**Purpose:** Satisfies AC-5; maps every criterion back to a passing gate; confirms no undeclared
surface change.

**Depends on:** T1, T2

**Files:** none (verification only)

**Interfaces:** none

**Simplicity proof:** n/a — verification task, no new code.

**Surface delta:** none beyond T1/T2.

**Steps:**

1. Run `npm run typecheck`. Expected: exits 0, no new errors (confirms AC-4's type-level
   consistency of the `ChangeRecordV2 | null` return type against all callers).
2. Run `npm test`. Expected: exits 0, full suite green including the two new tests from T2.
3. Run `npm run build`. Expected: exits 0.
4. Run `npm run smoke:cli`. Expected: exits 0 (confirms the Close-path CLI flow that calls
   `generateImprovementReport` transitively still works end-to-end).
5. Run `npm run lint:skills`. Expected: exits 0 (no skill files touched, but part of `verify`).
6. Run `git diff --stat main` (or the equivalent against target baseline) and confirm only
   `src/change/improvement-report.ts` and `src/change/improvement-report.test.ts` changed —
   reconcile against the spec's forecast (1 file modified, 1 test file modified, no new files,
   no dependency changes) and explain any difference before proceeding.
7. Run `grep -n '"yaml"' src/change/improvement-report.ts` — expect no match (AC-4).
8. Run `codepatrol graph sync` and confirm it completes with no new extraction errors for the two
   changed files.
9. Rollback check: reverting the single Apply commit for this Change restores the prior (buggy)
   behavior with no data migration to undo — record this in the Apply journal's final task result.
10. Residual risk: none identified beyond the spec's two documented and mitigated risks; record
    that both were re-checked (existing Close-stage tests green; no test pins the old wrong counts
    for the two legacy `"finalize"` Changes on disk).
