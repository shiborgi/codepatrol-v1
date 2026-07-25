# Specification — codepatrol-git: two-way backlog/GitHub-issue sync

## Intent

- Origin: propose-codebase
- Mode: feature
- Target baseline: `main` @ `932edcc79127c3fb84510e1a4b621efb9fc63774`, clean tree
- Governing constraints: `CONTEXT.md`'s **Rejected Integration Surface** term explicitly names
  "external issue trackers" as outside the local-only contract "unless a future Change explicitly
  adopts them" — this Change is that explicit adoption, scoped narrowly to the Backlog term ("a
  prioritized ... queue of follow-up work at `.codepatrol/backlog/items.yaml`") and to GitHub
  issues on the current `origin` remote only. No ADR exists yet for this decision; none governs
  it otherwise.
- Substrate state: graph synced at this Change's start (70 files, 1919 symbols)
- Problem: the Backlog already accumulates candidates from Close-stage tracing and Plan follow-ups,
  but has no path to or from an external issue tracker — a maintainer who triages work in GitHub
  Issues has no way to see the Codepatrol backlog there, and a Codepatrol-generated backlog
  candidate has no way to become something a non-Codepatrol collaborator can see, comment on, or
  close.
- Outcome: a new CLI command (`issues sync`) and a new directly-invoked skill
  (`codepatrol-git`) reconcile `.codepatrol/backlog/items.yaml` against the GitHub issues on the
  current `origin` remote in both directions in one deterministic pass, using the existing `gh`
  CLI the workspace is already authenticated with.

Improvement signals: Top error code: CHANGE_CONFLICT (2). Investigate the first occurrence's args
and stage context. — Command "change.session" was invoked 36 times — consider caching or batching
repeated invocations. (from `.codepatrol/docs/improvement-reports/2026-07-25-remove-duplicate-reader.md`;
both are process/tooling signals already tracked as their own backlog items and unrelated to this
feature's scope.)

User decisions (confirmed via clarifying questions before this spec was written):
- Pull direction imports **all open issues** in the repo, with no label filter (accepting the
  tradeoff that unrelated issues become backlog candidates — see Risks).
- Push direction **automatically** creates a GitHub issue for every backlog candidate that has no
  linked issue yet, on every sync run — no separate opt-in step per item.

## Scope

### In scope

- A new adapter module `src/change/issue-sync.ts`: a `GhAdapter` interface plus `NodeGhAdapter`
  (subprocess wrapper around the `gh` CLI, mirroring `src/change/git.ts`'s `GitAdapter`/
  `NodeGitAdapter` idiom exactly — same `execFile`-based `run` helper, same
  `CodepatrolError("OPERATION_FAILED", ...)` translation on failure), and a `syncIssues(workspace,
  direction, options)` orchestration function implementing the algorithm in Proposed design.
- A schema widening of `src/change/backlog.ts`: add `"github-issue"` to `BacklogSourceKind`; make
  `BacklogSource.workId` optional and required only for `"close-trace"`/`"plan-followup"`; add an
  optional `externalRef: { provider: "github"; number: number; url: string }` field to
  `BacklogItem`, validated the same way every other field is (allow-listed keys, explicit type
  checks, `CodepatrolError("CHANGE_INVALID", ...)` on violation).
- CLI wiring for a new `issues sync [--direction pull|push|both] [--dry-run]` command:
  `src/cli/args.ts` (new `KNOWN` options, new `COMMAND_OPTIONS` entry, new `ParsedArgs` fields),
  `src/cli/commands.ts` (new `"issues.sync"` case), `src/cli/output.ts` (new `HELP` section, new
  `renderIssueSyncResult` text renderer).
- A new skill `skills/codepatrol-git/SKILL.md` (frontmatter: `name`, `description` only, matching
  every existing skill), a new `role: support` entry in `skills/catalog.yaml` (`invokedBy: []`,
  `mayInvoke: []`, `mutation: artifacts`), and the required update to
  `scripts/skills-contract.test.mjs`'s hardcoded ten-name `support` array (add
  `"codepatrol-git"`, now eleven).
- Unit tests for `issue-sync.ts` using an in-memory `FakeGhAdapter` (no real network access) and
  the existing `readBacklog`/`writeBacklog` against a temp workspace, covering every branch in
  Proposed design.
