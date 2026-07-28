# Investigation - unified offline work identity

## Baseline and method

- Change: `2026-07-27-unify-issue-change-kanban`
- Target: `main` at `8e28c44d71c926d1691f160bcb5098acf1264404`
- Branch: `codepatrol/2026-07-27-unify-issue-change-kanban`
- Graph: synchronized at baseline; 76 files, 2,403 symbols, 0 files re-extracted.
- Improvement signals: none - `.codepatrol/docs/improvement-reports/` has no report mirror.
- ADRs: none - `docs/adr/` does not exist.
- Evidence: complete reads of backlog, issue sync, board, model, lifecycle start/close, CLI, sync, scripts, skills, governing docs and direct tests; one read-only `gh issue list` of the existing remote visualization.
- Product clarification: Codepatrol must remain fully functional offline. GitHub is a convenient visualization/publication target, never lifecycle or backlog authority.

## Current model duplicates identity and state

`BacklogItem` (`src/change/backlog.ts:15-28`) carries its own `id`, title,
priority, local status, source, optional GitHub `externalRef`, and nullable
`workId`. A promoted item therefore has two local identities (`id`, `workId`)
plus a remote issue number. The same work is represented by:

1. `.codepatrol/backlog/items.yaml` (`BacklogItem.id`, status, priority),
2. `.codepatrol/changes/<work-id>/change.yaml` after promotion,
3. branch `codepatrol/<work-id>`,
4. an optional GitHub issue copied through `externalRef`.

`linkBacklogItem` (`backlog.ts:163-173`) mutates candidate to scheduled and
adds the second identity. `startChangeLocked` (`orchestrator.ts:175-191`)
accepts `backlogItemId`, links it, and commits the YAML. Close
(`orchestrator.ts:440-452`) scans all items by nullable `workId`, changes local
status, and relies on a later issue sync to close the remote copy. These state
copies can drift and the monolithic YAML is subject to the separately tracked
concurrent read-modify-write race.

## Existing work-id invariant is the unification seam

`model.ts:31-34` already enforces `YYYY-MM-DD-slug` and exact
`codepatrol/<work-id>` branch. The smallest sufficient model makes that same
`work_id` the primary key before and after a Change starts:

```text
Local work: .codepatrol/work/<work-id>.yaml
Change:     .codepatrol/changes/<work-id>/change.yaml
Branch:     codepatrol/<work-id>
Issue:      [p1] <work-id>
```

No Change schema migration is needed. Existing `ChangeIdentity.branch` remains
for historical compatibility and is already validated as a pure derivation.

The local schema can collapse to:

```typescript
interface WorkItem {
  workId: string;
  priority: "p0" | "p1" | "p2" | "p3";
  description: string;
  status: "open" | "done" | "dismissed";
  issue?: { number: number; url: string };
  createdAt: string;
  updatedAt: string;
}
```

`scheduled` is derived from the existence of a nonterminal Change with the same
work id. Plan/Review/Apply/Verify/Close are derived only from that Change.
`done` and `dismissed` are terminal local dispositions written by Close commit
and rollback/manual dismissal respectively. Removed fields (`id`, nullable
`workId`, area, count, evidence, source and prose title) fold into the one
description during migration; they no longer participate in identity or board
state.

## Offline first, GitHub as projection

Tracked local Work records remain the governing offline backlog. Every core
operation (`backlog add/list/resolve`, `next`, `status`, `change start`, all
lifecycle stages and Kanban rendering) performs no network call.

Explicit `sync --issues` publishes the local model to GitHub:

- label: `codepatrol-backlog`;
- exact title: `[pN] <work-id>`;
- body: local description plus a generated Codepatrol marker;
- local open -> remote open;
- local done -> remote closed as completed;
- local dismissed -> remote closed as not planned.

Remote title/body/state never overwrite local work. Sync lists labeled issues,
matches by local issue number or the body work-id marker, creates/edits/reopens/
closes as needed, and writes only the resulting number/URL back to the same
local Work item. A GitHub outage is reported by sync and has zero effect on
local commands. The standalone pull/push/both semantics are removed because
there is no second authority to pull from.

