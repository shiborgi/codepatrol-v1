# Plan — Decompose `transitionChangeLocked`: separate validation, persona semantics, and storage responsibilities

- Work id: `2026-07-26-decompose-transition-change`
- Governing spec: `spec.md`
- Target baseline: `main` @ `25b26fc` (branch `codepatrol/2026-07-26-decompose-transition-change`)

## Goal and approach

`transitionChangeLocked` (`src/change/orchestrator.ts:219-307`, 89 lines) is
this codebase's highest-blast-radius function — every lifecycle transition
funnels through it. Extract four named, single-responsibility private
helpers (`recoverIdempotentTransition`, `assertPersonaStageMatch`,
`assertNoConsolidationDivergence`, `buildCheckpointEvent`) that each move an
existing block **verbatim**, restructured only where an early-return or
guard-clause shape is needed to preserve identical control flow. Remove one
incidentally-discovered dead local (`declared`) while relocating the block
that contains it. Zero behavior change — proven by the unchanged 215-test
suite after each extraction, not asserted once at the end.

## Global constraints

- No file other than `src/change/orchestrator.ts` may change.
- No error code, error message, or control-flow order may change — every
  step transcribes the cited original lines, it does not re-derive logic
  from description.
- After **every** task (not just the last), `npm test` must show the
  identical 215/215 pass count before moving to the next task — this is the
  safety discipline for the highest-risk function in the codebase.
- The four new functions are private (unexported), matching every other
  helper already in this file.

## Simplicity proof

- Selected rung: direct local change
- Reused capabilities: every function called from the extracted bodies
  (`eventMatchesIntent`, `parseStatusPaths`, `commitMetadata`,
  `relativeRecord`, `personaSubEvents`, `isDivergentPersonaEvent`,
  `validateWorkspaceArtifacts`, `ensurePath`, `baselineRef`, `loadConfig`,
  `defaultGateRunner`, `gateOutputTail`, `eventBase`) is already a
  module-level function or import in this file — nothing new to add besides
  the four function declarations themselves.
