# Stage Input/Output contract

All Codepatrol lifecycle skills must use the uniform Stage I/O entry and exit commands to provide a consistent, deterministic projection to the harness.

## Entry

When a lifecycle skill begins, it should use the `next` command to retrieve its list of actionable items.
```bash
codepatrol next --stage <stage>
```
Depending on the stage, the command provides specific affordances (e.g. Plan may indicate how to start a new change; Close will output `commit`, `commit+push`, `rollback`).

## Exit

When a lifecycle skill completes its work and explicitly seals the checkpoint (or transitions state), it must summarize its final verdict and the next action verbatim:
```bash
codepatrol change summary --id <work-id>
```
This guarantees the harness and operator see the uniform `Summary:`, `Verdict:`, and `Next:` lines across all skills.
