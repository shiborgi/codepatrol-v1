# Specification — Validate `change session` stage/attempt at the CLI boundary

## Intent

- Origin: improve-codebase
- Mode: bug
- Target baseline: `main` @ `5bd9e30` (branch `codepatrol/2026-07-25-session-input-validation`), clean tree
- Governing constraints: `AGENTS.md` (Stage Session is disposable, `_shared/SESSION.md` contract), `_shared/CHANGE.md` (never mutate a second store); no ADR exists in this repo (`.codepatrol/adr/` absent by design — 0 ADR across 19 prior Changes)
- Substrate state: graph not consulted — this is a CLI input-boundary fix, no symbol-level design decisions depend on it
- Problem: `codepatrol change session --input -` accepts the caller-supplied `stage` and `attempt` fields with zero validation and passes them straight into `primeStageSession`/`claimSessionItem`/etc. When a harness omits `attempt` or gets `stage` wrong, the failure surfaces four call frames deep as a generic `CHANGE_CONFLICT: Session review/undefined is not the current attempt.` — indistinguishable from the legitimate case where the Change genuinely advanced to a new attempt. This has now recurred across three independent Changes' improvement reports (`2026-07-25-commit-scoping`: `Session review/undefined is not the current attempt.`; `2026-07-25-remove-duplicate-reader`: `Session undefined/undefined is not the current attempt.`; `2026-07-25-session-handoff` apply return: literal `Session apply/1 is not the current attempt.` from a hardcoded attempt), and is the current top backlog item (`top-error-code-change-conflict-...`, p1, count 3, source `2026-07-25-commit-scoping`).
- Outcome: a `change session` call with a missing, wrong-typed, or out-of-range `stage`/`attempt` field fails immediately with `INVALID_ARGUMENT` naming the exact bad field and pointing at `codepatrol change inspect --id <work-id>` as the source of truth, instead of a generic downstream `CHANGE_CONFLICT`. The legitimate semantic conflict (well-formed but stale stage/attempt) still reports `CHANGE_CONFLICT` unchanged.

## Scope

### In scope

- Structural validation of `payload.stage` (must be one of `plan`, `review`, `apply`, `verify`, `close`) and `payload.attempt` (must be a safe integer `>= 1`) in the `change.session` command handler (`src/cli/commands.ts`), before any of the five actions (`prime`, `claim`, `close`, `rebuild`, `status`) dispatch.
- An actionable `INVALID_ARGUMENT` error naming the received value and the corrective command (`change inspect`) for each of the two fields.
- Documenting the exact `session.json` payload shape (all fields, which are required per action) in `skills/_shared/CODEPATROL-CLI.md`, stating that `stage`/`attempt` must be read from a fresh `change inspect` projection rather than assumed or hardcoded — closing the documentation gap that let three independent harness sessions guess wrong.
- Regression tests: (a) missing `attempt` → `INVALID_ARGUMENT`, not `CHANGE_CONFLICT`; (b) invalid `stage` string → `INVALID_ARGUMENT`; (c) well-formed but stale `stage`/`attempt` (Change genuinely on a later attempt) still → `CHANGE_CONFLICT` with the existing message, unchanged.

### Out of scope

- The `Session item is not ready: <id> — no such item.` failure mode (`2026-07-25-docs-consolidation`) — different root cause (caller guessed an `itemId` instead of calling `status` first); `_shared/SESSION.md` already documents the corrective `status` action, no code defect identified.
- The `Checkpoint has undeclared worktree paths` and `Only Apply may declare production changes` `CHANGE_CONFLICT`/`INVALID_ARGUMENT` pairs (`2026-07-25-issue-tracker-sync`) — those are checkpoint-declaration correctness checks working as designed, not this defect.
- `Transition contains unknown field attempt` (`2026-07-25-commit-scoping`) — the `change.transition` payload correctly rejects `attempt` (transitions are not session calls); left as-is. The doc update in this Change's scope reduces the field-confusion that produced it, but no `transitionChange` code changes.
- Any other open backlog item (N1 dead error codes, N2 test coverage gaps, N3 orchestrator decomposition, command-invocation-count items) — independent, unrelated files.
- Rewriting or restructuring `session.ts`'s own internal `CHANGE_CONFLICT` check (`view.stage !== stage || view.attempt !== attempt`, `src/change/session.ts:157,215`) — that check is correct and stays; this Change only adds a boundary guard in front of it.

