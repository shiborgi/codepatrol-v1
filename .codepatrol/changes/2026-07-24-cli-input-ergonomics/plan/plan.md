# Plan — CLI input ergonomics: actionable errors for inline JSON and unknown commands

- Work id: `2026-07-24-cli-input-ergonomics`
- Governing spec: `spec.md`
- Target baseline: `main` @ `5ed48226999d1a3d116fade28bee0652732a4db4`; clean worktree; `npm run verify` green.

## Goal and approach

Turn two obscure CLI errors into actionable ones, without touching any successful path. `readJsonInput` gains an inline-JSON guard; the `default` case of `executeCommand` gains a known-command / transition-type suggestion sourced from a new `KNOWN_COMMANDS` export. Both are pure message/validation changes at the CLI input seam. One implementation task (test-first) plus one verification task.

## Global constraints

- Node ESM + TypeScript; `.js` import specifiers; two-tab indentation; terse style of `src/cli/commands.ts`.
- Preserve the `--input <file|->` contract, `resolveInside` path-safety, and exit-code semantics (usage errors → `INVALID_ARGUMENT`, exit 2).
- No new dependencies, config keys, events, or files.
- Gate that must stay green: `npm run typecheck && npm test && npm run build && npm run smoke:cli && npm run lint:skills`.

## Simplicity proof

- Selected rung: direct local change at the CLI input seam.
- Reused capabilities: existing `readJsonInput`, `executeCommand` switch, `COMMAND_OPTIONS` table in `args.ts`, existing `run(...)` CLI test helper.
- Forbidden speculative surface: no new input mode, no edit-distance matching, no parse/execute refactor, no `resolveInside` change.
- Expected surface delta: modify `src/cli/commands.ts`, `src/cli/args.ts`, `src/cli/cli.test.ts`.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T1 | `node --test --import jiti/register src/cli/cli.test.ts` (inline-JSON input → exit 2, message names `--input -`) |
| AC-2 | T1 | same suite (`change begin` → exit 2, message names `change transition`) |
| AC-3 | T1 | same suite (`frobnicate` → exit 2, message lists known commands) |
| AC-4 | T1 | same suite: existing stdin + file-path input tests stay green |
| AC-5 | T2 | `npm run verify` exits 0 |

## Dependency order

`T1 → T2`. Single implementation task owns all three files; no concurrent same-file writes.

### T1 — Inline-JSON guard and unknown-command suggestion

**Purpose:** Satisfies AC-1, AC-2, AC-3, AC-4.

**Depends on:** None

**Files:**

- Modify: `src/cli/args.ts` — export `KNOWN_COMMANDS`
- Modify: `src/cli/commands.ts` — inline-JSON guard in `readJsonInput`; suggestion in the `default` case
- Modify: `src/cli/cli.test.ts` — CLI tests for the new errors

**Interfaces:**

- Produces: `export const KNOWN_COMMANDS: string[]` in `args.ts` (the `COMMAND_OPTIONS` keys).
- Consumes: `KNOWN_COMMANDS` in `commands.ts`.
- Invariants/errors: inline-JSON and unknown-command failures throw `CodepatrolError("INVALID_ARGUMENT", …, 2)`; successful invocations unchanged.

**Simplicity proof:** Reuse `COMMAND_OPTIONS` (already the parse-time source of valid commands) so the suggestion list cannot drift; add two guarded branches only.

**Surface delta:** +1 export in `args.ts`; one guard + one enriched `default` in `commands.ts`; new test blocks. No new files/deps/config.

**Steps:**

