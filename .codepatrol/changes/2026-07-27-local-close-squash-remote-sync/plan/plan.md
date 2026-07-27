# Plan — Close squash-merges and retains the branch locally; new `sync` command owns every remote action

- Work id: `2026-07-27-local-close-squash-remote-sync`
- Governing spec: `spec.md`
- Target baseline: `main` @ `7380920` (branch `codepatrol/2026-07-27-local-close-squash-remote-sync`)

## Goal and approach

Close today fast-forwards the whole feature branch onto the target (825/833
of `main`'s commits are bookkeeping) and is the only stage that touches the
network. Make Close fully local and squash it to exactly one tree-identical
commit while retaining the branch and tag as lineage anchors; add the
inspection dedupe that measurement proves retention requires; and introduce
`codepatrol sync` as the single owner of every remote action, renaming the
existing `codepatrol-git` skill to match.

## Global constraints

- The target's tree after Close must be **byte-identical** to the terminal
  tag's tree — asserted in code, not assumed.
- Rollback's behavior is untouched (tag, byte-identical target, branch
  deleted).
- Every git invocation stays inside `GitAdapter`; no raw `execFile` outside
  `src/change/git.ts`.
- `syncIssues`'s own pull/push semantics are unchanged; `sync` calls it.
- No Change-record/event schema change.
- After every task, `npm test` must pass before the next task starts.

## Simplicity proof

- Selected rung: direct local change for the Close/inspect edits; one new
  bounded module (`sync.ts`) that composes `git.push` and `syncIssues`
  rather than introducing new remote mechanics.
- Reused capabilities: `git.push` (already exists, loses its Close caller
  and gains its sync caller), `syncIssues` (called unchanged), `git.tree`
  (already used for tree comparison in lineage validation), `addRecord`'s
  existing identical-record tolerance (what makes head dedupe safe).
- Forbidden speculative surface: no branch pruning (DC-1), no fetch/rebase/
  force/PR (DC-2), no issue annotation (DC-3), no rollback change, no
  history rewrite of existing `main` commits.
- Expected surface delta: 4 production source files edited, 1 added
  (`sync.ts`), 3 CLI files wired, 4 skill/doc files, 4 test files.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T2, T3 | Test asserts `rev-list --count base..target` is 1 and branch+tag still exist |
| AC-2 | T2, T3 | Test asserts target tree equals tag tree; corrupted-squash double fails the Close |
| AC-3 | T3 | Test runs inspect/status/next against the retained branch + tag |
| AC-4 | T4 | Spy `GitAdapter` counts lineage validations per distinct head |
| AC-5 | T5 | Test asserts `push` is rejected by the exact-keys guard; no `git.push` under `closeChange` |
| AC-6 | T6, T7 | `sync.test.ts` + `cli.test.ts` against injected doubles, incl. `--dry-run` zero-call assertion |
| AC-7 | T8 | `npm run lint:skills`, catalog/doc greps |
| AC-8 | T9 | `npm run verify` |

## Dependency order

`T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9`. T1 adds the adapter primitive
the squash needs; T2 changes Close's git semantics; T3 proves the
squash/retention behavior; T4 adds the dedupe retention requires; T5 strips
push from Close; T6/T7 build and wire `sync`; T8 updates skills/docs; T9 is
final verification.

### T1 — Add the squash primitive to `GitAdapter`

**Purpose:** Give Close a squash operation without leaking git invocations
outside the adapter. Foundation for T2.

**Depends on:** None

**Files:**

- Modify: `src/change/git.ts`

**Steps:**

1. Re-read `src/change/git.ts:7-30` (the `GitAdapter` interface) and
   `:75-84` (`add`/`unstage`/`commit`/`tag`/`deleteBranch`/`mergeFf`) fresh
   to match the existing method style.
2. Add `mergeSquash(ref: string, signal?: AbortSignal): Promise<void>` to
   the `GitAdapter` interface, immediately after `mergeFf`, and implement it
   on `NodeGitAdapter` as a single `run(["merge", "--squash", ref], signal)`
   call — mirroring `mergeFf`'s one-line shape exactly.