- A CLI-level integration test (`src/cli/cli.test.ts` or a new adjacent file, matching existing
  convention) exercising `issues sync` end-to-end through `executeCommand`, still against a
  `FakeGhAdapter` (never real `gh` calls in the test suite — see Risks).

### Out of scope

- Any change to `src/change/orchestrator.ts`'s Close stage to auto-set backlog status `"done"` —
  a real, separate gap (confirmed in Current evidence) but unrelated to this sync feature; adding
  it here would silently expand scope beyond "sync backlog with issues."
- Syncing anything other than the Backlog: no Change record, no Plan/Review/Apply/Verify/Close
  artifact, and no Pull Request is read from or written to GitHub by this feature.
- Any non-GitHub issue tracker (GitLab, Jira, etc.) — the CLI is `gh`-specific by construction;
  a different tracker is a different adapter and a different Change.
- Label-based filtering of which issues are pulled — the user explicitly chose "all open issues,
  no label filter" for this Change.
- Per-item opt-in push — the user explicitly chose "automatic for every unlinked candidate."
- Pagination beyond `gh`'s single `--limit` call (see Deferred constraints, DC-1).
- Any new CLI flag, environment variable, or config file for choosing a different remote than
  `origin`, or a different repo than the one `gh` auto-detects from the workspace's Git remote.
- Migrating the (currently zero) existing GitHub issues on `shiborgi/codepatrol` — moot today
  (`gh issue list` returned `[]`), stated for completeness.

## Current evidence

See `plan/evidence/investigation.md` for full detail. Summary:

- `CONTEXT.md:52-54` — Rejected Integration Surface names "external issue trackers" as out of scope
  "unless a future Change explicitly adopts them"; this Change is that explicit adoption, confirmed
  with the user.
- `origin` remote is `https://github.com/shiborgi/codepatrol.git`; repo is public
  (`gh repo view --json visibility,isPrivate` → `PUBLIC`/`false`); `gh` 2.96.0 already
  authenticated; zero existing issues.
- `src/change/git.ts:7-30` — the `GitAdapter`/`NodeGitAdapter` idiom to mirror for `GhAdapter`/
  `NodeGhAdapter`.
- `src/change/backlog.ts:9-54` — current schema requires `source.workId` for every item; no
  external-reference field exists; `"done"`/`"dismissed"` statuses exist in the type but are never
  set anywhere in `src/`.
- `src/cli/args.ts:44-56,96` — command dispatch and per-command option validation to extend.
- `scripts/lint-skills.mjs` — hard-codes exactly six primary skills; a new skill must be
  `role: support` to pass `npm run lint:skills`.
- `scripts/skills-contract.test.mjs:9-11,17` — hardcodes and asserts the exact ten-name support
  list; must be updated to eleven names or the full suite fails.

## Proposed design

### Data model (`src/change/backlog.ts`)

```typescript
export type BacklogSourceKind = "close-trace" | "plan-followup" | "github-issue";
export interface BacklogSource { kind: BacklogSourceKind; workId?: string }
export interface ExternalRef { provider: "github"; number: number; url: string }
export interface BacklogItem {
	// ...existing fields unchanged...
	externalRef?: ExternalRef;
}
```

`validateSource` requires `workId` (non-empty string) when `kind` is `"close-trace"` or
`"plan-followup"`, and requires `workId` to be **absent** (not merely empty) when `kind` is
`"github-issue"` — keeping "workId present" a reliable signal of "this item was authored by a
Change" everywhere else in the codebase that reads `BacklogSource.workId` (e.g.
`orchestrator.ts:174-177`'s `backlogItemId` linkage flow is untouched and keeps working exactly as
before, since it never touches `github-issue`-sourced items). A new `validateExternalRef` follows
the exact pattern of `validateSource`: reject unknown keys, require `provider === "github"`,
require `number` a positive safe integer, require `url` a non-empty string. `ALLOWED_ITEM_KEYS`
gains `"externalRef"`.

For `github-issue`-sourced items, `id` is `gh-issue-<number>` (not `dedupKey(title)`), because the
issue number is a stable, unique, externally-assigned key, while titles can be edited on GitHub at
any time — using `dedupKey(title)` as the id for these items would silently create a duplicate
backlog entry the next time the title changed. Items from the two existing sources keep their
current `dedupKey(title)`-derived ids unchanged.

### Adapter (`src/change/issue-sync.ts`, new file)

