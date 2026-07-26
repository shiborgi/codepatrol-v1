# Plan — Validate `change session` stage/attempt at the CLI boundary

- Work id: `2026-07-25-session-input-validation`
- Governing spec: `spec.md`
- Target baseline: `main` @ `5bd9e30` (branch `codepatrol/2026-07-25-session-input-validation`)

## Goal and approach

Stop a malformed `change session` request from surfacing a generic downstream
`CHANGE_CONFLICT: Session <stage>/<attempt> is not the current attempt.`
(`undefined` attempt, wrong stage string) when the real defect is a missing or
invalid field in the caller's own `session.json`. Add one structural guard —
`requireSessionCoordinates` — at the top of the existing `case
"change.session":` block in `src/cli/commands.ts`, run before any of the five
action branches dispatch into `src/change/session.ts`. It rejects a bad
`stage`/`attempt` with `INVALID_ARGUMENT` naming the field and pointing at
`codepatrol change inspect --id <work-id>`. A well-formed but stale
`stage`/`attempt` still falls through to `session.ts`'s existing semantic
`CHANGE_CONFLICT` check, unchanged. Pair the code fix with a documented
`session.json` example in `skills/_shared/CODEPATROL-CLI.md` so a harness has
a worked shape to copy instead of guessing.

## Global constraints

- No new dependency; validation is hand-written `if`/`throw CodepatrolError`,
  matching every other check already in `src/cli/commands.ts` and
  `src/cli/args.ts`.
- `src/change/session.ts` is not modified — its `CHANGE_CONFLICT` check
  (`session.ts:157`, `:215`) is correct and stays the authority for genuine
  stage/attempt drift (AC-3).
- Every existing well-formed caller (the five lifecycle skills, which always
  source `stage`/`attempt` from a preceding `change inspect`) must remain
  unaffected — no behavior change for valid input.
- Forbidden: touching the `itemId`-guess failure mode, the checkpoint
  undeclared-paths failure mode, or the `change.transition` schema — all out
  of scope per spec.

## Simplicity proof

- Selected rung: direct local change
- Reused capabilities: `STAGES`/`Stage` from `src/change/types.ts`;
  `CodepatrolError` from `src/shared/errors.ts`; the existing
  `requireValue`/`readJsonInput` validation style in `src/cli/commands.ts`;
  the `workspace()`/`run()`/hand-written-`change.yaml` test harness already in
  `src/cli/cli.test.ts`.
- Forbidden speculative surface: no schema-validation library; no validation
  of `itemId`/`actor`/`result`/`artifacts` beyond what already exists
  (deferred as DC-1); no new CLI flag or config.
- Expected surface delta: 1 modified source file (`src/cli/commands.ts`,
  ~15 lines), 1 modified doc file (`skills/_shared/CODEPATROL-CLI.md`,
  ~15 lines), 1 modified test file (`src/cli/cli.test.ts`, 3 new `test()`
  blocks). No new files.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T1 | `node --import jiti/register --test src/cli/cli.test.ts` — new test "CLI change session rejects an invalid stage before touching session state" |
| AC-2 | T1 | same file — new test "CLI change session rejects a missing or invalid attempt before touching session state" |
| AC-3 | T1 | same file — new test "CLI change session still reports CHANGE_CONFLICT for a well-formed but stale stage/attempt" |
| AC-4 | T2 | manual inspection of `skills/_shared/CODEPATROL-CLI.md` diff + `npm run lint:skills` |

## Dependency order

`T1 → T2` (T2's doc example should reflect T1's finished field list/behavior,
low-risk ordering, not a hard technical dependency) `→ T3`. T3 is the final
verification task and depends on both.

### T1 — Validate `stage`/`attempt` at the `change.session` CLI boundary

**Purpose:** Satisfies AC-1, AC-2, AC-3 — reject malformed `stage`/`attempt`
with an actionable `INVALID_ARGUMENT` before it reaches `session.ts`, while
leaving the genuine semantic `CHANGE_CONFLICT` check untouched.

**Depends on:** None

**Files:**

- Modify: `src/cli/commands.ts` — add `requireSessionCoordinates` helper and
  call it at the top of `case "change.session":`
- Modify: `src/cli/cli.test.ts` — add 3 new `test()` blocks

**Interfaces:**

- Consumes: `STAGES` (value import, add alongside the existing `Stage` type
  import) from `../change/types.js`; `CodepatrolError` (already imported)
- Produces: `function requireSessionCoordinates(payload: { stage?: unknown;
  attempt?: unknown }, id: string): { stage: Stage; attempt: number }`
  (module-private in `src/cli/commands.ts`, placed near `requireSeed`)
- Invariants/errors: throws `CodepatrolError("INVALID_ARGUMENT", <message>,
  2)` if `payload.stage` is not a member of `STAGES`, or if `payload.attempt`
  fails `Number.isSafeInteger(x) && x >= 1`; otherwise returns the narrowed
  pair unchanged. Never called for a stage/attempt pair that is well-formed —
  those still reach `session.ts` and its existing `CHANGE_CONFLICT` check.

