# Specification — Add a CLI command to mark a backlog item done/dismissed directly

## Intent

- Origin: improve-codebase
- Mode: feature
- Target baseline: `main` @ `f51ced8` (branch `codepatrol/2026-07-26-backlog-resolve`), clean tree
- Governing constraints: `AGENTS.md` (backlog at `.codepatrol/backlog/items.yaml` is the sanctioned exception to "no root progress file / mutable status mirror"); no ADR exists in this repo (`.codepatrol/adr/` absent by design)
- Substrate state: graph not consulted — this is a bounded CLI/data-layer addition to an existing module (`src/change/backlog.ts`), no symbol-level design decision depends on it
- Improvement signals (from `.codepatrol/docs/improvement-reports/2026-07-25-session-input-validation.md`, most recent by mtime): top error code `INVALID_ARGUMENT` (1 occurrence) and `change.transition` invocation count (17) — neither is directly actionable for this Change's scope (both are generic Change-lifecycle telemetry, not backlog-specific); noted per protocol, not acted on here.
- Problem: `BacklogStatus` is `"candidate" | "scheduled" | "done" | "dismissed"` (`src/change/backlog.ts:9`), and both `session.ts`-adjacent code (`issue-sync.ts:130`) and the lifecycle guard (`linkBacklogItem`, `backlog.ts:168`) already branch on `status === "done" || status === "dismissed"` — but no function anywhere in the codebase ever writes those two values. `upsertBacklogItem` always creates `status: "candidate"` (`backlog.ts:155`); `linkBacklogItem` only ever writes `"scheduled"` (`backlog.ts:169`). Confirmed by grep: zero writers set `done`/`dismissed`. The only way to resolve a backlog item today is a hand-edit of `.codepatrol/backlog/items.yaml` — which is exactly what this session did minutes ago to resolve the `unsafe-duplicate-yaml-reader` item after fixing it via an unrelated Change (`2026-07-25-remove-duplicate-reader`) that never linked to it via `--backlogItemId`.
- Outcome: `codepatrol backlog resolve --id <item-id> --status done|dismissed` transitions a `candidate` or `scheduled` backlog item to the requested terminal status, persists it, and requires no hand-edit of the YAML file. The existing, already-tested `issues sync --direction push` pipeline (`issue-sync.ts:129-137`) picks up the new terminal status on its next run and closes the linked GitHub issue with no code change required there — proven by a regression test in this Change, not by re-implementing sync logic.

## Scope

### In scope

- `resolveBacklogItem(workspace, itemId, status, now?)` in `src/change/backlog.ts`: validates `itemId` exists and is not already terminal, sets `status` to `"done"` or `"dismissed"`, updates `lastSeenAt`, persists via the existing `writeBacklog`.
- CLI command `codepatrol backlog resolve --id <item-id> --status done|dismissed` in `src/cli/commands.ts` (`case "backlog.resolve":`), validating `--status` at the CLI boundary before calling into `resolveBacklogItem` (mirrors the two-layer validation shape already used for every other backlog/session command in this file).
- Registering `backlog.resolve` in `src/cli/args.ts`'s `COMMAND_OPTIONS` (reusing the already-known `id`/`status` flag names — no new flag) and updating the CLI help text in `src/cli/output.ts`.
- Regression test proving the existing `issues sync --direction push` pipeline closes the corresponding GitHub issue for a resolved item with an `externalRef`, with zero changes to `issue-sync.ts`.

### Out of scope

- Automatically resolving the backlog item a Change was started against (`--backlogItemId`) when that Change's Close commits — a materially different, larger scope touching `closeChangeLocked` (already flagged as dense by backlog item N3); filed as a separate backlog follow-up (`close-does-not-auto-resolve-the-backlog-item-it-was-started-against-...`, `plan-followup`, this Change's work id) rather than bundled here.
- Any GitHub-side mutation from this Change directly (e.g. calling `gh` to close an issue inline) — the existing `issues sync` pipeline already owns that responsibility and is proven, not re-implemented, by this Change's regression test.
- A `reason`/audit-trail field on resolution — the existing `evidence` array on the item already carries context; no new schema field is justified by current evidence.
- Any other open backlog item (N1 dead error codes, N2 test coverage gaps, N3 orchestrator decomposition, command-invocation-count items) — independent, unrelated files.