3. Run `npm run typecheck`. Expected: errors **only** in test files that
   implement `GitAdapter` structurally without the new method, if any; fix
   those by adding the method to the doubles. Re-run until 0 errors.
4. Run `npm test`. Expected: 217/217 — the new method has no caller yet, so
   nothing may change.

**Task result:** diff and `npm test` output appended to `apply/journal.md`.

### T2 — Close squashes onto the target and retains the branch

**Purpose:** The core behavior change. Progresses AC-1, AC-2.

**Depends on:** T1

**Files:**

- Modify: `src/change/orchestrator.ts`

**Steps:**

1. Re-read `closeWork` (`orchestrator.ts:476-482`) and
   `completeFinalization` (`orchestrator.ts:459-474`) fresh, confirming
   current line numbers.
2. In `closeWork`, replace the fast-forward with a squash and a
   tree-identity assertion, and stop deleting the branch. The commit-outcome
   body becomes: when the checked-out head equals `base_commit`, call
   `git.mergeSquash(tag, signal)`, then
   `git.commit(\`chore(codepatrol): committed ${view.identity.work_id}\`, false, signal)`;
   then read `git.tree("HEAD", signal)` and `git.tree(tag, signal)` and throw
   `CodepatrolError("CHANGE_DRIFT", "Squashed target tree does not match the terminal tree.", 4)`
   if they differ. Remove the `deleteBranch` call from this function only.
   Keep the existing `else if (checkedOutHead !== terminalCommit) throw
   TARGET_ADVANCED` recovery guard so a re-run that already squashed is not
   misread as drift.
3. In `completeFinalization`, relax the commit-outcome target-head
   precondition: it currently requires the head to equal `base_commit` or
   `terminalCommit`, which can no longer hold once the target carries a
   squash commit. Replace the `terminalCommit` alternative with "or the
   target's tree already equals the terminal tag's tree" (a completed
   squash), so recovery re-runs stay idempotent. Leave the rollback branch of
   that function, and its `deleteBranch` call, untouched.
4. Run `npm run typecheck`. Expected: 0 errors.
5. Run `npm test`. Expected: failures **only** in tests that assert the old
   fast-forward/branch-deletion behavior. Record which tests fail and why in
   the journal; do not fix them yet — T3 rewrites them deliberately.

**Task result:** diff, `npm test` output including the named expected
failures, appended to `apply/journal.md`.

### T3 — Rewrite the close-semantics tests for squash + retention

**Purpose:** Prove AC-1, AC-2, AC-3 and repair the tests T2 deliberately
broke.

**Depends on:** T2

**Files:**

- Modify: `src/change/git.test.ts`

**Steps:**

1. Re-read `git.test.ts` in full, especially `advanceThroughVerify`
   (`:19-30`) and the two finalization tests
   `"rollback tags the complete Change, deletes its branch, and preserves the target tree"`
   (`:239`) and
   `"commit finalization fast-forwards the unchanged target and preserves a terminal tag"`
   (`:266`).
2. Update the commit-finalization test (rename it to reflect squashing) to
   assert, after `closeChange` with outcome `commit`:
   - `run(workspace, ["rev-list", "--count", \`${base}..main\`])` equals
     `"1"` (AC-1);
   - `run(workspace, ["rev-parse", "main^{tree}"])` equals
     `run(workspace, ["rev-parse", \`codepatrol/committed/${id}^{tree}\`])`
     (AC-2);
   - `git branch --list codepatrol/<id>` is non-empty and the tag exists
     (AC-1 retention).
3. Leave the rollback test unchanged — it must still pass as-is, proving
   rollback was not affected.
