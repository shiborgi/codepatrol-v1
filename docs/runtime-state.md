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

No root `.codepatrol` scratch JSON, global ledger, duplicate status cache,
architecture namespace or durable ADR is supported. Durable project decisions
belong in `CONTEXT.md`, `docs/adr/` or declared Change evidence.
