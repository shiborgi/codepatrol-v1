# Investigation — codepatrol-git two-way backlog/GitHub-issue sync

## Origin and governing-constraint conflict

The user asked (verbatim, pt-BR): "crie um novo comando codepatrol-git que sincroniza backlog com
issues do git. que seja de 2 vias" (create a new command codepatrol-git that syncs the backlog
with git[Hub] issues, two-way).

`CONTEXT.md:52-54` lists **Rejected Integration Surface**: "hosted agent runtimes, provider
memory, external issue trackers and remote Git automation remain outside the local-only contract
**unless a future Change explicitly adopts them**." This request is exactly that explicit
adoption — the user is asking, in plain language, for this specific Change to adopt an external
issue tracker. Confirmed with the user directly (two clarifying questions on pull-filter scope and
push-trigger policy, both answered) before writing this spec, since overriding a documented
rejected-surface clause is a material decision, not an implementation detail.

## Confirmed environment facts

- `git remote -v` → `origin https://github.com/shiborgi/codepatrol.git`. `gh repo view --json
  visibility,isPrivate` → `{"isPrivate":false,"visibility":"PUBLIC"}`. The target repo is public,
  so pushing backlog evidence (repo-relative `file:line` strings, already public in this repo) as
  public GitHub issue bodies carries no confidentiality risk.
- `gh --version` → 2.96.0, already authenticated (`gh repo view` succeeded without prompting).
- `gh issue list --state all --json number,title,state,url,body,labels,updatedAt --limit 20` →
  `[]`. Zero existing issues — no legacy data to reconcile or collide with.
- `gh issue create --help` confirms flags `-t/--title`, `-b/--body`, `-l/--label`; on success it
  prints the created issue's URL to stdout (no `--json` flag exists for `create`), so the issue
  number must be parsed from the returned URL.
- `gh issue close --help` confirms `gh issue close <number> --reason {completed|not
  planned|duplicate}`.
- `gh label create <name> --color --description --force` confirms `-f/--force` makes label
  creation idempotent (updates instead of erroring if the label already exists) — no separate
  existence check needed.

## Existing architecture to reuse

- `src/change/git.ts:7-30` (`GitAdapter` interface + `NodeGitAdapter`): subprocess wrapper around a
  CLI (here `git`) via `execFile`, translating failures to `CodepatrolError("OPERATION_FAILED", ...)`
  and exposing an interface injectable through `OperationOptions.git` (`src/change/orchestrator.ts:23`
  `gitFor`). This is the exact idiom to mirror for a `GhAdapter`/`NodeGhAdapter` wrapping the `gh`
  CLI — same subprocess-wrapper-plus-injectable-interface shape, same error translation.
- `src/change/backlog.ts` is the complete backlog schema/storage module: `BacklogItem`,
  `BacklogSource`, strict allow-listed keys (`ALLOWED_ITEM_KEYS`, `ALLOWED_SOURCE_KEYS`,
  `ALLOWED_ROOT_KEYS`), `readBacklog`/`writeBacklog` (atomic write via `atomicWriteFile`),
  `upsertBacklogItem`, `linkBacklogItem`, `listBacklog`, `findBacklogItem`. Every current
  `BacklogSourceKind` (`"close-trace" | "plan-followup"`) requires `source.workId` to be a
  non-empty string (`validateSource`, `backlog.ts:47-54`) because both existing sources are always
  attributed to a Change.
- **Gap confirmed**: `BacklogStatus` includes `"done"` and `"dismissed"` in the type and validator
  (`backlog.ts:9,31`), but grepping the whole `src/` tree shows no function ever sets either value
  — only `"candidate"` (item creation) and `"scheduled"` (`linkBacklogItem`) are ever written. This
  Change is the first to give `"dismissed"` a real transition (via pull, when a linked GitHub issue
  closes) and the first to let a `"done"`/`"dismissed"` item trigger a real effect (via push,
  closing the linked issue). `"done"` itself is not set by this Change — nothing in the current
  codebase sets it on Close, and adding that transition is a separate, unrelated gap (out of
  scope).
