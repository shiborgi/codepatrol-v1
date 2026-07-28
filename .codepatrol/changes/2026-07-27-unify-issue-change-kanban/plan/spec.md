# Specification - Unify offline work, Change, branch and issue identity

## Intent

- Origin: user-requested refactor.
- Mode: architecture/refactor with tracked-data migration.
- Target baseline: `main` at `8e28c44d71c926d1691f160bcb5098acf1264404`; Change branch `codepatrol/2026-07-27-unify-issue-change-kanban`; clean tree at start.
- Improvement signals: none - first available Change without a mirrored improvement report in this workspace.
- Product constraint: Codepatrol remains fully functional offline. GitHub issues are an optional visualization/publication adapter and never govern Work or lifecycle state.
- Problem: backlog, issue, Change and branch currently use separate/nullable identities and duplicated statuses. The Kanban exposes derivable Work/Branch/Total columns and joins backlog through a mutable nullable link.
- Outcome: one canonical `work_id` identifies a local Work record, optional Change, derived branch and optional GitHub issue; the offline Kanban renders only Backlog, Plan, Review, Apply, Verify and Close with compact harness/attempt/time/token cells.

## Scope

### In scope

- Replace monolithic `.codepatrol/backlog/items.yaml` with one tracked local Work record at `.codepatrol/work/<work-id>.yaml`.
- Replace `BacklogItem.id` plus nullable `workId` with one required `WorkItem.workId` matching the Change grammar.
- Migrate every current legacy item offline and deterministically, preserving descriptions, dispositions and issue references.
- Make `backlog add/list/resolve`, `next`, Change start/Close and Status consume local Work records without network access.
- Make Change start resolve or create one open Work by exact work id and create `codepatrol/<work-id>` from that same identity.
- Publish local Work records one-way to issues labeled `codepatrol-backlog`; exact remote title is `[pN] <work-id>`.
- Redesign the pure Kanban to exactly six columns and compact stage cells containing harness, latest attempt, active time and token total/coverage.
- Update governing documentation, public skill contracts, CLI help and tests to the unified offline model.

### Out of scope

- Making GitHub available offline, storing remote issue comments/events, or accepting remote edits as local decisions.
- Removing the existing Change event/checkpoint schema or changing Plan -> Review -> Apply -> Verify -> Close ordering.
- Removing `ChangeIdentity.branch`; persisted v2 records require it and validation already proves it equals `codepatrol/<work-id>`.
- Changing Git ref publication, Close squash/rollback mechanics, provider token accounting, Stage Session ownership or graph storage.
- Solving every lifecycle transaction/recovery backlog finding; this Change removes the shared backlog-file contention but does not redesign Git/YAML checkpoint transactions.

## Domain model

### Work

`WorkItem` is the sole local pre-lifecycle aggregate:

```typescript
export type WorkPriority = "p0" | "p1" | "p2" | "p3";
export type WorkStatus = "open" | "done" | "dismissed";
export interface WorkIssueRef { number: number; url: string }
export interface WorkItem {
	workId: string;
	priority: WorkPriority;
	description: string;
	status: WorkStatus;
	issue?: WorkIssueRef;
	createdAt: string;
	updatedAt: string;
}
```

The durable YAML uses snake_case keys (`schema_version`, `work_id`,
`created_at`, `updated_at`) and exact-key validation. The path is
`.codepatrol/work/<work-id>.yaml`; filename and payload work id must match.

### Relationships

- Work -> Change: zero or one Change with `identity.work_id === work.workId`.
- Work -> branch: when a Change exists, exactly `codepatrol/<work-id>`.
- Work -> issue: zero or one optional visualization reference; sync discovers or creates exactly one labeled issue for the work id.
- Work status -> lifecycle: open is eligible for Change start; Close commit sets done; Close rollback or explicit backlog dismissal sets dismissed.
- A nonterminal Change determines the active Kanban lifecycle column; local Work status never substitutes for Change stage.

## Local Work storage

`src/change/backlog.ts` remains the public local Work module to minimize import
surface, but exports Work terminology and per-work operations:

- `workRelativePath(workId)` and `workPath(workspace, workId)` resolve the canonical record.
- `readWork`, `listWork`, `writeWork`, `addWork`, `resolveWork` use workspace containment and per-work locking.
- `addWork` input is `{ workId, priority, description }`; exact work-id identity replaces fuzzy title deduplication and occurrence counts.
- Re-adding an identical open work is idempotent; conflicting content or terminal work returns `CHANGE_CONFLICT`.
- `resolveWork` accepts done or dismissed; lifecycle Close uses exact work id, never scans nullable links.
- `listWork` sorts priority p0 through p3, then `createdAt`, then work id.

No Work operation invokes `gh`, fetches, pushes or requires authentication.

## Migration

`migrateLegacyBacklog(workspace)` handles the currently tracked schema-1 root:

