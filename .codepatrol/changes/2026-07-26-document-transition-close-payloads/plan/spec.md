# Specification — Document `transition.json` and `close.json` exact payload shapes

## Intent

- Origin: improve-codebase
- Mode: bug
- Target baseline: `main` @ `d088fdb` (branch `codepatrol/2026-07-26-document-transition-close-payloads`), clean tree
- Governing constraints: `_shared/CODEPATROL-CLI.md` is the shared CLI payload reference; no ADR exists in this repo (`.codepatrol/adr/` absent by design)
- Substrate state: graph not consulted — this is a documentation-only fix, no symbol-level design decisions depend on it
- Improvement signals (from `.codepatrol/docs/improvement-reports/2026-07-26-dedupe-exact-keys-guard.md`, most recent by mtime): "Top error code: INVALID_ARGUMENT (6). Investigate the first occurrence's args and stage context." (this Change directly addresses it); "Command `change.session` was invoked 43 times — consider caching or batching repeated invocations." (workflow/tooling concern, unrelated file, not actionable here); "Session item(s) claimed but never closed: review/1/report, review/2/report." (harness-handoff artifact, self-resolves on re-prime, not a code defect).
- Problem: `INVALID_ARGUMENT` is the recurring top error code across at least 9 independent Changes' `close/improvement-report.md` files, with sample messages spanning multiple distinct lifecycle payloads. `session.json`'s share of this pattern was already fixed by `2026-07-25-session-input-validation` (closed): it added a fenced worked example to `skills/_shared/CODEPATROL-CLI.md` and a CLI-boundary validator, and explicitly deferred the analogous `transition.json` gap. `transition.json` and `close.json` remain the only two lifecycle payloads with zero worked example in the repo — only a one-line command invocation each. This session independently reproduced both gaps first-hand: `Transition contains unknown field next_action.` (correct field is `nextAction`, camelCase) and `Close contains unknown field action.` (correct field is `outcome`) — both guessed wrong on the first attempt for lack of an example to copy, exactly the failure mode the prior Change fixed for `session.json`.
- Outcome: `skills/_shared/CODEPATROL-CLI.md` gains one fenced JSON example per `TransitionIntent` variant (six: `begin`, `usage`, `checkpoint`, `return`, `block`, `resume`) and one fenced JSON example for `close.json`, each showing every field that variant accepts, sourced directly from `src/change/types.ts` and `src/change/orchestrator.ts`'s validators — closing the same documentation gap `session.json` already had fixed, for the two payloads that still have it.

## Scope

### In scope

- Add a `transition.json` section to `skills/_shared/CODEPATROL-CLI.md` with six fenced JSON examples (one per `TransitionIntent` variant), each field-complete and using `nextAction` (not `next_action`), and a one-line note on the `checkpoint` variant's stage-locked `result` values and the `apply`-only `changes` array.
- Add a `close.json` section with one fenced JSON example showing all four fields (`outcome`, `actor`, `authority`, `push`).
- Both additions placed directly under their existing one-line command references (lines 9 and 12), mirroring `session.json`'s existing placement and tone (lines 23-38).

### Out of scope

- Any code change to `src/cli/commands.ts`, `src/change/orchestrator.ts`, or their validators (`assertTransitionIntent`, `assertCloseInput`) — the validation logic is already correct (confirmed by evidence: every sample message traces to a genuinely invalid payload, not a validator defect); this Change only documents the shape that already exists.
- `session.json` — already fixed by `2026-07-25-session-input-validation`; not touched again here.
- The `Unknown command: session.begin` / `Unknown command: change.begin` samples — a different root cause (wrong top-level command name, e.g. `session.begin` instead of `change session` with `action: "begin"`... actually no such action exists; these are pre-existing typos in *how the CLI is invoked*, not a payload-shape gap) — no file addition fixes a command-name typo; out of scope.
- The other two backlog Recommendations from the improvement-report mirror (command-invocation-count, abandoned session items) — unrelated files/concerns, independently already-tracked backlog items.
- Restructuring `CODEPATROL-CLI.md`'s existing prose/ordering beyond inserting the two new sections — minimize diff, preserve everything else byte-identical.

