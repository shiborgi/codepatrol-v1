# Specification — CLI input ergonomics: actionable errors for inline JSON and unknown commands

## Intent

- Origin: improve-codebase
- Mode: architecture
- Target baseline: `main` @ `5ed48226999d1a3d116fade28bee0652732a4db4`; clean worktree; `npm run verify` green at baseline.
- Governing constraints: `CONTEXT.md` domain vocabulary; `AGENTS.md` CLI-only contract. No ADRs (`docs/adr/` absent). None block this design.
- Substrate state: graph synced (73 files, 1838 symbols); wiki absent (valid substrate state).
- Improvement signals (most recent report `docs/codepatrol/improvement-reports/2026-07-24-architecture-assessment.md`):
  - Top error code INVALID_ARGUMENT (6), sample `Unknown command: change.begin` — investigate first occurrence's args and stage.
  - Command `change.transition` invoked 20 times — consider caching or batching repeated invocations.
  - (Same report also records `INVALID_WORKSPACE` `Path must be workspace-relative: /tmp/review-transition.json`.)
- Problem: The CLI produces obscure errors for two recurring operator mistakes. (1) Passing JSON inline to `--input` (instead of `--input -` + stdin, or a file path) makes `readJsonInput` treat the JSON string as a filesystem path, so `resolveInside` throws `INVALID_WORKSPACE: Path does not exist in the workspace: {…}` — an error that names the symptom, not the fix. This is finding F5 and the source of the recurring `INVALID_WORKSPACE`-on-input telemetry across improvement reports. (2) Mistyping a subcommand — e.g. `change begin`, where `begin` is a `change transition` event type, not a command — yields a bare `Unknown command: change.begin` with no correction, the literal top error (×6) of the latest report.
- Outcome: Both mistakes produce an actionable `INVALID_ARGUMENT` (exit 2) message that names the correct usage, with no change to any successful invocation.

## Scope

### In scope

- Detect inline JSON passed to `--input` (a non-`-` value whose trimmed text begins with `{` or `[`) in `readJsonInput` and throw an actionable `INVALID_ARGUMENT` error directing the user to `--input -` with stdin (or a workspace-relative file).
- Replace the bare `Unknown command` error with one that lists the known commands and, when the command is `change.<transition-type>` (`begin|usage|checkpoint|return|block|resume`), points to `change transition --input -`.
- Export a single source of known command names from `src/cli/args.ts` for the suggestion.

### Out of scope

- Accepting inline JSON as a real input mode (the `--input <file|->` contract is intentional; stdin is the pipe path).
- Absolute-path `--input` handling — the existing `INVALID_WORKSPACE: Path must be workspace-relative` message is already actionable; not changed here.
- Moving unknown-command rejection from `executeCommand` to `parseArgs`, or adding per-command option validation for unknown commands (larger refactor; not required for the outcome).
- Fuzzy/edit-distance "did you mean" matching beyond the transition-type special case.
- Findings F2, F3, F4, F6, F7 — recorded in the assessment document as separate follow-up Changes.

## Current evidence

- `src/cli/commands.ts:45-49` — `readJsonInput` reads `resolveInside(workspace, input, true)` when `input !== "-"`; an inline-JSON string is resolved as a path. Confidence: high (read).
- `src/shared/workspace.ts:28-55` — `resolveInside` throws `INVALID_WORKSPACE` (exit 3) with `Path must be workspace-relative` (absolute), `Path does not exist in the workspace` (missing), etc. Confidence: high.
- `src/cli/commands.ts:145-146` — `default:` throws `INVALID_ARGUMENT: Unknown command: ${args.command || "(none)"}` with no suggestion. Confidence: high.
- `src/cli/args.ts:36-54,95` — `command = positionals.slice(0,2).join(".")`; `COMMAND_OPTIONS` holds the exact set of valid commands; an unknown command skips option validation and falls through to the `default` case. Confidence: high.
- `src/change/types.ts:46-51` — `TransitionIntent` types are `begin|usage|checkpoint|return|block|resume`. Confidence: high.
- No test asserts the current `Unknown command`, `is not valid JSON`, or `INVALID_WORKSPACE` input messages (`grep` over `src`/`scripts` test files returned none). Confidence: high — messages safe to change.
- `src/cli/output.ts:38-57` — `HELP` already documents `--input <file|->`; no help change needed. Confidence: high.
- Baseline: `npm run verify` exits 0 at `5ed4822` (157 tests). Confidence: high (verified last Change).

## Proposed design

In `src/cli/commands.ts`, `readJsonInput`: before resolving a non-`-` input as a path, test `input.trimStart()` for a leading `{` or `[`. If matched, throw `INVALID_ARGUMENT` (exit 2): the input looks like inline JSON, and the caller must pipe it via `--input -` (e.g. `echo '<json>' | codepatrol … --input -`) or write it to a workspace-relative file. Otherwise behavior is unchanged (resolve path, read, `JSON.parse`, existing invalid-JSON error).