1. Parse and validate the complete legacy document using a migration-only type.
2. Reuse valid `item.workId`; otherwise derive `<YYYY-MM-DD>-<legacy-id>` from `firstSeenAt` and normalized legacy id.
3. Generated ids are capped at 96 characters; truncation/collision appends `-<sha256[0..8]>` and the full precomputed output set must be unique before writes.
4. Map candidate/scheduled -> open, done -> done, dismissed -> dismissed.
5. Convert prose title, area, evidence, source and count into stable Markdown `description`; preserve external issue number/url.
6. Atomically write each `.codepatrol/work/<id>.yaml`. Existing byte-identical output is accepted on retry; conflicting output fails closed.
7. Delete `.codepatrol/backlog/items.yaml` only after every output validates.

Normal Work reads fail with actionable `MIGRATION_REQUIRED` while the legacy
file exists. Apply runs the migration once after implementation and declares
the legacy deletion plus every generated Work path as production changes.

## Lifecycle behavior

- `StartChangeInput` removes `backlogItemId`, retains `title` for direct new work, and adds optional `priority` (default p2). `startChangeLocked` reuses an existing open Work or atomically creates one from `workId`/`title`/`priority`; when Work already exists its first description line is the immutable Change title.
- Start still requires a clean trusted target checkout and creates exactly `codepatrol/<work-id>` at target HEAD.
- Close no longer auto-upserts trace recommendations. Recommendations remain in `close/improvement-report.md` until Plan explicitly creates a new work id.
- Close commit writes `done` to the matching Work; rollback writes `dismissed`. A nonterminal Change missing Work fails closed with `CHANGE_DRIFT`; migration and new start prevent that state.
- Work-path writes are included in scoped metadata/terminal commits. No unrelated Work record is touched.

## GitHub projection

The existing `GhAdapter` is widened with label-filtered list, edit and reopen
operations. `syncIssues` becomes one-way reconciliation from local Work plus
Change terminal state to GitHub:

- title: `[${priority}] ${workId}` exactly;
- label: `codepatrol-backlog`;
- body: description followed by a generated `Codepatrol-Work: <work-id>` marker;
- open local work -> open issue;
- done -> closed with completed reason;
- dismissed -> closed with not-planned reason.

Matching order is stored issue number, then unique body marker, then canonical
title. Duplicate matches or an issue number belonging to another work fail
closed. After successful create/discovery, sync updates only local `issue`
number/url metadata. Remote prose, priority and state are overwritten from
local on the next sync; remote changes never alter local priority/status/description.

`issues sync [--dry-run]` and `sync --issues` retain explicit network access
but remove direction selection. Dry-run performs reads and reports create/edit/
reopen/close/update-local actions with zero local or remote writes.

## Kanban

`projectKanban(works, changes, options)` joins by exact work id and returns rows
sorted by priority, creation time and work id. Default includes open Work and
nonterminal Changes; `--all` additionally includes done/dismissed Work and
terminal Changes. A historical Change without Work renders a fallback
`[--] <work-id>` row.

Markdown header is exactly:

```text
| Backlog | Plan | Review | Apply | Verify | Close |
```

Backlog cell is `[pN] <work-id>` plus one escaped/truncated description line.
Issue URL may wrap the identity as a link but never changes sorting or joining.

`StageAttempt` gains optional projected `harness`; `foldChange` sets it from
the latest relevant event actor (stage start, run, checkpoint/return/Close).
No durable event field changes. A nonempty stage cell is exactly four compact
parts separated by ` | `:

```text
<harness-or--> | #<latest-attempt> | <summed-stage-active-time> | <token-total>[~]tok <measured/total>
```

There is no Work, Branch or Total column and no next-action prose inside the
table. Exact resume actions remain available from `codepatrol next` and Change
summary.

## CLI and contracts

- `backlog add --input -`: `{ "workId": "YYYY-MM-DD-slug", "priority": "p0|p1|p2|p3", "description": "..." }`.
- `backlog list [--status open|done|dismissed]`: local only.
- `backlog resolve --id <work-id> --status done|dismissed`: local only.
- `issues sync [--dry-run]`: one-way local-to-GitHub visualization.
- `sync --issues [--dry-run]`: same issue publication composed with ref sync; `--direction` is removed.
- `change start` reads or creates canonical Work; no backlog item id or nullable link remains.

Plan skill creates explicit work ids for splits, commits only their Work files,
then starts a Change by that same id. Status remains a pure local projector.
Sync remains the only public workflow that calls GitHub. AGENTS, CONTEXT,
README, shared CLI docs and skill contracts are updated accordingly.

## Alternatives

- GitHub as backlog source of truth: rejected by the explicit offline requirement; Status and Change start would depend on network/authentication.
- Keep current BacklogItem and only change issue titles/Kanban: rejected because nullable dual identity and duplicated status remain.
- Store issue number in Change identity: rejected because it duplicates local Work metadata and forces a persisted Change schema migration.
- Derive all Work solely from Change records: rejected because backlog items exist before a branch/lifecycle Change.
- Keep one monolithic schema-2 items file: rejected because per-work files express identity directly and avoid unrelated-work write contention with no new abstraction.
- Auto-create GitHub issues from backlog add or Close: rejected because core offline commands and local Close must never require remote access.

## Simplicity decision

