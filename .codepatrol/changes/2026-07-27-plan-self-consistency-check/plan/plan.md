# Plan — Add self-consistency and fence-structure self-check to codepatrol-plan's seal step

- Work id: `2026-07-27-plan-self-consistency-check`
- Governing spec: `spec.md`
- Target baseline: `main` @ `3b8ffb3` (branch `codepatrol/2026-07-27-plan-self-consistency-check`)

## Goal and approach

The immediately preceding Change was returned from Review twice, both times
for defects self-contained within the Plan's own artifacts (a spec
self-contradiction; a fence-nesting structural defect in literal
multi-block content). Add one instruction paragraph to
`skills/codepatrol-plan/SKILL.md`'s "Seal and stop" section directing the
Architect to self-check for both failure classes before checkpointing.
Doc-only; no code change; no tooling/`assess-change` invocation added.

## Global constraints

- The new paragraph must state both checks generally (not by referencing
  the specific prior Change), so it reads as durable guidance.
- `skills/codepatrol-plan/SKILL.md`'s existing content stays byte-identical
  outside the one new paragraph.
- `npm run lint:skills` must pass after the edit.

## Simplicity proof

- Selected rung: direct local change (documentation/instruction only)
- Reused capabilities: the existing "Seal and stop" section's own
  paragraph structure and tone.
- Forbidden speculative surface: no `assess-change` invocation added to
  Plan (DC-1 in spec.md); no change to any other skill file.
- Expected surface delta: `skills/codepatrol-plan/SKILL.md` only, +~10
  lines.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T1 | Read the new paragraph's position and content against `SKILL.md`'s current "Seal and stop" section |
| AC-2 | T1 | Read the same paragraph for the fence-nesting instruction |
| AC-3 | T1 | Read the same paragraph for the "not a replacement for Review" framing |
| AC-4 | T2 | `git diff` shows exactly one new paragraph, no other line touched |
| AC-5 | T2 | `npm run lint:skills` |

## Dependency order

`T1 → T2` (single content task, then final verification).

### T1 — Insert the self-check paragraph

**Purpose:** Add the self-consistency and fence-structure self-check
instruction. Satisfies AC-1, AC-2, AC-3.

**Depends on:** None

**Files:**

- Modify: `skills/codepatrol-plan/SKILL.md`

**Steps:**

1. Re-read the current `## Seal and stop` section
   (`skills/codepatrol-plan/SKILL.md`, the section beginning "## Seal and
   stop" and ending at the file's last line) fresh, immediately before
   writing, to confirm the exact current paragraph boundaries and text.
2. Insert, as a new paragraph immediately after the `## Seal and stop`
   heading and immediately before the existing "Record one finished Plan
   run..." paragraph:

   ```markdown
   Before hashing or checkpointing, re-read `spec.md` and `plan.md`
   end-to-end once as a single self-check: confirm no section states a
   fact (scope, placement, a required field, a line count) that another
   section contradicts, and confirm every task that instructs inserting
   literal multi-block content (multiple fenced code blocks, tables, or
   other structured content) into a target file is structurally valid as
   written — in particular, that no fence is nested inside another fence
   of the same or shorter delimiter length. This is a lightweight
   author-side pass, not a substitute for Review's independent judgment.
   ```

3. Do not touch any other line in the file (heading text, other
   paragraphs, other sections all stay byte-identical).
4. No `npm test`/typecheck applicable (markdown-only edit).

**Task result:** diff appended to `apply/journal.md`.

### T2 — Final verification

**Purpose:** Confirm the inserted paragraph is correctly scoped and the
file remains valid. Satisfies AC-4, AC-5.

**Depends on:** T1

**Files:** None (verification only)

**Steps:**

1. Run `npm run lint:skills`. Expected: passes unchanged (this Change adds
   prose inside an existing section of an already-cataloged skill file; no
   frontmatter, catalog, or link change).
2. Run `git diff --stat` against base (`3b8ffb3`) restricted to production
   paths (`git diff --stat 3b8ffb3 -- . ':!.codepatrol'`). Expected:
   exactly one file, `skills/codepatrol-plan/SKILL.md`.
3. Run `git diff 3b8ffb3 -- skills/codepatrol-plan/SKILL.md` and confirm
   the only change is one added paragraph (all `-` lines: none; all `+`
   lines: the new paragraph only).
4. Read the final file once more end-to-end and confirm the new paragraph:
   states the self-contradiction check (AC-1), states the fence-nesting
   check by name (AC-2), and states it doesn't replace Review (AC-3).

**Task result:** the lint output and `git diff` output are appended to
`apply/journal.md`.
