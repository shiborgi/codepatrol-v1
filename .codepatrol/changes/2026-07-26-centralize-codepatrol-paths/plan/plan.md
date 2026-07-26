# Plan — Centralize `.codepatrol/` path-layout knowledge in `shared/state.ts`

- Work id: `2026-07-26-centralize-codepatrol-paths`
- Governing spec: `spec.md`
- Target baseline: `main` @ `2e6549c` (branch `codepatrol/2026-07-26-centralize-codepatrol-paths`)

## Goal and approach

`shared/state.ts` already exists to own `.codepatrol/` path knowledge but
only covers `runtime/`; `changes/` and `backlog/` are re-typed as literals
across five other files (~20 sites). Add three private constants and seven
new relative-path builders to `state.ts`, redirect its four existing
exports to derive from the same constant, then redirect every consumer site
to call a builder instead of inlining the literal — **never renaming an
existing function or changing its signature**, only its body. Zero behavior
change, proven by an unchanged 215-test count after every task.

## Global constraints

- Every path string produced by every touched function must be
  byte-identical to today's — this is a substitution, not a redesign.
- After **every** task, `npm test` must show 215/215 before the next task
  starts — the same discipline `2026-07-26-decompose-transition-change`
  used for this same file.
- No existing exported function name, signature, or call-site changes
  (`relativeRecord`, `changeRecordPath`, `changeDirectoryForCleanup`,
  `backlogPath` all keep their exact names).
- `stage` parameters on the new `shared/state.ts` builders are typed
  `string`, never `Stage` (layering: `shared/` must not import `change/`).

## Simplicity proof

- Selected rung: direct local change
- Reused capabilities: `resolveInside` (already used by every touched
  file); the existing `state.ts` pattern (`stageSessionPath` already
  demonstrates a `stage: string`-typed builder in this exact file).
- Forbidden speculative surface: no generic path-join DSL (spec's
  Alternatives); no fix for `graph/store.ts:133` or
  `git.test-helper.ts` (DC-1/DC-2).
- Expected surface delta: `state.ts` +~25 lines; `store.ts` ~4 lines;
  `backlog.ts` ~2 lines +1 import; `validation.ts` ~2 lines +1 import;
  `session.ts` ~2 lines extending 1 import; `orchestrator.ts` ~13 lines
  across 4 functions +1 import.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T1 | Read `shared/state.ts` |
| AC-2 | T2-T5 | `grep` command from spec's AC-2, run at T6 |
| AC-3 | T1-T6 | `npm run verify` after every task |
| AC-4 | T6 | `git diff --stat` against base |

## Dependency order

`T1 → {T2, T3, T4, T5 in any order, each independent} → T6`. T2 (store.ts),
T3 (backlog.ts), T4 (validation.ts), T5 (session.ts) each only depend on
T1's new `state.ts` exports and touch disjoint files — safe to do in any
order, done sequentially here for a simpler single-actor session, each
still gated by its own test run. T6 covers `orchestrator.ts` internally
across three sub-steps (its own function boundaries) plus final
verification.

### T1 — Add relative-path builders to `shared/state.ts`

**Purpose:** Foundation for every other task. Satisfies AC-1.

**Depends on:** None

**Files:**

- Modify: `src/shared/state.ts`

**Interfaces:**

- Produces: `changesRootRelativePath()`, `changeDirectoryRelativePath(workId)`,
  `changeRecordRelativePath(workId)`, `changeStageRelativePrefix(workId, stage)`,
  `backlogRelativePrefix()`, `backlogRelativePath()`, `runtimeRelativePrefix()`
- Invariants: `stateRoot`, `graphStatePath`, `lockPath`, `stageSessionPath`
  keep their exact signatures and return values.

**Simplicity proof:** Three private constants, seven pure string functions,
no I/O, no new dependency.

**Surface delta:** +~25 lines, 0 removed (existing function bodies are
edited, not deleted).

**Steps:**

