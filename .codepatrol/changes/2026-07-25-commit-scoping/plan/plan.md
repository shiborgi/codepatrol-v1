# Plan — Scope every lifecycle bookkeeping commit to its own intended paths

- Work id: `2026-07-25-commit-scoping`
- Governing spec: `spec.md`
- Target baseline: `main` @ `bcaa3c2bc5055cd5daa70f54210197adcc130f6b`; clean worktree; graph synced (70 files, 1814 symbols).

## Goal and approach

Close the gap between "what a lifecycle commit's preceding `git.add()` staged" and "what actually ends up in that commit" by giving `NodeGitAdapter.commit()` an optional pathspec (T1), then passing each of the 4 existing call sites' already-locally-known intended paths to it (T2), proving the fix with a regression test that reproduces the real incident class (T3), then verifying (T4).

## Global constraints

- No behavior change when nothing unexpected is staged — every existing passing test must stay green with byte-identical commit contents.
- The checkpoint commit's existing pre/post-commit validation (`orchestrator.ts:264-270`, `:291-292`) is preserved unmodified; this Change adds pathspec-restriction as an additional layer, not a replacement.
- `AGENTS.md`'s "preserve unrelated user changes" directive governs the fix choice: pathspec-restriction (non-destructive) over `git reset` (destructive) at every site.
- No new dependency, no lifecycle/event-schema/checkpoint change, no config change.
- Gate: `npm run typecheck && npm test && npm run build && npm run smoke:cli && npm run lint:skills` (i.e. `npm run verify`).

## Simplicity proof

- Selected rung: direct local change — one optional interface parameter, reused at 4 existing call sites, each already computing the exact path array it needs for its preceding `git.add()`.
- Reused capabilities: `git.ts`'s own `["<verb>", "--", ...paths]` convention, already used by `add()`/`unstage()` in the same file; the existing `git.test.ts` helper shape (`run()`, `startChange`, `transitionChange`, `at()`) for the new regression test.
- Forbidden speculative surface: no per-call-site pre-check guards (rejected alternative); no `git reset`-based approach (rejected, destructive); no lint rule or mandatory-parameter enforcement for hypothetical future call sites (residual risk, explicitly deferred, not solved here).
- Expected surface delta: modify `src/change/git.ts`, `src/change/orchestrator.ts`, `src/change/git.test.ts`. No new files, no new dependencies, no config change.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 (`commit()` accepts optional pathspec; unchanged when omitted) | T1 | `node --test --import jiti/register src/change/git.test.ts` (existing tests, byte-identical behavior) |
| AC-2 (unrelated staged file excluded from `commitMetadata`-routed commit, remains staged) | T2, T3 | new regression test in `git.test.ts` |
| AC-3 (receipt + terminal commit exclude unrelated staged content) | T2, T3 | companion assertions reusing Close-lifecycle fixtures |
| AC-4 (checkpoint commit passes its own paths; existing validation untouched) | T2 | full checkpoint test suite (`change.test.ts`, `apply-gate*.test.ts`, `close-integration.test.ts`, `orchestrator-parallel.test.ts`) |
| AC-5 (`npm run verify` exit 0) | T4 | `applyGate` |

## Dependency order

`T1 → T2` (T2's call sites need T1's interface change to exist first). `T3` depends on `T2` (the regression test exercises the fixed behavior). `T4` depends on `T1, T2, T3`.

### T1 — `GitAdapter.commit()` gains an optional pathspec

**Purpose:** Satisfies AC-1; foundation for T2.

**Depends on:** None

**Files:**

- Modify: `src/change/git.ts` (interface `:18`; `NodeGitAdapter.commit()` `:77-80`)

**Interfaces:**

- `GitAdapter.commit(message: string, allowEmpty?: boolean, signal?: AbortSignal, paths?: string[]): Promise<string>` (was: no 4th parameter).

**Simplicity proof:** Mirrors the existing `add()`/`unstage()` pathspec pattern in the same file; purely additive to the args array.

**Steps:**

1. Edit the `GitAdapter` interface (`:18`): `commit(message: string, allowEmpty?: boolean, signal?: AbortSignal, paths?: string[]): Promise<string>;`
2. Edit `NodeGitAdapter.commit()` (`:77-80`): change the signature to `async commit(message: string, allowEmpty = false, signal?: AbortSignal, paths?: string[]): Promise<string>` and the git-args array from `["-c", "user.name=Codepatrol", "-c", "user.email=codepatrol@local", "commit", ...(allowEmpty ? ["--allow-empty"] : []), "-m", message]` to the same array with `, ...(paths?.length ? ["--", ...paths] : [])` appended.
3. Run `npm run typecheck`. Expected clean (the new parameter is optional; no existing call site or override breaks).
4. Run `node --test --import jiti/register src/change/git.test.ts`. Expected green (no behavior change yet — no call site passes `paths` until T2).

**Task result:** append to `apply/journal.md`.

### T2 — Pass each call site's already-known paths to `commit()`

**Purpose:** Satisfies AC-2 (partially, mechanism), AC-3, AC-4.

**Depends on:** T1

**Files:**

- Modify: `src/change/orchestrator.ts` (`commitMetadata` `:95-98`; checkpoint commit `:289-290`; Close receipt commit `:400`; Close terminal commit `:418`)

