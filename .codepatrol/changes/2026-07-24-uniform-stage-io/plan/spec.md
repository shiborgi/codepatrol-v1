# Specification — Uniform, harness-independent stage input and output

## Intent

- Origin: improve-codebase
- Mode: architecture
- Target baseline: `main` @ `5674289d953cb32b7b178029e10ca78fdb72141a`; clean worktree; `npm run verify` green at baseline.
- Governing constraints: `CONTEXT.md` (Public Workflow, Change, Stage Attempt, Terminal Outcome); `AGENTS.md` CLI-only contract and the read-only Dispatcher pattern; the existing `codepatrol-status` precedent (CLI renders, skill reproduces verbatim). No ADRs (`docs/adr/` absent). None block this design.
- Substrate state: graph synced (73 files, 1869 symbols); wiki absent (valid substrate state).
- Improvement signals (most recent report `docs/codepatrol/improvement-reports/2026-07-24-architecture-assessment-v2.md`):
  - Command `change.transition` invoked repeatedly — consider caching/batching (recurring; accepted design cost, one event per transition).
  - The v2 assessment recorded no new blocking errors.
- Problem: Each lifecycle stage presents input and output differently, and the wording is produced by the model, so the experience varies by harness and model. On entry, a stage takes a work id (or, for Plan, silently starts a new Change) with no deterministic menu of the Changes actually actionable at that stage. On exit, every stage ends in free-form prose ("Report the …"), so the final summary, verdict, and next step are phrased inconsistently. Only `codepatrol-status` is deterministic (it reproduces a CLI-rendered board verbatim).
- Outcome: Every lifecycle stage begins by reproducing a deterministic, CLI-rendered list of the Changes actionable at that stage (Plan also offers starting a new Change; Close offers commit / commit+push / rollback) and ends by reproducing a deterministic, CLI-rendered `Summary / Verdict / Next` block — identical regardless of harness or model.

## Scope

### In scope