- Selected rung: local model consolidation and reuse.
- Reused capabilities: work-id grammar, `resolveInside`, atomic YAML writes, workspace locks, Change projection, existing `GhAdapter`, aggregate usage and pure board rendering.
- Removed surface: independent backlog id, nullable promotion link, area/count/evidence/source fields, fuzzy dedup, scheduled mirror status, issue pull authority and Work/Branch/Total columns.
- Irreducible complexity: a small local Work record is required before Change creation; optional issue metadata is required for idempotent publication; deterministic migration is required to avoid tracked-data loss.
- Safety floor: offline lifecycle, exact path/ref identity, atomic migration, no remote-to-local decisions, no token estimation, full project gate.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | `ChangeIdentity.branch` remains persisted although derivable | Identity retains one redundant field for historical schema compatibility | A separately approved Change v3 migration is needed for another identity field | Migrate Change schema and remove branch in one dedicated compatibility Change |
| DC-2 | Work remains in `.codepatrol/backlog.ts` at the source-module level while durable records move to `.codepatrol/work/` | Module filename uses legacy terminology although exported domain names are Work-based | The module needs further responsibilities or external imports become confusing | Rename module and imports in a mechanical follow-up |
| DC-3 | Issue body is regenerated from local description and marker | Human edits made only on GitHub are overwritten | Users require collaborative remote description editing | Add an explicit import/conflict workflow; never silently pull |

## Compatibility and rollout

- Tracked legacy backlog data is migrated offline during Apply before checkpoint; no remote migration is required.
- Existing Change YAML/tags remain readable and historical Changes lacking Work receive board fallback rows.
- CLI payloads for backlog add and Change start intentionally break because they encode the removed dual model; repository skills/tests/docs move atomically in this Change.
- First optional `sync --issues` after Close normalizes existing labeled issue titles to `[pN] work-id`, bodies and states from local Work.
- Rollback restores schema-1 `items.yaml` and old code from Git; no remote mutation is performed during Apply, Verify or Close.

## Risks and mitigations

- Risk: deterministic migration assigns the wrong work id to an unlinked legacy item. Mitigation: derive from persisted timestamp/id, preflight all ids, preserve legacy id and description, and test long/colliding cases.
- Risk: migrating many Work files partially fails. Mitigation: legacy file remains until all writes validate; byte-identical outputs make retries idempotent; conflicts fail closed.
- Risk: direct Change start creates Work and Change in one transaction that may fail midway. Mitigation: include the exact Work path in start ownership/cleanup and test failures before/after branch creation; pre-existing Work is never deleted by cleanup.
- Risk: remote issue edits are lost. Mitigation: document one-way ownership, dry-run exact actions, and preserve all governing text locally.
- Risk: compact board hides lifecycle status/next action. Mitigation: `next`, `change inspect` and `change summary` retain exact state and resume action; Kanban is intentionally placement/metrics only.
- Risk: actor is not always a literal harness name. Mitigation: event actor is the only durable authoritative executor identity; board labels it harness without inference and renders `-` only when no event is available.

## Acceptance criteria

- AC-1: Every migrated/new local Work has one valid work id used as its record filename; schema rejects duplicate, unsafe or mismatched identity, and migration preserves every legacy item without network access or data loss.
- AC-2: `backlog add/list/resolve`, `next --stage plan`, Status, Change start and the complete lifecycle work with `gh` unavailable and perform zero network calls.
- AC-3: Change start reuses an open Work or creates one locally from its exact work id, derives `codepatrol/<work-id>`, atomically cleans up only newly-owned Work on failure, and no longer accepts/stores `backlogItemId` or an independent backlog identity.
- AC-4: Close commit updates only matching Work to done; rollback/manual dismissal produces dismissed; trace recommendations remain reports and never create implicit work.
- AC-5: Issue sync is one-way and idempotent: it creates/edits/reopens/closes labeled issues to exact `[pN] work-id` title/body/state, updates only issue reference metadata locally, ignores remote state as authority, and dry-run writes nothing.
- AC-6: Kanban Markdown has exactly Backlog, Plan, Review, Apply, Verify and Close columns; Work and Change join into one row by work id; backlog-only, active, terminal, dismissed and historical fallback cases are deterministic.
- AC-7: Every populated stage cell reports exactly harness, latest attempt, active time and token total/coverage from authoritative events/runs; no token estimate, branch, total or next-action text appears in the table.
- AC-8: Governing docs, public skills, CLI help/catalog and tests consistently describe local Work as truth and GitHub as optional visualization; no live contract still treats `items.yaml` schema 1, remote pull or nullable backlog linking as current behavior.
- AC-9: Focused migration, Work, issue sync, lifecycle and board suites plus `npm run verify` pass; final production/data diff contains only the declared implementation, contract and migrated Work paths.

## Decisions and open questions

- Decision: local Work is authoritative; GitHub is one-way visualization.
- Decision: `work_id` is the only relationship key; no separate backlog id or nullable link survives.
- Decision: per-work tracked files replace the monolithic backlog root.
- Decision: remote sync remains explicit and optional; no lifecycle stage invokes it.
- Decision: all current requested behavior is one cohesive migration Change; no follow-up split is required.
- No open question remains that can materially change scope, interfaces or acceptance.