- `src/cli/args.ts` command dispatch is `<group>.<verb>` from two positionals
  (`args.ts:96` `positionals.slice(0, 2).join(".")`), validated per-command against
  `COMMAND_OPTIONS` (a `Map<string, Set<string>>`, e.g. `["backlog.add", new
  Set(["input"])]`, `args.ts:44-56`). Adding a command means: a new `KNOWN` option name, a new
  `COMMAND_OPTIONS` entry, a new `ParsedArgs` field populated in the return object, a new `case` in
  `src/cli/commands.ts`'s `executeCommand` switch, and a new section in `HELP`
  (`src/cli/output.ts:33-61`).
- `skills/catalog.yaml` + `scripts/lint-skills.mjs` enforce a **closed set of exactly six primary
  skills** (`lint-skills.mjs`: `const primaryWorkflows = ["codepatrol-plan", "codepatrol-review",
  "codepatrol-apply", "codepatrol-verify", "codepatrol-close", "codepatrol-status"]`; later:
  `if (declaredPrimaries.join(",") !== [...primaryWorkflows].sort().join(",")) failures.push(...)`).
  A new skill **must** be `role: support` to pass `npm run lint:skills`. `role: support` also
  matches `CONTEXT.md`'s own definition: "**Support Skill** — a bounded capability invoked behind a
  Public Workflow." Ten support skills already exist (`assess-change`, `codebase-design`,
  `diagnose-bug`, `domain-modeling`, `execute-change`, `grilling`, `research-technology`,
  `solution-simplification`, `verification-strategy`, `writing-plans`); `codepatrol-git` becomes
  the eleventh, invoked directly by the user rather than by another skill — no rule in
  `lint-skills.mjs` requires a non-empty `invokedBy`, and `codepatrol-status` is already listed as
  `role: primary`, `invokedBy: []` (directly user-invoked with no calling skill), confirming a
  standalone, directly-invoked skill with an empty `invokedBy` is an accepted, existing shape.
- `scripts/skills-contract.test.mjs:9-11,17` hardcodes the exact ten-name `support` array and
  asserts the catalog's support-role set equals it exactly
  (`assert.deepEqual(...support skills..., [...support].sort())`). This test **must** be updated
  to add `"codepatrol-git"` or it fails after the new catalog entry is added — this is required,
  in-scope work, not an incidental side effect.
- `scripts/lint-skills.mjs` frontmatter rule: a `SKILL.md` frontmatter block may contain only
  `name` and `description` (`keys.join(",") !== "description,name"` fails otherwise) — matches
  every existing skill file.
- `scripts/lint-skills.mjs`'s `executionProtocolSkills` set (skills required to reference
  `EXECUTION.md`) is exactly the five ordered lifecycle skills plus `diagnose-bug` and
  `execute-change`. `codepatrol-git` is not in that set and does no bounded/parallel decomposition
  work, so it is not required to reference `EXECUTION.md`, and adding that reference would be
  unjustified surface.
- `scripts/package-contract.test.mjs` does not enumerate individual skill names (only structural
  existence of `skills/`, `skills/catalog.yaml`, `skills/_shared/*`) — confirmed no change needed
  there.

## Design implication

Every fact above points to one bounded design: a new `src/change/issue-sync.ts` module (mirroring
`git.ts`'s adapter idiom) driving reconciliation between `gh issue list` output and
`.codepatrol/backlog/items.yaml` (via `backlog.ts`'s existing read/write/validate functions, after
widening its schema to accept a `"github-issue"` source with no `workId` and an optional
`externalRef`), wired into the CLI as `issues sync` (`src/cli/args.ts`, `src/cli/commands.ts`,
`src/cli/output.ts`), and exposed to the user as a new, directly-invoked `support`-role skill named
`codepatrol-git` (`skills/codepatrol-git/SKILL.md` + a `skills/catalog.yaml` entry +
`scripts/skills-contract.test.mjs` update).
