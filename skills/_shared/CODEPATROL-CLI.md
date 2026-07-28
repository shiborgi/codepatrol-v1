# Codepatrol CLI

Prefer JSON for lifecycle and graph operations consumed by another step:

```bash
codepatrol status --workspace "$PWD" --format json
codepatrol change start --input change.json --workspace "$PWD" --format json
codepatrol change inspect --id <work-id> --workspace "$PWD" --format json
codepatrol change transition --id <work-id> --input transition.json --workspace "$PWD" --format json
codepatrol change session --id <work-id> --input session.json --workspace "$PWD" --format json
codepatrol change doctor --id <work-id> --workspace "$PWD" --format json
codepatrol change close --id <work-id> --input close.json --workspace "$PWD" --format json
codepatrol backlog add --input work.json --workspace "$PWD" --format json
codepatrol backlog list [--status open|done|dismissed] --workspace "$PWD" --format json
codepatrol backlog resolve --id <work-id> --status done|dismissed --workspace "$PWD" --format json
codepatrol backlog migrate [--dry-run] --workspace "$PWD" --format json
codepatrol issues sync [--dry-run] --workspace "$PWD" --format json
codepatrol sync [--target-branch <name>] [--dry-run] --workspace "$PWD" --format json
node --import jiti/register scripts/render-kanban.mjs --workspace "$PWD" --format markdown

codepatrol graph sync --workspace "$PWD" --format json
codepatrol graph overview --workspace "$PWD" --format json
codepatrol graph outline --file src/example.ts --workspace "$PWD" --format json
codepatrol graph find --query Example --workspace "$PWD" --format json
codepatrol graph neighbors --file src/example.ts --relation tests --workspace "$PWD" --format json
codepatrol graph impact --since-ref HEAD~30 --workspace "$PWD" --format json
```

`work.json` for `backlog add` names one explicit Work record:

```json
{ "workId": "YYYY-MM-DD-slug", "priority": "p0|p1|p2|p3", "description": "..." }
```

Local Work records at `.codepatrol/work/<work-id>.yaml` are the offline
authority for the backlog; `issues sync`/`sync --issues` is the only network
path and publishes them one-way to GitHub issues titled `[pN] <work-id>`.

`session.json` for `change session` carries `action`, `stage`, `attempt`, and
the fields that action needs (`itemId`/`actor` for `claim`; `itemId`/`result`/
`artifacts` for `close`); `stage`/`attempt` must come from a fresh `change
inspect` projection, never assumed or hardcoded:

```json
{
  "action": "close",
  "stage": "apply",
  "attempt": 1,
  "itemId": "t1-note-store",
  "actor": "claude-sonnet-5",
  "result": "note store implemented, tests green",
  "artifacts": ["src/store/note-store.ts"]
}
```

`transition.json` for `change transition` has six `type` variants, each
with its own exact field set (no variant accepts a field outside its own
list):

| Variant | Required fields | Optional fields |
|---|---|---|
| `begin` | `type`, `actor`, `stage`, `nextAction` | — |
| `usage` | `type`, `actor`, `stage`, `run` | — |
| `checkpoint` | `type`, `actor`, `stage`, `result`, `artifacts`, `nextAction` | `changes` (required when `stage: "apply"`, forbidden otherwise), `persona` |
| `return` | `type`, `actor`, `stage`, `toStage`, `reason`, `nextAction` | `persona`, `reasons` |
| `block` | `type`, `actor`, `stage`, `reason`, `nextAction` | — |
| `resume` | `type`, `actor`, `stage`, `nextAction` | — |

`persona` (checkpoint/return) marks a per-persona sub-checkpoint or
sub-return within a parallel Review/Verify (e.g. `review-security`,
`review-architecture`). `reasons` (return only) is populated on a later
*consolidating* (non-persona) return that aggregates each sub-persona's
individual reason string — it is not set on a single-persona return.

```json
{ "type": "begin", "actor": "claude-sonnet-5", "stage": "plan", "nextAction": "codepatrol-review <work-id> on codepatrol/<work-id>" }
```

```json
{ "type": "usage", "actor": "claude-sonnet-5", "stage": "plan", "run": { "id": "plan-1", "started_at": "2026-01-01T00:00:00Z", "finished_at": "2026-01-01T00:05:00Z", "elapsed_ms": 300000, "characters": { "status": "unavailable", "reason": "harness exposes no authoritative per-run token/character usage hook" } } }
```

```json
{ "type": "checkpoint", "actor": "claude-sonnet-5", "stage": "plan", "result": "ready", "artifacts": [ { "path": ".codepatrol/changes/<work-id>/plan/spec.md", "sha256": "<64-hex>", "intent": "create" } ], "nextAction": "codepatrol-review <work-id> on codepatrol/<work-id>" }
```

```json
{ "type": "checkpoint", "actor": "claude-sonnet-5", "stage": "apply", "result": "implemented", "artifacts": [ { "path": ".codepatrol/changes/<work-id>/apply/journal.md", "sha256": "<64-hex>", "intent": "create" } ], "changes": ["src/example.ts"], "nextAction": "codepatrol-verify <work-id> on codepatrol/<work-id>" }
```

```json
{ "type": "return", "actor": "claude-sonnet-5", "stage": "review", "toStage": "plan", "reason": "fix-first: <concrete reason>", "nextAction": "codepatrol-plan <work-id> on codepatrol/<work-id>" }
```

```json
{ "type": "block", "actor": "claude-sonnet-5", "stage": "apply", "reason": "<external blocker>", "nextAction": "<corrective action>" }
```

```json
{ "type": "resume", "actor": "claude-sonnet-5", "stage": "apply", "nextAction": "codepatrol-apply <work-id> on codepatrol/<work-id>" }
```

`checkpoint`'s `result` is stage-locked: `plan`→`"ready"`,
`review`→`"approve"`, `apply`→`"implemented"`, `verify`→`"commit"`
(`close` never checkpoints via `transition`). Each `artifacts[]` entry's
`intent` is `"create"`, `"modify"`, or `"delete"` — no default, no
`"update"`. `return`'s `stage` is only `review`/`apply`/`verify`; its
`toStage` is only `plan`/`apply`.

`close.json` for `change close` carries exactly `outcome`
(`"commit"|"rollback"`), `actor`, and `authority` (a free-text justification
for the action, not a fixed enum); Close is fully local — no `push` field,
no remote action:

```json
{ "outcome": "commit", "actor": "claude-sonnet-5", "authority": "User selected commit via AskUserQuestion for <work-id>; ran `codepatrol sync --target` afterward to push." }
```

Lifecycle commands require an explicit work id; none select by recency. All
durable lifecycle mutations pass through the four-function Change seam. Status
and the Kanban script share one pure projector. Stage Sessions are rebuildable;
`change doctor` may rebuild runtime but never refresh hashes, alter events,
repair source or mutate refs.

Treat graph edges as leads and verify cited locations directly. A missing or
stale graph may be synced once by the coordinator. User-controlled paths remain
workspace-relative and symlink-contained. All writers use locks, cancellation
checks and atomic replacement; Git commands use argv arrays and local refs only.