## Current evidence

- `src/change/backlog.ts:9` — `export type BacklogStatus = "candidate" | "scheduled" | "done" | "dismissed";`
- `src/change/backlog.ts:139-160` (`upsertBacklogItem`) — only ever constructs `status: "candidate"` for a new item.
- `src/change/backlog.ts:162-173` (`linkBacklogItem`) — only ever writes `status: "scheduled"`; guards `if (existing.status === "done" || existing.status === "dismissed") throw CodepatrolError("CHANGE_CONFLICT", ...)` — the exact guard shape this Change's `resolveBacklogItem` reuses for re-resolution attempts.
- `src/change/issue-sync.ts:129-137` — already reads `item.status === "done" || item.status === "dismissed"` and, if the item has an `externalRef`, closes the matching open GitHub issue on the next `push`/`both` sync — this logic is unreachable today because nothing ever sets those statuses, confirmed by grep (`grep -rn '"done"' src/change/*.ts` shows only type/comparison sites, never an assignment).
- `grep -rn 'status: "done"\|status: "dismissed"\|status = "done"\|status = "dismissed"' src/` (excluding test files) returns zero matches — confirms no writer exists anywhere in the codebase.
- `src/change/orchestrator.ts:347-420` (`closeChangeLocked`) — writes the improvement report and upserts new backlog candidates from it, but never looks up or mutates the backlog item the Change itself was started against; confirmed by reading the full function body, no `item.workId === workId` lookup or `resolveBacklogItem`-shaped call exists. Live proof: `.codepatrol/backlog/items.yaml` item `top-error-code-change-conflict-...` still has `workId: 2026-07-25-session-input-validation, status: scheduled` after that Change committed (`main`@`08d490a`) — filed as the out-of-scope follow-up above.
- `src/cli/commands.ts:180-198` — `backlog.add`/`backlog.list` cases show the established two-layer validation shape (CLI-boundary `INVALID_ARGUMENT` check, then the underlying `backlog.ts` function's own `CHANGE_INVALID`/`CHANGE_CONFLICT` check) that `backlog.resolve` follows.
- `src/cli/args.ts:41-60` (`COMMAND_OPTIONS`) — `id` and `status` are both already-registered flag names (used by `change.inspect`/`change.transition`/etc. and `backlog.list` respectively); adding `["backlog.resolve", new Set(["id", "status"])]` requires no new flag parsing, only a new map entry.
- `src/change/backlog.test.ts:78-90` (`linkBacklogItem sets workId and status, throws on missing or dismissed`) — establishes the exact test shape (`upsertBacklogItem` to seed, assert on missing id, assert on already-terminal status) this Change's `resolveBacklogItem` test mirrors.
- Direct precedent for this exact gap: this session hand-edited `.codepatrol/backlog/items.yaml` (commit `b33e27b`, `2026-07-26T02:00Z`ish, prior to this Change) to mark `unsafe-duplicate-yaml-reader-in-improvement-report-ts-bypasses-migraterecord-normalization` `done` after confirming via `grep` that `2026-07-25-remove-duplicate-reader` had already fixed it — the exact manual workaround this Change's CLI command replaces.

## Proposed design

Add one pure data function and one thin CLI case, both following patterns already established in the same two files for the sibling `linkBacklogItem`/`backlog.add` operations:

1. `src/change/backlog.ts`: add `resolveBacklogItem(workspace: string, itemId: string, status: "done" | "dismissed", now: Date = new Date()): BacklogItem`. Validates `itemId` is a non-empty string, looks it up via the existing item list, throws `CodepatrolError("CHANGE_INVALID", ..., 4)` if not found (mirrors `linkBacklogItem`'s not-found message shape), throws `CodepatrolError("CHANGE_CONFLICT", \`Backlog item ${itemId} is already ${existing.status}.\`, 4)` if `existing.status` is already `"done"` or `"dismissed"` (mirrors `linkBacklogItem`'s terminal guard exactly). Otherwise returns a copy with `status` set to the requested value and `lastSeenAt` refreshed, and persists via the existing `writeBacklog`.
2. `src/cli/commands.ts`: add `case "backlog.resolve":` reading `--id` via the existing `requireValue` and `--status` directly from `args.status`; validates `args.status` is `"done"` or `"dismissed"` with `CodepatrolError("INVALID_ARGUMENT", ..., 2)` naming the received value before calling `resolveBacklogItem`; returns `{ data: { id: item.id, status: item.status }, text: \`${item.id} -> ${item.status}\` }`.
3. `src/cli/args.ts`: add `["backlog.resolve", new Set(["id", "status"])]` to `COMMAND_OPTIONS`.
4. `src/cli/output.ts`: add `backlog resolve --id <item-id> --status done|dismissed` to the CLI help block, next to the existing `backlog add`/`backlog list` lines.

Root cause and why this fixes it: the schema and every *consumer* of `done`/`dismissed` (the terminal-state guards, the issue-sync close-on-resolve logic) already exist and are already tested — only the *producer* is missing. Adding the producer at the same architectural layer and with the same validation shape as its sibling `linkBacklogItem`/`upsertBacklogItem` functions is the minimal change that makes the existing schema reachable, with no changes needed to `issue-sync.ts` (proven by a regression test rather than assumed).

## Alternatives

- **Auto-resolve on Close instead of a manual command**: rejected for *this* Change — real and valuable (filed as a follow-up), but a materially larger, different-shaped change (touches `closeChangeLocked`, needs its own evidence-gathering on trigger conditions — commit-only? what about items not linked via `--backlogItemId`, like `unsafe-duplicate-yaml-reader` which this session just fixed by hand?). A manual command is needed regardless of whether auto-resolve ships later, since not every resolution traces to a linked Change's Close.
- **Extend `backlog add`'s upsert semantics to accept a `status` override**: rejected — `upsertBacklogItem`'s contract is "create or bump an existing candidate's count/priority"; overloading it to also terminally resolve an item conflates two different operations (idempotent telemetry ingestion vs. one-time manual resolution) and would make the existing dedup-and-bump logic harder to reason about for no simplicity gain.
- **A generic `backlog set-status` accepting all four `BacklogStatus` values**: rejected — `candidate`/`scheduled` are already reachable through `upsertBacklogItem`/`linkBacklogItem` with their own invariants (dedup-and-bump; require a `workId`); a generic setter would let a caller bypass those invariants (e.g. jump straight to `scheduled` without a real `workId`). Restricting the new command to the two genuinely-unreachable terminal values keeps every status's invariants intact.

## Simplicity decision

- Selected rung: local reuse
- Earlier rungs: no runtime/stdlib or platform primitive applies (this is domain-specific state); an installed dependency is disproportionate to a four-line status transition; "local reuse" is reachable and sufficient — the exact validation shape, error codes, and persistence call (`writeBacklog`) already exist in the same file for `linkBacklogItem`.
- Irreducible complexity: a terminal-status transition must reject an already-terminal item (idempotency/audit-trail integrity — resolving twice with different statuses must not silently overwrite) and must reject a missing item; this is inherent to any status-machine mutation and already accepted as necessary for `linkBacklogItem`.
- Safety floor: item identity, priority, area, evidence, source, and count are never touched by `resolveBacklogItem` — only `status` and `lastSeenAt` change, matching the minimal-mutation shape of `linkBacklogItem`.
- Expected surface delta: 1 new function in `src/change/backlog.ts` (~10 lines); 1 new CLI case in `src/cli/commands.ts` (~6 lines); 1 new map entry in `src/cli/args.ts` (1 line); 1 help-text line in `src/cli/output.ts`; new tests in `src/change/backlog.test.ts` and `src/cli/cli.test.ts`. No new files, no new dependency, no new CLI flag (reuses `id`/`status`).

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | `resolveBacklogItem` takes no `reason`/audit note — only `status` changes | A future need to record *why* an item was resolved (beyond its existing `evidence` array) is not served | A reviewer or user explicitly asks for a resolution audit trail distinct from `evidence` | Add an optional `reason` field to the function/CLI/schema, following the same additive-field pattern already used for `externalRef` |
| DC-2 | Close does not auto-resolve the linked backlog item (filed as separate backlog follow-up, out of scope here) | A Change that links via `--backlogItemId` and commits leaves that item `scheduled` until someone runs `backlog resolve` by hand | A user or process notices a committed Change's linked backlog item is still non-terminal (as happened with `2026-07-25-session-input-validation`) | Implement the filed follow-up: `closeChangeLocked` looks up backlog items where `item.workId === workId` and calls `resolveBacklogItem(..., "done")` on `outcome === "committed"` |

## Compatibility and rollout

- No migration: `BacklogStatus`'s `"done"`/`"dismissed"` values and every consumer of them already exist in the schema and in `issue-sync.ts`; this Change only adds a way to reach them. No schema version bump.
- No config change.
- Rollback: revert the single commit; `backlog resolve` disappears, hand-editing `items.yaml` remains the only path (status quo ante, not a regression from any in-flight state since nothing depends on the new command yet).
- Observability: `backlog resolve`'s result (`{ id, status }`) is visible the same way every other CLI command's output is today; the item's new status is visible via `backlog list --status done|dismissed` and the Kanban's Backlog column (`renderNext`, `output.ts:154-155`), both pre-existing and unmodified.

## Risks and mitigations

- Risk: a caller resolves the wrong item id (typo) and silently marks unrelated work done, suppressing a real backlog signal. Mitigation: `resolveBacklogItem` throws `CHANGE_INVALID` for any id that doesn't exist (no silent no-op on typo); this mitigation is inherent to the design, not an add-on, matching `linkBacklogItem`'s existing not-found behavior.
- Risk: resolving an item that has an open, linked GitHub issue could be surprising if the caller doesn't know `issues sync --direction push` will later close that issue automatically. Mitigation: this is existing, already-shipped, already-tested behavior in `issue-sync.ts` (not introduced by this Change); this Change's regression test makes that interaction explicit and verified rather than leaving it as an undocumented side effect discovered later.

## Acceptance criteria

- AC-1: Given a `candidate` or `scheduled` backlog item and `codepatrol backlog resolve --id <item-id> --status done`, when the command runs, then the item's `status` becomes `"done"`, `lastSeenAt` is refreshed, and the change is persisted to `.codepatrol/backlog/items.yaml` (readable via `backlog list --status done`).
- AC-2: Given the same setup with `--status dismissed`, when the command runs, then the item's `status` becomes `"dismissed"`, otherwise identical to AC-1.
- AC-3: Given `--status` missing, empty, or any value other than `done`/`dismissed`, when the command runs, then it exits `2` with `error.code === "INVALID_ARGUMENT"` naming the received value and the two accepted values.
- AC-4: Given `--id` referencing a backlog item that does not exist, when the command runs, then it exits `4` with `error.code === "CHANGE_INVALID"` naming the missing id.
- AC-5: Given `--id` referencing an item whose `status` is already `"done"` or `"dismissed"`, when the command runs, then it exits `4` with `error.code === "CHANGE_CONFLICT"` naming the item id and its current status — the item is not silently re-resolved or overwritten.
- AC-6: Given a backlog item with an `externalRef` to an open GitHub issue that has just been resolved via AC-1/AC-2, when `issues sync --direction push` subsequently runs (against a fake `GhAdapter` in the test, mirroring `issue-sync.test.ts`'s existing pattern), then the result's `pushed.closed` includes that issue's number — proving the existing sync pipeline requires zero changes to react to the new status.

## Decisions and open questions

- Decision: scope excludes auto-resolution on Close — filed as a separate backlog follow-up (`plan-followup`, this work id), not bundled here. Settled, see Alternatives and DC-2.
- Decision: only `done`/`dismissed` are reachable via the new command; `candidate`/`scheduled` remain owned by `upsertBacklogItem`/`linkBacklogItem` with their existing invariants. Settled, see Alternatives.
- No open questions remain that could change scope, interfaces, or acceptance.