**Simplicity proof:** Zero new path computation — each site already builds or has in scope the exact array its preceding `git.add()` call uses; this task only threads that existing local through to the adjacent `git.commit()` call.

**Steps:**

1. `commitMetadata` (`:95-98`): change `await git.add(paths, signal); return git.commit(message, false, signal);` to `await git.add(paths, signal); return git.commit(message, false, signal, paths);`.
2. Checkpoint commit (`:289-290`): capture the array currently passed inline to `git.add(...)` into a named local first — `const committedPaths = [...new Set([...paths, ...intent.artifacts.map((item) => item.path)])];` — then `await git.add(committedPaths, options.signal);` and `const checkpoint = await git.commit(<same message expression>, true, options.signal, committedPaths);`.
3. Close receipt commit (`:400`): change `await git.add([receiptPath], options.signal); const receiptCommit = await git.commit(\`chore(codepatrol): ${outcome} receipt ${workId}\`, false, options.signal);` to pass `[receiptPath]` as the 4th argument to `git.commit(...)`.
4. Close terminal commit (`:418`): change `await git.add(pathsToCommit, options.signal); const terminalCommit = await git.commit(\`chore(codepatrol): ${outcome} ${workId}\`, false, options.signal);` to pass `pathsToCommit` as the 4th argument to `git.commit(...)`.
5. Run `npm run typecheck`. Expected clean.
6. Run the full existing suite touching these paths: `node --test --import jiti/register src/change/{change,git,close-integration,close-push,backlog-close-integration,orchestrator-parallel,apply-gate-enforcement,apply-gate,start-backlog-link}.test.ts`. Expected green — no behavior change for any currently-passing scenario (none stages unrelated content before a transition).

**Task result:** append to `apply/journal.md`.

### T3 — Regression test reproducing the incident class

**Purpose:** Satisfies AC-2, AC-3 with red-capable, falsifiable evidence — not just "the fix looks right."

**Depends on:** T2

**Files:**

- Modify: `src/change/git.test.ts` (new test, placed near the existing `"repeating an interrupted transition commits the pending event exactly once"` test at `:185-194`, reusing its helpers)

**Steps:**

1. Add a test `"an unrelated file staged outside Codepatrol is never swept into a lifecycle bookkeeping commit"`: initialize a workspace exactly like the adjacent recovery test (`initialize()`/`run()` helpers), `startChange`, then directly `run(workspace, ["add", ...])` an unrelated newly-created file (bypassing any Codepatrol command — reproducing the incident's `git rm`-before-transition shape, generalized to any stray staged content), then call `transitionChange(workspace, id, { type: "usage", ... }, at(n))`. Assert: (a) `run(workspace, ["show", "--name-only", "--format=", "HEAD"])` does **not** include the unrelated file; (b) `run(workspace, ["status", "--porcelain"])` still reports the unrelated file as staged (e.g. matches `/^A\s+unrelated\.txt$/m` or equivalent porcelain form); (c) the transition itself still succeeds and records the intended event.
2. Run the new test alone. Expected **red** against the pre-T1/T2 code shape if run in isolation on a stash of the baseline — but since T1/T2 already landed by this point in sequence, confirm it is red-capable by temporarily reverting T2's `commitMetadata` call-site change locally, re-running, observing the unrelated file wrongly appear in `git show --name-only HEAD`, then restoring T2's change. Record this red/restore cycle in the journal as the red evidence (the same "expected red, verified by temporary reversion" pattern is unnecessary if T3 is written and run before T2 lands — prefer sequencing T3's test-writing before T2's fix within the same task session if practical, matching standard test-first practice; either ordering is acceptable as long as red evidence is captured).
3. Add a companion assertion inside the existing Close-lifecycle test(s) (`close-integration.test.ts` or `close-push.test.ts`) that stages an unrelated file immediately before a `closeChange` call and asserts it is excluded from both the receipt commit and the terminal commit's `git show --name-only`, and remains staged afterward.
4. Run `node --test --import jiti/register src/change/git.test.ts src/change/close-integration.test.ts src/change/close-push.test.ts`. Expected green.

**Task result:** append to `apply/journal.md`.

### T4 — Final verification and reconciliation

**Purpose:** Confirms AC-5 and whole-Change integrity.

**Depends on:** T1, T2, T3

**Files:**

- Modify: none (verification only)

**Steps:**

1. Map delivered paths back to AC-1…AC-5; confirm each passed.
2. Run the full gate: `npm run verify`. Expected exit 0 (also enforced at Apply `implemented` by `.codepatrol/config.json` `applyGate`).
3. `git diff --stat bcaa3c2` — inspect for undeclared work; confirm exactly `src/change/git.ts`, `src/change/orchestrator.ts`, `src/change/git.test.ts` (plus any companion Close-lifecycle test file touched in T3) changed.
4. Reconcile actual surface delta with the spec forecast; explain any difference in the journal.
5. Record whether `DC-1` triggered (expected: no — the other 3 backlog items stay untouched).
6. `codepatrol graph sync`.
7. State rollback (revert the branch; no migration, purely additive/hardening) and the residual risk (a future call site added without passing `paths` degrades to today's status quo, not a regression — noted in `spec.md`'s Risks).

**Task result:** append the final reconciliation to `apply/journal.md`.
