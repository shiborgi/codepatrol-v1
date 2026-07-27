# Plan evidence — self-consistency/fence-structure self-check for codepatrol-plan

## Backlog item and source

Item `review-stage-returned-times-surface-the-top-review-defects-to-the-next-plan-and-consider-a-pre-review-assess-change-precondition`
(p2, workflow, source `close-trace`/`2026-07-26-document-transition-close-payloads`,
count 1, first/lastSeenAt `2026-07-27T00:30:07.613Z`). Auto-generated
recommendation text: "Review stage returned 2+ times — surface the top
review defects to the next Plan and consider a pre-Review `assess-change`
precondition."

## Concrete evidence: the two real returns that produced this recommendation

`.codepatrol/changes/2026-07-26-document-transition-close-payloads/close/improvement-report.md`
records both returns verbatim (also mirrored at
`.codepatrol/docs/improvement-reports/2026-07-26-document-transition-close-payloads.md`):

1. **review/1 → plan** (`2026-07-26T23:35:29.599Z`): "T1 omits accepted
   optional checkpoint/return fields despite AC-1 field-completeness, and
   Scope conflicts with T1/T2 on insertion location." Root cause, read
   directly from that Change's `plan/spec.md` at the time: `Scope` (line 20)
   stated the new sections go "directly under their existing one-line
   command references (lines 9 and 12)" while `Proposed design` (line 44)
   and `plan.md`'s T1/T2 both said "after line 38" — a **self-contradiction
   within the same spec.md**, not an external-fact error. Independently
   confirmable by grep for both phrases in the same file without reading
   any other artifact.
2. **review/2 → plan** (`2026-07-27T00:02:13.743Z`): T1/T2 wrapped a
   multi-part Markdown insertion (prose + table + several JSON examples) in
   an outer ` ```markdown ` fence with same-length ` ```json ` fences nested
   inside — a **CommonMark fence-nesting defect**: the first bare ` ``` `
   line closes the outer fence prematurely, so the literal instruction, if
   followed, ships broken Markdown. Confirmed independently by comparing the
   proposed structure against the file's own real, already-shipped
   `session.json` block (`skills/_shared/CODEPATROL-CLI.md:23-38`, no
   wrapper) and by writing and running a small Node script that reproduces
   the parse failure on the wrapped form and the correct pass on the flat
   form (see that Change's `review/report.md` and `apply/journal.md`).

Both defects were **self-contained within the Plan's own artifacts** —
neither required reading application source, external docs, or any
information the Architect didn't already have while writing the spec/plan.
Each is the kind of defect a careful, dedicated re-read of the finished
spec.md + plan.md (for #1) or a mechanical structure check on any task that
proposes literal multi-block content (for #2) would have caught before
checkpointing.

## Elapsed cost of the two returns (why this is worth fixing)

From the same improvement report's "Elapsed per stage": `plan` totaled
2,741,443 ms (~46 min) across 3 attempts; `review` totaled 2,612,946 ms
(~44 min) across 3 attempts (2 of which ended in `fix-first`). Not all of
this is attributable to the two findings (evidence-gathering and writing
take time regardless), but each return cycle requires a full begin/prime/
claim/read/write/checkpoint round-trip on both sides — concrete, non-trivial
overhead for defects that were self-contained and self-detectable.

## Existing mechanisms checked (to avoid duplicating what's already there)

- `skills/codepatrol-plan/SKILL.md:31`: "If resuming after a return from
  Review or Verify, explicitly read all markdown files in the returning
  stage's directory... to aggregate and address all findings" — this
  already covers *reacting* to a return once it happens. It does not cover
  *avoiding* a first return via self-check before the first checkpoint.
- `skills/codepatrol-plan/SKILL.md:33`: "Improvement signals" — surfaces the
  most recent improvement report's top-3 `Recommendations` bullets into the
  *next* Change's spec Intent section. This *will* automatically surface
  this exact recommendation's one-line text to the next Change (already
  observed: `2026-07-26-document-transition-close-payloads`'s own spec.md
  Intent correctly surfaced its predecessor's top-3 recommendations). But a
  one-line recommendation ("Review stage returned 2+ times — surface...")
  carries no actionable, generalizable guidance for an *unrelated* future
  Change — it doesn't teach "check your spec for internal contradictions"
  or "don't nest same-length Markdown fences," it just names that returns
  happened. Confirmed by reading the mechanism's own generated output
  (`spec.md:10` of `2026-07-26-document-transition-close-payloads`, already
  closed) — the surfaced line is opaque without also reading the full
  improvement report.
- `grep -n "assess-change" skills/*/SKILL.md`: only
  `skills/codepatrol-review/SKILL.md:27` and
  `skills/codepatrol-verify/SKILL.md:28` invoke it. Neither
  `codepatrol-plan/SKILL.md` nor `codepatrol-apply/SKILL.md` does. Confirms
  the backlog item's second clause ("consider a pre-Review assess-change
  precondition") describes something that does not exist yet.
- `skills/assess-change/SKILL.md` read in full: it is "the read-only
  assessment engine behind `codepatrol-review` and `execute-change` gates"
  — a general-purpose, thorough, multi-axis (contract/code/simplicity)
  assessment tool designed for an *independent* reviewer with fresh eyes,
  not designed or scoped as a lightweight author self-check.

## Precedent for scope discipline on process/workflow Changes

`2026-07-25-session-input-validation` and
`2026-07-26-document-transition-close-payloads` (both closed) are the direct
precedent for fixing a recurring `INVALID_ARGUMENT`/workflow-friction
pattern with a narrow, evidenced, doc/instruction-only change rather than a
heavier mechanism — both explicitly rejected broader validator/tooling
changes in their own Alternatives sections in favor of the smallest fix that
addresses the concretely evidenced defect class.