## Current evidence

- `src/cli/commands.ts:130-146` — the `change.session` case casts the parsed JSON straight to `{ action; stage: Stage; attempt: number; ... }` via `as` with no runtime check, then passes `payload.stage`/`payload.attempt` unvalidated into `primeStageSession`/`claimSessionItem`/`closeSessionItem`/`discardAndRebuildSession`/`readStageSession`.
- `src/change/session.ts:157` and `:215` — `loadOrDerive`/`discardAndRebuildSession` throw `CodepatrolError("CHANGE_CONFLICT", \`Session ${stage}/${attempt} is not the current attempt.\`, 4)` whenever the passed-in stage/attempt do not equal the live projection — this fires identically whether the caller passed `undefined` or a real stale value, so the message cannot distinguish "malformed request" from "genuine conflict".
- `src/change/types.ts:3-4` — `export const STAGES = ["plan", "review", "apply", "verify", "close"] as const; export type Stage = typeof STAGES[number];` — existing enum available for reuse, not currently imported as a value in `commands.ts` (only the `Stage` type is imported).
- `src/cli/args.ts:139` — `requireValue(value: string | undefined, option: string): string` — existing CLI-boundary validation helper pattern (throws `INVALID_ARGUMENT`), used for every other required field in `commands.ts`, but only handles required-string presence, not enum membership or integer range — no directly reusable helper for `stage`/`attempt`.
- `skills/_shared/CODEPATROL-CLI.md:10` — lists `codepatrol change session --id <work-id> --input session.json ...` as a one-line command reference with no payload schema; `skills/_shared/SESSION.md:9` documents the `status` action's purpose but not the JSON shape either. No file in the repo shows a worked `session.json` example.
- Three improvement reports document the recurring failure verbatim (paths and quotes above): `.codepatrol/docs/improvement-reports/2026-07-25-commit-scoping.md:23`, `.codepatrol/docs/improvement-reports/2026-07-25-remove-duplicate-reader.md:21`, `.codepatrol/docs/improvement-reports/2026-07-25-session-handoff.md` (apply-stage return quoting `Session apply/1 is not the current attempt.`).
- `.codepatrol/backlog/items.yaml` — item `top-error-code-change-conflict-investigate-the-first-occurrence-s-args-and-stage-context`, priority `p1`, count 3, `firstSeenAt: 2026-07-25T16:19:10.317Z`, source `2026-07-25-commit-scoping`; now `status: scheduled`, `workId: 2026-07-25-session-input-validation` (claimed by this Change's `change start`).
- `src/cli/cli.test.ts:52` — existing test `"CLI change session supports read-only status projection"` exercises the `status` action end-to-end against a hand-built `change.yaml`; establishes the test harness pattern (`workspace()`, `run()`, hand-written `change.yaml` fixture) this Change's new tests reuse.
- Precedent: `2026-07-24-cli-input-ergonomics` (closed, `main`@`8ac598b`) fixed an analogous class of defect — `readJsonInput` detecting inline JSON and the unknown-command default case — by adding a targeted, actionable `INVALID_ARGUMENT` at the CLI boundary instead of letting a raw downstream error surface. This Change follows the same shape.

## Proposed design

Add one small validation step inside the existing `case "change.session":` block in `src/cli/commands.ts`, run once, before the `if/else if` action dispatch:

1. Import `STAGES` as a value (alongside the existing `Stage` type import) from `../change/types.js`.
2. Add a module-local helper `requireSessionCoordinates(payload: { stage?: unknown; attempt?: unknown }, id: string): { stage: Stage; attempt: number }` near `requireSeed`/`readJsonInput`. It:
   - throws `INVALID_ARGUMENT` if `payload.stage` is not one of `STAGES`, naming the received value (or "(missing)") and the fix: `` Run `codepatrol change inspect --id <id>` to read the current stage. ``
   - throws `INVALID_ARGUMENT` if `payload.attempt` is not `Number.isSafeInteger(x) && x >= 1`, naming the received value and the same corrective command for attempt.
   - returns the narrowed `{ stage, attempt }` pair.
3. Call it once at the top of the `change.session` case: `const { stage, attempt } = requireSessionCoordinates(payload, id);` and use `stage`/`attempt` (not `payload.stage`/`payload.attempt`) in the five dispatch branches.

Root cause and why this fixes it: the defect is a missing boundary check, not a logic error inside `session.ts` — `session.ts`'s own `CHANGE_CONFLICT` check is semantically correct for a well-formed-but-stale request and must keep firing for that case (AC-3 in Acceptance criteria). The fix only rejects structurally invalid input earlier, with a message that tells the caller exactly which field was wrong and how to get the right value, closing the gap that let three independent harness sessions submit `undefined` or wrong values silently.

The second, independent contributor is a documentation gap: no file shows the full `session.json` shape, so a harness constructing the payload from scratch has no worked example to copy and can conflate it with the differently-shaped `transition.json` payload (which legitimately rejects an `attempt` field — see the `Transition contains unknown field attempt` sample in the same report). Add a fenced JSON example to `skills/_shared/CODEPATROL-CLI.md` directly under the existing one-line `change session` reference, showing all fields (`action`, `stage`, `attempt`, `itemId`, `actor`, `result`, `artifacts`) with a one-line note that `stage`/`attempt` must be copied from the most recent `change inspect` output, not assumed.

## Alternatives

- **Fix only inside `session.ts`** (reject `undefined`/out-of-range `stage`/`attempt` in `loadOrDerive` itself): rejected — `session.ts` functions are also called internally with trusted values derived from `change inspect` (e.g. `change.doctor`, `commands.ts:150`), so pushing the check there would either duplicate the CLI-boundary check or risk rejecting internally-trusted calls; the CLI command boundary is the single place untrusted external input enters.
- **Make `attempt` optional and default it to the Change's current attempt server-side** (auto-resolve instead of validate): rejected — it would silently mask exactly the caller confusion this Change is fixing (a harness that thinks it knows the attempt but is wrong would get a *different* wrong answer instead of an actionable error), and contradicts the Change contract's "never select by recency" principle applied by analogy — the caller must state what it believes the current attempt is so a genuine drift is still caught as `CHANGE_CONFLICT`.
- **Zod/schema-library validation for the whole `session.json` payload**: rejected by the simplicity ladder — the codebase has zero runtime schema-validation dependencies today (all `commands.ts` validation is hand-written `if`/`throw`), and two scalar checks do not justify a new dependency.

## Simplicity decision

- Selected rung: direct local change
- Earlier rungs: no existing local capability directly validates an enum-membership + integer-range pair (`requireValue` only handles required-string presence); no runtime/stdlib or platform primitive applies; an installed dependency (schema validator) is disproportionate to two scalar checks.
- Irreducible complexity: the CLI boundary must know the legal `Stage` enum and the "positive integer" shape of `attempt` to reject bad input before it reaches business logic; this is inherent to any typed command boundary and already exists in spirit for every other required field via `requireValue`.
- Safety floor: the existing semantic `CHANGE_CONFLICT` check in `session.ts` remains untouched and mandatory (AC-3) — this Change adds a stricter earlier gate, it does not weaken or replace the existing conflict detection.
- Expected surface delta: 1 new private helper function and one call-site change in `src/cli/commands.ts` (~15 lines); 1 doc addition in `skills/_shared/CODEPATROL-CLI.md` (~15 lines, fenced JSON example + one sentence); 2-3 new test cases appended to `src/cli/cli.test.ts`. No new files, no new dependency, no public interface change (the CLI's external contract — reject bad input with `INVALID_ARGUMENT` exit 2 — already exists for every other command).

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | Validate only `stage` and `attempt` (the two fields implicated in all three recurring failures); `itemId`/`actor`/`result`/`artifacts` keep relying on per-action `requireValue`/pass-through as today | A future recurring `CHANGE_CONFLICT`/`INVALID_ARGUMENT` pattern traced to a different `session.json` field (e.g. malformed `artifacts` array) would not be caught by this gate | A new backlog item citing a fourth improvement-report occurrence naming a different `session.json` field | Extend `requireSessionCoordinates` (or add a sibling helper) for the newly implicated field, following the same pattern |

## Compatibility and rollout

- No migration: this only tightens validation of a command whose well-formed callers (the five lifecycle skills, which always source `stage`/`attempt` from a preceding `change inspect`) are unaffected — their requests already satisfy the new checks.
- No config, no schema version bump, no data migration.
- Rollback: revert the single commit; the CLI reverts to accepting unvalidated `stage`/`attempt` (prior behavior, strictly worse but not broken).
- Observability: the new `INVALID_ARGUMENT` errors are visible the same way all CLI errors are today (stderr JSON envelope, exit code 2) and are captured by the existing improvement-report error-aggregation pipeline, so a regression or new confusion pattern will resurface in the next Close's report automatically.

## Risks and mitigations

- Risk: a legitimate caller that currently passes a numeric-string `attempt` (e.g. `"1"` from a shell script that JSON-stringified loosely) would newly be rejected. Mitigation: `JSON.parse` output for a JSON number field is always a JS `number`, not a string, for every existing caller path in this repo (skills pipe `--input -` with real JSON, not shell-interpolated strings); confirmed no skill or test in the repo currently sends `attempt` as a string. If this assumption is wrong, the new `INVALID_ARGUMENT` message will say so immediately and be trivially reproducible (an explicit, worse-than-before regression risk is not silent).
- Risk: the doc example itself could still be copied verbatim with stale `stage`/`attempt` values by a future harness. Mitigation: the added doc sentence explicitly says to source these two fields from a fresh `change inspect` call, not to hardcode the example's literal values; this is a documentation mitigation, not a code one — residual risk accepted (DC-1 boundary: code-level enforcement already exists via AC-1/AC-2/AC-3, the doc only helps callers avoid triggering it in the first place).

## Acceptance criteria

- AC-1: Given `codepatrol change session --input -` with `action: "prime"` (or any action) and `stage` missing or not one of `plan`/`review`/`apply`/`verify`/`close`, when the command runs against a started Change, then it exits `2` with `error.code === "INVALID_ARGUMENT"` and a message naming the received `stage` value and directing the caller to `codepatrol change inspect --id <work-id>`.
- AC-2: Given the same command with a syntactically valid `stage` but `attempt` missing, non-integer, zero, or negative, when the command runs, then it exits `2` with `error.code === "INVALID_ARGUMENT"` and a message naming the received `attempt` value and the same corrective `change inspect` command.
- AC-3: Given a well-formed request (`stage` in the enum, `attempt` a positive integer) whose values do not match the Change's actual current stage/attempt (e.g., the Change has since advanced to a new attempt), when the command runs, then it still exits `4` with `error.code === "CHANGE_CONFLICT"` and the existing message `Session <stage>/<attempt> is not the current attempt.` — unchanged from current behavior, proven by a regression test.
- AC-4: `skills/_shared/CODEPATROL-CLI.md` contains a fenced JSON example of a complete `session.json` payload (all fields: `action`, `stage`, `attempt`, `itemId`, `actor`, `result`, `artifacts`) plus one sentence stating `stage`/`attempt` must be read from the most recent `change inspect` projection.

## Decisions and open questions

- Decision: validation lives in `src/cli/commands.ts` (the CLI command boundary), not in `src/change/session.ts` — see Alternatives. Settled, no open question.
- Decision: scope excludes the `itemId`-guessing and checkpoint-declaration failure modes from the same reports — different root causes, would require separate evidence-gathering and risk conflating two unrelated fixes in one Change. Settled.
- No open questions remain that could change scope, interfaces, or acceptance.