- Forbidden speculative surface: no new test file (existing suite is the
  characterization gate — DC omitted from spec, not applicable here); no
  export of the new helpers; no further decomposition of
  `buildCheckpointEvent` (spec's DC-1).
- Expected surface delta: `src/change/orchestrator.ts` only. `transitionChangeLocked`
  shrinks from 89 to an estimated ~25-30 lines; four new functions appear
  immediately above it totaling roughly the same relocated line count, minus
  one dead line (`declared`).

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T1, T2, T3, T4 | Read the post-refactor `transitionChangeLocked` body |
| AC-2 | T4 | `awk` line-count command from spec's Current evidence |
| AC-3 | T4 | `grep -n "\bdeclared\b" src/change/orchestrator.ts` |
| AC-4 | T1, T2, T3, T4, T5 | `npm run verify` after every task |
| AC-5 | T5 | `git diff --stat` against base |

## Dependency order

`T1 → T2 → T3 → T4 → T5` (strictly sequential — each task edits the same
function; concurrent edits to `transitionChangeLocked` are unsafe by
construction, not merely disallowed by convention).

### T1 — Extract `recoverIdempotentTransition`

**Purpose:** Moves the idempotent-retry recovery block (storage/idempotency
concern) out of `transitionChangeLocked`. Partial progress toward AC-1, AC-4.

**Depends on:** None

**Files:**

- Modify: `src/change/orchestrator.ts`

**Interfaces:**

- Produces: `async function recoverIdempotentTransition(git: GitAdapter, workId: string, record: ChangeRecordV2, view: ChangeView, intent: TransitionIntent, options: OperationOptions): Promise<ChangeView | undefined>`
- Invariants: returns `undefined` when the original would have fallen
  through without returning (i.e., `eventMatchesIntent` is false); returns
  `view` in both original early-return cases; throws
  `CodepatrolError("CHANGE_CONFLICT", ...)` in the original throw case —
  identical to today.

**Simplicity proof:** Verbatim relocation of `orchestrator.ts:223-230`, only
restructured from a wrapping `if` to an early-return guard clause (identical
runtime behavior, since falling off the end of the wrapping `if` and
returning `undefined` from a guard clause are observationally the same to
the caller).

**Surface delta:** +1 function (~9 lines) placed immediately before
`transitionChangeLocked`; -8 lines / +2 lines at the call site.

**Steps:**

1. Insert this function immediately before `async function
   transitionChangeLocked` (i.e., directly after `assertCurrentBranch`
   ends, matching the file's existing helper-before-caller order):

   ```typescript
   async function recoverIdempotentTransition(git: GitAdapter, workId: string, record: ChangeRecordV2, view: ChangeView, intent: TransitionIntent, options: OperationOptions): Promise<ChangeView | undefined> {
   	if (!eventMatchesIntent(record.events.at(-1), intent)) return undefined;
   	const statusPaths = parseStatusPaths(await git.status(options.signal));
   	if (statusPaths.length === 0) return view;
   	if (statusPaths.length === 1 && statusPaths[0] === relativeRecord(workId)) {
   		await commitMetadata(git, workId, `chore(codepatrol): recover ${intent.type} ${intent.stage} ${workId}`, options.signal);
   		return view;
   	}
   	throw new CodepatrolError("CHANGE_CONFLICT", `Transition recovery found unrelated worktree paths: ${statusPaths.join(", ")}.`, 4);
   }
   ```

2. In `transitionChangeLocked`, replace the original inline block

   ```typescript
   if (eventMatchesIntent(record.events.at(-1), intent)) {
   	const statusPaths = parseStatusPaths(await git.status(options.signal));
   	if (statusPaths.length === 0) return view;
   	if (statusPaths.length === 1 && statusPaths[0] === relativeRecord(workId)) {
   		await commitMetadata(git, workId, `chore(codepatrol): recover ${intent.type} ${intent.stage} ${workId}`, options.signal); return view;
   	}
   	throw new CodepatrolError("CHANGE_CONFLICT", `Transition recovery found unrelated worktree paths: ${statusPaths.join(", ")}.`, 4);
   }
   ```

   with:

   ```typescript
   const recovered = await recoverIdempotentTransition(git, workId, record, view, intent, options);
   if (recovered) return recovered;
   ```

3. Run `npm run typecheck`. Expected: 0 errors.
4. Run `npm test`. Expected: identical 215/215 pass count, 0 failures —
   this is the "red-capable" signal for this behavior-preserving step: if
   the count or any test name/result differs, the extraction introduced a
   behavior change and must be corrected before proceeding, not carried
   forward.

**Task result:** diff for this step, and the `npm test` output, are
appended to `apply/journal.md`.

### T2 — Extract `assertPersonaStageMatch`

**Purpose:** Moves persona-aware stage-matching validation (persona
semantics) out of `transitionChangeLocked`. Partial progress toward AC-1,
AC-4.

**Depends on:** T1

**Files:**

- Modify: `src/change/orchestrator.ts`

**Interfaces:**

- Produces: `function assertPersonaStageMatch(record: ChangeRecordV2, view: ChangeView, intent: TransitionIntent): string | undefined`
- Invariants: returns the same `persona` value the original inline code
  computed (`(intent as { persona?: string }).persona`); throws the same
  `CHANGE_CONFLICT` in the same two cases (persona-active-attempt mismatch;
  non-persona stage mismatch) with identical messages.

**Simplicity proof:** Verbatim relocation of `orchestrator.ts:231-242`; the
computed `persona` is returned because every later branch in
`transitionChangeLocked` (the checkpoint builder, the consolidation guard,
the `return` event branch) reads the same value.

**Surface delta:** +1 function (~12 lines); -12 lines / +1 line at the call
site.

**Steps:**

1. Insert this function immediately after `recoverIdempotentTransition`
   (before `transitionChangeLocked`):

   ```typescript
   function assertPersonaStageMatch(record: ChangeRecordV2, view: ChangeView, intent: TransitionIntent): string | undefined {
   	const persona = (intent as { persona?: string }).persona;
   	if (persona && (intent.stage === "review" || intent.stage === "verify")) {
   		if (intent.stage !== view.stage) {
   			const personaSub = personaSubEvents(record.events, intent.stage, view.attempt);
   			if (personaSub.length === 0) {
   				const attempt = view.attempts[intent.stage].at(-1);
   				if (!attempt || attempt.status !== "active") throw new CodepatrolError("CHANGE_CONFLICT", `Cannot ${intent.type} ${intent.stage} attempt ${attempt?.attempt ?? 0}: attempt is ${attempt?.status ?? "missing"}.`, 4);
   			}
   		}
   	} else if (intent.stage !== view.stage) {
   		throw new CodepatrolError("CHANGE_CONFLICT", `Expected ${view.stage}, received ${intent.stage}.`, 4);
   	}
   	return persona;
   }
   ```

2. In `transitionChangeLocked`, replace the original inline block

   ```typescript
   const persona = (intent as { persona?: string }).persona;
   if (persona && (intent.stage === "review" || intent.stage === "verify")) {
   	if (intent.stage !== view.stage) {
   		const personaSub = personaSubEvents(record.events, intent.stage, view.attempt);
   		if (personaSub.length === 0) {
   			const attempt = view.attempts[intent.stage].at(-1);
   			if (!attempt || attempt.status !== "active") throw new CodepatrolError("CHANGE_CONFLICT", `Cannot ${intent.type} ${intent.stage} attempt ${attempt?.attempt ?? 0}: attempt is ${attempt?.status ?? "missing"}.`, 4);
   		}
   	}
   } else if (intent.stage !== view.stage) {
   	throw new CodepatrolError("CHANGE_CONFLICT", `Expected ${view.stage}, received ${intent.stage}.`, 4);
   }
   ```

   with:

   ```typescript
   const persona = assertPersonaStageMatch(record, view, intent);
   ```

3. Run `npm run typecheck`. Expected: 0 errors.
4. Run `npm test`. Expected: identical 215/215.

**Task result:** diff and `npm test` output appended to `apply/journal.md`.

### T3 — Extract `assertNoConsolidationDivergence`

**Purpose:** Moves the consolidation-divergence guard (persona semantics)
out of `transitionChangeLocked`. Partial progress toward AC-1, AC-4.

**Depends on:** T2

**Files:**

- Modify: `src/change/orchestrator.ts`

**Interfaces:**

- Produces: `function assertNoConsolidationDivergence(record: ChangeRecordV2, view: ChangeView, intent: TransitionIntent, persona: string | undefined): void`
- Invariants: throws `CONSOLIDATION_AFTER_SUBEVENTS` under the exact same
  condition as the original (non-persona checkpoint on review/verify with a
  divergent persona sub-event already recorded) — **this is the error code
  from the prior critical defect referenced in project memory
  (`2026-07-24-aggregate-and-push`); verify this block's guard-clause form
  against the original nested-if line by line, not by inspection alone.**

**Simplicity proof:** Verbatim relocation of `orchestrator.ts:244-250`,
restructured to guard clauses (three early `return`s) instead of nested
`if`s — the boolean condition for reaching the throw is identical
(De Morgan-equivalent, not behaviorally different): original requires
`!persona && type==="checkpoint" && (stage==="review"||stage==="verify") &&
subEvents.length>0 && hasDivergence`; the guard-clause form returns early on
the negation of each conjunct in turn, reaching the throw under the exact
same combined condition.

**Surface delta:** +1 function (~7 lines); -7 lines / +1 line at the call
site.

**Steps:**

1. Insert this function immediately after `assertPersonaStageMatch` (before
   `transitionChangeLocked`):

   ```typescript
   function assertNoConsolidationDivergence(record: ChangeRecordV2, view: ChangeView, intent: TransitionIntent, persona: string | undefined): void {
   	if (persona || intent.type !== "checkpoint" || (intent.stage !== "review" && intent.stage !== "verify")) return;
   	const subEvents = personaSubEvents(record.events, intent.stage, view.attempt);
   	if (subEvents.length === 0) return;
   	if (subEvents.some(isDivergentPersonaEvent)) throw new CodepatrolError("CONSOLIDATION_AFTER_SUBEVENTS", "Cannot consolidate checkpoint with divergence; use return instead.", 4);
   }
   ```

2. In `transitionChangeLocked`, replace the original inline block

   ```typescript
   if (!persona && intent.type === "checkpoint" && (intent.stage === "review" || intent.stage === "verify")) {
   	const subEvents = personaSubEvents(record.events, intent.stage, view.attempt);
   	if (subEvents.length > 0) {
   		const hasDivergence = subEvents.some(isDivergentPersonaEvent);
   		if (hasDivergence) throw new CodepatrolError("CONSOLIDATION_AFTER_SUBEVENTS", "Cannot consolidate checkpoint with divergence; use return instead.", 4);
   	}
   }
   ```

   with:

   ```typescript
   assertNoConsolidationDivergence(record, view, intent, persona);
   ```

3. Run `npm run typecheck`. Expected: 0 errors.
4. Run `npm test`. Expected: identical 215/215. **Additionally**, re-read
   `src/change/orchestrator-parallel.test.ts` (the file specifically
   covering persona sub-event consolidation, per this Change's spec
   evidence) and confirm every one of its assertions still passes and
   none was skipped — extra scrutiny for this specific block per the
   spec's named risk.

**Task result:** diff, `npm test` output, and the extra
`orchestrator-parallel.test.ts` confirmation are appended to
`apply/journal.md`.

### T4 — Extract `buildCheckpointEvent` and remove the dead `declared` variable

**Purpose:** Moves the checkpoint-sealing pipeline (storage responsibilities
— the densest 42-line block) out of `transitionChangeLocked`, and drops the
incidentally-discovered dead `declared` local while relocating the block
that contains it. Satisfies AC-1, AC-2, AC-3; progresses AC-4.

**Depends on:** T3

**Files:**

- Modify: `src/change/orchestrator.ts`

**Interfaces:**

- Produces: `async function buildCheckpointEvent(git: GitAdapter, workspace: string, workId: string, record: ChangeRecordV2, view: ChangeView, intent: Extract<TransitionIntent, { type: "checkpoint" }>, persona: string | undefined, options: OperationOptions): Promise<ChangeEvent>`
- Invariants: every validation, the Apply gate execution, the Git
  add/commit/tree sequence, and the final post-commit delta re-verification
  behave identically to the original inline block; the only literal change
  is dropping the never-read `const declared = new Set(...)` line.

**Simplicity proof:** Verbatim relocation of `orchestrator.ts:252-294`
(minus the one dead line), typed with `Extract<TransitionIntent, { type:
"checkpoint" }>` to preserve the same compile-time narrowing the original
`if (intent.type === "checkpoint")` provided without a redundant runtime
check inside the function.

**Surface delta:** +1 function (~41 lines, one fewer than the original 42
due to the dead-line removal); -42 lines / +1 line at the call site.

**Steps:**

1. Insert this function immediately after `assertNoConsolidationDivergence`
   (before `transitionChangeLocked`):

   ```typescript
   async function buildCheckpointEvent(git: GitAdapter, workspace: string, workId: string, record: ChangeRecordV2, view: ChangeView, intent: Extract<TransitionIntent, { type: "checkpoint" }>, persona: string | undefined, options: OperationOptions): Promise<ChangeEvent> {
   	const required: Record<string, string[]> = {
   		plan: [`.codepatrol/changes/${workId}/plan/spec.md`, `.codepatrol/changes/${workId}/plan/plan.md`],
   		review: [`.codepatrol/changes/${workId}/review/report.md`],
   		apply: [`.codepatrol/changes/${workId}/apply/journal.md`],
   		verify: [`.codepatrol/changes/${workId}/verify/report.md`],
   	};
   	const personaCheckpoint = persona && (intent.stage === "review" || intent.stage === "verify");
   	const missing = personaCheckpoint ? [] : required[intent.stage].filter((path) => !intent.artifacts.some((item) => item.path === path && item.intent !== "delete"));
   	if (missing.length) throw new CodepatrolError("CHANGE_INVALID", `Checkpoint is missing required ${intent.stage} artifacts: ${missing.join(", ")}.`, 4);
   	if (!personaCheckpoint) await validateWorkspaceArtifacts(git, workspace, record, intent.stage, intent.artifacts, undefined, options.signal);
   	const paths = [...intent.artifacts.filter((item) => item.intent !== "delete").map((item) => item.path), ...(intent.changes ?? [])]; paths.forEach(ensurePath);
   	const allowed = new Set([...paths, ...intent.artifacts.filter((item) => item.intent === "delete").map((item) => item.path), relativeRecord(workId), ".codepatrol/backlog/items.yaml"]);
   	const prior = baselineRef(record); const dirty = parseStatusPaths(await git.status(options.signal)); const committed = await git.changedPaths(prior, "HEAD", options.signal); const candidate = [...new Set([...committed, ...dirty])];
   	const unexpected = candidate.filter((path) => !allowed.has(path));
   	if (unexpected.length && !personaCheckpoint) throw new CodepatrolError("CHANGE_CONFLICT", `Checkpoint has undeclared worktree paths: ${unexpected.join(", ")}.`, 4);
   	const actualProduction = personaCheckpoint ? paths.slice().sort() : candidate.filter((path) => !path.startsWith(`.codepatrol/changes/${workId}/`) && !path.startsWith(".codepatrol/backlog/")).sort(); const declaredProduction = [...(intent.changes ?? [])].sort();
   	if (!personaCheckpoint && JSON.stringify(actualProduction) !== JSON.stringify(declaredProduction)) throw new CodepatrolError("CHANGE_CONFLICT", "Apply changes do not match the complete candidate production delta.", 4);

   	let gateSummary: GateResult | undefined;
   	if (intent.stage === "apply" && intent.result === "implemented" && !personaCheckpoint) {
   		const applyGate = loadConfig(workspace).applyGate;
   		if (applyGate) {
   			const runner = options.gate ?? defaultGateRunner;
   			const result = await runner(applyGate, workspace, options.signal);
   			if (result.exitCode !== 0) {
   				throw new CodepatrolError(
   					"APPLY_GATE_FAILED",
   					`Apply gate \`${applyGate.command.join(" ")}\` failed (exit ${result.exitCode}); checkpoint not sealed.\n${gateOutputTail(result.output)}`,
   					4,
   				);
   			}
   			gateSummary = { command: applyGate.command.join(" "), exit_code: 0, elapsed_ms: result.elapsedMs, at: now(options).toISOString() };
   		}
   	}

   	const committedPaths = [...new Set([...paths, ...intent.artifacts.map((item) => item.path)])];
   	await git.add(committedPaths, options.signal);
   	const checkpoint = await git.commit(personaCheckpoint ? `chore(codepatrol): ${intent.stage} ${persona} persona content ${workId}` : `chore(codepatrol): ${intent.stage} content ${workId}`, true, options.signal, committedPaths); const tree = await git.tree(checkpoint, options.signal);
   	const finalDelta = await git.changedPaths(prior, checkpoint, options.signal); const unexpectedFinal = finalDelta.filter((path) => !allowed.has(path)); const finalProduction = finalDelta.filter((path) => !path.startsWith(`.codepatrol/changes/${workId}/`) && !path.startsWith(".codepatrol/backlog/")).sort();
   	if (unexpectedFinal.length || JSON.stringify(finalProduction) !== JSON.stringify(declaredProduction)) throw new CodepatrolError("CHANGE_CONFLICT", "Checkpoint commit does not match its declared artifact and production paths.", 4);
   	return { ...eventBase(view, intent.actor, options), type: "stage-checkpointed", stage: intent.stage, result: intent.result, checkpoint, tree, artifacts: intent.artifacts, ...(intent.stage === "apply" ? { changes: intent.changes ?? [] } : {}), next_action: intent.nextAction, ...(persona ? { persona } : {}), ...(gateSummary ? { gate: gateSummary } : {}) };
   }
   ```

   Note: the `const declared = new Set(intent.artifacts.map((item) =>
   item.path));` line from the original is **deliberately omitted** — it is
   the dead variable AC-3 requires removed.

2. In `transitionChangeLocked`, find the dispatch block:

   ```typescript
   let event: ChangeEvent;
   if (intent.type === "checkpoint") {
   	// ... the 42-line block ...
   	event = { ...eventBase(view, intent.actor, options), type: "stage-checkpointed", ... };
   } else if (intent.type === "begin") event = { ... };
   ```

   Replace the entire `if (intent.type === "checkpoint") { ... }` body with:

   ```typescript
   if (intent.type === "checkpoint") event = await buildCheckpointEvent(git, workspace, workId, record, view, intent, persona, options);
   else if (intent.type === "begin") event = { ... };
   ```

   (the `else if`/`else` branches for `begin`/`usage`/`return`/`block`/the
   final `else` are unchanged — only the `checkpoint` branch's body is
   replaced).
3. Run `npm run typecheck`. Expected: 0 errors — this specifically confirms
   `Extract<TransitionIntent, { type: "checkpoint" }>` narrows correctly at
   the call site (TypeScript already narrowed `intent` via `intent.type ===
   "checkpoint"` in the `if`, so passing it into a parameter of that
   `Extract` type must typecheck with no cast needed).
4. Run `npm test`. Expected: identical 215/215.
5. Confirm AC-2: run
   `awk '/^async function transitionChangeLocked/{start=NR} start && /^}/{print NR-start+1; exit}' src/change/orchestrator.ts`.
   Expected: a number under 35.
6. Confirm AC-3: run `grep -n "\bdeclared\b" src/change/orchestrator.ts`.
   Expected: zero matches (the `declaredProduction` occurrences use a
   different identifier and are unaffected — confirm the grep output
   contains no line for bare `declared`).

**Task result:** diff, `npm test` output, and the AC-2/AC-3 command outputs
are appended to `apply/journal.md`.

### T5 — Final verification

**Purpose:** Confirms all five acceptance criteria hold together on the
fully-refactored function, the full gate is green, and the actual surface
delta matches the spec forecast.

**Depends on:** T1, T2, T3, T4

**Files:** None (verification only)

**Steps:**

1. Run `npm run verify` (typecheck + full test suite + build + smoke-cli +
   lint-skills). Expected: all steps pass, 215/215 tests, 0 failures, no
   new warnings.
2. Read the complete post-refactor `transitionChangeLocked` function and
   confirm AC-1: all four extracted blocks are gone, replaced by named
   calls, in the same relative order as the original (recovery → persona
   match → consolidation guard → event-type dispatch with the checkpoint
   branch calling `buildCheckpointEvent`).
3. Re-run and record AC-2's line-count command and AC-3's `declared` grep
   one final time against the fully-assembled file (not just after T4, in
   case T5 or a rebase-equivalent step altered anything — it should not
   have, but the AC is checked at the point of sealing, not assumed carried
   forward).
4. Run `git diff --stat` against this Change's base commit (`25b26fc`) and
   confirm AC-5: exactly one file, `src/change/orchestrator.ts`.
5. Confirm no `DC-1` trigger fired (no evidence during implementation
   suggested `buildCheckpointEvent` needed further decomposition beyond
   what was already deferred).
6. Graph sync: not required — no exported symbol added, removed, or
   renamed; all four new functions are private. State this explicitly
   rather than running `codepatrol graph sync` needlessly.
7. Rollback check: confirm `git revert` of the resulting commit would
   cleanly restore the original inline 89-line function — no other file
   depends on the four new (private, unexported) function names existing.

**Task result:** final gate output, the re-confirmed AC-2/AC-3 outputs, diff
reconciliation, and residual-risk statement are appended to
`apply/journal.md`.
