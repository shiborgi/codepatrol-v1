# Specification — Close auto-resolves the backlog item its Change was linked against on commit

## Intent

- Origin: improve-codebase
- Mode: bug
- Target baseline: `main` @ `9439c40` (branch `codepatrol/2026-07-26-close-resolves-backlog`), clean tree
- Governing constraints: `AGENTS.md` (backlog at `.codepatrol/backlog/items.yaml` is the sanctioned exception; Close is "the only normal terminal mutation" per `_shared/CHANGE.md`); no ADR exists in this repo
- Substrate state: graph not consulted — this is a bounded addition to an already-read function (`closeChangeLocked`), no symbol-level design decision depends on it
- Improvement signals (from `.codepatrol/docs/improvement-reports/2026-07-26-backlog-resolve.md`, most recent by mtime): `change.session` invocation count (14) — generic Change-lifecycle telemetry, not actionable for this Change's scope, noted per protocol and not acted on here.
- Problem: `change start --backlogItemId <id>` calls `linkBacklogItem`, setting that backlog item's `status` to `"scheduled"` and `workId` to the new Change's id (`orchestrator.ts:187`). `closeChangeLocked` (`orchestrator.ts:347-420`) writes the improvement report and upserts new backlog *candidates* from it (`orchestrator.ts:410-414`), but never looks up or resolves the item the Change was itself started against. A Change that links via `--backlogItemId` and successfully commits leaves that item `scheduled` forever — confirmed live: `.codepatrol/backlog/items.yaml`'s `top-error-code-change-conflict-...` item still has `workId: 2026-07-25-session-input-validation, status: scheduled` after that Change committed at `main`@`08d490a` (now several commits behind `main`@`9439c40`). Filed as backlog item `close-does-not-auto-resolve-...` during the prior Change's Plan (`2026-07-26-backlog-resolve`), which shipped the manual `backlog resolve` command as the interim fix but explicitly deferred this automatic case (its spec's DC-2).
- Outcome: when a Change started with `--backlogItemId` reaches Close with outcome `"commit"`, the linked backlog item (if still `"scheduled"` and its `workId` still equals this Change's id) is automatically transitioned to `"done"` via the now-available `resolveBacklogItem` (shipped in `2026-07-26-backlog-resolve`), committed in the same terminal commit as the receipt/report — no manual `backlog resolve` call needed for the common case. Rollback explicitly does not touch the item's status (the work was not actually done).

## Scope

### In scope

- In `closeChangeLocked`'s normal (non-already-terminal) Close path, after the existing improvement-report/upsert block and before the final `pathsToCommit`/commit, add a best-effort step: when `outcome === "committed"`, find backlog items where `item.workId === workId && item.status === "scheduled"` and call `resolveBacklogItem(workspace, item.id, "done", now(options))` for each, wrapped in the same per-item try/catch-and-stderr pattern already used for the neighboring `upsertBacklogItem` loop (`orchestrator.ts:412-413`) so a resolution failure never blocks Close.
- Regression tests in `src/change/backlog-close-integration.test.ts` (the existing close+backlog integration suite) covering: auto-resolve on commit; no touch on rollback; isolation from unrelated `workId`s; non-blocking behavior when the item was already manually resolved before Close ran.

### Out of scope

- Any change to `resolveBacklogItem`, `linkBacklogItem`, or the `backlog resolve` CLI command themselves — all shipped and tested in `2026-07-26-backlog-resolve`, reused here unmodified.
- Rollback-side backlog handling (e.g., reverting a `scheduled` item back to `candidate` on rollback) — zero evidence justifies a design here: `git tag -l 'codepatrol/*'` shows 21 `committed` tags and 0 `rolled-back` tags across this repo's entire history; explicit non-goal, proven by a regression test rather than silently doing nothing.
- Retroactively fixing already-stale items from Changes that closed before this fix ships (e.g., the `top-error-code-change-conflict-...` item cited above) — this Change only affects future Close calls; the existing stale item is resolved separately via the already-shipped `backlog resolve` CLI command, outside this Change's lifecycle (data-only, sanctioned exception per `AGENTS.md`).
- Any other open backlog item (N2 test coverage gaps, N3 orchestrator decomposition, command-invocation-count items) — independent, unrelated files.

## Current evidence

- `src/change/orchestrator.ts:174-189` (`startChangeLocked`) — confirms `input.backlogItemId` is the only path that ever sets a backlog item's `workId`, always paired with `status: "scheduled"` via `linkBacklogItem` (`orchestrator.ts:187`). No other writer sets `workId`.
- `src/change/orchestrator.ts:347-420` (`closeChangeLocked`), read in full — the normal (non-already-terminal) path: writes the improvement report (`404-406`), generates recommendations and upserts new *candidate* items from them (`409-414`), computes `pathsToCommit` including the backlog file if it exists (`416-418`), commits and tags (`419`). No lookup of `item.workId === workId` anywhere in the function.
- `src/change/backlog.ts:162-173` (`linkBacklogItem`) and the new `resolveBacklogItem` (shipped in `2026-07-26-close-resolves-backlog`'s immediate predecessor, `2026-07-26-backlog-resolve`, `main`@`9439c40`) — `resolveBacklogItem(workspace, itemId, "done"|"dismissed", now?)` is the exact function this Change needs to call; already validated (not-found → `CHANGE_INVALID`, already-terminal → `CHANGE_CONFLICT`) and already tested.
- `git tag -l 'codepatrol/*' | sort` — 21 `codepatrol/committed/*` tags, 0 `codepatrol/rolled-back/*` tags in this repo's entire lifecycle-managed history, confirmed by direct command run during this Plan. Grounds the "rollback out of scope, zero evidence" decision rather than asserting it from intuition.
- `.codepatrol/backlog/items.yaml` (read live during this Plan, via `change start --backlogItemId` just performed) — the backlog item this very Change is linked against (`close-does-not-auto-resolve-the-backlog-item-...`) is now itself `status: scheduled, workId: 2026-07-26-close-resolves-backlog` — this Change's own Close will be the first real-world test of the fix it implements, beyond the unit/integration tests.
- `src/change/backlog-close-integration.test.ts` (read in full) — the existing close+backlog integration test file, using `advanceThroughVerify` (from `git.test-helper.ts`) to drive a Change through Plan→Review→Apply→Verify, then manual `begin`/`usage`/`closeChange` calls to reach Close; establishes the exact test shape this Change's new tests extend, in the same file (no new test file needed).
- `src/change/git.test-helper.ts:11` (`advanceThroughVerify`) — calls `startChange` without a `backlogItemId` parameter; this Change's tests link a backlog item independently via direct `upsertBacklogItem`/`linkBacklogItem` calls before invoking `advanceThroughVerify`, rather than modifying the shared helper (smaller blast radius — the helper is shared by other test files not touched by this Change).

## Proposed design

Add one best-effort resolution step to `closeChangeLocked`'s normal Close
path, placed immediately after the existing improvement-report/upsert
`try`/`catch` block (`orchestrator.ts:404-415`) and before the
`pathsToCommit` computation (`orchestrator.ts:416`):

```typescript
if (outcome === "committed") {
	try {
		const linked = readBacklog(workspace).items.filter((item) => item.workId === workId && item.status === "scheduled");
		for (const item of linked) {
			try { resolveBacklogItem(workspace, item.id, "done", now(options)); }
			catch (cause) { process.stderr.write(`[close] backlog resolve failed for "${item.id}": ${(cause as Error).message}\n`); }
		}
	} catch (cause) { process.stderr.write(`[close] backlog resolution lookup failed: ${(cause as Error).message}\n`); }
}
```

`readBacklog` and `resolveBacklogItem` are added to the existing
`./backlog.js` import (`orchestrator.ts:12`, currently `{ upsertBacklogItem,
findBacklogItem, linkBacklogItem, backlogPath }`). No other file changes.

Root cause and why this fixes it: `startChangeLocked` already durably links a
Change to a backlog item (`workId` on the item, one-directional — the
`ChangeRecordV2`/`ChangeIdentity` itself carries no reciprocal field, and
none is needed since the backlog file is the single source of truth for that
link). `closeChangeLocked` only ever *adds* new candidates from telemetry; it
never closes the loop on the item that motivated the Change in the first
place. Looking the item up by `workId === workId` at the exact point Close
already computes its terminal outcome — using the already-shipped, already-
tested `resolveBacklogItem` — closes that loop with the smallest possible
addition, reusing every piece of infrastructure this needs.

## Alternatives

- **Resolve in `startChangeLocked` speculatively / resolve "optimistically" as soon as Apply implements**: rejected — resolving before the work is verified and committed would be wrong (Verify or Close could still return/rollback); Close's `outcome === "committed"` check is the only point where "the work genuinely landed" is true.
- **Store the `backlogItemId` on `ChangeIdentity` and use that instead of a `workId === workId` backlog scan**: rejected — the backlog file is already the single source of truth for the link (`item.workId`); adding a reciprocal field to `ChangeIdentity` would introduce two places that could drift out of sync for zero behavioral gain, and `readBacklog(workspace).items.filter(...)` is already O(items) which is small (single-digit to low-double-digit items in this repo's actual data).
- **Revert a `scheduled` item to `candidate` on rollback**: rejected for this Change — zero evidence (0 rollbacks in this repo's history) justifies designing that behavior now; explicitly filed as a non-goal with a regression test proving current (no-op) behavior is preserved, not silently changed.

## Simplicity decision

- Selected rung: local reuse
- Earlier rungs: no runtime/stdlib or platform primitive applies (domain-specific lifecycle logic); an installed dependency is disproportionate; "local reuse" is reachable and sufficient — `resolveBacklogItem` and `readBacklog` already exist, tested, and are one import away.
- Irreducible complexity: Close must be the trigger point (the only place "genuinely committed" is known), and the resolution must be best-effort (mirroring the existing `upsertBacklogItem` loop's defensive shape) so a backlog-layer failure can never block a Close that has already produced a valid receipt/tag — this constraint is inherited from `AGENTS.md`'s "Close is the only normal terminal mutation" contract, not invented here.
- Safety floor: rollback is explicitly untouched (proven by regression test, not just omitted); an item already resolved by another path (e.g. manual `backlog resolve`) is silently skipped by the `status === "scheduled"` filter, never double-resolved or errored.
- Expected surface delta: `src/change/orchestrator.ts` (+1 import edit, +~8 lines in `closeChangeLocked`); test additions in `src/change/backlog-close-integration.test.ts` (~4 new test cases, no new test file). No new files, no new dependency, no public interface change (this is purely a Close side effect, same category as the existing improvement-report generation).

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | Rollback never touches the linked backlog item's status | If rollbacks become common, a `scheduled` item pointing at a rolled-back (abandoned) Change would sit stale exactly like the bug this Change fixes for commit, just for a different outcome | A user or process observes a rolled-back Change's linked backlog item still `scheduled` and wants it reverted to `candidate` for re-pickup | Extend the same `outcome === "committed"` conditional with an `outcome === "rolled-back"` branch that instead reverts `status` to `"candidate"` (would need a small `backlog.ts` addition, since `resolveBacklogItem` only accepts `"done"`/`"dismissed"` by design) |
| DC-2 | Already-stale items from Changes that closed before this fix ships are not retroactively resolved | Every Change closed before this ships (21 to date) with a linked item stays stale unless resolved manually | A user notices a pre-existing stale linked item (as happened with `top-error-code-change-conflict-...`) | Run `backlog resolve --id <item-id> --status done` manually per stale item — already sufficient, no code needed; not a code migration |

## Compatibility and rollout

- No migration: this only adds a side effect to an already-existing, already-optional path (`--backlogItemId` is optional on `change start`; Changes that never link an item are completely unaffected — the `filter` finds nothing and the loop body never executes).
- No config change, no schema version bump.
- Rollback: revert the single commit; Close reverts to never auto-resolving (status quo ante — the manual `backlog resolve` command from the prior Change remains available regardless).
- Observability: a resolved item's new status is visible the same way `backlog resolve`'s output already is (via `backlog list --status done` and the Kanban's Backlog column); a resolution failure (best-effort path) writes to stderr with the same `[close] ...` prefix convention already used by the neighboring improvement-report/upsert failure paths, so it is discoverable the same way those already are.

## Risks and mitigations

- Risk: a bug in the filter or resolution call could silently resolve the wrong item or throw during Close, breaking an otherwise-successful terminal operation. Mitigation: the filter is exact-match on `workId` (the same field `linkBacklogItem` already sets, no new derivation logic) and `status === "scheduled"` (excludes anything already terminal); the outer `try`/`catch` (mirroring the established `upsertBacklogItem` pattern at `orchestrator.ts:404,412-413`) guarantees a resolution failure can never prevent the receipt/tag/commit that already exist by that point in the function from being finalized.
- Risk: double-resolving an item that was already manually resolved via `backlog resolve` before Close ran. Mitigation: the `status === "scheduled"` filter excludes it (already `"done"`/`"dismissed"`), so the loop body never calls `resolveBacklogItem` on it — no `CHANGE_CONFLICT` is ever thrown for this case, proven by a regression test (AC-4) rather than assumed.

## Acceptance criteria

- AC-1: Given a Change started with `change start --backlogItemId <item-id>` (linking the item to `scheduled`), when its Close runs with `outcome: "commit"`, then the linked backlog item's `status` becomes `"done"` and this change is present in the same terminal commit (`git show --name-only <terminalCommit>` includes `.codepatrol/backlog/items.yaml`).
- AC-2: Given the same setup, when Close runs with `outcome: "rollback"` instead, then the linked backlog item's `status` remains `"scheduled"` — unchanged, proven by reading the backlog after `closeChange` returns.
- AC-3: Given a Change with no backlog item linked to its `workId` (or items linked to a *different* `workId`), when its Close commits, then no backlog item's `status` changes as a result of this feature (existing improvement-report-driven candidate upserts, if any, are unaffected and out of this AC's assertion scope).
- AC-4: Given a backlog item linked to this Change's `workId` that was already manually resolved (`status: "done"` or `"dismissed"`) via `backlog resolve` before Close runs, when Close commits, then `closeChange` still succeeds (returns normally, produces its receipt/tag/commit) and does not throw — the already-terminal item is left untouched, not re-resolved or errored.

## Decisions and open questions

- Decision: trigger is `outcome === "committed"` only; rollback is an explicit non-goal (DC-1), not silently unhandled — see Alternatives and Risks.
- Decision: no schema change to `ChangeIdentity`/`ChangeRecordV2` — the backlog file's existing `workId` field is the single source of truth for the link, reused as-is — see Alternatives.
- Decision: retroactive resolution of pre-existing stale items is out of scope, handled via the already-shipped manual command (DC-2) — see Scope and Deferred constraints.
- No open questions remain that could change scope, interfaces, or acceptance.
