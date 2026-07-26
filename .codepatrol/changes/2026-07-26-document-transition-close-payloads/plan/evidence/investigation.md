# Plan evidence — document transition.json and close.json payload shapes

## Backlog item and root-cause aggregation

Item `top-error-code-invalid-argument-investigate-the-first-occurrence-s-args-and-stage-context`
(p1, count 8 at time of claim, source `close-trace`/`2026-07-24-backlog-subsystem`,
externalRef `github.com/shiborgi/codepatrol#2`) is an auto-generated
recommendation with no fixed root cause of its own — it just names the
current top error code. Aggregated every `INVALID_ARGUMENT` "Top errors" row
across all 20 closed Changes' `close/improvement-report.md` files:

```
$ grep -B2 "INVALID_ARGUMENT" .codepatrol/changes/*/close/improvement-report.md
```

Distinct sample messages found (one per Change, most recent first):

| Change | Sample message | Payload |
|---|---|---|
| `2026-07-26-dedupe-exact-keys-guard` | `Session stage must be one of plan, review, apply, verify, close; got (missing).` | `session.json` |
| `2026-07-26-remove-dead-path-builders` | `Unknown command: session.begin. Known commands: ...` | command name |
| `2026-07-25-issue-tracker-sync` | `Only Apply may declare production changes.` | `transition.json` (checkpoint) |
| `2026-07-25-docs-consolidation` | `artifact.sha256 must be lowercase SHA-256.` | `transition.json` (checkpoint) |
| `2026-07-25-session-input-validation` / `2026-07-25-session-handoff` | `type must be a non-empty string.` | `session.json` |
| `2026-07-25-commit-scoping` | `Transition contains unknown field attempt.` | `transition.json` |
| `2026-07-24-backlog-subsystem` | `Transition input is not valid JSON.` | `transition.json` |
| `2026-07-24-aggregate-and-push` | `Session input is not valid JSON.` | `session.json` |
| `2026-07-24-architecture-assessment` | `Unknown command: change.begin` | command name |
| `2026-07-24-project-structure-review` | `Only Apply may declare production changes.` | `transition.json` (checkpoint) |

This is not one defect but one **class** of defect: a harness (agent) guesses
the exact JSON field names/enum values for a lifecycle payload because no
worked example exists, gets `INVALID_ARGUMENT`, then corrects on a second
attempt by reading source. `session.json` was already fixed for this class by
`2026-07-25-session-input-validation` (closed): it added a fenced JSON example
to `skills/_shared/CODEPATROL-CLI.md` (now present, lines 23-38) and a CLI
boundary validator (`requireSessionCoordinates` in `src/cli/commands.ts`).
That Change's own Scope explicitly named `transition.json`'s
`Transition contains unknown field attempt` sample as adjacent but out of
scope, deferring it: "the doc update in this Change's scope reduces the
field-confusion that produced it, but no transitionChange code changes."

`skills/_shared/CODEPATROL-CLI.md` read in full (49 lines): confirmed
`transition.json` and `close.json` still have **zero** worked example — only
the one-line command invocation at lines 9 and 12. `session.json` is the only
lifecycle payload with a fenced example (lines 28-38).

## First-hand reproduction, this session, both undocumented payloads

Direct transcript evidence from this conversation (not a lab reproduction —
the actual, unmodified errors this agent hit while operating
`2026-07-26-dedupe-exact-keys-guard` through Plan/Review/Apply/Verify/Close):

- `transition.json`, checkpoint intent: submitted
  `{"type":"checkpoint",...,"next_action":"..."}` (snake_case, matching the
  *event* field name recorded in `change.yaml`) — got
  `INVALID_ARGUMENT: Transition contains unknown field next_action.` The
  correct field is `nextAction` (camelCase) — confirmed only by reading
  `src/change/types.ts:48` directly; the error message names the wrong field
  but never states the right one.
- `transition.json`, artifact intent: submitted `"intent":"update"` for a
  modified (not newly created) artifact — got `INVALID_ARGUMENT:
  artifact.intent is required and must be create, modify, or delete.` This
  one *does* self-correct (the message lists the valid enum), unlike the
  unknown-field case above.