**Simplicity proof:** Reuses the existing `STAGES` enum and
`CodepatrolError`/`requireValue` throw style already used for every other
`change.session` field (`itemId`, `actor`, `result`); no new abstraction, one
function colocated with its one call site.

**Surface delta:** +1 helper function and 1 call-site edit in
`src/cli/commands.ts` (~15 lines); +3 test cases in `src/cli/cli.test.ts`; no
dependency, config, or public interface change.

**Steps:**

1. Add the three red-capable tests below to `src/cli/cli.test.ts`, appended
   after the existing `"CLI change session supports read-only status
   projection"` test (reuse the file's `workspace()`/`run()`/`git()` helpers
   already imported at the top):

   ```typescript
   test("CLI change session rejects an invalid stage before touching session state", () => {
     const root = workspace();
     try {
       const result = run(["change", "session", "--id", "does-not-matter", "--input", "-", "--workspace", root, "--format=json"], JSON.stringify({ action: "prime", stage: "bogus", attempt: 1 }));
       assert.equal(result.status, 2, result.stderr || result.stdout);
       const error = JSON.parse(result.stdout).error;
       assert.equal(error.code, "INVALID_ARGUMENT");
       assert.match(error.message, /stage/i);
       assert.match(error.message, /change inspect/);
     } finally { rmSync(root, { recursive: true, force: true }); }
   });

   test("CLI change session rejects a missing or invalid attempt before touching session state", () => {
     const root = workspace();
     try {
       const missing = run(["change", "session", "--id", "does-not-matter", "--input", "-", "--workspace", root, "--format=json"], JSON.stringify({ action: "prime", stage: "plan" }));
       assert.equal(missing.status, 2, missing.stderr || missing.stdout);
       const missingError = JSON.parse(missing.stdout).error;
       assert.equal(missingError.code, "INVALID_ARGUMENT");
       assert.match(missingError.message, /attempt/i);
       assert.match(missingError.message, /change inspect/);

       const zero = run(["change", "session", "--id", "does-not-matter", "--input", "-", "--workspace", root, "--format=json"], JSON.stringify({ action: "prime", stage: "plan", attempt: 0 }));
       assert.equal(zero.status, 2, zero.stderr || zero.stdout);
       assert.equal(JSON.parse(zero.stdout).error.code, "INVALID_ARGUMENT");
     } finally { rmSync(root, { recursive: true, force: true }); }
   });

   test("CLI change session still reports CHANGE_CONFLICT for a well-formed but stale stage/attempt", () => {
     const root = workspace();
     try {
       const id = "2026-07-25-stale-attempt";
       const started = run(["change", "start", "--input", "-", "--workspace", root, "--format=json"], JSON.stringify({ workId: id, title: "Stale attempt regression", targetBranch: "main", actor: "codex" }));
       assert.equal(started.status, 0, started.stderr || started.stdout);

       const wrongStage = run(["change", "session", "--id", id, "--input", "-", "--workspace", root, "--format=json"], JSON.stringify({ action: "prime", stage: "review", attempt: 1 }));
       assert.equal(wrongStage.status, 4, wrongStage.stderr || wrongStage.stdout);
       const wrongStageError = JSON.parse(wrongStage.stdout).error;
       assert.equal(wrongStageError.code, "CHANGE_CONFLICT");
       assert.equal(wrongStageError.message, "Session review/1 is not the current attempt.");

       const wrongAttempt = run(["change", "session", "--id", id, "--input", "-", "--workspace", root, "--format=json"], JSON.stringify({ action: "prime", stage: "plan", attempt: 2 }));
       assert.equal(wrongAttempt.status, 4, wrongAttempt.stderr || wrongAttempt.stdout);
       assert.equal(JSON.parse(wrongAttempt.stdout).error.code, "CHANGE_CONFLICT");
     } finally { rmSync(root, { recursive: true, force: true }); }
   });
   ```

2. Run `node --import jiti/register --test src/cli/cli.test.ts`.
   Expected red: the first two new tests fail — today's code passes
   `payload.stage`/`payload.attempt` straight through, so `stage: "bogus"`
   and missing/zero `attempt` currently surface as `CHANGE_CONFLICT` (exit 4)
   or a different failure, not `INVALID_ARGUMENT` (exit 2). The third test
   (stale-but-well-formed) is a characterization test and is expected to
   already pass (existing `session.ts` behavior) — confirm it is green even
   before the implementation step, to prove it characterizes current
   behavior rather than asserting a future change.
