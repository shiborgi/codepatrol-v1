# Specification — Add self-consistency and fence-structure self-check to codepatrol-plan's seal step

## Intent

- Origin: improve-codebase
- Mode: bug
- Target baseline: `main` @ `3b8ffb3` (branch `codepatrol/2026-07-27-plan-self-consistency-check`), clean tree
- Governing constraints: `skills/_shared/CHANGE.md` (stage ownership: Plan owns `plan/`); `skills/codepatrol-plan/SKILL.md` is the file this Change edits; no ADR exists in this repo (absent by design)
- Substrate state: graph not consulted — skill instruction files are not indexed by the code graph; this is a documentation/process-instruction change with no symbol-level dependency
- Improvement signals (from `.codepatrol/docs/improvement-reports/2026-07-26-document-transition-close-payloads.md`, most recent by mtime): "Review stage returned 2+ times — surface the top review defects to the next Plan and consider a pre-Review `assess-change` precondition." (this Change directly addresses it); "Top error code: CHANGE_INVALID (1)... Investigate..." (single-occurrence workflow noise from a stage-transition edge case, not independently actionable — see Out of scope); "Command `change.session` was invoked 49 times..." (workflow/tooling concern, unrelated file, independently tracked backlog item, not actionable here).
- Problem: the immediately preceding Change (`2026-07-26-document-transition-close-payloads`) was returned from Review twice. Both returns were for defects entirely self-contained within the Plan's own artifacts, discoverable without reading anything the Architect didn't already have: (1) `spec.md`'s Scope section directly contradicted its own Proposed design section on where new content should be inserted; (2) a Plan task instructed inserting literal multi-block Markdown content wrapped in a fence-nesting pattern that CommonMark parses incorrectly, which — if executed literally — ships broken documentation, and which was verifiable by comparing against the target file's own existing real structure. Neither defect required Review's independent perspective to catch; a deliberate self-check before checkpointing would have caught both, saving a full return/re-plan/re-review round-trip each time (evidenced elapsed cost: ~46 min Plan + ~44 min Review across the 3 resulting attempts).
- Outcome: `skills/codepatrol-plan/SKILL.md`'s "Seal and stop" section gains one explicit self-check step, performed after the Plan artifacts are written but before hashing/checkpointing: (a) re-read `spec.md` and `plan.md` end-to-end once specifically to confirm no section contradicts another on scope, placement, or the same fact stated twice; (b) for any task that instructs inserting literal multi-block content (multiple fenced code blocks, tables, or other structured content) into a target file, mechanically or visually confirm the proposed structure is valid as written — in particular, no fence is nested inside another fence using the same or a shorter delimiter length.

## Scope

### In scope

- Add a new paragraph to `skills/codepatrol-plan/SKILL.md`'s "## Seal and stop" section, before the existing "Record one finished Plan run..." paragraph, instructing the two self-checks above.
- Ground the instruction in the two concrete, generalizable failure classes evidenced by this Change (self-contradiction between sections; fence-nesting in literal multi-block content), stated abstractly enough to apply to any future Plan, not just documentation-editing ones.

### Out of scope

