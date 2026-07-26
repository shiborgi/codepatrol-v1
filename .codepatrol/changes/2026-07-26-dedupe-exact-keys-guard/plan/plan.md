# Plan — Extract a shared exact-keys schema guard, parameterized on error code

- Work id: `2026-07-26-dedupe-exact-keys-guard`
- Governing spec: `spec.md`
- Target baseline: `main` @ `45ba75a` (branch `codepatrol/2026-07-26-dedupe-exact-keys-guard`)

## Goal and approach

The "reject unknown object keys" idiom is hand-rolled 9 times across 5
files, including two byte-identical private functions
(`orchestrator.ts`'s `exactInput`, `model.ts`'s `exactKeys`). Add one
parameterized `assertExactKeys` to `shared/errors.ts`; redirect
`exactInput`/`exactKeys` to thin-wrap it (every existing call site
untouched); redirect the five remaining inline sites to call it directly.
Zero behavior change, proven by an unchanged 215-test count after every
task.

## Global constraints

- Every thrown error's `code`, `exitCode`, and message text must be
  byte-identical to today's.
- After **every** task, `npm test` must show 215/215 before the next task
  starts.
- `exactInput`/`exactKeys` keep their exact names, signatures, and every
  existing call site.
- `session.ts:24-27`'s combined forbidden+allowed loop is untouched
  (spec's Out of scope, DC-1).

## Simplicity proof

- Selected rung: direct local change
- Reused capabilities: `CodepatrolError`/`ErrorCode` (already imported by
  all five consumer files); each site's existing `allowed` value (array or
  `Set`, passed through unchanged).
- Forbidden speculative surface: no touch to `session.ts:24-27` or the
  `requireObject`-family idiom (DC-1/DC-2); no message-prefix
  normalization.
- Expected surface delta: `errors.ts` +~5 lines; `orchestrator.ts` ~2
  lines; `model.ts` ~2 lines; `backlog.ts` ~4 lines (1 per site);
  `session.ts` ~1 line; `usage.ts` ~1 line.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T1 | Read `shared/errors.ts` |
| AC-2 | T2, T3 | `git diff` shows 8 call sites unchanged, only 2 bodies edited |
| AC-3 | T2-T6 | `grep` command from spec's AC-3, run at T6 |
| AC-4 | T1-T6 | `npm run verify` after every task |
| AC-5 | T6 | `git diff --stat` against base |

## Dependency order

`T1 → {T2, T3, T4, T5, T6-prep in any order, each independent} → T7`.
T2 (orchestrator.ts), T3 (model.ts), T4 (backlog.ts), T5 (session.ts), T6
(usage.ts) each only depend on T1's new export and touch disjoint files —
done sequentially here, each gated by its own test run. T7 is final
verification.

### T1 — Add `assertExactKeys` to `shared/errors.ts`

**Purpose:** Foundation for every other task. Satisfies AC-1.

**Depends on:** None

**Files:**

- Modify: `src/shared/errors.ts`

**Steps:**

1. Add, after the `CodepatrolError` class and before (or after)
   `operationalError`:

   ```typescript
   export function assertExactKeys(value: object, allowed: readonly string[] | ReadonlySet<string>, label: string, code: ErrorCode = "CHANGE_INVALID", exitCode: 2 | 4 = 4): void {
   	const isAllowed = (key: string) => Array.isArray(allowed) ? allowed.includes(key) : (allowed as ReadonlySet<string>).has(key);
   	for (const key of Object.keys(value)) if (!isAllowed(key)) throw new CodepatrolError(code, `${label} contains unknown field ${key}.`, exitCode);
   }
   ```

2. Run `npm run typecheck`. Expected: 0 errors.
3. Run `npm test`. Expected: 215/215 — no consumer yet calls this
   function, so nothing should differ.

**Task result:** diff and `npm test` output appended to `apply/journal.md`.

### T2 — Redirect `orchestrator.ts`'s `exactInput`

**Purpose:** Fixes the `exactInput`/`exactKeys` duplication's first half.
Progresses AC-2, AC-3, AC-4.

**Depends on:** T1

**Files:**

- Modify: `src/change/orchestrator.ts`

**Steps:**

1. Extend the existing `import { CodepatrolError } from "../shared/errors.js";`
   line to `import { CodepatrolError, assertExactKeys } from "../shared/errors.js";`.
2. Replace:

   ```typescript
   function exactInput(value: Record<string, unknown>, allowed: string[], label: string): void {
   	for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new CodepatrolError("INVALID_ARGUMENT", `${label} contains unknown field ${key}.`, 2);
   }
   ```

   with:

   ```typescript
   function exactInput(value: Record<string, unknown>, allowed: string[], label: string): void {
   	assertExactKeys(value, allowed, label, "INVALID_ARGUMENT", 2);
   }
   ```