Read-only `gh issue list` confirmed issues 2-26 already carry
`codepatrol-backlog`; their current prose titles require one publication pass
after local schema migration to become `[priority] work-id`.

## Deterministic local migration

The monolithic `items.yaml` is replaced by one schema-1 record per work at
`.codepatrol/work/<work-id>.yaml`. This makes the work id both filename and
validated content identity, and removes unrelated-work read-modify-write
contention. A pure migration converts the repository without network access:

1. Reuse a valid non-null legacy `item.workId`.
2. Otherwise derive `<firstSeenAt YYYY-MM-DD>-<legacy id>`; normalize to the
   work-id grammar, cap generated ids at 96 characters, and append the first
   eight SHA-256 characters when truncation or collision requires it.
3. Precompute every id and reject collisions before writing.
4. Map candidate/scheduled to open, done to done, dismissed to dismissed.
5. Preserve prose title, area, evidence, source and occurrence count in a
   stable Markdown description.
6. Preserve `externalRef.number/url` as `issue` metadata when present.
7. Write each deterministic Work record atomically, verify pre-existing
   identical records on retry, and delete the legacy file only after every
   output is durable.

If interrupted, the legacy file remains the migration authority and rerun
continues idempotently; a conflicting pre-existing Work file fails closed.
Existing historical Change records and refs are untouched. Work schema 1
rejects unknown fields and any filename/content identity mismatch.

## Kanban duplication and compact cells

`board.ts:6,34,49-50` currently exposes nine columns: Work, Branch, Backlog,
Plan, Review, Apply, Verify, Close and Total. Backlog-only rows use
`BacklogItem.id`; promoted rows are joined through nullable `workId`. Work,
Branch and Total repeat derivable information.

The new pure projector joins `WorkItem` and `ChangeView` directly by the same
work id and renders exactly:

```text
Backlog | Plan | Review | Apply | Verify | Close
```

The Backlog cell identifies every row as `[pN] work-id` and includes a concise
description; there is no separate Work or Branch column. Open Work with no
Change has only Backlog populated. A matching Change fills stage cells on the
same row. Terminal/dismissed work appears only with `--all`.

Every durable event already records `actor` (`model.ts:75`), but
`StageAttempt` drops it. Projecting the latest event actor as optional
`harness` adds no durable field and permits the requested stage format:

```text
opencode | #2 | 39s | 812tok 1/1
```

Each stage cell contains only harness, latest attempt, summed active stage time
and authoritative token total/coverage. It omits status prose; column placement
and blank/nonblank cells communicate progress. Close uses the same format.

## Lifecycle simplification

- `backlog add` requires explicit `workId`, priority and description; exact
  work-id replaces fuzzy `dedupKey` and generated independent item ids.
- `change start` removes `backlogItemId`; it reuses matching open Work or
  creates one locally from the direct start title/priority before creating
  `codepatrol/<work-id>`.
- Close updates exactly that Work item to done on commit or dismissed on
  rollback; it no longer scans nullable links.
- Close recommendations remain in the durable improvement report. They are not
  auto-enqueued because doing so without an explicit work id would recreate a
  second identity; Plan creates follow-up Work items with explicit ids.
- `next --stage plan`, Status and the Kanban read only schema-1 per-Work records.
- `sync --issues` is the only remote issue operation and remains optional.

## Scope and impact

Graph impact from `backlog.ts`, `issue-sync.ts`, `board.ts` and
`orchestrator.ts` reaches lifecycle start/close, sync, CLI output, Kanban,
14 direct/indirect test files and public skill contracts. The migration,
lifecycle join and six-column board form one cohesive Change: landing only one
piece would either break offline backlog, lose tracked data or preserve the
dual identity.

No dependency or hosted runtime is added. GitHub remains an explicit adapter
behind sync; all acceptance except remote adapter tests runs with fakes or no
network.