## Current evidence

See `plan/evidence/investigation.md` for the full aggregation across 9+ improvement reports, the exact `TransitionIntent`/`CloseInput`/`ArtifactBinding`/`RunUsage` type definitions (`src/change/types.ts:11-12,45-51,54`), the exact per-type allowed-field enforcement (`src/change/orchestrator.ts:47-79`), and this session's own first-hand reproduction of both gaps.

Key facts restated:

- `skills/_shared/CODEPATROL-CLI.md` is 49 lines; `session.json` has a fenced example (lines 28-38), `transition.json` and `close.json` do not (one-line references only, lines 9 and 12).
- `TransitionIntent` has six variants, each with a distinct exact field set enforced by `exactInput` in `assertTransitionIntent` — no variant accepts a superset or subset of its own listed fields.
- `checkpoint`'s `result` is stage-locked (`plan`→`ready`, `review`→`approve`, `apply`→`implemented`, `verify`→`commit`); its `changes` array is required exactly when `stage: "apply"` and forbidden otherwise; `artifacts[].intent` is `create`/`modify`/`delete` only, no default.
- `CloseInput` has exactly four fields: `outcome` (`"commit"|"rollback"`), `actor`, `authority`, `push?`.

## Proposed design

Insert two new fenced-example blocks into `skills/_shared/CODEPATROL-CLI.md`,
directly after the existing `session.json` block (after line 38), following
its exact prose pattern (one sentence stating what the payload carries, then
a fenced JSON example):

1. **`transition.json`** — one intro sentence noting the six `type` variants
   share `type`/`actor`/`stage` but each has its own additional required
   fields, then six small fenced examples (one per variant), each using the
   exact field names from `types.ts` (`nextAction`, not `next_action`).
   Include one sentence on `checkpoint`'s stage-locked `result` and
   `apply`-only `changes`.
2. **`close.json`** — one intro sentence, one fenced example with all four
   fields (`outcome`, `actor`, `authority`, `push`).

No code changes. The new content is transcribed directly from
`src/change/types.ts` and `src/change/orchestrator.ts`'s validators (already
read in full during evidence-gathering), not invented — every field name,
required/optional status, and enum value in the new examples must match the
current source exactly.

## Alternatives