- Adding an `assess-change` invocation to Plan (the backlog recommendation's second, hedged clause: "consider a pre-Review assess-change precondition") — rejected; see Alternatives.
- Any change to `codepatrol-review/SKILL.md`, `codepatrol-verify/SKILL.md`, or `assess-change/SKILL.md` — those skills already invoke `assess-change` and are unaffected by this Change, which only adds an author-side pre-check to Plan.
- The single-occurrence `CHANGE_INVALID: Cannot begin plan attempt 1.` sample from the same improvement report — this is expected, correct behavior (attempt 1's Plan begins implicitly via `change start`'s own `change-started` event; a caller submitting an explicit redundant `begin` for attempt 1 is rejected by design, confirmed by direct reproduction and by `src/change/types.ts`'s `ChangeStartedEvent` shape), not a defect; not independently actionable as a code fix.
- The `change.session`/`change.transition` invocation-count Recommendations — unrelated files, independently tracked backlog items (`command-change-session-was-invoked-times-...`, `command-change-transition-was-invoked-times-...`).
- `session-item(s) claimed but never closed` Recommendation — a harness-handoff artifact that self-resolves on re-prime (observed directly this session, multiple times), not a code or instruction defect.
- Any change to `PLAN-FORMAT.md`, `SPEC-FORMAT.md`, or other shared format docs — the self-check is a *process step* the Architect performs, not a new requirement on the artifacts' own format/content, so it belongs in the skill's own procedural instructions, not the format specs.

## Current evidence

See `plan/evidence/investigation.md` for the full trace: both returns'
exact reasons and root causes (re-derived from the closed Change's own
`review/report.md` and `close/improvement-report.md`), confirmation that
`assess-change` is invoked only by `codepatrol-review`/`codepatrol-verify`
today (not `codepatrol-plan`), and the elapsed-time cost of the two
round-trips.

Key facts restated:

- Both returns' root causes were self-contained within the Plan's own
  artifacts (no external fact was misread).
- `skills/codepatrol-plan/SKILL.md:31` already handles *reacting* to a
  return (reading `review/`'s markdown files when resuming); it does not
  cover *preventing* a first return.
- `skills/codepatrol-plan/SKILL.md:33`'s "Improvement signals" mechanism
  will already surface this recommendation's one-line text to the *next*
  Change automatically — but a one-liner naming that returns happened
  carries no generalizable, actionable guidance for a future, unrelated
  Change on its own.

## Proposed design

Insert, in `skills/codepatrol-plan/SKILL.md`'s "## Seal and stop" section,
immediately before the existing first paragraph ("Record one finished Plan
run..."), the following new paragraph:

```markdown
Before hashing or checkpointing, re-read `spec.md` and `plan.md` end-to-end
once as a single self-check: confirm no section states a fact (scope,
placement, a required field, a line count) that another section
contradicts, and confirm every task that instructs inserting literal
multi-block content (multiple fenced code blocks, tables, or other
structured content) into a target file is structurally valid as written —
in particular, that no fence is nested inside another fence of the same or
shorter delimiter length. This is a lightweight author-side pass, not a
substitute for Review's independent judgment.
```

No code changes; no changes to any other skill file. The new paragraph is
placed in `codepatrol-plan/SKILL.md` specifically (not a shared `_shared/`
file) because this self-check is a Plan-stage-specific procedural step, not
a cross-stage contract rule.

## Alternatives

- **Add an `assess-change` invocation to `codepatrol-plan`, run by the
  Architect on its own artifacts before checkpointing** (the backlog
  recommendation's literal second clause): rejected. `assess-change` is
  designed and scoped as an independent reviewer's tool ("read-only
  assessment engine behind `codepatrol-review`"); having the same persona
  that just wrote the spec also run the full assessment against itself has
  a known blind-spot risk (an author is less likely to catch their own
  contradictions than an independent reviewer, which is exactly why
  Review exists as a separate stage/persona in this lifecycle's design).
  It is also heavier than the evidence justifies: both real defects were
  simple, mechanical, self-contained checks, not failures of contract or
  code-axis judgment that `assess-change`'s full multi-axis machinery is
  built for. A lightweight, targeted self-check paragraph is proportionate;
  a full redundant assessment invocation is not.
- **Add the self-check to `_shared/CHANGE.md` or `_shared/EXECUTION.md`
  instead, as a cross-stage rule**: rejected — the two evidenced defect
  classes (spec/plan internal contradiction; literal-content fence
  structure) are specific to the *authoring* of Plan artifacts, not a
  general lifecycle rule every stage needs; Apply, Verify, and Close don't
  author multi-section specs or literal fenced-content insertions in the
  same way.
- **Do nothing; rely on the existing "Improvement signals" mechanism to
  surface the recommendation text and trust the next Architect to infer
  the lesson**: rejected — evidenced as insufficient on its own (see
  Current evidence: a one-line recommendation carries no generalizable
  guidance); this Change makes the lesson durable and actionable instead
  of relying on inference from a terse auto-generated bullet.

## Simplicity decision

- Selected rung: direct local change (one instruction paragraph in one
  skill file)
- Earlier rungs: not applicable — there is no lighter mechanism than
  stating the two lessons directly in the stage's own procedural
  instructions; both are genuinely novel information not already covered
  by the existing "Seal and stop" text.
- Irreducible complexity: none introduced — this only adds a checking step
  to an existing human/agent-readable process document, no new tooling,
  dependency, or code path.
- Safety floor: the paragraph is instructional prose only; it cannot be
  automatically verified by a test (skill files are not executable code),
  so acceptance is direct textual confirmation the paragraph exists,
  states both checks, and `npm run lint:skills` (which validates skill
  catalog/frontmatter/links) still passes.
- Expected surface delta: `skills/codepatrol-plan/SKILL.md` only, +~10
  lines (one paragraph). No new files, no dependency, no code change.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | No `assess-change` (or any tooling) invocation added to Plan — the self-check is unenforced prose, relying on the Architect actually performing it | A future Plan attempt could still skip the self-check and ship a self-contradictory or structurally-broken artifact, caught only by Review as before | A future improvement-report shows the same return-cause pattern (self-contained spec contradiction or fence-nesting) recurring after this Change ships, despite the new instruction | Escalate to a mechanical check (e.g., a lint script Plan runs before checkpointing) informed by the specific recurring pattern, rather than speculatively building one now for a single historical instance |

## Compatibility and rollout

- No migration, no code change, no config/schema/event/checkpoint change.
- Rollback: revert the single commit; `codepatrol-plan/SKILL.md` reverts to
  its current content, byte-identical.
- Observability: not applicable — prose-only change with no runtime effect;
  its effectiveness (fewer self-contained-defect returns) would only be
  observable over several future Changes' improvement reports, not by this
  Change's own verification.

## Risks and mitigations

- Risk: the new paragraph is read but not actually followed (prose
  guidance has no enforcement mechanism). Mitigation: explicitly named as
  DC-1 rather than silently assumed to be sufficient; the upgrade path
  (a mechanical check) is stated for if the pattern recurs.
- Risk: over-instructing the Architect with process steps that don't
  generalize well beyond the two specific incidents that prompted them.
  Mitigation: both checks are stated at a general level ("no section
  contradicts another", "no same-length nested fence") rather than
  referencing the specific prior Change by name, so they read as durable
  guidance, not a one-off patch.

## Acceptance criteria

- AC-1: `skills/codepatrol-plan/SKILL.md`'s "## Seal and stop" section contains a new paragraph, positioned before the existing "Record one finished Plan run..." paragraph, instructing a self-check of `spec.md`/`plan.md` for internal self-contradiction before hashing/checkpointing.
- AC-2: The same paragraph (or an adjacent one in the same section) instructs checking that any task proposing literal multi-block content insertion is structurally valid, explicitly naming the same-or-shorter-length nested-fence hazard.
- AC-3: The paragraph explicitly frames the check as a lightweight author-side pass, not a replacement for Review's independent judgment (preserving the existing Plan/Review separation of concerns).
- AC-4: No other section of `skills/codepatrol-plan/SKILL.md` (or any other skill file) is modified — the diff is confined to one new paragraph in one existing section.
- AC-5: `npm run lint:skills` passes unchanged.

## Decisions and open questions

- Decision: instruction-only (prose) fix, no tooling/`assess-change`
  invocation added — matches the evidence's actual shape (both defects
  were simple, mechanical, and self-contained) and avoids the blind-spot
  risk of self-assessment replacing independent Review.
- Decision: the paragraph lives in `codepatrol-plan/SKILL.md` specifically,
  not a `_shared/` file — this is a Plan-stage-specific authoring
  discipline, not a cross-stage contract rule.
- No open questions remain that could change scope, interfaces, or
  acceptance.