4. Add a test proving the tree assertion is real (AC-2's "corrupted squash
   must fail"): drive a Change to Close with an injected `GitAdapter`
   subclass whose `mergeSquash` stages something other than the terminal
   tree (e.g. overrides `mergeSquash` to a no-op so the commit captures the
   unchanged base tree), and assert `closeChange` rejects with
   `error.code === "CHANGE_DRIFT"`. This proves the assertion fails the Close
   rather than being decorative.
5. Add a test for AC-3: after a successful squash Close, assert
   `inspectChanges(workspace, { all: true })` returns the Change with
   `state === "terminal"` and `outcome === "committed"` without throwing
   (exercising lineage validation through both the retained branch and the
   tag), and that `inspectChanges(workspace, {})` — the non-`all` path that
   scans `refs/heads/codepatrol` — also succeeds and yields the same
   terminal view.
6. Run `npm test`. Expected: all green, count 217 + the 2 new tests = 219.

**Task result:** diff, `npm test` output, appended to `apply/journal.md`.

### T4 — Dedupe inspection by resolved head SHA

**Purpose:** Remove the measured duplicate-validation cost retention would
otherwise add. Satisfies AC-4.

**Depends on:** T3

**Files:**

- Modify: `src/change/orchestrator.ts`
- Modify: `src/change/git.test.ts`

**Steps:**

1. Re-read `inspectChanges` (`orchestrator.ts:330-362`) fresh, specifically
   the `refs/heads/codepatrol` loop (opens at `:344`) and the
   `query.all`-gated terminal-tag loop (opens at `:351`).
2. Introduce a `validatedHeads = new Set<string>()` local at the top of
   `inspectChanges`. In both loops, after resolving `head`, skip the
   `validateCheckpointLineage` + `validateAcceptedRefArtifacts` pair when
   `validatedHeads.has(head)`; otherwise run them and `validatedHeads.add(head)`.
   Still call `addRecord(id, record, ref)` in both cases — the record must
   be registered from every source so `addRecord`'s existing
   conflicting-copies detection is preserved unchanged.
3. Add a test asserting AC-4 with a counting adapter: subclass
   `NodeGitAdapter` overriding `isAncestor` (the per-checkpoint call inside
   `validateCheckpointLineage`) to increment a counter, close a Change so it
   has both a retained branch and a tag at the same head, then call
   `inspectChanges(workspace, { all: true })` and assert the counter equals
   the count observed for a single head — i.e. validating one head, not two
   refs. Assert on the count, never on wall-clock time.
4. Run `npm test`. Expected: all green, 220 tests.

**Task result:** diff, `npm test` output, appended to `apply/journal.md`.

### T5 — Remove push from Close

**Purpose:** Make Close fully local. Satisfies AC-5.

**Depends on:** T4

**Files:**

- Modify: `src/change/types.ts`
- Modify: `src/change/orchestrator.ts`
- Modify: `src/cli/commands.ts`
- Modify: `src/change/close-push.test.ts`

**Steps:**

1. In `types.ts:54-55`, remove `push?: boolean` from `CloseInput` and
   `pushError?` / `pushSuggestion?` from `CloseResult`.
2. In `orchestrator.ts`, remove `"push"` from `assertCloseInput`'s
   `exactInput` allow-list (`:77`), and delete the push block and suggestion
   computation (`:450-456`), returning the result without those fields.
3. In `commands.ts:166-171`, delete the `pushSuggestion` branch so the text
   is just the base `${outcome} ${terminalCommit} (${tag})`.
4. Repurpose `src/change/close-push.test.ts`: its `describe("close push
   integration")` block (`:15`) now asserts the *absence* of push — replace
   its cases with (a) `closeChange` with `push: true` in the input rejects
   with `CodepatrolError` code `INVALID_ARGUMENT` and a message naming
   `push`; (b) a `GitAdapter` double whose `push` throws if called completes
   a normal `commit` Close without ever invoking it. Rename the file's
   describe block to reflect "close performs no remote action".
5. Run `npm run typecheck`. Expected: 0 errors.
6. Run `npm test`. Expected: all green; count reflects the repurposed file's
   case count.

**Task result:** diff, `npm test` output, appended to `apply/journal.md`.

### T6 — Add the `sync` module

**Purpose:** Create the single remote owner. Progresses AC-6.

**Depends on:** T5

**Files:**

- Add: `src/change/sync.ts`
- Add: `src/change/sync.test.ts`

**Steps:**

1. Re-read `src/change/issue-sync.ts:62-77` (`SyncDirection` at `:62`,
   `IssueSyncOptions` at `:64`, `IssueSyncResult` at `:71`) to match its
   option/result conventions, and `src/change/git.ts:106-112` (`push`).
2. Create `src/change/sync.ts` exporting:
   - `interface RemoteSyncOptions { signal?: AbortSignal; git?: GitAdapter; gh?: GhAdapter; dryRun?: boolean; target?: boolean; branches?: boolean; issues?: SyncDirection | false }`
   - `interface RemoteSyncResult { pushedRefs: string[]; skipped: string[]; failures: { ref: string; code: string; message: string }[]; issues?: IssueSyncResult; dryRun: boolean }`
   - `async function syncRemote(workspace: string, options: RemoteSyncOptions = {}): Promise<RemoteSyncResult>`
     which: resolves the target branch from the workspace's Changes (or
     falls back to the current branch's configured target), collects
     `refs/heads/codepatrol/*` and `refs/tags/codepatrol/*` when `branches`
     is set, pushes each selected ref via `git.push("origin", ref)`
     accumulating per-ref failures instead of aborting the whole run, and
     calls `syncIssues(workspace, direction, { signal, dryRun, gh })` when
     `issues` is not `false`. When `dryRun` is set it records intended refs
     in `pushedRefs` and performs **zero** `git.push` calls.
3. Create `src/change/sync.test.ts` with injected doubles: a `GitAdapter`
   double recording every `push` call, and a `GhAdapter` double. Cover:
   (a) target-only push pushes exactly the target ref; (b) `branches: true`
   pushes retained Change branches and their tags; (c) a failing push on one
   ref is reported in `failures` while other refs still push; (d)
   `dryRun: true` yields a populated `pushedRefs` with **zero** recorded
   `push` calls and zero `gh` write calls; (e) `issues` delegates to
   `syncIssues` and surfaces its result.
4. Run `npm run typecheck`, then `npm test`. Expected: all green with the
   new cases added.

**Task result:** diff, `npm test` output, appended to `apply/journal.md`.

### T7 — Wire `sync` into the CLI

**Purpose:** Expose the command. Completes AC-6.

**Depends on:** T6

**Files:**

- Modify: `src/cli/args.ts`
- Modify: `src/cli/commands.ts`
- Modify: `src/cli/output.ts`
- Modify: `src/cli/cli.test.ts`

**Steps:**

1. Re-read `args.ts:31-63` (`BOOLEAN_FLAGS`, `KNOWN`, `COMMAND_OPTIONS`,
   `KNOWN_COMMANDS`), `commands.ts:206-211` (the `issues.sync` case), and
   `output.ts:48-54` (help lines) plus `:176-187`
   (`renderIssueSyncResult`) — the three parallel registries the CLI keeps
   in sync by hand.
2. In `args.ts`: add any new flag names to `KNOWN` (and to `BOOLEAN_FLAGS`
   if boolean), and add a `["sync", new Set([...])]` entry to
   `COMMAND_OPTIONS` covering the flags `sync` accepts (at minimum
   `dry-run`, plus the target/branches/issues selectors chosen in T6).
3. In `commands.ts`: add a `case "sync":` that maps parsed args to
   `RemoteSyncOptions`, calls `syncRemote`, and returns
   `{ data, text: renderRemoteSyncResult(data) }`, following the
   `issues.sync` case's shape including the `overrides` hook for injected
   adapters used by tests.
4. In `output.ts`: add a `sync` help line beside the existing
   `issues sync` line, and add `renderRemoteSyncResult` modeled on
   `renderIssueSyncResult` — one summary line plus indented detail lines for
   pushed refs, skipped refs, and failures.
5. In `cli.test.ts`: add a case asserting `sync` is reachable through the
   real arg parser with injected adapter overrides, and that an unknown flag
   for `sync` is rejected by `COMMAND_OPTIONS` validation.
6. Run `npm run typecheck`, then `npm test`. Expected: all green.

**Task result:** diff, `npm test` output, appended to `apply/journal.md`.

### T8 — Rename the skill and correct every document that shows `push`

**Purpose:** Documentation must not contradict the shipped validator.
Satisfies AC-7.

**Depends on:** T7

**Files:**

- Add: `skills/codepatrol-sync/SKILL.md`
- Delete: `skills/codepatrol-git/SKILL.md`
- Modify: `skills/catalog.yaml`
- Modify: `skills/codepatrol-close/SKILL.md`
- Modify: `skills/_shared/CODEPATROL-CLI.md`

**Steps:**

1. Re-read `skills/codepatrol-git/SKILL.md` in full,
   `skills/catalog.yaml`'s `codepatrol-git` entry (`:95-101`),
   `skills/codepatrol-close/SKILL.md:36` (the opt-in push sentence), and
   `skills/_shared/CODEPATROL-CLI.md:94-102` (the `close.json` prose and
   example, which currently shows `"push": true`).
2. Create `skills/codepatrol-sync/SKILL.md` carrying over the existing
   issue-sync direction semantics and preconditions verbatim where still
   accurate, and adding the ref-pushing scope (target branch, retained
   Change branches and terminal tags), the `--dry-run` guarantee, and an
   explicit Out-of-scope list (no fetch, rebase, force-push, PR creation, or
   Change-lifecycle mutation). Keep the "every other command remains fully
   local" invariant sentence — it is now actually true.
3. Delete `skills/codepatrol-git/SKILL.md` and rename its
   `skills/catalog.yaml` key to `codepatrol-sync`, updating `consumes`/
   `produces` to include pushed refs. Grep for any remaining
   `codepatrol-git` reference and fix each.
4. In `skills/codepatrol-close/SKILL.md`, replace the opt-in push sentence
   with a statement that Close performs no remote action and that
   `codepatrol sync` owns pushing; also state that Close squashes to one
   commit and retains the Change branch.
5. In `skills/_shared/CODEPATROL-CLI.md`, remove `push` from the `close.json`
   prose and example (leaving `outcome`, `actor`, `authority`), and add a
   `sync` line to the command list.
6. Run `npm run lint:skills`. Expected: passes. Run
   `grep -rn "codepatrol-git" skills/ src/ scripts/`. Expected: no hits.

**Task result:** diff, lint output, grep output, appended to
`apply/journal.md`.

### T9 — Final verification

**Purpose:** Confirm every criterion holds together on the assembled diff.
Satisfies AC-8.

**Depends on:** T1-T8

**Files:** None (verification only)

**Steps:**

1. Run `npm run verify`. Expected: all green, test count strictly greater
   than the 217 baseline, 0 failures (AC-8).
2. Re-run the AC-5 greps: `grep -rn "pushSuggestion\|pushError" src/` returns
   nothing, and `grep -n "push" src/change/orchestrator.ts` shows no
   `git.push` call under `closeChange`.
3. Run `git diff --stat main -- . ':!.codepatrol'` and reconcile against the
   spec's forecast: `src/change/{orchestrator,git,types,sync}.ts`,
   `src/cli/{args,commands,output}.ts`,
   `skills/codepatrol-sync/SKILL.md` (added),
   `skills/codepatrol-git/SKILL.md` (deleted), `skills/catalog.yaml`,
   `skills/codepatrol-close/SKILL.md`, `skills/_shared/CODEPATROL-CLI.md`,
   and the four test files. Any file outside that set is undeclared surface
   and must be explained in the journal.
4. Confirm no DC trigger fired: no branch pruning, fetch/rebase/force, or
   issue annotation was added.
5. Rollback check: confirm a single `git revert` of the resulting commit
   would restore fast-forward Close, branch deletion, and the `push` field.

**Task result:** the `npm run verify` output, grep results, `git diff --stat`
reconciliation, and residual-risk statement appended to `apply/journal.md`.
