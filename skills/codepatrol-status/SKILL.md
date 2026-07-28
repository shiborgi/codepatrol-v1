---
name: codepatrol-status
description: (codepatrol) Render the deterministic Change Kanban with Backlog, Plan, Review, Apply, Verify and Close columns plus compact harness/attempt/time/token cells, then report exact resume actions. Use to inspect lifecycle state; never mutate it.
---

# Codepatrol Status

Act as the read-only Dispatcher in [ROLES.md](../_shared/ROLES.md).
Follow the portable [execution protocol](../_shared/EXECUTION.md) when inspection is delegated.

Run `scripts/render-kanban.mjs --workspace "$PWD" --format markdown`. Add
`--all` only when the user asks for terminal Changes; add `--as-of <ISO>` only
when the user explicitly wants active intervals advanced to that time.

Reproduce the script output verbatim. Do not construct, reorder, embellish or
repair the table manually. Each row joins one local Work record and its
optional Change by exact work id; columns are exactly Backlog, Plan, Review,
Apply, Verify and Close. Each populated stage cell contains exactly the
harness, latest attempt, active time and token total with measured-run
coverage. The Backlog cell identifies the row as `[pN] <work-id>`; a
historical Change without Work renders a `[--] <work-id>` fallback. The table
never contains branch, total or next-action prose.

After the table, repeat each projected `nextAction` exactly, taken from
`codepatrol next` or `codepatrol change summary`. If there are no rows, say
the active board is empty and offer `codepatrol-plan` for new work. Never
select by recency, invoke another lifecycle skill or mutate files/refs.