3. In `src/cli/commands.ts`, change the type-only import
   `import type { CloseInput, Stage, StartChangeInput, TransitionIntent }
   from "../change/types.js";` to also value-import `STAGES`:
   `import { STAGES } from "../change/types.js";` alongside the existing
   type import (two import statements, or one combined — match the file's
   existing import style). Add, near `requireSeed`:

   ```typescript
   function requireSessionCoordinates(payload: { stage?: unknown; attempt?: unknown }, id: string): { stage: Stage; attempt: number } {
   	const hint = `Run \`codepatrol change inspect --id ${id}\` to read the current stage and attempt.`;
   	if (typeof payload.stage !== "string" || !STAGES.includes(payload.stage as Stage)) {
   		throw new CodepatrolError("INVALID_ARGUMENT", `Session stage must be one of ${STAGES.join(", ")}; got ${JSON.stringify(payload.stage) ?? "(missing)"}. ${hint}`, 2);
   	}
   	if (typeof payload.attempt !== "number" || !Number.isSafeInteger(payload.attempt) || payload.attempt < 1) {
   		throw new CodepatrolError("INVALID_ARGUMENT", `Session attempt must be a positive integer; got ${JSON.stringify(payload.attempt) ?? "(missing)"}. ${hint}`, 2);
   	}
   	return { stage: payload.stage as Stage, attempt: payload.attempt };
   }
   ```

4. In the `case "change.session":` block, immediately after `const payload =
   readJsonInput(...) as {...}`, add `const { stage, attempt } =
   requireSessionCoordinates(payload, id);` and replace every
   `payload.stage`/`payload.attempt` reference in the five action branches
   with `stage`/`attempt`.
5. Run `node --import jiti/register --test src/cli/cli.test.ts`.
   Expected green: all tests in the file pass, including the existing "CLI
   change session supports read-only status projection" test (unaffected —
   it always sent well-formed `stage`/`attempt`).
6. Run `npm run typecheck`.
   Expected: no new errors — the value+type import split for
   `STAGES`/`Stage` must not break the existing `Stage` type usages
   elsewhere in the file.

**Task result:** changed paths, red/green evidence, deviations, and
assessment are appended to `apply/journal.md`.

### T2 — Document the `session.json` payload shape

**Purpose:** Satisfies AC-4 — give a harness a worked example to copy so it
stops guessing the field set (the documentation half of the root cause).

**Depends on:** T1 (reflects the finished, validated field behavior; not a
hard technical dependency — could be written first, but sequencing after T1
avoids documenting a shape that changes mid-Change)

**Files:**

- Modify: `skills/_shared/CODEPATROL-CLI.md`

**Interfaces:**

- Produces: a fenced JSON example block plus one sentence, added directly
  under the existing line-10 reference to `codepatrol change session
  --id <work-id> --input session.json ...`. No code interface — doc only.

**Simplicity proof:** Pure documentation addition next to the existing
one-line command list; no new file, no restructuring of the doc.

**Surface delta:** ~15 lines added to one existing markdown file.

**Steps:**

1. After the existing fenced command-list block in
   `skills/_shared/CODEPATROL-CLI.md` (the block containing the `codepatrol
   change session --id <work-id> --input session.json ...` line), add a new
   fenced JSON example and one sentence:

   ````markdown
   `session.json` for `change session` carries all fields for its `action`;
   `stage`/`attempt` must come from a fresh `change inspect` projection, never
   assumed or hardcoded:

   ```json
   {
     "action": "claim",
     "stage": "apply",
     "attempt": 1,
     "itemId": "t1-note-store",
     "actor": "claude-sonnet-5"
   }
   ```
   ````

2. Run `npm run lint:skills`.
   Expected: passes with no new warnings (confirms the doc edit does not
   break any skill-contract assertion that inspects `_shared/*.md`).

**Task result:** changed paths and verification evidence are appended to
`apply/journal.md`.

### T3 — Final verification

**Purpose:** Confirms all four acceptance criteria hold together, the full
gate is green, and the actual surface delta matches the spec forecast.

**Depends on:** T1, T2

**Files:** None (verification only; no new files)

**Steps:**

1. Run `npm run verify` (typecheck + full test suite + build + smoke-cli +
   lint-skills).
   Expected: all steps pass, 0 failures, no new warnings.
2. Run `git diff --stat main...HEAD` (or equivalent against the base commit)
   and confirm the changed-file set is exactly: `src/cli/commands.ts`,
   `src/cli/cli.test.ts`, `skills/_shared/CODEPATROL-CLI.md` — no undeclared
   work.
3. Re-read AC-1 through AC-4 against the three new tests (T1) and the doc
   diff (T2); confirm each is satisfied by name.
4. Confirm actual surface delta (3 files, ~45 lines total) matches the
   spec's "Expected surface delta" forecast; no unexplained difference to
   reconcile.
5. Confirm no `DC-1` trigger fired (no fourth `session.json` field implicated
   by evidence gathered during this Change); if it had, the upgrade path in
   `spec.md`'s Deferred constraints table would apply — it does not.
6. Graph sync: not required — no symbol-level structural change (no new
   exported module, no renamed public interface); `commands.ts`'s existing
   exports are unchanged. State this explicitly rather than running
   `codepatrol graph sync` needlessly.
7. Rollback check: confirm `git revert` of the single resulting commit would
   cleanly restore prior (unvalidated) behavior — no migration or data
   dependency was introduced (matches spec's Compatibility and rollout
   section).

**Task result:** final gate output, diff reconciliation, and residual-risk
statement are appended to `apply/journal.md`.