3. Run `npm run typecheck`. Expected: 0 errors.
4. Run `npm test`. Expected: 215/215.
5. Confirm AC-2 for this half: `git diff` shows only `exactInput`'s body
   changed — none of its 4 call sites (`assertStartInput`,
   `assertTransitionIntent`, the artifact-binding validator,
   `assertCloseInput`) differ.

**Task result:** diff and `npm test` output appended to `apply/journal.md`.

### T3 — Redirect `model.ts`'s `exactKeys`

**Purpose:** Fixes the `exactInput`/`exactKeys` duplication's second half.
Progresses AC-2, AC-3, AC-4.

**Depends on:** T1

**Files:**

- Modify: `src/change/model.ts`

**Steps:**

1. Extend the existing `import { CodepatrolError } from "../shared/errors.js";`
   line to `import { CodepatrolError, assertExactKeys } from "../shared/errors.js";`.
2. Replace:

   ```typescript
   function exactKeys(value: object, allowed: string[], label: string): void {
   	for (const key of Object.keys(value)) if (!allowed.includes(key)) invalid(`${label} contains unknown field ${key}.`);
   }
   ```

   with:

   ```typescript
   function exactKeys(value: object, allowed: string[], label: string): void {
   	assertExactKeys(value, allowed, `CHANGE_INVALID: ${label}`, "CHANGE_INVALID", 4);
   }
   ```

   (the `CHANGE_INVALID: ` prefix is baked into the forwarded label to
   reproduce exactly what `invalid()` used to add — `invalid()` itself is
   untouched and keeps its other caller, the "Unknown event type" check).
3. Run `npm run typecheck`. Expected: 0 errors.
4. Run `npm test`. Expected: 215/215.
5. Confirm AC-2 for this half: `git diff` shows only `exactKeys`'s body
   changed — none of its 4 call sites (the artifact-binding loop,
   `assertChangeRecord`'s record/identity checks, the event-shape check)
   differ.

**Task result:** diff and `npm test` output appended to `apply/journal.md`.

### T4 — Redirect `backlog.ts`'s four inline sites

**Purpose:** Fixes the four `backlog.ts` duplications. Progresses AC-3,
AC-4.

**Depends on:** T1

**Files:**

- Modify: `src/change/backlog.ts`

**Steps:**

1. Extend the existing `import { CodepatrolError } from "../shared/errors.js";`
   line to `import { CodepatrolError, assertExactKeys } from "../shared/errors.js";`.
2. In `validateSource`, replace:

   ```typescript
   	for (const key of Object.keys(source as Record<string, unknown>)) if (!ALLOWED_SOURCE_KEYS.has(key)) throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Backlog item ${itemId} source contains unknown field ${key}.`, 4);
   ```

   with:

   ```typescript
   	assertExactKeys(source as Record<string, unknown>, ALLOWED_SOURCE_KEYS, `CHANGE_INVALID: Backlog item ${itemId} source`);
   ```

3. In `validateExternalRef`, replace:

   ```typescript
   	for (const key of Object.keys(ref as Record<string, unknown>)) if (!ALLOWED_EXTERNAL_REF_KEYS.has(key)) throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Backlog item ${itemId} externalRef contains unknown field ${key}.`, 4);
   ```

   with:

   ```typescript
   	assertExactKeys(ref as Record<string, unknown>, ALLOWED_EXTERNAL_REF_KEYS, `CHANGE_INVALID: Backlog item ${itemId} externalRef`);
   ```

