# Plan evidence — recurring `CHANGE_CONFLICT` on `change session`

Verified by direct file reads during this Plan attempt (not conversation
history). All paths relative to repo root, checked against `main` @ `5bd9e30`.

## Backlog item claimed

`.codepatrol/backlog/items.yaml`, id
`top-error-code-change-conflict-investigate-the-first-occurrence-s-args-and-stage-context`:
priority `p1`, `count: 3`, `firstSeenAt: 2026-07-25T16:19:10.317Z`, source
`{ kind: close-trace, workId: 2026-07-25-commit-scoping }`.

## Recurring failure, three independent Changes

| Improvement report | Sample message |
|---|---|
| `.codepatrol/docs/improvement-reports/2026-07-25-commit-scoping.md:23` | `Session review/undefined is not the current attempt.` |
| `.codepatrol/docs/improvement-reports/2026-07-25-remove-duplicate-reader.md:21` | `Session undefined/undefined is not the current attempt.` |
| `.codepatrol/docs/improvement-reports/2026-07-25-session-handoff.md` (apply-stage return body) | `... fails with CHANGE_CONFLICT: Session apply/1 is not the current attempt.` |

`undefined` in the first two confirms a missing/unset field reaches the error
message verbatim — i.e. the caller's JSON omitted `stage` and/or `attempt`
and nothing rejected the request before it reached the deep session-state
check.

## Code path

- `src/cli/commands.ts:130-146` — `case "change.session":` casts parsed JSON
  to `{ action; stage: Stage; attempt: number; ... }` via `as`, no runtime
  check. `payload.stage`/`payload.attempt` flow straight into
  `primeStageSession`/`claimSessionItem`/`closeSessionItem`/
  `discardAndRebuildSession`/`readStageSession`.
- `src/change/session.ts:157` (`loadOrDerive`) and `:215`
  (`discardAndRebuildSession`) — both throw `CodepatrolError("CHANGE_CONFLICT",
  \`Session ${stage}/${attempt} is not the current attempt.\`, 4)` when
  `view.stage !== stage || view.attempt !== attempt`. This condition is true
  both for a genuinely stale attempt and for `stage`/`attempt` being
  `undefined` — the message cannot distinguish the two, confirmed by reading
  the comparison logic (no separate branch for missing values).
- `src/change/types.ts:3-4` — `STAGES` exported as a value (`as const`
  array), not currently value-imported in `commands.ts` (only `Stage` the
  type is imported today, confirmed via `commands.ts:14`).
- `src/cli/args.ts:139` — `requireValue` is the only existing CLI-boundary
  validator; it only handles required-string presence, confirmed by reading
  its full body — no enum-membership or integer-range check exists anywhere
  in `src/cli/`.

## Documentation gap

- `skills/_shared/CODEPATROL-CLI.md:10` — one-line command reference only,
  no `session.json` payload shape shown.
- `skills/_shared/SESSION.md:9` — documents the `status` action's purpose,
  not the JSON field set.
- Grep across `skills/*/SKILL.md`, `scripts/*.mjs`, and every `*.test.ts` for
  a literal `"attempt"` JSON key outside `src/change/session.ts` and
  `src/cli/commands.ts` returned no matches — confirms no existing caller in
  this repo hardcodes or stringifies `attempt`, supporting the spec's Risk
  mitigation that a `number`-typed check will not break current callers.

## Confirmed out of scope

- `.codepatrol/docs/improvement-reports/2026-07-25-docs-consolidation.md:22`
  — `Session item is not ready: verify-work — no such item.` — an `itemId`
  guess, different code path (`src/change/session.ts:187`), not a
  `stage`/`attempt` defect.
- `.codepatrol/docs/improvement-reports/2026-07-25-issue-tracker-sync.md` —
  `Checkpoint has undeclared worktree paths: ...` and `Only Apply may declare
  production changes.` — checkpoint-declaration and transition-schema checks
  working as designed, unrelated subsystem.
- `.codepatrol/docs/improvement-reports/2026-07-25-commit-scoping.md:24` —
  `Transition contains unknown field attempt.` — confirms the schema
  confusion theorized in `spec.md` (a caller conflated the `session.json` and
  `transition.json` shapes); `change.transition` correctly rejects `attempt`
  and is not modified by this Change.

## Precedent

`2026-07-24-cli-input-ergonomics` (closed, `main`@`8ac598b`) fixed an
analogous defect class (inline-JSON detection, unknown-command guidance) with
the same shape of fix: a targeted, actionable `INVALID_ARGUMENT` at the CLI
boundary instead of a raw downstream error. Confirmed by reading
`.codepatrol/changes/2026-07-24-cli-input-ergonomics/plan/spec.md`.
