# Plan investigation evidence

Baseline: `main` @ `5ed48226999d1a3d116fade28bee0652732a4db4`; branch `codepatrol/2026-07-24-cli-input-ergonomics`.

## Seams (F5)

- `src/cli/commands.ts:45-49` — `readJsonInput`: `const raw = input === "-" ? readFileSync(0,"utf8") : readFileSync(resolveInside(workspace, input, true), "utf8");` → inline JSON is resolved as a path.
- `src/shared/workspace.ts:28-55` — `resolveInside` throws `INVALID_WORKSPACE` (exit 3): `Path must be workspace-relative` (absolute), `Path does not exist in the workspace` (missing). This is the obscure error surfaced today.
- `src/cli/commands.ts:145-146` — `default: throw new CodepatrolError("INVALID_ARGUMENT", \`Unknown command: ${args.command || "(none)"}\`, 2);` — no suggestion.
- `src/cli/args.ts:36-54` — `COMMAND_OPTIONS` map holds the exact valid-command set; `:95` `command = positionals.slice(0,2).join(".")`; unknown command falls through (no option validation) to the `default` case.
- `src/change/types.ts:46-51` — transition types: `begin|usage|checkpoint|return|block|resume`.
- `src/cli/output.ts:38-57` — `HELP` already documents `--input <file|->`; no help change needed.

## Safety checks

- `grep` for `Unknown command` / `not valid JSON` / `input -` across `src` and `scripts` test files: no test asserts these messages → safe to change.
- `src/cli/main.ts:72-81` — errors render as `error.code: message` (text) or JSON envelope; exit code = `error.exitCode`. `INVALID_ARGUMENT` → exit 2. Confirms the actionable errors will surface with exit 2 and the `INVALID_ARGUMENT` code.

## Telemetry motivation

- `docs/codepatrol/improvement-reports/2026-07-24-architecture-assessment.md:21,24` — top error `INVALID_ARGUMENT` ×6 sample `Unknown command: change.begin`; `INVALID_WORKSPACE` sample `Path must be workspace-relative: /tmp/review-transition.json`.
- Prior reports (`2026-07-24-apply-verify-gate.md`, `2026-07-24-aggregate-and-push.md`) recorded `INVALID_WORKSPACE` on `change.session` input — same class.

## Baseline health

- `npm run verify` exit 0 at `5ed4822` (157 tests) — established by the prior Change's Verify.