4. In `validateItem`, replace:

   ```typescript
   	for (const key of Object.keys(raw as Record<string, unknown>)) if (!ALLOWED_ITEM_KEYS.has(key)) throw new CodepatrolError("CHANGE_INVALID", `Backlog item at index ${index} contains unknown field ${key}.`, 4);
   ```

   with:

   ```typescript
   	assertExactKeys(raw as Record<string, unknown>, ALLOWED_ITEM_KEYS, `Backlog item at index ${index}`);
   ```

   (no `CHANGE_INVALID: ` prefix here — preserving the existing
   inconsistency exactly, matching this site's current output).
5. In `validate` (root), replace:

   ```typescript
   	for (const key of Object.keys(root as Record<string, unknown>)) if (!ALLOWED_ROOT_KEYS.has(key)) throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Backlog root contains unknown field ${key}.`, 4);
   ```

   with:

   ```typescript
   	assertExactKeys(root as Record<string, unknown>, ALLOWED_ROOT_KEYS, "CHANGE_INVALID: Backlog root");
   ```

6. Run `npm run typecheck`. Expected: 0 errors.
7. Run `npm test`. Expected: 215/215.

**Task result:** diff and `npm test` output appended to `apply/journal.md`.

### T5 — Redirect `session.ts`'s item-level site

**Purpose:** Fixes the `session.ts` item-loop duplication, leaving the
combined forbidden+allowed loop untouched. Progresses AC-3, AC-4.

**Depends on:** T1

**Files:**

- Modify: `src/change/session.ts`

**Steps:**

1. Extend the existing `import { CodepatrolError } from "../shared/errors.js";`
   line to `import { CodepatrolError, assertExactKeys } from "../shared/errors.js";`.
2. Inside `validate`'s per-item loop, replace:

   ```typescript
   		for (const key of Object.keys(item)) if (!allowed.has(key)) throw new CodepatrolError("CHANGE_INVALID", `Session item ${item.id ?? "?"} contains unknown field ${key}.`, 4);
   ```

   with:

   ```typescript
   		assertExactKeys(item, allowed, `Session item ${item.id ?? "?"}`);
   ```

   (the `allowed` local `Set` declared on the line immediately above is
   unchanged; the combined `forbidden`/`keys` loop at lines 24-27, in the
   same function but a separate block over `session`'s own top-level keys
   rather than a per-item `item`'s keys, is explicitly untouched — do not
   edit it).
3. Run `npm run typecheck`. Expected: 0 errors.
4. Run `npm test`. Expected: 215/215.

**Task result:** diff and `npm test` output appended to `apply/journal.md`.

### T6 — Redirect `usage.ts`'s inline site

**Purpose:** Fixes the `usage.ts` duplication. Progresses AC-3, AC-4.

**Depends on:** T1

**Files:**

- Modify: `src/change/usage.ts`

**Steps:**

1. Extend the existing `import { CodepatrolError } from "../shared/errors.js";`
   line to `import { CodepatrolError, assertExactKeys } from "../shared/errors.js";`.
2. Inside `validateRun`, replace:

   ```typescript
   	for (const key of Object.keys(run)) if (!["id", "started_at", "finished_at", "elapsed_ms", "characters"].includes(key)) throw new CodepatrolError("CHANGE_INVALID", `Run contains unknown field ${key}.`, 4);
   ```

   with:

   ```typescript
   	assertExactKeys(run, ["id", "started_at", "finished_at", "elapsed_ms", "characters"], "Run");
   ```

3. Run `npm run typecheck`. Expected: 0 errors.
4. Run `npm test`. Expected: 215/215.

**Task result:** diff and `npm test` output appended to `apply/journal.md`.

### T7 — Final verification

**Purpose:** Confirms all five acceptance criteria hold together on the
fully-assembled diff.

**Depends on:** T1, T2, T3, T4, T5, T6

**Files:** None (verification only)

**Steps:**

1. Run:

   ```bash
   grep -n "for (const key of Object.keys" src/change/orchestrator.ts src/change/model.ts src/change/backlog.ts src/change/session.ts src/change/usage.ts
   ```

   Expected: exactly one match — `session.ts:24-27`'s combined loop
   (explicitly out of scope). Any other match means a site was missed.
2. Run `npm run verify` (typecheck + full test suite + build + smoke-cli +
   lint-skills). Expected: all green, 215/215.
3. Run `git diff --stat` against this Change's base commit (`45ba75a`).
   Expected: exactly six files — `src/shared/errors.ts`,
   `src/change/orchestrator.ts`, `src/change/model.ts`,
   `src/change/backlog.ts`, `src/change/session.ts`,
   `src/change/usage.ts` (AC-5).
4. Re-confirm AC-2: `git diff` on `orchestrator.ts` and `model.ts` touches
   only the two function bodies (`exactInput`, `exactKeys`) plus their
   import lines — no call site differs.
5. Confirm no `DC-1`/`DC-2` trigger fired (no evidence surfaced a need to
   touch `session.ts:24-27` or the `requireObject`-family idiom beyond
   what was already deferred).
6. Graph sync: not required — no exported symbol removed or renamed, only
   one additive `shared/errors.ts` export plus body-only edits elsewhere.
7. Rollback check: confirm `git revert` of the resulting commit(s) would
   cleanly restore every inline/original-body form, byte-identical to
   today.

**Task result:** the AC-3 grep output, final `npm run verify` output, diff
reconciliation, and residual-risk statement are appended to
`apply/journal.md`.