- **Add a CLI-boundary validator improvement (e.g., unknown-field errors
  listing the allowed set) instead of/in addition to docs**: rejected for
  this Change — `2026-07-25-session-input-validation`'s own precedent
  explicitly scoped the equivalent `transition.json` fix as doc-only
  ("the doc update... reduces the field-confusion... but no transitionChange
  code changes"); this Change follows that same established scope boundary.
  A future Change could still pursue richer error messages as an independent,
  separately-evidenced follow-up.
- **One combined worked example showing a full multi-stage lifecycle
  transcript** instead of one example per variant: rejected — a single
  transcript would bury the six distinct shapes inside narrative flow;
  `session.json`'s existing single-example treatment works there because
  `session.json` has one shape with optional fields, not six genuinely
  different variants.
- **Move payload documentation into a JSON Schema file instead of prose
  examples**: rejected by the simplicity ladder — no schema-validation
  tooling exists in this codebase today (confirmed by the prior Change's own
  Alternatives), and six small worked examples are simpler to read and
  copy than a schema a harness would need to interpret.

## Simplicity decision

- Selected rung: direct local change (documentation addition, no code)
- Earlier rungs: not applicable — there is no lighter mechanism than writing
  the missing examples directly; the payloads are already minimal and
  correctly validated, the only gap is the absence of a worked reference.
- Irreducible complexity: `transition.json` genuinely has six distinct
  shapes (enforced by the validator's own per-type field-set table); showing
  all six is not speculative completeness, it mirrors the validator's own
  branching exactly.
- Safety floor: every field name and enum value in the new examples is
  transcribed from current source, not memory or inference — verified by a
  final side-by-side diff against `types.ts`/`orchestrator.ts` before
  sealing (AC-5).
- Expected surface delta: `skills/_shared/CODEPATROL-CLI.md` only, +~70
  lines (six small `transition.json` examples + one `close.json` example +
  ~3 sentences of prose). No new files, no dependency, no code change.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | No CLI-boundary validator improvement (e.g., unknown-field errors that list the allowed set) is added in this Change | A harness that still guesses a field name wrong (e.g., for a payload shape not covered by these two files) gets a message naming the bad field but not the valid ones | A future improvement-report cites a fourth recurring `INVALID_ARGUMENT` sample after this Change's docs are in place, for a field genuinely not documented anywhere | File a new backlog item citing the specific occurrence, following `2026-07-25-session-input-validation`'s CLI-boundary-validator pattern applied to the newly implicated field |
| DC-2 | The `Unknown command: session.begin`/`change.begin` command-name-typo samples are not addressed | A harness that invokes a wrong top-level command name still gets a generic `Unknown command` error, not redirected to the right one | A future improvement-report shows the same command-name typo recurring after this Change ships | A future Change could add "did you mean" suggestions to the CLI's unknown-command handler, informed by which typos actually recur |

## Compatibility and rollout

- No migration, no code change, no config/schema/event/checkpoint change.
- Rollback: revert the single commit; `CODEPATROL-CLI.md` reverts to its
  current content, byte-identical.
- Observability: not applicable — prose-only change with no runtime effect.

## Risks and mitigations

- Risk: a transcribed example silently diverges from the actual validator
  (e.g., a stale field name after a future code change). Mitigation: this
  Change's own acceptance criterion (AC-5) requires a direct side-by-side
  diff against current source before sealing, not a memorized shape; future
  drift is a known, accepted risk of any hand-maintained doc (same as
  `session.json`'s existing example, which has this same property today).
- Risk: over-documenting turns a quick-reference file into a wall of text
  that harnesses stop reading. Mitigation: each example stays minimal
  (field-complete, no narrative padding); total addition (~70 lines) roughly
  doubles the file's length once, matching the proportional size of the
  `session.json` addition relative to this file's pre-existing length.

## Acceptance criteria

- AC-1: `skills/_shared/CODEPATROL-CLI.md` contains six fenced JSON examples for `transition.json`, one per `TransitionIntent` variant (`begin`, `usage`, `checkpoint`, `return`, `block`, `resume`), each using exactly the field names and required/optional status from `src/change/types.ts:45-51`.
- AC-2: The `checkpoint` example (or accompanying prose) states the stage-locked `result` mapping (`plan`→`ready`, `review`→`approve`, `apply`→`implemented`, `verify`→`commit`) and that `changes` is required only for `stage: "apply"`.
- AC-3: `skills/_shared/CODEPATROL-CLI.md` contains one fenced JSON example for `close.json` with all four fields (`outcome`, `actor`, `authority`, `push`) matching `src/change/types.ts:54`.
- AC-4: `npm run lint:skills` (skill catalog, frontmatter, dependencies, portability, relative-links check) passes unchanged — this Change adds prose inside an existing file, no catalog/frontmatter/link change.
- AC-5: A direct side-by-side comparison of every field name and enum value in the new examples against current `src/change/types.ts`/`src/change/orchestrator.ts` source shows zero divergence (performed and recorded at Apply/Verify, not merely asserted here).

## Decisions and open questions

- Decision: doc-only scope, no validator code changes — matches the direct precedent's own explicit deferral of this exact gap.
- Decision: one example per `TransitionIntent` variant rather than one combined narrative — matches the validator's own per-type branching.
- No open questions remain that could change scope, interfaces, or acceptance.