1. Replace the full content of `src/shared/state.ts` with:

   ```typescript
   import { resolveInside } from "./workspace.js";

   export const STATE_VERSION = 1;

   const CHANGES_DIR = ".codepatrol/changes";
   const BACKLOG_DIR = ".codepatrol/backlog";
   const RUNTIME_DIR = ".codepatrol/runtime";

   export function stateRoot(workspace: string): string {
   	return resolveInside(workspace, RUNTIME_DIR);
   }

   export function graphStatePath(workspace: string): string {
   	return resolveInside(workspace, `${RUNTIME_DIR}/graph/graph.json`);
   }

   export function lockPath(workspace: string, name: string): string {
   	return resolveInside(workspace, `${RUNTIME_DIR}/locks/${name}.lock`);
   }

   export function stageSessionPath(workspace: string, workId: string, stage: string, attempt: number): string {
   	return resolveInside(workspace, `${RUNTIME_DIR}/sessions/${workId}/${stage}/${attempt}.json`);
   }

   export function runtimeRelativePrefix(): string {
   	return `${RUNTIME_DIR}/`;
   }

   export function changesRootRelativePath(): string {
   	return CHANGES_DIR;
   }

   export function changeDirectoryRelativePath(workId: string): string {
   	return `${CHANGES_DIR}/${workId}`;
   }

   export function changeRecordRelativePath(workId: string): string {
   	return `${CHANGES_DIR}/${workId}/change.yaml`;
   }

   export function changeStageRelativePrefix(workId: string, stage: string): string {
   	return `${CHANGES_DIR}/${workId}/${stage}/`;
   }

   export function backlogRelativePrefix(): string {
   	return `${BACKLOG_DIR}/`;
   }

   export function backlogRelativePath(): string {
   	return `${BACKLOG_DIR}/items.yaml`;
   }
   ```

2. Run `npm run typecheck`. Expected: 0 errors.
3. Run `npm test`. Expected: 215/215 — no consumer yet calls the new
   functions, and the four redirected bodies produce identical strings to
   their prior literal form (`RUNTIME_DIR` = `.codepatrol/runtime`,
   character-for-character what was inlined before), so nothing should
   differ.

**Task result:** diff and `npm test` output appended to `apply/journal.md`.

### T2 — Redirect `store.ts` to the new builders

**Purpose:** Fixes the `.codepatrol/changes/<id>/change.yaml` and
`.codepatrol/changes` duplication in `store.ts`. Progresses AC-2, AC-3.

**Depends on:** T1

**Files:**

- Modify: `src/change/store.ts`

**Steps:**

1. Add `changeRecordRelativePath, changesRootRelativePath` to a new import
   from `"../shared/state.js"` (insert after the existing
   `import { resolveInside } from "../shared/workspace.js";` line).
2. Replace:

   ```typescript
   export function changeRecordPath(workspace: string, workId: string): string { return resolveInside(workspace, `.codepatrol/changes/${workId}/change.yaml`); }
   ```

   with:

   ```typescript
   export function changeRecordPath(workspace: string, workId: string): string { return resolveInside(workspace, changeRecordRelativePath(workId)); }
   ```

3. Replace, inside `listWorkingTreeChangeIds`:

   ```typescript
   	const root = resolveInside(workspace, ".codepatrol/changes"); if (!existsSync(root)) return [];
   	return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(resolveInside(workspace, `.codepatrol/changes/${entry.name}/change.yaml`))).map((entry) => entry.name).sort();
   ```

   with:

   ```typescript
   	const root = resolveInside(workspace, changesRootRelativePath()); if (!existsSync(root)) return [];
   	return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(resolveInside(workspace, changeRecordRelativePath(entry.name)))).map((entry) => entry.name).sort();
   ```

4. Run `npm run typecheck`. Expected: 0 errors.
5. Run `npm test`. Expected: 215/215.

**Task result:** diff and `npm test` output appended to `apply/journal.md`.

### T3 — Redirect `backlog.ts` to the new builder

**Purpose:** Fixes the `.codepatrol/backlog/items.yaml` duplication at its
real accessor. Progresses AC-2, AC-3.