- `close.json`: submitted `{"action":"commit",...}` (matching `change
  session.json`'s field name for "what am I doing") — got `INVALID_ARGUMENT:
  Close contains unknown field action.` The correct field is `outcome` —
  confirmed only by reading `src/change/types.ts:54`
  (`CloseInput { outcome: "commit" | "rollback"; ... }`).

Both failures share the same shape as the `session.json` defect the prior
Change fixed: a plausible field name borrowed from an adjacent payload
(`type` from `TransitionIntent`, or the event's `next_action` snake_case),
rejected with a message that names the bad field but not the valid one,
with no fenced example anywhere in the repo to check against first.

## Exact payload shapes (source of truth: `src/change/types.ts` and validators)

`src/change/types.ts:45-51` — `TransitionIntent`, six variants:

```typescript
| { type: "begin"; actor: string; stage: Stage; nextAction: string }
| { type: "usage"; actor: string; stage: Stage; run: RunUsage }
| { type: "checkpoint"; actor: string; stage: Exclude<Stage, "close">; result: "ready"|"approve"|"implemented"|"commit"; artifacts: ArtifactBinding[]; changes?: string[]; nextAction: string; persona?: string }
| { type: "return"; actor: string; stage: "review"|"apply"|"verify"; toStage: "plan"|"apply"; reason: string; nextAction: string; persona?: string; reasons?: string[] }
| { type: "block"; actor: string; stage: Stage; reason: string; nextAction: string }
| { type: "resume"; actor: string; stage: Stage; nextAction: string }
```

`src/change/types.ts:11-12` — nested shapes `checkpoint`/`usage` reference:

```typescript
export interface RunUsage { id: string; started_at: string; finished_at?: string; elapsed_ms?: number; characters: CharacterUsage }
export interface ArtifactBinding { path: string; sha256: string; intent?: "create" | "modify" | "delete" }
```

`src/change/orchestrator.ts:47-72` (`assertTransitionIntent`) — confirms,
per type, the *exact* allowed field set (via `exactInput`, no more no less)
and the extra semantic checks:

- `checkpoint`'s `result` is stage-locked: `plan`→`"ready"`,
  `review`→`"approve"`, `apply`→`"implemented"`, `verify`→`"commit"`
  (`orchestrator.ts:64`) — a wrong `result` for the current stage throws
  `Checkpoint result is invalid for <stage>.`
- `checkpoint`'s `changes` array is **required** when `stage: "apply"`, and
  **forbidden** for every other stage (`orchestrator.ts:68-69`) — this is
  the exact source of the `Only Apply may declare production changes.`
  sample message seen in two improvement reports above.
- `artifact.intent` (inside `checkpoint.artifacts[]`) must be one of
  `create`/`modify`/`delete` — no `update`, no default (`orchestrator.ts:66`).
- `return`'s `stage` is narrower than the general `Stage` type: only
  `review`/`apply`/`verify` (a Plan can't return from itself); `toStage`
  is only `plan`/`apply`.

`src/change/orchestrator.ts:76-79` (`assertCloseInput`) — `close.json`'s
exact and only allowed fields: `outcome` (`"commit"|"rollback"`, required),
`actor` (required, non-empty string), `authority` (required, non-empty
string — a free-text justification, not a fixed enum), `push` (optional
boolean, only meaningful when `outcome: "commit"`).

## Precedent for the fix shape

`2026-07-25-session-input-validation` (closed, `main`-merged) is the direct
precedent both for identifying this class of defect from aggregated
improvement-report evidence and for the doc-only remedy: it added a fenced
`session.json` example to this exact file, sourced from the exact TypeScript
type plus the CLI's own runtime validator, and explicitly deferred
`transition.json`'s analogous gap as future work rather than scope-creeping
its own bounded Change. This Change picks up that explicit deferral.

## Returned-review correction

Attempt 1 was returned `fix-first` (`review/report.md`) on two findings,
both independently re-verified against current source before correcting:

1. **Placement contradiction**: `spec.md`'s Scope bullet said the new
   sections go "directly under their existing one-line command references
   (lines 9 and 12)" — those lines sit *inside* the fenced bash command
   block (lines 5-21), so inserting new Markdown content there is
   structurally impossible. `spec.md`'s own Proposed design and `plan.md`'s
   T1/T2 already correctly said "after line 38" (after the whole
   `session.json` block). Confirmed by direct re-read of `spec.md:20` vs.
   `spec.md:44`/`plan.md:68`: a genuine self-contradiction, not a
   reviewer misreading. Fixed by correcting the Scope bullet to match the
   already-correct Proposed design/plan.md wording — no plan.md change
   needed for this finding.
2. **Optional-field gap**: `checkpoint`'s optional `persona` (and the
   apply-only conditional `changes`) and `return`'s optional
   `persona`/`reasons` were absent from every T1 example, while AC-1 as
   originally written demanded "every field that variant accepts." Re-ran
   `grep -n "reasons" src/change/*.ts` fresh: confirmed `persona` marks a
   per-persona sub-checkpoint/sub-return (`skills/codepatrol-review/SKILL.md:17-18`
   documents `review-security`/`review-architecture` as example persona
   values) and `reasons` is populated on a later *consolidating*
   (non-persona) return that aggregates each sub-persona's individual
   reason string, confirmed by the test name itself:
   `src/change/orchestrator-parallel.test.ts:88`,
   `"a non-persona return aggregates persona sub-event reasons into reasons[]"`.
   Fixed by extending scope/AC-1/AC-2/AC-5 to require a field table (every
   variant's required + optional fields) plus a seventh example
   (`checkpoint` on `stage: "apply"` with `changes`) plus one-line prose on
   `persona`/`reasons`, rather than trying to cram every optional field
   into a single misleading combined example.

## Constraint

`skills/_shared/CODEPATROL-CLI.md` is documentation only, not executable —
no test suite covers its prose (`scripts/lint-skills.mjs` checks the skill
catalog's frontmatter, dependencies, portability, and relative links, not
prose content), so acceptance for this Change is direct textual comparison
against the current `src/change/types.ts`/`orchestrator.ts` source, not
`npm test`. Confirmed by grep (`grep -rl "CODEPATROL-CLI" skills/*/SKILL.md
skills/_shared/*.md`) that only `skills/diagnose-bug/SKILL.md:23` links to
it directly by name; every lifecycle skill (`codepatrol-plan`, `-review`,
`-apply`, `-verify`, `-close`) reaches it only indirectly, by a harness or
coordinator choosing to consult the shared CLI reference when constructing
a payload — not a link followed automatically. This Change does not change
that reachability; it only makes the file's existing content correct and
complete for the two payloads a harness is most likely to consult it for.