In `src/cli/args.ts`: export `KNOWN_COMMANDS: string[]` = the `COMMAND_OPTIONS` keys (single source of the valid command set).

In `src/cli/commands.ts`, the `default` case: build an `INVALID_ARGUMENT` message that (a) when `args.command` is `change.<t>` with `t` in the transition-type set, suggests `change transition --id <work-id> --input -` with an input of type `"<t>"`; (b) otherwise lists the known commands (rendered space-form, e.g. `change transition`). The error code and exit 2 are unchanged.

No new module, dependency, config, or event. Dependency direction unchanged: `commands.ts` already imports from `args.ts`.

## Alternatives

- **Silently accept inline JSON** (parse the string directly when it looks like JSON). Rejected: makes `--input` ambiguous (path vs literal), hides the intended stdin contract, and risks misparsing a real file path.
- **Reject unknown commands in `parseArgs`.** Rejected here: broader change to the parse/execute boundary; the `default`-case message is sufficient for the outcome and keeps the change bounded.
- **Edit-distance suggestions.** Rejected: adds logic for marginal benefit; the transition-type special case covers the documented top error.
- **Change `resolveInside` to detect JSON.** Rejected: `resolveInside` is a security-sensitive path validator reused widely; input-format concerns belong at the CLI input seam.

## Simplicity decision

- Selected rung: direct local change at the CLI input seam (two guarded branches + one exported constant).
- Earlier rungs: need is real (recurring top errors); no local reuse produces the actionable message; no runtime/stdlib/platform/dependency provides it.
- Irreducible complexity: distinguishing an inline-JSON string from a path, and mapping an unknown `change.<t>` to the transition hint.
- Safety floor: preserve the `--input <file|->` contract, `resolveInside` path-safety, all successful invocations, and exit-code semantics (usage errors stay exit 2). Full gate must stay green.
- Expected surface delta: modify `src/cli/commands.ts`, `src/cli/args.ts`, `src/cli/cli.test.ts`. No new files, dependencies, config, or events.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | Inline-JSON detection keys on a leading `{`/`[` | A file literally named `{…}`/`[…]` would be misread as inline JSON | A user reports a legitimate path starting with `{`/`[` rejected | Add an `existsSync` fallback: only reject when the JSON-looking string is not an existing file |
| DC-2 | Suggestion is a static known-commands list + transition-type special case | No fuzzy match for arbitrary typos (e.g. `chnage`) | Telemetry shows unknown-command errors dominated by near-miss typos | Add edit-distance nearest-command matching |

## Compatibility and rollout

- Additive error-message changes only; no successful invocation changes, no on-disk or event-schema change. `--input -` (stdin) and workspace-relative file inputs behave exactly as before. Rollback = revert the branch; no migration. Observability improves (actionable errors). No security/privacy/performance/accessibility impact; `resolveInside` is untouched.

## Risks and mitigations

- A real file path beginning with `{`/`[` is misdetected as inline JSON. Mitigation: DC-1 upgrade path; such filenames are pathological; documented. Early signal: a user report.
- The known-commands list drifts from the actual switch. Mitigation: derive `KNOWN_COMMANDS` from `COMMAND_OPTIONS`, the same table `parseArgs` uses; a new command added there appears automatically.
- Changed message breaks an external matcher. Mitigation: no test asserts the current strings; exit code and `INVALID_ARGUMENT` code preserved.

## Acceptance criteria

- AC-1: Running a `--input` command with inline JSON (a value starting with `{` or `[`, not `-`) exits 2 with an `INVALID_ARGUMENT` error whose message directs the caller to use `--input -` with stdin, rather than an `INVALID_WORKSPACE` path error.
- AC-2: Running `change begin` (an unknown `change.<transition-type>` command) exits 2 with an `INVALID_ARGUMENT` error whose message references `change transition`.
- AC-3: Running an unknown command with no transition-type suffix (e.g. `frobnicate`) exits 2 with an `INVALID_ARGUMENT` error whose message lists known commands.
- AC-4: A valid `--input -` stdin invocation and a valid workspace-relative file-path `--input` invocation both still succeed (no regression) — the existing CLI suite stays green.
- AC-5: `npm run verify` exits 0 on the candidate (enforced at Apply seal by `.codepatrol/config.json` `applyGate`).

## Decisions and open questions

- Decided (maintainer, this session): next finding to attack = F5 CLI input ergonomics (chosen over F2 usage and F4 persona for value × bounded × low-risk).
- Decided: keep `--input <file|->` contract; inline JSON is a usage error, not a new input mode.
- Decided: absolute-path input messages are already adequate; out of scope.
- No open question can materially change scope, interfaces, or acceptance.