**Depends on:** T1

**Files:**

- Modify: `src/change/backlog.ts`

**Steps:**

1. Add a new import line `import { backlogRelativePath } from "../shared/state.js";`
   (this file has no existing import from `shared/state.js`).
2. Replace:

   ```typescript
   export function backlogPath(workspace: string): string {
   	return resolveInside(workspace, ".codepatrol/backlog/items.yaml");
   }
   ```

   with:

   ```typescript
   export function backlogPath(workspace: string): string {
   	return resolveInside(workspace, backlogRelativePath());
   }
   ```

3. Run `npm run typecheck`. Expected: 0 errors.
4. Run `npm test`. Expected: 215/215.

**Task result:** diff and `npm test` output appended to `apply/journal.md`.

### T4 — Redirect `validation.ts` to the new builder

**Purpose:** Fixes the three-way duplicated `.codepatrol/changes/<id>/<stage>/`
prefix's two sites in this file. Progresses AC-2, AC-3.

**Depends on:** T1

**Files:**

- Modify: `src/change/validation.ts`

**Steps:**

1. Add a new import line `import { changeStageRelativePrefix } from "../shared/state.js";`
   (this file has no existing import from `shared/state.js`).
2. In `validateWithReader`, replace:

   ```typescript
   	const prefix = `.codepatrol/changes/${record.identity.work_id}/${stage}/`;
   ```

   with:

   ```typescript
   	const prefix = changeStageRelativePrefix(record.identity.work_id, stage);
   ```

3. In `validateArtifactBindings`, replace:

   ```typescript
   	const prefix = `.codepatrol/changes/${record.identity.work_id}/${stage}/`;
   ```

   with:

   ```typescript
   	const prefix = changeStageRelativePrefix(record.identity.work_id, stage);
   ```

4. Run `npm run typecheck`. Expected: 0 errors.
5. Run `npm test`. Expected: 215/215.

**Task result:** diff and `npm test` output appended to `apply/journal.md`.

### T5 — Redirect `session.ts` to the new builders

**Purpose:** Fixes the `.codepatrol/changes/<id>/` prefix and the
independently-hardcoded `plan/plan.md` path. Progresses AC-2, AC-3.

**Depends on:** T1

**Files:**

- Modify: `src/change/session.ts`

**Steps:**

1. Extend the existing import line
   `import { stageSessionPath } from "../shared/state.js";` to
   `import { changeDirectoryRelativePath, changeStageRelativePrefix, stageSessionPath } from "../shared/state.js";`.
2. In `itemIsDelivered`, replace:

   ```typescript
   	const changePrefix = `.codepatrol/changes/${workId}/`;
   ```

   with:

   ```typescript
   	const changePrefix = `${changeDirectoryRelativePath(workId)}/`;
   ```

3. Replace:

   ```typescript
   	const planPath = resolveInside(workspace, `.codepatrol/changes/${workId}/plan/plan.md`);
   ```

   with:

   ```typescript
   	const planPath = resolveInside(workspace, `${changeStageRelativePrefix(workId, "plan")}plan.md`);
   ```

4. Run `npm run typecheck`. Expected: 0 errors.
5. Run `npm test`. Expected: 215/215.

**Task result:** diff and `npm test` output appended to `apply/journal.md`.

### T6 — Redirect `orchestrator.ts` (three sub-steps) and final verification

**Purpose:** Fixes every remaining site: `relativeRecord`,
`parseStatusPaths`, `ensurePath`, `changeDirectoryForCleanup` (sub-step A);
`buildCheckpointEvent`'s prefix, required-artifact map, and backlog literal
plus prefix checks (sub-step B); `closeChangeLocked`'s close-path literals
(sub-step C). Completes AC-2; delivers AC-3 (final) and AC-4.

**Depends on:** T1, T2, T3, T4, T5

**Files:**

- Modify: `src/change/orchestrator.ts`

**Steps — sub-step A (early helpers, lines 24-28, 206-208):**

