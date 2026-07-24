# Plan — Uniform, harness-independent stage input and output

- Work id: `2026-07-24-uniform-stage-io`
- Governing spec: `spec.md`
- Target baseline: `main` @ `5674289d953cb32b7b178029e10ca78fdb72141a`; clean worktree; `npm run verify` green.

## Goal and approach

Add two deterministic CLI commands — `codepatrol next [--stage <s>]` (stage-scoped Change list with affordances) and `codepatrol change summary --id <id>` (uniform Summary/Verdict/Next block) — then wire every lifecycle skill to reproduce them verbatim on entry and exit, documented in a shared `STAGE-IO.md` and locked by the skills contract test. CLI is the single source of the standardized text. Two implementation tasks (CLI, then skills) plus a verification task.

## Global constraints

- Node ESM + TypeScript; `.js` import specifiers; two-tab indentation; terse style of `src/cli/*`.
- Reuse `inspectChanges`/`ChangeView`; no orchestrator, lifecycle, event, or schema change. `commit+push` uses the existing `push: true` path.
- Preserve every existing command, `inspect`/`status` behavior, and exit codes.
- No new dependencies or config.
- Gate that must stay green: `npm run typecheck && npm test && npm run build && npm run smoke:cli && npm run lint:skills`.

## Simplicity proof

- Selected rung: local reuse — two renderers over existing projections plus mechanical skill wiring.
- Reused capabilities: `inspectChanges`, `ChangeView`, `STAGES`, existing `run(...)` CLI test helper, existing skills-contract seam.
- Forbidden speculative surface: no `status`/`inspect` change, no orchestrator change, no paging, no verdict phrasing map.
- Expected surface delta: `src/cli/args.ts`, `src/cli/commands.ts`, `src/cli/output.ts`, `src/cli/cli.test.ts`; create `skills/_shared/STAGE-IO.md`; five `skills/codepatrol-*/SKILL.md`; `scripts/skills-contract.test.mjs`.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T1 | `node --test --import jiti/register src/cli/cli.test.ts` (`next --stage` lists stage Changes, text + json) |
| AC-2 | T1 | same suite (plan start-new affordance; close options; invalid stage → exit 2) |
| AC-3 | T1 | same suite (`change summary` three-line block + json) |
| AC-4 | T2 | `node --test --import jiti/register scripts/skills-contract.test.mjs` + `npm run lint:skills` |
| AC-5 | T3 | `npm run verify` exits 0 |

## Dependency order

`T1 → T2 → T3`. Disjoint file ownership (T1: `src/cli/*`; T2: skills + contract test; T3: none).

### T1 — CLI commands `next` and `change summary`

**Purpose:** Satisfies AC-1, AC-2, AC-3.

**Depends on:** None

**Files:**

- Modify: `src/cli/args.ts` — add `--stage` option; register `next` and `change.summary` in `COMMAND_OPTIONS`; add `stage` to `ParsedArgs`
- Modify: `src/cli/output.ts` — add `renderNext`, `renderSummary`; add both commands to `HELP`
- Modify: `src/cli/commands.ts` — add `next` and `change.summary` cases
- Modify: `src/cli/cli.test.ts` — tests for both commands

**Interfaces:**

- Produces:
  - `renderNext(stage: Stage | undefined, changes: ChangeView[]): string` and a JSON shape `{ stage, changes: [{workId,state,nextAction}], startNew, closeOptions? }`.
  - `renderSummary(view: ChangeView): string` and JSON `{ summary, verdict, next }`.
  - CLI commands `next` and `change.summary`.
- Consumes: `inspectChanges`, `ChangeView`, `STAGES`.
- Invariants/errors: `--stage` ∉ `STAGES` → `INVALID_ARGUMENT` (exit 2); `change summary` without `--id` → existing missing-option error.

**Simplicity proof:** Reuse `inspectChanges`/`ChangeView`; renderers mirror `renderOverview`/`renderImpact`; command routing mirrors existing cases.

**Steps:**

1. Add CLI tests to `src/cli/cli.test.ts` (reuse `run`, `workspace`, `git`). Cover: start a Change (it lands at plan); `codepatrol next --stage plan --format=json` lists it with `nextAction`, `startNew: true`; text output mentions the work id and a start-new line; `next --stage close --format=json` includes `closeOptions` `["commit","commit+push","rollback"]`; `next --stage bogus` exits 2 with `INVALID_ARGUMENT`; `change summary --id <id> --format=json` returns `{summary,verdict,next}` with `verdict` reflecting the plan attempt state and `next` equal to the projected next action; text output has three lines starting `Summary:`, `Verdict:`, `Next:`.

   ```typescript
   test("codepatrol next lists Changes by stage with affordances", () => {
     const root = workspace();
     try {
       const id = "2026-07-22-io-demo";
       assert.equal(run(["change","start","--input","-","--workspace",root,"--format=json"], JSON.stringify({ workId: id, title: "IO", targetBranch: "main", actor: "codex" })).status, 0);
       const plan = run(["next","--stage","plan","--workspace",root,"--format=json"]);
       assert.equal(plan.status, 0, plan.stderr);
       const pd = JSON.parse(plan.stdout).data;
       assert.equal(pd.changes[0].workId, id);
       assert.equal(pd.startNew, true);
       const close = JSON.parse(run(["next","--stage","close","--workspace",root,"--format=json"]).stdout).data;
       assert.deepEqual(close.closeOptions, ["commit","commit+push","rollback"]);
       const bad = run(["next","--stage","bogus","--workspace",root,"--format=json"]);
       assert.equal(bad.status, 2); assert.equal(JSON.parse(bad.stdout).error.code, "INVALID_ARGUMENT");
     } finally { rmSync(root, { recursive: true, force: true }); }
   });

   test("codepatrol change summary renders a uniform Summary/Verdict/Next block", () => {
     const root = workspace();
     try {
       const id = "2026-07-22-io-sum";
       run(["change","start","--input","-","--workspace",root,"--format=json"], JSON.stringify({ workId: id, title: "IO", targetBranch: "main", actor: "codex" }));
       const j = JSON.parse(run(["change","summary","--id",id,"--workspace",root,"--format=json"]).stdout).data;
       assert.ok(j.summary && j.verdict && j.next);
       const text = run(["change","summary","--id",id,"--workspace",root]).stdout;
       assert.match(text, /^Summary:/m); assert.match(text, /^Verdict:/m); assert.match(text, /^Next:/m);
     } finally { rmSync(root, { recursive: true, force: true }); }
   });
   ```

