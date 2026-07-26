# Plan — Remove dead `.codepatrol/changes` path-builder helpers (`changeDirectory`, `changeRoot`)

- Work id: `2026-07-26-remove-dead-path-builders`
- Governing spec: `spec.md`
- Target baseline: `main` @ `948905d` (branch `codepatrol/2026-07-26-remove-dead-path-builders`)

## Goal and approach

Delete two zero-caller functions (`changeDirectory` in `src/change/store.ts`,
`changeRoot` in `src/shared/state.ts`), re-verifying immediately before
deletion that neither has any caller anywhere in the repo (a red-capable
characterization step — if the grep unexpectedly finds a caller, the removal
stops and returns to Plan as a contract defect, not a silent scope change).

## Global constraints

- No behavior change is possible or intended — both functions are
  unreachable today.
- No file other than `src/change/store.ts` and `src/shared/state.ts` may
  change.
- The full `npm run verify` gate must show the same test count (215) after
  removal as before — proving no regression, not merely that it compiles.

## Simplicity proof

- Selected rung: direct local change
- Reused capabilities: none needed — pure deletion.
- Forbidden speculative surface: no new shared path-builder helper (DC-1);
  no consolidation beyond the two deletions.
- Expected surface delta: `src/change/store.ts` (-1 line), `src/shared/state.ts`
  (-3 lines).

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T1 | `grep -n "changeDirectory" src/change/store.ts` |
| AC-2 | T1 | `grep -n "changeRoot" src/shared/state.ts` |
| AC-3 | T1 | `npm run verify` |
| AC-4 | T1 | `git diff --stat` against base |

## Dependency order

Single task, T1.

### T1 — Remove both dead functions

**Purpose:** Satisfies AC-1 through AC-4.

**Depends on:** None

**Files:**

- Modify: `src/change/store.ts` — delete `changeDirectory`
- Modify: `src/shared/state.ts` — delete `changeRoot`

**Interfaces:**

- Removes: `export function changeDirectory(workspace: string, workId: string): string` from `store.ts`
- Removes: `export function changeRoot(workspace: string): string` from `state.ts`
- Invariants: no other export in either file changes; no import statement in either file changes (neither function used anything exclusive to it — `changeDirectory` used only `resolveInside`, already imported and used by other functions in the same file; `changeRoot` used only `resolveInside`, likewise).

**Simplicity proof:** Pure deletion, no replacement code, no new abstraction.

**Surface delta:** -1 line in `store.ts`, -3 lines in `state.ts` (including
the blank line separating the function from its neighbors, kept or removed
to match each file's existing spacing convention — inspect surrounding
lines before editing).

**Steps:**

1. Re-run the characterization check immediately before editing (this is
   the "red-capable" step for a pure-deletion task — the expected signal is
   confirmation of zero callers, not a traditional failing test):

   ```bash
   grep -rn "changeDirectory\b" src/ --include="*.ts"
   grep -rn "changeRoot\b" src/ --include="*.ts"
   ```

   Expected: each returns exactly one line — the function's own declaration
   in `store.ts:11` / `state.ts:17` respectively. If either returns a second
   match, STOP — this is a contract defect (the spec's evidence was wrong or
   went stale) and must return to Plan, not be silently worked around.
2. Delete the `changeDirectory` function declaration
   (`src/change/store.ts:11`), matching the surrounding file's spacing.
3. Delete the `changeRoot` function declaration
   (`src/shared/state.ts:17-19`), matching the surrounding file's spacing.
4. Run `npm run typecheck`.
   Expected: 0 errors — confirms no import anywhere referenced either
   removed export (a missing-import error would surface here immediately if
   the evidence were wrong).
5. Run `node --import jiti/register --test $(find src .pi scripts -name '*.test.ts' -o -name '*.test.mjs')` (the full suite, matching `npm test`'s exact invocation).
   Expected: same pass count as the base commit, 215/215, 0 failures.
6. Run `git diff --stat` against the base commit.
   Expected: exactly two files changed, `src/change/store.ts` and
   `src/shared/state.ts`, no other paths.

**Task result:** changed paths, the re-verification command outputs, and
gate results are appended to `apply/journal.md`.

## Final task

T1 is both the implementation and the complete verification for this
single-task Change — its steps 4-6 already constitute the full gate
(`npm run verify`'s constituent parts are typecheck + test; build/smoke-cli/
lint-skills are re-run identically at the Apply checkpoint's machine gate).
No separate T2 is needed: the surface is two deletions with no new
behavior, interface, or file to reconcile beyond what steps 4-6 already
confirm.
