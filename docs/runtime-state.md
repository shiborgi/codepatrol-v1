# Runtime state

Everything below `.codepatrol/runtime/` is local, ignored and rebuildable:

```text
graph/graph.json
sessions/<work-id>/<stage>/<attempt>.json
evaluations/
locks/
tmp/
version.json
```

The graph cache is rebuildable. Locks provide atomic recovery. Temporary
inputs are removed after use. Evaluations keep only bounded summaries
explicitly required by their owner.

A Stage Session may store task dependencies, claim, concise conclusion,
artifact paths and next action. It must not store lifecycle stage/revision,
approval, terminal outcome, raw logs, prompts, conversations or credentials.
Missing/corrupt sessions are discarded and rebuilt from the current Change.

No root `.codepatrol` scratch JSON, duplicate status cache, architecture
namespace or durable ADR is supported. Durable project decisions belong in
`CONTEXT.md`, `docs/adr/` or declared Change evidence.

The structured backlog at `.codepatrol/backlog/items.yaml` is the sanctioned
follow-up queue: a tracked, schema-validated top-level file (not rebuildable
runtime, not a per-Change artifact), auto-fed from Close trace analysis and
Plan splits, surfaced by `codepatrol next --stage plan` and the Kanban's
Backlog column.

`.codepatrol/docs/` is gitignored, rebuildable local-mirror state: local,
human-browsable copies of artifacts that are already durable elsewhere. It is
never itself a source of truth — losing or deleting anything below it loses
no information. Its first occupant is the improvement-report mirror
(`.codepatrol/docs/improvement-reports/<work-id>.md`), copied from the durable
`.codepatrol/changes/<work-id>/close/improvement-report.md`.
