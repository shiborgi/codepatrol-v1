# Plan evidence — missing backlog resolution producer

Verified by direct file reads during this Plan attempt. All paths relative
to repo root, checked against `main` @ `f51ced8`.

## The gap

- `src/change/backlog.ts:9` — `BacklogStatus = "candidate" | "scheduled" | "done" | "dismissed"`.
- `src/change/backlog.ts:139-160` (`upsertBacklogItem`) — only ever writes `status: "candidate"`.
- `src/change/backlog.ts:162-173` (`linkBacklogItem`) — only ever writes `status: "scheduled"`.
- `grep -rn 'status: "done"\|status: "dismissed"\|status = "done"\|status = "dismissed"' src/` (excluding `*.test.ts`) returns zero matches — confirmed no writer exists anywhere.
- `src/change/issue-sync.ts:129-137` already branches on `item.status === "done" || item.status === "dismissed"` to close a linked GitHub issue on `push`/`both` sync — this branch is unreachable today.
- `src/change/orchestrator.ts:347-420` (`closeChangeLocked`), read in full — writes the improvement report and calls `upsertBacklogItem` for new recommendations, but never looks up the backlog item the Change was started against (no `item.workId === workId` lookup, no resolution call). Confirmed live: `.codepatrol/backlog/items.yaml`'s `top-error-code-change-conflict-...` item still has `status: scheduled, workId: 2026-07-25-session-input-validation` after that Change committed at `main`@`08d490a` — filed separately as this Change's DC-2 follow-up, not fixed here.

## Direct precedent this session

Immediately prior to this Change, this session hand-edited
`.codepatrol/backlog/items.yaml` (commit `b33e27b`) to mark
`unsafe-duplicate-yaml-reader-in-improvement-report-ts-bypasses-migraterecord-normalization`
`status: done` after confirming via `grep` that `2026-07-25-remove-duplicate-reader`
had already fixed the underlying code (`src/change/improvement-report.ts` no
longer contains a duplicate YAML reader). This item was never linked via
`--backlogItemId` (it was `candidate`, not `scheduled`), so even the DC-2
auto-resolve-on-close follow-up would not have covered this exact case —
confirming a manual command is needed regardless of whether DC-2 ships later.

## Reused patterns confirmed by reading

- `src/change/backlog.ts:162-173` (`linkBacklogItem`) — exact validation
  shape (`CHANGE_INVALID` not-found, `CHANGE_CONFLICT` already-terminal)
  that `resolveBacklogItem` mirrors.
- `src/cli/commands.ts:180-198` (`backlog.add`/`backlog.list`) — the
  two-layer CLI-boundary-then-module validation shape `backlog.resolve`
  follows.
- `src/cli/args.ts:41-60` (`COMMAND_OPTIONS`) — `id` (used by
  `change.inspect`/`change.transition`/`change.session`/`change.close`) and
  `status` (used by `backlog.list`) are both already-registered flag names;
  confirmed by reading the full map, no new flag parsing is required.
- `src/change/backlog.test.ts:78-91` — exact test shape (seed via
  `upsertBacklogItem`, assert not-found throw, assert already-terminal
  throw) `resolveBacklogItem`'s tests mirror.
- `src/change/issue-sync.test.ts:1-52` — `FakeGhAdapter`/`seed`/`itemAt`/`URL`
  test harness, reused verbatim for AC-6 rather than re-implemented.
- `src/cli/main.ts:80` — confirmed `CodepatrolError.exitCode` propagates
  directly to `process.exitCode`, so `CHANGE_INVALID`/`CHANGE_CONFLICT`
  (exit 4) and `INVALID_ARGUMENT` (exit 2) from `resolveBacklogItem`/the new
  CLI case reach the process exit code unchanged — no additional CLI-layer
  exit-code mapping needed.

## Precedent for scope discipline

`2026-07-25-session-input-validation` (this session's prior Change, closed
`main`@`08d490a`) used the same shape: fix the missing boundary check at its
exact architectural layer, file a materially-different larger idea as a
backlog follow-up rather than bundling it. This Change follows the same
discipline (DC-2 filed separately rather than also implementing
auto-resolve-on-close here).
