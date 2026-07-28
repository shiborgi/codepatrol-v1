# ADR 0001 — Offline Work identity unifies backlog, Change, branch and issue

- Status: accepted
- Date: 2026-07-27
- Change: `2026-07-27-unify-issue-change-kanban`

## Context

The backlog, Change, branch and GitHub issue used separate or nullable
identities: `BacklogItem.id` plus a nullable `workId`, a Change `work_id`, a
derived branch and an optional copied issue reference. Statuses were
duplicated across the monolithic `.codepatrol/backlog/items.yaml` and the
Change event log, promotion mutated a second identity, and issue sync could
pull remote prose/state into local authority. The Kanban exposed derivable
Work/Branch/Total columns.

## Decision

- One canonical `work_id` identifies a local Work record
  (`.codepatrol/work/<work-id>.yaml`), an optional Change, the derived branch
  `codepatrol/<work-id>` and an optional GitHub issue. There is no separate
  backlog id and no nullable promotion link.
- Local Work records are the sole offline backlog authority. Every core
  command (`backlog add/list/resolve`, `next`, Status, Change start, all
  lifecycle stages, Kanban) performs zero network calls.
- Per-work tracked YAML files replace the monolithic schema-1 backlog root.
  The file name is the validated payload identity; schema 1 rejects unknown
  keys and identity mismatch.
- Change start reuses one open Work or creates it from the direct-start
  title/priority; Close writes the terminal disposition (`done`/`dismissed`)
  to exactly that Work and commits it in the scoped terminal commit.
- GitHub is a one-way optional visualization: explicit `issues sync` /
  `sync --issues` publishes local Work as labeled issues titled exactly
  `[pN] <work-id>` with a generated `Codepatrol-Work: <work-id>` body marker,
  reconciles open/completed/not-planned state from local disposition, and
  writes back only issue number/URL. Remote prose, priority or state never
  govern local Work or lifecycle. The pull/push/both direction selector is
  removed because there is no second authority.
- The Kanban renders exactly Backlog, Plan, Review, Apply, Verify and Close,
  joining Work and Change by exact work id with compact
  harness/attempt/active-time/token cells and no derivable Work/Branch/Total
  columns.
- Legacy tracked data is migrated offline and deterministically
  (`backlog migrate`): valid legacy work ids are reused, unlinked items derive
  capped hash-suffixed ids from persisted timestamps, dispositions map
  candidate/scheduled → open, and the legacy file is deleted only after every
  output validates.

## Consequences

- CLI payloads for `backlog add` and `change start` intentionally break:
  `backlogItemId` and the title/area/evidence/source add payload are gone.
- Close no longer auto-enqueues trace recommendations; the improvement report
  remains the durable record and Plan creates follow-up Work with explicit
  ids.
- Remote issue edits made only on GitHub are overwritten on the next sync
  (DC-3); a collaborative import workflow would be a separate explicit
  Change.
- `ChangeIdentity.branch` remains persisted for schema-2 compatibility
  although derivable (DC-1); the source module keeps the `backlog.ts`
  filename while exporting Work terminology (DC-2).

## Rejected alternatives

- GitHub as backlog source of truth: violates the offline requirement.
- Keeping the dual identity and only renaming issue titles/Kanban: the
  nullable link and duplicated status would remain.
- Storing the issue number in Change identity: duplicates Work metadata and
  forces a Change schema migration.
- Deriving Work solely from Change records: backlog entries exist before any
  branch or lifecycle Change.
- One monolithic schema-2 items file: per-work files express identity
  directly and remove unrelated-work write contention.