1. Add `changeDirectoryRelativePath, changeRecordRelativePath, changeStageRelativePrefix, backlogRelativePath, backlogRelativePrefix, runtimeRelativePrefix` to a new import from `"../shared/state.js"`, placed near the existing `"./store.js"`/`"./backlog.js"` imports.
2. Replace:

   ```typescript
   function relativeRecord(workId: string): string { return `.codepatrol/changes/${workId}/change.yaml`; }
   function parseStatusPaths(status: string): string[] { return status.split("\n").filter(Boolean).map((line) => line.slice(3).split(" -> ").at(-1)!).filter((path) => Boolean(path) && path !== ".codepatrol/" && !path.startsWith(".codepatrol/runtime/")); }
   function ensurePath(path: string): void {
   	if (!path || /[\0\r\n]/.test(path) || path.startsWith("/") || path.split("/").includes("..") || path.startsWith(".codepatrol/runtime/")) throw new CodepatrolError("CHANGE_INVALID", `Unsafe checkpoint path: ${path}.`, 4);
   }
   ```

   with:

   ```typescript
   function relativeRecord(workId: string): string { return changeRecordRelativePath(workId); }
   function parseStatusPaths(status: string): string[] { return status.split("\n").filter(Boolean).map((line) => line.slice(3).split(" -> ").at(-1)!).filter((path) => Boolean(path) && path !== ".codepatrol/" && !path.startsWith(runtimeRelativePrefix())); }
   function ensurePath(path: string): void {
   	if (!path || /[\0\r\n]/.test(path) || path.startsWith("/") || path.split("/").includes("..") || path.startsWith(runtimeRelativePrefix())) throw new CodepatrolError("CHANGE_INVALID", `Unsafe checkpoint path: ${path}.`, 4);
   }
   ```

   (the bare `path !== ".codepatrol/"` condition is untouched — it is not
   part of the `runtime/` duplication).
3. Replace:

   ```typescript
   function changeDirectoryForCleanup(workspace: string, workId: string): string {
   	return resolveInside(workspace, `.codepatrol/changes/${workId}`);
   }
   ```

   with:

   ```typescript
   function changeDirectoryForCleanup(workspace: string, workId: string): string {
   	return resolveInside(workspace, changeDirectoryRelativePath(workId));
   }
   ```

4. Run `npm run typecheck`. Expected: 0 errors.
5. Run `npm test`. Expected: 215/215.

**Steps — sub-step B (`buildCheckpointEvent`, lines ~123, ~255-258, ~265,
~269, ~292 — re-locate by content, not line number, since sub-step A may
shift line numbers slightly):**

6. Inside `buildCheckpointEvent`, replace:

   ```typescript
   	const prefix = `.codepatrol/changes/${record.identity.work_id}/${stage}/`;
   ```

   with:

   ```typescript
   	const prefix = changeStageRelativePrefix(record.identity.work_id, stage);
   ```

7. Replace the `required` map:

   ```typescript
   	const required: Record<string, string[]> = {
   		plan: [`.codepatrol/changes/${workId}/plan/spec.md`, `.codepatrol/changes/${workId}/plan/plan.md`],
   		review: [`.codepatrol/changes/${workId}/review/report.md`],
   		apply: [`.codepatrol/changes/${workId}/apply/journal.md`],
   		verify: [`.codepatrol/changes/${workId}/verify/report.md`],
   	};
   ```

   with:

   ```typescript
   	const required: Record<string, string[]> = {
   		plan: [`${changeStageRelativePrefix(workId, "plan")}spec.md`, `${changeStageRelativePrefix(workId, "plan")}plan.md`],
   		review: [`${changeStageRelativePrefix(workId, "review")}report.md`],
   		apply: [`${changeStageRelativePrefix(workId, "apply")}journal.md`],
   		verify: [`${changeStageRelativePrefix(workId, "verify")}report.md`],
   	};
   ```