```typescript
export interface RemoteIssue { number: number; title: string; url: string; state: "open" | "closed" }
export interface GhAdapter {
	assertAvailable(signal?: AbortSignal): Promise<void>;
	listIssues(signal?: AbortSignal): Promise<RemoteIssue[]>;
	ensureLabel(name: string, signal?: AbortSignal): Promise<void>;
	createIssue(title: string, body: string, label: string, signal?: AbortSignal): Promise<RemoteIssue>;
	closeIssue(number: number, reason: "completed" | "not planned", signal?: AbortSignal): Promise<void>;
}
export class NodeGhAdapter implements GhAdapter { /* execFile("gh", [...]) mirroring NodeGitAdapter's run() */ }
```

`assertAvailable` runs `gh auth status`; a non-zero exit (missing binary or unauthenticated)
throws `CodepatrolError("OPERATION_FAILED", "gh CLI is not installed or not authenticated. Install https://cli.github.com and run `gh auth login`.", 5)` —
fail loud and specific rather than silently syncing nothing. `listIssues` runs `gh issue list
--state all --json number,title,state,url --limit 1000` (see DC-1 for the 1000 ceiling).
`createIssue` runs `gh issue create --title <title> --body <body> --label <label>` and parses the
issue number from the printed URL (`gh issue create` has no `--json` output mode). `closeIssue`
runs `gh issue close <number> --reason <reason>`. `ensureLabel` runs `gh label create <name>
--color ededed --description "Codepatrol backlog" --force` (idempotent via `--force`, confirmed in
investigation).

### Orchestration (`syncIssues`, same file)

```typescript
export type SyncDirection = "pull" | "push" | "both";
export interface IssueSyncOptions { signal?: AbortSignal; now?: Date; gh?: GhAdapter; dryRun?: boolean }
export interface IssueSyncResult {
	pulled: { created: string[]; dismissed: string[]; reopened: string[]; skippedClosed: number };
	pushed: { created: string[]; closed: string[] };
	dryRun: boolean;
}
export async function syncIssues(workspace: string, direction: SyncDirection, options?: IssueSyncOptions): Promise<IssueSyncResult>
```

One invocation always calls `gh.assertAvailable()` then `gh.listIssues()` once, regardless of
`direction` — both phases need the same snapshot, and the repo is small enough (Deferred
constraints, DC-1) that one call per sync is cheap.

**Pull phase** (runs when `direction` is `"pull"` or `"both"`):
1. For every backlog item with `externalRef.provider === "github"`: look up its `number` in the
   fetched issues.
   - Not found (deleted/inaccessible issue): leave the item untouched (Residual risk, not a
     defect).
   - Found, item `status === "candidate"` and issue `state === "closed"`: set `status:
     "dismissed"`, refresh `title` from the issue, refresh `lastSeenAt`.
   - Found, item `status === "dismissed"` and issue `state === "open"`: set `status: "candidate"`
     (reopened), refresh `title`, refresh `lastSeenAt`.
   - Found, item `status` is `"scheduled"` or `"done"`, or already matches the issue's state:
     refresh `title`/`lastSeenAt` only — never flip a `"scheduled"` (actively bound to a Change) or
     `"done"` (already shipped) item's status from an incidental external open/close.
2. For every fetched issue with `state === "open"` that has no existing backlog item referencing
   its number: create a new item — `id: gh-issue-<number>`, `title` from the issue, `priority:
   classifyPriority(title)` (reused unchanged from `backlog.ts`), `area: "workflow"` (a fixed
   default; GitHub issues carry no architecture/workflow/skills signal today — Deferred
   constraints, DC-2), `status: "candidate"`, `evidence: [issue.url]`, `source: { kind:
   "github-issue" }` (no `workId`), `externalRef: { provider: "github", number, url }`.
3. Closed issues with no existing backlog item are never imported (Decisions and open questions) —
   only issues already tracked get their closed state reflected; a closed-and-never-seen issue is
   assumed pre-existing history, not a new candidate.
4. Write the backlog once via `writeBacklog` (skipped entirely when `dryRun`).

**Push phase** (runs when `direction` is `"push"` or `"both"`, using the same fetched issue
snapshot):
1. Read the backlog (post-pull state, when both phases ran in one invocation). For every item with
   `status === "candidate"` and no `externalRef`: call `gh.ensureLabel("codepatrol-backlog", ...)`
   once per sync run (only if there is at least one item to create, skipped otherwise), then
   `gh.createIssue(title, formatIssueBody(item), "codepatrol-backlog")`, then set the item's
   `externalRef` to the returned `{provider: "github", number, url}` (status stays `"candidate"` —
   now linked, awaiting resolution either way).