1. Add CLI tests to `src/cli/cli.test.ts` using the existing `run(args, input?)` helper (defined at `cli.test.ts:20`) and `workspace()`:

   ```typescript
   test("CLI rejects inline JSON passed to --input with an actionable error", () => {
     const root = workspace();
     try {
       const res = run(["change", "transition", "--id", "2026-07-22-x", "--input", '{"type":"begin"}', "--workspace", root, "--format=json"]);
       assert.equal(res.status, 2, res.stdout);
       const err = JSON.parse(res.stdout).error;
       assert.equal(err.code, "INVALID_ARGUMENT");
       assert.match(err.message, /--input -/);
     } finally { rmSync(root, { recursive: true, force: true }); }
   });

   test("CLI suggests change transition for an unknown change.<transition-type> command", () => {
     const root = workspace();
     try {
       const res = run(["change", "begin", "--workspace", root, "--format=json"]);
       assert.equal(res.status, 2, res.stdout);
       const err = JSON.parse(res.stdout).error;
       assert.equal(err.code, "INVALID_ARGUMENT");
       assert.match(err.message, /change transition/);
     } finally { rmSync(root, { recursive: true, force: true }); }
   });

   test("CLI lists known commands for an unknown command", () => {
     const root = workspace();
     try {
       const res = run(["frobnicate", "--workspace", root, "--format=json"]);
       assert.equal(res.status, 2, res.stdout);
       const err = JSON.parse(res.stdout).error;
       assert.equal(err.code, "INVALID_ARGUMENT");
       assert.match(err.message, /change start|graph sync/);
     } finally { rmSync(root, { recursive: true, force: true }); }
   });
   ```

   Reuse whatever `workspace()`/`run()`/`rmSync` imports the file already has (see the existing tests at `cli.test.ts:63-160`).
2. Run `node --test --import jiti/register src/cli/cli.test.ts`.
   Expected red: inline-JSON test currently yields `INVALID_WORKSPACE` (not `INVALID_ARGUMENT` / no `--input -`); `change begin` message lacks `change transition`; `frobnicate` message lacks a known-command list. Not a setup/syntax failure.
3. Implement in `src/cli/args.ts`: add `export const KNOWN_COMMANDS: string[] = [...COMMAND_OPTIONS.keys()];` after `COMMAND_OPTIONS`.
4. Implement in `src/cli/commands.ts`:
   - Import `KNOWN_COMMANDS` from `./args.js`.
   - In `readJsonInput`, before the `input === "-" ? … : readFileSync(resolveInside(...))` line, add: if `input !== "-"` and `input.trimStart()` starts with `{` or `[`, throw `new CodepatrolError("INVALID_ARGUMENT", \`${label} input looks like inline JSON, not a file path. Pipe it via stdin with \\\`--input -\\\` (for example: echo '<json>' | codepatrol … --input -) or write it to a workspace-relative file.\`, 2)`.
   - In the `default` case, compute `const suffix = args.command.startsWith("change.") ? args.command.slice(7) : "";` and `const transitionTypes = ["begin","usage","checkpoint","return","block","resume"];` then throw `INVALID_ARGUMENT` with, when `transitionTypes.includes(suffix)`, a message referencing `` `change transition --id <work-id> --input -` `` and the type `"${suffix}"`; otherwise a message ending `Known commands: ${KNOWN_COMMANDS.map((c) => c.replace(".", " ")).join(", ")}.` Keep the `Unknown command: ${args.command || "(none)"}` lead and exit 2.
5. Run `node --test --import jiti/register src/cli/cli.test.ts`.
   Expected green: all three new tests pass; existing `cli.test.ts` tests (stdin input, file-path input, status projection) still pass.
6. Run `npm run typecheck`. Expected: clean.

**Task result:** append changed paths, red/green evidence, and any deviation to `apply/journal.md`.

### T2 — Final verification and reconciliation

**Purpose:** Confirms AC-5 and whole-Change integrity.

**Depends on:** T1

**Files:**

- Modify: none (verification only)

**Steps:**

1. Map delivered paths back to AC-1…AC-5; confirm each check passed.
2. Run the full gate: `npm run verify`. Expected exit 0 (also enforced at the Apply `implemented` checkpoint by `.codepatrol/config.json` `applyGate`).
3. Inspect the final diff (`git diff --stat` vs base `5ed4822`) for undeclared work; confirm only the three declared files changed.
4. Reconcile actual surface delta with the spec forecast; explain any difference in the journal.
5. Record whether any `DC-N` trigger activated (expected: none).
6. Run `codepatrol graph sync`; wiki remains absent (valid) — no wiki refresh required.
7. State rollback (revert branch; no migration) and residual risks (F2, F3, F4, F6, F7 remain as recorded follow-ups).

**Task result:** append the final reconciliation to `apply/journal.md`.