2. Run `node --test --import jiti/register src/cli/cli.test.ts`.
   Expected red: `next` and `change summary` are unknown commands (parse/executeCommand errors). Not a setup failure.
3. Implement `src/cli/args.ts`: add `"stage"` to `KNOWN`; add `stage: values.get("stage")?.[0]` to `ParsedArgs` (and the interface field `stage?: string`); register `["next", new Set(["stage"])]` and `["change.summary", new Set(["id"])]` in `COMMAND_OPTIONS`.
4. Implement `src/cli/output.ts`: add `renderNext(stage, changes)` and `renderSummary(view)` per the spec's formats; add `next` and `change summary` lines to `HELP`.
5. Implement `src/cli/commands.ts`:
   - `case "next"`: validate `args.stage` against `STAGES` (throw `INVALID_ARGUMENT` if present and invalid); `const changes = (await inspectChanges(workspace, { all: true }, { signal })).filter((v) => v.state !== "terminal" && (!args.stage || v.stage === args.stage));` build the JSON data `{ stage: args.stage, changes: changes.map((v) => ({ workId: v.identity.work_id, state: v.state, nextAction: v.nextAction })), startNew: args.stage === "plan" || !args.stage, ...(args.stage === "close" ? { closeOptions: ["commit","commit+push","rollback"] } : {}) }`; `text = renderNext(args.stage, changes)`.
   - `case "change.summary"`: `const view = (await inspectChanges(workspace, { workId: requireValue(args.id,"id"), all: true }, { signal }))[0];` build `{ summary, verdict, next }` and `text = renderSummary(view)`.
6. Run `node --test --import jiti/register src/cli/cli.test.ts`. Expected green.
7. Run `npm run typecheck && npm run smoke:cli`. Expected clean.

**Task result:** append changed paths, red/green evidence, and any deviation to `apply/journal.md`.

### T2 — Wire the lifecycle skills and shared contract

**Purpose:** Satisfies AC-4.

**Depends on:** T1

**Files:**

- Create: `skills/_shared/STAGE-IO.md`
- Modify: `skills/codepatrol-plan/SKILL.md`, `skills/codepatrol-review/SKILL.md`, `skills/codepatrol-apply/SKILL.md`, `skills/codepatrol-verify/SKILL.md`, `skills/codepatrol-close/SKILL.md`
- Modify: `scripts/skills-contract.test.mjs`

**Interfaces:**

- Produces: `STAGE-IO.md` describing the entry (`codepatrol next --stage <stage>`, verbatim) and exit (`codepatrol change summary --id <work-id>`, verbatim) contract, and the Close commit/commit+push/rollback options; each lifecycle skill references both commands and links `STAGE-IO.md`.
- Invariants/errors: assertions match stable tokens present only after the edits.

**Simplicity proof:** Reuse the existing skills-contract assertion seam; mechanical, per-skill prose additions modeled on `codepatrol-status`.

**Steps:**

1. Add to `scripts/skills-contract.test.mjs` a loop asserting each of `codepatrol-plan|review|apply|verify|close` SKILL.md contains `codepatrol next` and `codepatrol change summary`, and that `codepatrol-close` contains `commit+push`.
2. Run `node --test --import jiti/register scripts/skills-contract.test.mjs`. Expected red: assertions fail before the skill edits.
3. Write `skills/_shared/STAGE-IO.md` (entry/exit verbatim contract; Close options).
4. Edit each lifecycle SKILL.md: add an entry line (reproduce `codepatrol next --stage <stage>` verbatim; act on a named work id or choose from the list; Plan may start new; Close chooses commit/commit+push/rollback) and an exit line (after sealing, reproduce `codepatrol change summary --id <work-id>` verbatim). Keep existing preflight/seal instructions intact so their current skills-contract assertions still pass; link `../_shared/STAGE-IO.md`.
5. Run `node --test --import jiti/register scripts/skills-contract.test.mjs` and `npm run lint:skills`. Expected green.

**Task result:** append evidence to `apply/journal.md`.

### T3 — Final verification and reconciliation

**Purpose:** Confirms AC-5 and whole-Change integrity.

**Depends on:** T1, T2

**Files:**

- Modify: none (verification only)

**Steps:**

1. Map delivered paths back to AC-1…AC-5; confirm each check passed.
2. Run the full gate: `npm run verify`. Expected exit 0 (also enforced at the Apply `implemented` checkpoint by `.codepatrol/config.json` `applyGate`).
3. Inspect the final diff (`git diff --stat` vs base `5674289`) for undeclared work; confirm only the declared files changed.
4. Reconcile actual surface delta with the spec forecast; explain any difference in the journal.
5. Record whether any `DC-N` trigger activated (expected: none).
6. Run `codepatrol graph sync`; wiki remains absent (valid) — no wiki refresh required.
7. State rollback (revert branch; no migration) and residual risks.

**Task result:** append the final reconciliation to `apply/journal.md`.