2. For every item with `status` in `("done", "dismissed")` and an `externalRef` whose looked-up
   issue (from the same fetched snapshot) is still `state === "open"`: call
   `gh.closeIssue(number, status === "done" ? "completed" : "not planned")`.
3. Write the backlog once via `writeBacklog` if step 1 changed anything (skipped entirely when
   `dryRun`); step 2 never touches the backlog (it only calls `gh.closeIssue`).

`formatIssueBody(item)` is a small pure function: `${item.title}\n\n${item.evidence.join("\n")}
\n\n---\nPriority: ${item.priority} · Area: ${item.area}\nSource: ${item.source.kind}${item.source.workId ? ` (${item.source.workId})` : ""}`.

A `github-issue`-sourced candidate is never re-pushed as a new issue — it already carries
`externalRef` from the pull that created it, and the push filter explicitly requires
`!item.externalRef`.

### CLI (`src/cli/args.ts`, `src/cli/commands.ts`, `src/cli/output.ts`)

`issues sync [--direction pull|push|both] [--dry-run]` (default `direction`: `both`). Invalid
`--direction` values throw `CodepatrolError("INVALID_ARGUMENT", ...)`, matching the existing
per-command validation style (e.g. `backlog.list`'s `--status` check). Output: a rendered summary
(created/dismissed/reopened/skipped counts for pull, created/closed counts for push, and whether
`--dry-run` was set) in text mode, the full `IssueSyncResult` in JSON mode.

### Skill (`skills/codepatrol-git/SKILL.md`, `skills/catalog.yaml`,
`scripts/skills-contract.test.mjs`)

