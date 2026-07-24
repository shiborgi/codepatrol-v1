# Plan investigation evidence

Baseline: `main` @ `5674289d953cb32b7b178029e10ca78fdb72141a`; branch `codepatrol/2026-07-24-uniform-stage-io`. Graph: 73 files, 1869 symbols.

## Current input/output surfaces

- `skills/codepatrol-status/SKILL.md:11-23` — the deterministic precedent: run `render-kanban.mjs`, "reproduce the script output verbatim … repeat each projected nextAction exactly." This design extends the same reproduce-verbatim rule to every stage.
- `src/cli/commands.ts:53-57` — `status` renders the Kanban. `:116-119` — `change.inspect` text `<id> <stage>#<attempt> <state>\nnext: <nextAction>`. No stage-scoped list; no uniform summary block.
- `src/change/board.ts:19-33` — `projectKanban`/`renderKanbanMarkdown` already project per-stage state + `nextAction` from `ChangeView`; new renderers reuse `inspectChanges` + `ChangeView`.
- `src/cli/output.ts:32-63,65-140` — `HELP` + `renderOverview`/`renderImpact` presentation-layer precedent for `renderNext`/`renderSummary`.
- `src/cli/args.ts:31-54` — `KNOWN` options, `COMMAND_OPTIONS` valid-command map (also feeds `KNOWN_COMMANDS`); `command = positionals.slice(0,2).join(".")`. Add `--stage`, `next`, `change.summary`.
- `src/change/types.ts:3` — `STAGES = ["plan","review","apply","verify","close"]` for `--stage` validation.

## Lifecycle skills (entry/exit today)

- Each of `codepatrol-{plan,review,apply,verify,close}/SKILL.md` opens with "run `codepatrol change inspect --id`" and ends with free-form "Report …". No stage-scoped entry list; no uniform exit block.
- `skills/codepatrol-close/SKILL.md:37` documents `push: true` — so `commit+push` already exists in the close input; the list only needs to surface it (no orchestrator change).
- `scripts/skills-contract.test.mjs` — existing per-skill assertions (SESSION.md, status verbatim) are the seam to lock the new wiring.

## Test harness

- `src/cli/cli.test.ts:1-20` — `run(args, input?)` (spawns `main.ts` via jiti), `workspace()` (git repo), `git(...)`. New command tests reuse these.

## Baseline health

- `npm run verify` exit 0 at `5674289` — established by the prior Change's Verify.
