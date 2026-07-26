# Plan evidence — Close never resolves its linked backlog item

Verified by direct file reads and commands run during this Plan attempt. All
paths relative to repo root, checked against `main` @ `9439c40`.

## The gap, confirmed live

- `.codepatrol/backlog/items.yaml` — item `top-error-code-change-conflict-...`
  has `workId: 2026-07-25-session-input-validation, status: scheduled`. That
  Change committed at `main`@`08d490a` (now behind `main`@`9439c40` by
  several commits) — the item has been stale since. This is the exact
  reproduction this Change fixes going forward.
- `src/change/orchestrator.ts:174-189` (`startChangeLocked`) — `input.backlogItemId`
  is the only path that ever sets a backlog item's `workId`; always paired
  with `status: "scheduled"` via `linkBacklogItem` (`orchestrator.ts:187`).
- `src/change/orchestrator.ts:347-420` (`closeChangeLocked`), read in full —
  writes the improvement report and upserts new *candidate* items
  (`404-415`), but no `item.workId === workId` lookup anywhere in the
  function — confirmed by reading every line, not by grep alone.

## Rollback evidence (grounds DC-1)

```
$ git tag -l "codepatrol/*" | sort
```
21 `codepatrol/committed/*` tags, 0 `codepatrol/rolled-back/*` tags — run
directly during this Plan. Grounds the decision that rollback-side backlog
handling is out of scope for lack of any real-world case to design against,
rather than an assumption.

## Reused infrastructure confirmed by reading

- `src/change/backlog.ts` (shipped in the immediately-preceding Change,
  `2026-07-26-backlog-resolve`, `main`@`9439c40`) — `resolveBacklogItem`
  already validates not-found (`CHANGE_INVALID`) and already-terminal
  (`CHANGE_CONFLICT`); `readBacklog` already exists and is used elsewhere in
  `orchestrator.ts` only indirectly (via `backlogPath`'s `existsSync` check,
  not `readBacklog` itself — confirmed `readBacklog` is not yet imported in
  `orchestrator.ts`, so this Change adds it to the existing `./backlog.js`
  import line rather than introducing a new import statement).
- `src/change/orchestrator.ts:404-415` — the exact per-item
  try/catch-and-`process.stderr.write` shape already proven for
  `upsertBacklogItem` in the improvement-report loop; this Change's
  resolution step mirrors it line-for-line in structure.
- `src/change/backlog-close-integration.test.ts` (read in full) — exact test
  harness (`git()`, `at()`, `readItems`/`readBacklog`, `advanceThroughVerify`,
  manual `begin`/`usage`/`closeChange` sequence) this Change's four new tests
  extend in place, no new test file.
- `src/change/git.test-helper.ts:11` (`advanceThroughVerify`) — confirmed it
  does not accept a `backlogItemId` parameter; this Change's tests link the
  backlog item independently via direct `upsertBacklogItem`/`linkBacklogItem`
  calls before invoking the helper, avoiding a change to a helper shared by
  other test files (`close-integration.test.ts`, `close-push.test.ts`,
  `change.test.ts`, `git.test.ts` all import it).

## Dogfooding note

This Change was itself started via `change start --backlogItemId
close-does-not-auto-resolve-the-backlog-item-it-was-started-against-...`
(the exact backlog item this Plan's spec cites as motivation). Its own future
Close will be a live, real-world exercise of the fix it implements — beyond
the unit/integration tests, recorded as an informational note in `plan.md`
T2 step 8, not a substitute for the test suite.

## Precedent for scope discipline

Both of this session's immediately-preceding Changes
(`2026-07-25-session-input-validation`, `2026-07-26-backlog-resolve`) filed
materially-larger or zero-evidence ideas as separate backlog follow-ups
rather than bundling them. This Change continues that discipline: DC-1
(rollback handling, zero evidence) and DC-2 (retroactive migration, already
solved by the shipped manual command) are both explicitly deferred rather
than absorbed into this Change's scope.