A thin, deterministic wrapper — the same shape as `codepatrol-status` wrapping
`render-kanban.mjs`: run `codepatrol issues sync [--direction ...] [--dry-run]`, reproduce its
output verbatim, never touch Change lifecycle state. Catalog entry: `role: support`, `invokedBy:
[]` (directly user-invoked, matching `codepatrol-status`'s own `invokedBy: []` shape), `mayInvoke:
[]`, `consumes: [backlog items, GitHub issues on origin]`, `produces: [reconciled backlog items,
reconciled GitHub issues]`, `mutation: artifacts`. `scripts/skills-contract.test.mjs`'s `support`
array gains `"codepatrol-git"` (eleven names, alphabetical position after `codebase-design` and
before `diagnose-bug`).

## Alternatives

- **Fold sync into an existing lifecycle stage (e.g. auto-pull at Plan start, auto-push at
  Close).** Rejected: the user asked for a distinct, on-demand command; silently wiring it into
  existing stages would create a hidden network dependency inside every Plan/Close run (every
  Plan or Close would now require `gh` to be installed and authenticated, and would make a
  network call the user never asked those stages to make), a much larger and riskier surface
  change than the one requested.
- **A generic issue-tracker abstraction supporting multiple providers (GitHub, GitLab, ...) behind
  one interface.** Rejected: no second provider is requested or in evidence; this is exactly the
  kind of speculative surface the simplicity floor forbids. `GhAdapter` is deliberately GitHub-
  specific; a second provider is a new adapter and a new Change if it is ever needed.
- **Real `gh` calls against the real repo in tests, matching `git.test-helper.ts`'s real-`git`
  convention.** Rejected: the codebase's existing convention for git-related tests uses
  the *real* `git` binary against throwaway temp directories, because local git is free, fast, and
  hermetic. A real `gh` call is none of those (network-dependent, rate-limited, mutates a shared
  external system, requires live auth) — mirroring that convention here would make the test suite
  flaky, slow, and would create/close real GitHub issues on every `npm test` run. A `FakeGhAdapter`
  is a deliberate, justified deviation from the ambient testing convention for this one adapter.
- **Real `gh` calls guarded by an environment flag, skipped by default in CI.** Rejected: adds a
  second, harder-to-verify code path (a conditionally-skipped test provides no evidence when
  skipped) for a benefit (contract coverage of the real `gh` binary) not requested and not
  necessary — `NodeGhAdapter`'s command construction is simple enough (four thin methods, each one
  `execFile` call) to review by inspection against the `gh --help` output already captured in
  `plan/evidence/investigation.md`.

## Simplicity decision

- Selected rung: local reuse
- Earlier rungs: no `need`/no-code rung applies (a real command is requested); `runtime/stdlib`
  doesn't provide GitHub access; `native platform` doesn't apply; `installed dependency` is
  rejected in favor of the already-installed, already-authenticated `gh` CLI (an "installed
  dependency" in the sense of a new npm package, e.g. `@octokit/rest`, is unnecessary and would add
  a runtime dependency, an auth-token-handling surface, and a different CLI-only philosophy
  violation — see memory: "CLI-only" contract decision — that shelling out to the user's own `gh`
  session avoids entirely).
- Irreducible complexity: the pull/push reconciliation state machine (status transitions in the
  Proposed design) — no smaller design satisfies "two-way" without it, since some logic must decide
  what an issue-closed or backlog-done event means for the other side.
- Safety floor: reliability (`assertAvailable` fails loud on missing/unauthenticated `gh`, never
  silently no-ops), correctness (schema validation extended consistently with every existing field
  in `backlog.ts`), and no secret/credential handling in this codebase at all (auth is entirely
  `gh`'s own out-of-band session) remain mandatory.
- Expected surface delta: 1 new file (`src/change/issue-sync.ts`), 1 new test file
  (`src/change/issue-sync.test.ts`), 1 new skill file (`skills/codepatrol-git/SKILL.md`), 4 files
  modified (`src/change/backlog.ts`, `src/cli/args.ts`, `src/cli/commands.ts`,
  `src/cli/output.ts`), 2 test files modified (`scripts/skills-contract.test.mjs`,
  `skills/catalog.yaml` is data not test but is modified), no new npm dependency, no new public
  interface beyond the ones listed above.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | `listIssues` fetches once via a single `--limit 1000` call, no pagination loop | Repos with more than 1000 total issues (open+closed) will silently miss the overflow | `gh issue list --state all --json number --limit 1000 \| jq length` returns exactly 1000 (saturated) | Add a paginated fetch loop using `gh`'s cursor-based `--json` output or the REST API directly |
| DC-2 | Every GitHub-issue-sourced backlog item gets a fixed `area: "workflow"` | Items that are actually architecture or skills work are misclassified until a human edits `items.yaml` by hand | A maintainer reports that GitHub-issue-sourced items are consistently miscategorized | Add label-to-area mapping (e.g. a GitHub label named `architecture` maps to `area: architecture`) once real usage shows a pattern |

## Compatibility and rollout

- Migration: none. `BacklogItem.externalRef` is optional and `BacklogSource.workId` becomes
  optional only for the new `"github-issue"` kind — every existing `items.yaml` entry
  (`close-trace`/`plan-followup`, `workId` always present) continues to validate unchanged.
- Compatibility: `upsertBacklogItem`, `linkBacklogItem`, `listBacklog`, `findBacklogItem` are
  unchanged; `orchestrator.ts`'s `backlogItemId` linkage flow is unchanged and untouched by this
  Change.
- Observability: the CLI's text-mode summary and JSON-mode full result are the only reporting
  surface; no new logging subsystem.
- Rollback: revert the single Apply commit; no data migration to undo (the widened schema is
  additive-only).
- Operational impact: introduces the *first* outbound network dependency in the entire CLI (every
  other command is fully local). This is deliberate and explicit for this one command only;
  `--dry-run` lets a user preview a sync with zero mutation (no `gh` write calls, no
  `items.yaml` write) before running it for real.

## Risks and mitigations

- Risk: "all open issues, no label filter" (explicit user choice) means any unrelated issue opened
  by anyone on `shiborgi/codepatrol` becomes a backlog candidate. Mitigation: this is an accepted,
  explicit tradeoff, not a defect; a human can freely edit or delete a wrongly-imported candidate
  from `items.yaml`, and re-running pull will not resurrect a deleted item unless the underlying
  issue is still open (an item is only re-created if no backlog item currently references that
  issue number).
- Risk: automatic push means every backlog candidate — including internally-generated, potentially
  noisy `close-trace` items like "Command X was invoked N times" — becomes a public GitHub issue.
  Mitigation: this is an accepted, explicit tradeoff (user's stated choice); the repo is public, so
  no confidentiality risk; `--dry-run` lets a user preview exactly what would be created before
  committing to it.
- Risk: `FakeGhAdapter`-only test coverage means a real behavioral drift in the `gh` CLI's flags or
  output format (a `gh` version upgrade) would not be caught by the test suite. Mitigation:
  `NodeGhAdapter`'s four methods are each a single, simple `execFile` call whose exact flags are
  pinned against the `gh --help` output captured in `plan/evidence/investigation.md` at Plan time;
  Apply must re-run the exact `gh --help`/`gh issue create --help`/`gh issue close --help` output
  against the installed `gh` version before implementing, and Verify must confirm the flags used in
  the diff match that captured evidence (stated as a residual risk in `verify/report.md`, not
  silently accepted).
- Risk: two-way sync run concurrently by two harnesses/users at once could race on
  `items.yaml` writes. Mitigation: `writeBacklog`'s `atomicWriteFile` already guarantees each
  individual write is atomic (no partial/corrupt file); a lost-update race (two concurrent syncs,
  one write clobbers the other's changes) is a pre-existing property of every current
  `backlog.ts` writer (`upsertBacklogItem`, `linkBacklogItem` have the same read-then-write race
  today) and is not introduced or worsened by this Change — out of scope to fix here.

## Acceptance criteria

- AC-1: Given a backlog item with `source.kind: "github-issue"`, `status: "candidate"`, and an
  `externalRef` pointing to an issue the fetched snapshot reports as `state: "closed"`, running
  `issues sync --direction pull` sets that item's `status` to `"dismissed"` and leaves every other
  field except `title`/`lastSeenAt` unchanged.
- AC-2: Given the same setup but the item's `status` is `"dismissed"` and the fetched issue is
  `state: "open"`, running `issues sync --direction pull` sets the item's `status` back to
  `"candidate"`.
- AC-3: Given the same setup but the item's `status` is `"scheduled"` or `"done"`, running `issues
  sync --direction pull` never changes that item's `status`, regardless of the fetched issue's
  state.
- AC-4: Given a fetched issue with `state: "open"` and no existing backlog item referencing its
  number, running `issues sync --direction pull` creates exactly one new backlog item with `id:
  gh-issue-<number>`, `source: { kind: "github-issue" }` (no `workId`), and `externalRef` set to
  that issue's `{provider: "github", number, url}`.
- AC-5: Given a fetched issue with `state: "closed"` and no existing backlog item referencing its
  number, running `issues sync --direction pull` creates no new backlog item.
- AC-6: Given a backlog item with `status: "candidate"` and no `externalRef`, running `issues sync
  --direction push` calls `gh issue create` exactly once for that item and sets its `externalRef`
  to the created issue's `{provider: "github", number, url}`, leaving `status` as `"candidate"`.
- AC-7: Given a backlog item with `status: "done"` (or `"dismissed"`) and an `externalRef` pointing
  to an issue the fetched snapshot reports as `state: "open"`, running `issues sync --direction
  push` calls `gh issue close` exactly once for that issue with reason `"completed"` (or `"not
  planned"` for `"dismissed"`).
- AC-8: Running `issues sync --dry-run` (any direction) makes zero calls to
  `GhAdapter.createIssue`/`closeIssue`/`ensureLabel` and performs zero writes to `items.yaml`,
  while still returning the same shaped `IssueSyncResult` describing what would have happened.
- AC-9: `npm run verify` (typecheck, full test suite, build, smoke CLI, skill lint) exits 0,
  including the updated `scripts/skills-contract.test.mjs` support-array assertion.

## Decisions and open questions

- Decided (user, this session): pull imports all open issues, no label filter.
- Decided (user, this session): push is automatic for every unlinked candidate, no per-item opt-in.
- Decided: closed issues with no existing backlog link are never imported as fresh candidates —
  only issues the backlog already references get their closed state reflected on pull. This
  prevents importing a repo's entire closed-issue history as dead backlog noise on the first sync.
- Decided: `"scheduled"` and `"done"` items are immune to pull's status flips — only `"candidate"`
  ↔ `"dismissed"` moves automatically; an actively-bound-to-a-Change or already-shipped item is
  never silently reopened or dismissed by an incidental external event.
- Decided: `gh` CLI over a GitHub SDK dependency, matching the project's CLI-only philosophy and
  reusing the user's existing authenticated session with no new credential-handling surface.
- No open question remains that could change scope, interfaces, or acceptance.