8. Replace:

   ```typescript
   	const allowed = new Set([...paths, ...intent.artifacts.filter((item) => item.intent === "delete").map((item) => item.path), relativeRecord(workId), ".codepatrol/backlog/items.yaml"]);
   ```

   with:

   ```typescript
   	const allowed = new Set([...paths, ...intent.artifacts.filter((item) => item.intent === "delete").map((item) => item.path), relativeRecord(workId), backlogRelativePath()]);
   ```

9. Replace both occurrences (one in the `actualProduction` computation,
   one in the final post-commit `finalProduction` computation) of:

   ```typescript
   !path.startsWith(`.codepatrol/changes/${workId}/`) && !path.startsWith(".codepatrol/backlog/")
   ```

   with:

   ```typescript
   !path.startsWith(`${changeDirectoryRelativePath(workId)}/`) && !path.startsWith(backlogRelativePrefix())
   ```

   (there are exactly two occurrences of this exact substring in the
   function — one in the `actualProduction` line, one in the
   `finalProduction` line a few lines later; replace both identically).
10. Run `npm run typecheck`. Expected: 0 errors.
11. Run `npm test`. Expected: 215/215.

**Steps — sub-step C (`closeChangeLocked`, the close-path literals):**

12. Replace both occurrences of the pair
    `` `.codepatrol/changes/${workId}/close/receipt.md`, `.codepatrol/changes/${workId}/close/improvement-report.md` ``
    (one inside the `assertVerifiedCandidate` call's array literal, one
    inside the `allowedRecovery` `Set` literal a line below) with
    `` `${changeDirectoryRelativePath(workId)}/close/receipt.md`, `${changeDirectoryRelativePath(workId)}/close/improvement-report.md` ``,
    keeping every other element of each array/Set literal unchanged.
13. Replace:

    ```typescript
    	const receiptPath = `.codepatrol/changes/${workId}/close/receipt.md`;
    ```

    with:

    ```typescript
    	const receiptPath = `${changeDirectoryRelativePath(workId)}/close/receipt.md`;
    ```

14. Replace:

    ```typescript
    	const absolute = resolveInside(workspace, receiptPath); mkdirSync(resolveInside(workspace, `.codepatrol/changes/${workId}/close`), { recursive: true });
    ```

    with:

    ```typescript
    	const absolute = resolveInside(workspace, receiptPath); mkdirSync(resolveInside(workspace, `${changeDirectoryRelativePath(workId)}/close`), { recursive: true });
    ```

15. Run `npm run typecheck`. Expected: 0 errors.
16. Run `npm test`. Expected: 215/215.

**Final verification (this task's closing steps, covering AC-2 and AC-4
for the whole Change):**

17. Run:

    ```bash
    grep -n '"\.codepatrol/changes\|`\.codepatrol/changes\|"\.codepatrol/backlog\|`\.codepatrol/backlog\|"\.codepatrol/runtime\|`\.codepatrol/runtime' src/change/store.ts src/change/backlog.ts src/change/validation.ts src/change/session.ts src/change/orchestrator.ts
    ```

    Expected: no output (AC-2).
18. Run `npm run verify` (typecheck + full test suite + build + smoke-cli +
    lint-skills). Expected: all green, 215/215.
19. Run `git diff --stat` against this Change's base commit (`2e6549c`).
    Expected: exactly six files — `src/shared/state.ts`,
    `src/change/store.ts`, `src/change/backlog.ts`,
    `src/change/validation.ts`, `src/change/session.ts`,
    `src/change/orchestrator.ts` (AC-4).
20. Confirm no `DC-1`/`DC-2` trigger fired (no evidence surfaced a need to
    touch `graph/store.ts` or `git.test-helper.ts` beyond what was already
    deferred).
21. Graph sync: not required — no exported symbol removed or renamed, only
    additive exports in `state.ts` plus body-only edits elsewhere.
22. Rollback check: confirm `git revert` of the resulting commit(s) would
    cleanly restore every literal-inlined form, byte-identical to today.

**Task result:** diffs, all `npm test` outputs, the AC-2 grep output, the
final `npm run verify` output, diff reconciliation, and residual-risk
statement are appended to `apply/journal.md`.
