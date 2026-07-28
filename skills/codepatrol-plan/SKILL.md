---
name: codepatrol-plan
description: (codepatrol) Start or resume one branch-backed Change and turn a project, feature, architecture assessment, or bug symptom into a decision-complete specification and executable plan. Use for the Plan stage; never implement production code.
---

# Codepatrol Plan

Act as the Architect in [ROLES.md](../_shared/ROLES.md). Follow
[CHANGE.md](../_shared/CHANGE.md), [SESSION.md](../_shared/SESSION.md), [STAGE-IO.md](../_shared/STAGE-IO.md), and the
portable [execution protocol](../_shared/EXECUTION.md).

## Bind or start exactly one Change

Use `codepatrol next --stage plan` to discover active Changes, review the prioritized backlog, or confirm how to start a new one.

If a work id is supplied, run `codepatrol change inspect --id <work-id>` and
continue only when the projection says Plan on branch
`codepatrol/<work-id>`. Otherwise require a clean trusted Git checkout and use
`change start --input -` with a collision-safe `YYYY-MM-DD-slug`, title, current
target branch, actor and exact Plan next action. The command creates and checks
out the feature branch. Never infer an id by recency.

Capture the run start time immediately. Prime the current Stage Session. When
resuming a stage another harness began, re-prime the Stage Session first and
read its `status` projection before claiming. For a
brownfield Change, sync the graph once, read `CONTEXT.md` and `docs/adr/`,
trace relevant modules/callers/tests and record absent substrates.
Use the appropriate supporting skills for bug diagnosis, domain language,
module/seam design, external evidence, simplification and executable planning.

If resuming after a return from Review or Verify, explicitly read all markdown files in the returning stage's directory (e.g., `review/` or `verify/`) to aggregate and address all findings from all parallel personas. The close stage now includes an opt-in push suggestion.

For a brownfield Change, also read the most recent `.codepatrol/docs/improvement-reports/*.md` (sorted by file mtime, take the most recent) and surface its top three `Recommendations` bullets as `Improvement signals:` lines in the new spec's Intent section. If no mirror exists yet, record `Improvement signals: none — first Change on this workspace.` and continue.

When investigation shows the work exceeds one bounded Change, call `codepatrol backlog add --input -` for each follow-up with an explicit new work id, priority and description (`{ "workId": "YYYY-MM-DD-slug", "priority": "p0|p1|p2|p3", "description": "..." }`) so each is queryable by exact identity and surfaced by `next --stage plan` and the Kanban Backlog column. After calling `backlog add`, the caller MUST commit exactly that one Work file (`git add .codepatrol/work/<new-work-id>.yaml && git commit -m <message>`) before the next Change transition; the `backlog add` CLI does not commit on its own — it only writes the file — so an uncommitted Work record before a checkpoint produces `CHANGE_CONFLICT: Checkpoint has undeclared worktree paths`. No network access is required. The follow-up Change is then started later by that same work id.

## Produce the Plan artifacts

Write only:

- `.codepatrol/changes/<work-id>/plan/spec.md` using
  [SPEC-FORMAT.md](../_shared/SPEC-FORMAT.md);
- `.codepatrol/changes/<work-id>/plan/plan.md` using
  [PLAN-FORMAT.md](../writing-plans/PLAN-FORMAT.md);
- governing evidence beneath `plan/evidence/`.

The specification must settle scope, interfaces, invariants, failures,
rollout, risks and observable `AC-N` criteria. The plan must map every criterion
to dependency-ordered tasks, exact files/interfaces, red-capable checks and
expected results. Another harness must need no conversation history.

## Seal and stop

Before hashing or checkpointing, re-read `spec.md` and `plan.md`
end-to-end once as a single self-check: confirm no section states a
fact (scope, placement, a required field, a line count) that another
section contradicts, and confirm every task that instructs inserting
literal multi-block content (multiple fenced code blocks, tables, or
other structured content) into a target file is structurally valid as
written — in particular, that no fence is nested inside another fence
of the same or shorter delimiter length. This is a lightweight
author-side pass, not a substitute for Review's independent judgment.

Record one finished Plan run with actual provider/harness tokens or explicit
`unavailable`, start/finish timestamps and elapsed milliseconds. Hash and
declare every Plan artifact, then submit a `checkpoint` transition with stage
`plan`, result `ready`, and exact next action
`codepatrol-review <work-id> on codepatrol/<work-id>`. The orchestrator creates
the checkpoint and advances the projection to Review.

Report the work id, branch, target/base, artifact paths, metrics coverage and
risks. Finally, run `codepatrol change summary --id <work-id>` and print its output verbatim. Do not invoke Review or edit production code.