- A new deterministic CLI command `codepatrol next [--stage <plan|review|apply|verify|close>]` that lists the non-terminal Changes whose projected stage matches, each with work id, state, and exact next action, plus stage-specific affordances (Plan: start-new; Close: commit / commit+push / rollback). Text and JSON output.
- A new deterministic CLI command `codepatrol change summary --id <work-id>` that renders a uniform three-part block — `Summary:` (what the current/last stage produced), `Verdict:` (the current stage's last attempt result or state), `Next:` (the exact next action, or the terminal outcome). Text and JSON output.
- Wiring all five lifecycle skills (`codepatrol-plan|review|apply|verify|close`) to reproduce `codepatrol next --stage <stage>` verbatim on entry and `codepatrol change summary --id <work-id>` verbatim on exit, and a shared `skills/_shared/STAGE-IO.md` describing the contract.
- A `scripts/skills-contract.test.mjs` assertion locking the wiring.

### Out of scope

- Changing lifecycle order, transition semantics, checkpoint validation, or the Close Git behavior. `commit+push` already exists via the `push: true` close input; this Change only surfaces it in the list (no orchestrator change).
- `codepatrol-status` (already the deterministic board) — left as the canonical full board; `next` is its stage-scoped, action-oriented sibling.
- The v2 assessment follow-ups (N1–N4) and F2/F6/F7 — separate Changes.
- Any change to `change inspect` (retained as the preflight JSON source).

## Current evidence

- `src/cli/commands.ts:53-147` — command switch; `change.inspect` text is `<id> <stage>#<attempt> <state>\nnext: <nextAction>` (`:116-119`); `status` renders the Kanban (`:53-57`). No stage-scoped list or uniform summary. Confidence: high (read).
- `src/change/board.ts:19-33` — `projectKanban` + `renderKanbanMarkdown` already project every Change's per-stage state and `nextAction`; the new renderers reuse `inspectChanges` + `ChangeView`. Confidence: high.
- `src/cli/args.ts:31-54` — `KNOWN` options and `COMMAND_OPTIONS` map (the valid-command source, now also feeding `KNOWN_COMMANDS`); `command = positionals.slice(0,2).join(".")`. Adding `next` and `change.summary` plus a `--stage` option follows the existing pattern. Confidence: high.
- `src/cli/output.ts:32-63` — `HELP`; `renderOverview`/`renderImpact` are the presentation-layer precedent for the new `renderNext`/`renderSummary`. Confidence: high.
- `skills/codepatrol-status/SKILL.md:11-23` — the "reproduce the script output verbatim … repeat each projected nextAction exactly" precedent this design extends to every stage. Confidence: high.
- `skills/codepatrol-{plan,review,apply,verify,close}/SKILL.md` — each currently says "run `codepatrol change inspect --id`" on entry and "Report …" (free-form) on exit; `close` documents `push: true` at `SKILL.md:37`. Confidence: high.
- `scripts/skills-contract.test.mjs` — existing per-skill assertions (e.g. the SESSION.md and status assertions) provide the seam to lock the new wiring. Confidence: high.
- `src/change/types.ts:3` — `STAGES = ["plan","review","apply","verify","close"]` for `--stage` validation. Confidence: high.
- Baseline: `npm run verify` exits 0 at `5674289`. Confidence: high.

## Proposed design

Deterministic CLI is the single source of the standardized text; skills reproduce it verbatim (the `codepatrol-status` model).

### `codepatrol next [--stage <s>]`

- Data: `inspectChanges(workspace, { all: true })` → filter to non-terminal Changes; when `--stage` is given, keep those whose `view.stage === s`; sort by `created_at`.
- Text (`renderNext`):
  ```
  Changes at <stage>:
  - <work-id> — <state> — next: <nextAction>
  …
  <footer>
  ```
  Footers: Plan → `No work id? Resume one above, or start a new Change (change start with a new YYYY-MM-DD-slug).`; Close → `Per Change, choose: commit | commit+push (push:true) | rollback.`; others → `Resume the chosen work id with codepatrol-<stage>.`. Empty list → `No Changes at <stage>.` plus the Plan start-new line when `--stage plan`.
- JSON: `{ stage, changes: [{ workId, state, nextAction }], startNew: <boolean>, closeOptions?: ["commit","commit+push","rollback"] }`.
- Validation: `--stage` must be in `STAGES`, else `INVALID_ARGUMENT`.

### `codepatrol change summary --id <work-id>`

- Data: the single `ChangeView` for the id.
- Text (`renderSummary`), exactly three labeled lines:
  ```
  Summary: <work-id> "<title>" — <stage>#<attempt> (<state>); active <duration>, tokens <coverage>
  Verdict: <lastAttempt.result ?? lastAttempt.state-for-current-stage>
  Next: <nextAction | "terminal: <outcome> <terminalCommit>">
  ```
- JSON: `{ summary, verdict, next }`.
- Verdict is deterministic: the current stage's last attempt `result` when present, else its `status`; for a terminal Change, the outcome.

### Skills

Each lifecycle skill gains a fixed pair of instructions (per `skills/_shared/STAGE-IO.md`):
- Entry: "Run `codepatrol next --stage <stage>` and reproduce its output verbatim. If the user named a work id, act on it; otherwise choose from the list. (Plan may start a new Change; Close chooses commit, commit+push, or rollback.)"
- Exit: "After sealing, run `codepatrol change summary --id <work-id>` and reproduce its output verbatim as the final report."

`skills/_shared/STAGE-IO.md` documents the two commands and the verbatim rule; `scripts/skills-contract.test.mjs` asserts each of the five lifecycle skills references both commands (and that `close` documents commit+push).

Dependency direction unchanged; new renderers live in the CLI presentation layer; no lifecycle/orchestrator change.

## Alternatives

- **JSON-only CLI + model formats the text.** Rejected by decision: weaker harness/model uniformity than reproduce-verbatim.
- **Skill-prose convention only (no new commands).** Rejected: the model still generates the text, so it varies by harness.
- **Extend `codepatrol status` with `--stage` instead of a new `next`.** Rejected: `status` is the full audit board; a distinct action-oriented `next` keeps the entry menu focused (list + affordances) without overloading the board renderer.
- **Enhance `change inspect` text instead of a new `summary`.** Rejected: `inspect` is the preflight JSON contract consumed by skills; a dedicated `summary` keeps the human-facing block separate and stable.

## Simplicity decision

- Selected rung: local reuse — two CLI renderers over existing `inspectChanges`/`ChangeView`, plus mechanical skill wiring.
- Earlier rungs: need is real (per-harness variance); no runtime/stdlib/platform/dependency renders Change-stage menus or the summary block.
- Irreducible complexity: the stage-filtered list with affordances and the deterministic three-part summary; hidden behind two commands.
- Safety floor: preserve all existing commands, `inspect`/`status` behavior, exit codes, and lifecycle semantics; no orchestrator change; full gate green.
- Expected surface delta: modify `src/cli/args.ts`, `src/cli/commands.ts`, `src/cli/output.ts`, `src/cli/cli.test.ts`; create `skills/_shared/STAGE-IO.md`; modify five `skills/codepatrol-*/SKILL.md` and `scripts/skills-contract.test.mjs`. No new dependencies, config, events, or lifecycle changes.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | `next` lists all non-terminal Changes at a stage, unsorted beyond created_at | Very many concurrent Changes could make the list long | A workspace routinely shows >20 active Changes | Add paging/filtering to `next` |
| DC-2 | Summary verdict is the raw result/state token | A localized or richer verdict phrasing may be wanted | Product asks for human phrasing | Map tokens to phrases in `renderSummary` |

## Compatibility and rollout

- Additive CLI commands and skill instructions; no existing command, event, schema, or Git behavior changes; `commit+push` uses the existing `push: true` path. Older skills keep working until updated in this Change. Rollback = revert the branch; no migration. Observability improves. No security/privacy/performance/accessibility impact.

## Risks and mitigations

- Skill wiring drifts from the actual command names. Mitigation: `skills-contract.test.mjs` asserts each skill references `codepatrol next` and `codepatrol change summary`; `lint:skills` validates skill structure.
- `renderSummary` verdict misrepresents a returned/blocked attempt. Mitigation: verdict is `result ?? status` of the current stage's last attempt, covered by CLI tests across stages (ready, approve, returned, implemented, commit, terminal).
- `next` list omits or duplicates a Change. Mitigation: reuse `inspectChanges` (already dedups and validates) and cover the stage filter with a CLI test.

## Acceptance criteria

- AC-1: `codepatrol next --stage <s>` lists exactly the non-terminal Changes whose projected stage is `<s>`, each showing work id, state, and exact next action, in both text and `--format json`.
- AC-2: `codepatrol next --stage plan` (and any empty list for plan) includes a start-a-new-Change affordance, and `codepatrol next --stage close` lists the commit / commit+push / rollback options; an invalid `--stage` returns `INVALID_ARGUMENT` (exit 2).
- AC-3: `codepatrol change summary --id <id>` outputs a uniform three-line `Summary:` / `Verdict:` / `Next:` block (text) and the matching `{summary,verdict,next}` JSON, where verdict is the current stage's last attempt result-or-state and next is the next action or terminal outcome.
- AC-4: Each of the five lifecycle skills instructs reproducing `codepatrol next --stage <its-stage>` on entry and `codepatrol change summary --id <work-id>` on exit verbatim; `close` documents commit+push; `scripts/skills-contract.test.mjs` asserts all five.
- AC-5: `npm run verify` exits 0 on the candidate (enforced at Apply seal by `.codepatrol/config.json` `applyGate`).

## Decisions and open questions

- Decided (maintainer, this session): mechanism = CLI renders, skills reproduce verbatim; scope = one Change spanning CLI + all five lifecycle skills + shared docs; Close entry lists commit / commit+push / rollback.
- Decided: `next` is a new command (not a `status` flag); `summary` is a new command (not an `inspect` change).
- Decided: `codepatrol-status` is unchanged; the five lifecycle skills are wired.
- No open question can materially change scope, interfaces, or acceptance.
