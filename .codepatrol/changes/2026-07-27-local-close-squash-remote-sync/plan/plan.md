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
- Forbidden speculative surface: branch pruning exists **only** behind the
  explicit `--prune-closed` flag — its opt-in-ness, not its absence, is
  DC-1; no fetch/rebase/force/PR (DC-2), no issue annotation (DC-3), no
  rollback change, no history rewrite of existing `main` commits.
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
| AC-6 | T6, T7 | `sync.test.ts` + `cli.test.ts` against injected doubles, incl. `--dry-run` zero-*mutation* assertion, the inherited `syncIssues` reads still firing, and all 3 target-resolution cases plus the `--target-branch` override |
| AC-7 | T8 | `npm run lint:skills`, catalog/doc greps |
| AC-8 | T9 | `npm run verify` |
| AC-9 | T2, T3 | `git.test.ts:266`'s re-run after an injected post-squash failure returns `outcome === "committed"` |
| AC-10 | T6, T7 | `sync.test.ts` cases (f)-(i): prune only after successful push, blocked by failed push, never for non-terminal, never a tag |
| AC-11 | T7 | `CommandOverrides.git` field exists; `cli.test.ts` `sync` cases inject a `GitAdapter` double and touch no real network |

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
   tree-identity assertion, make the recovery guard squash-aware, and stop
   deleting the branch. The commit-outcome body becomes:
   - when the checked-out head equals `base_commit`, call
     `git.mergeSquash(tag, signal)`, then
     `git.commit(\`chore(codepatrol): committed ${view.identity.work_id}\`, false, signal)`;
   - **otherwise**, treat "already squashed" as the completed state by
     comparing trees rather than commits: if
     `await git.tree("HEAD", signal) !== await git.tree(tag, signal)`, throw
     `CodepatrolError("TARGET_ADVANCED", "Target changed during Close.", 4)`;
     if the trees match, no-op. The existing
     `else if (checkedOutHead !== terminalCommit)` comparison **must be
     removed**: after a squash the target head equals neither `base_commit`
     nor `terminalCommit`, so keeping it would throw `TARGET_ADVANCED` on
     exactly the recovery re-run that `git.test.ts:266` already asserts must
     succeed.
   - after a fresh squash, assert `git.tree("HEAD", signal)` equals
     `git.tree(tag, signal)` and throw
     `CodepatrolError("CHANGE_DRIFT", "Squashed target tree does not match the terminal tree.", 4)`
     if they differ.
   - remove the `deleteBranch` call from this function only.
3. In `completeFinalization`, apply the **same** tree-equality rule to the
   commit-outcome target-head precondition, which currently requires the head
   to equal `base_commit` or `terminalCommit` and can no longer hold once the
   target carries a squash commit: accept the head when it equals
   `base_commit`, or when the target's tree already equals the terminal tag's
   tree. Leave the rollback branch of that function, and its `deleteBranch`
   call, untouched.
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
2. Update the commit-finalization test (rename it to reflect squashing).
   Three of its **existing** assertions break under T2 and must be changed
   deliberately, not discovered as surprise failures:
   - **`FailAfterMergeGit` (`git.test.ts:57`) overrides `mergeFf`**, which
     `closeWork` no longer calls. Retarget the double to override
     `mergeSquash`, otherwise the injected failure never fires and
     `assert.rejects(…, /injected after merge/)` (line 278) fails.
   - **Line 283 asserts `run(["rev-parse", "HEAD"]) === result.terminalCommit`**
     — false under squash, where HEAD is the new squash commit. Replace it
     with the tree-equality assertion below.
   - **Line 283 asserts `run(["branch", "--list", …]) === ""`** (branch
     deleted). Invert it: the branch must now still exist.
   Then assert, after `closeChange` with outcome `commit`:
   - `run(workspace, ["rev-list", "--count", \`${base}..main\`])` equals
     `"1"` (AC-1);
   - `run(workspace, ["rev-parse", "main^{tree}"])` equals
     `run(workspace, ["rev-parse", \`codepatrol/committed/${id}^{tree}\`])`
     (AC-2);
   - `git branch --list codepatrol/<id>` is non-empty and the tag exists
     (AC-1 retention);
   - the re-run at the end of that test still returns
     `outcome === "committed"` (AC-9) — this is the assertion the T2 guard
     fix exists to preserve.
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
6. Run `npm test`. Expected: all green. Count is 217 plus the 2 new tests
   added in steps 4-5 = 219; the edits in step 2 modify an existing test
   rather than adding one, so they do not change the count. If the observed
   count differs, reconcile it in the journal before proceeding.

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

### T5 — Remove push from Close and remove `commit+push` as a named action

**Purpose:** Make Close fully local, and stop advertising an action it can
no longer perform. Satisfies AC-5.

**Depends on:** T4

**Files:**

- Modify: `src/change/types.ts`
- Modify: `src/change/orchestrator.ts`
- Modify: `src/cli/commands.ts`
- Modify: `src/cli/output.ts`
- Modify: `src/cli/cli.test.ts`
- Modify: `src/change/close-push.test.ts`

**Steps:**

1. In `types.ts:54-55`, remove `push?: boolean` from `CloseInput` and
   `pushError?` / `pushSuggestion?` from `CloseResult`.
2. In `orchestrator.ts`, remove `"push"` from `assertCloseInput`'s
   `exactInput` allow-list (`:77`), and delete the push block and suggestion
   computation (`:450-456`), returning the result without those fields.
3. In `commands.ts:166-171`, delete the `pushSuggestion` branch so the text
   is just the base `${outcome} ${terminalCommit} (${tag})`.
4. In `commands.ts:84`, change
   `closeOptions: ["commit", "commit+push", "rollback"]` to
   `closeOptions: ["commit", "rollback"]`.
5. In `output.ts:162`, change
   `"Close options: commit, commit+push, rollback"` to
   `"Close options: commit, rollback"`.
6. In `cli.test.ts:195`, change the assertion to
   `assert.deepEqual(close.closeOptions, ["commit","rollback"]);`.
7. Repurpose `src/change/close-push.test.ts`: its `describe("close push
   integration")` block (`:15`) now asserts the *absence* of push — replace
   its cases with (a) `closeChange` with `push: true` in the input rejects
   with `CodepatrolError` code `INVALID_ARGUMENT` and a message naming
   `push`; (b) a `GitAdapter` double whose `push` throws if called completes
   a normal `commit` Close without ever invoking it. Rename the file's
   describe block to reflect "close performs no remote action".
8. Run `npm run typecheck`. Expected: 0 errors.
9. Run `npm test`. Expected: all green; count reflects the repurposed file's
   case count.

**Task result:** diff, `npm test` output, appended to `apply/journal.md`.

### T6 — Add the `sync` module

**Purpose:** Create the single remote owner. Progresses AC-6.

**Depends on:** T5

**Files:**

- Add: `src/change/sync.ts`
- Add: `src/change/sync.test.ts`

**CLI flag contract** (decided here so T7 has a concrete mapping to wire,
not a deferred choice — extends the existing `issues sync --direction`
pattern rather than inventing a new one):

| Flag | Type | Maps to | Default when **no** selector flag is given |
|---|---|---|---|
| `--target` | boolean | `RemoteSyncOptions.target` | `true` |
| `--branches` | boolean | `RemoteSyncOptions.branches` | `true` |
| `--issues` | boolean | `RemoteSyncOptions.issues !== false` | `true` |
| `--direction pull\|push\|both` | value (existing flag, reused) | `RemoteSyncOptions.issues`'s direction when `--issues` is set | `"both"` (identical to `issues sync`'s own default) |
| `--target-branch <name>` | value | `RemoteSyncOptions.targetBranch` | unset (triggers the resolution algorithm below) |
| `--prune-closed` | boolean | `RemoteSyncOptions.pruneClosed` | `false` |
| `--dry-run` | boolean (existing flag, reused) | `RemoteSyncOptions.dryRun` | `false` |

**Target-branch resolution algorithm** (governs `target: true`'s push in
step 2 below; total over every input, never guesses):

1. If `options.targetBranch` is set (from `--target-branch`), first validate
   it with the exact existing `assertStartInput` target-branch grammar:
   `^[A-Za-z0-9][A-Za-z0-9._/-]*$`, and reject `..`, `//`, a trailing `/`, or
   `@{`. On failure throw `CodepatrolError("INVALID_ARGUMENT", "targetBranch
   is not a safe Git branch name.", 2)` before any `git.push`; otherwise use
   it directly and resolution stops here. This forbids Git refspecs such as
   `:refs/heads/name`, which `git push origin <value>` would interpret as a
   remote deletion and which is outside this Change's DC-4 boundary.
2. Otherwise read `current = await git.currentBranch(signal)`.
3. If `current` starts with `"codepatrol/"`, the work id is
   `current.slice("codepatrol/".length)`. Call
   `inspectChanges(workspace, { workId, all: true }, { signal })` (`all:
   true` matters because a terminal Change's branch can still be checked
   out now that Close retains it) and use the one result's
   `identity.target_branch`. If `inspectChanges` throws `CHANGE_NOT_FOUND`,
   propagate it — do not fall through to step 4 for a branch that looks
   like a Change branch but isn't one.
4. Otherwise, call `inspectChanges(workspace, { all: true }, { signal })`
   and check whether **at least one** returned view's
   `identity.target_branch` equals `current`
   (`views.some((v) => v.identity.target_branch === current)`) — this is
   an existence check, not a uniqueness check: the value pushed is
   `current` itself, already known, not any field read off a specific
   matching record, so multiple Changes sharing one target (the normal
   case in this repository — 33 records currently target `main`, per
   evidence) must all satisfy this check simultaneously, not conflict. If
   at least one matches, push `current`.
5. If neither step 3 nor step 4 resolves a branch, throw
   `CodepatrolError("INVALID_ARGUMENT", \`Cannot resolve a target branch
   from ${current}; pass --target-branch <name>.\`, 2)` — `sync --target`
   fails loudly rather than pushing an unrelated branch.

Passing **any** of `--target`/`--branches`/`--issues` narrows selection to
exactly the flags given (e.g. `sync --branches` pushes only branches/tags,
skipping target and issues); passing none selects all three, mirroring
`issues sync`'s own permissive default. `--prune-closed` needs no explicit
dependency on `--branches`: pruning eligibility is "the ref was pushed in
*this* run" (step 3 below), so `--prune-closed` without `--branches`
prunes nothing — a safe no-op, not an error.

**Steps:**

1. Re-read `src/change/issue-sync.ts:62-77` (`SyncDirection` at `:62`,
   `IssueSyncOptions` at `:64`, `IssueSyncResult` at `:71`) to match its
   option/result conventions, `src/change/git.ts:106-112` (`push`), and
   `src/change/orchestrator.ts:330` (`inspectChanges`'s exact signature,
   `(workspace, query: ChangeQuery, options) => Promise<ChangeView[]>`) —
   import `inspectChanges` from `./orchestrator.js` and `ChangeView` as a
   type from `./types.js`.
2. Create `src/change/sync.ts` exporting:
   - `interface RemoteSyncOptions { signal?: AbortSignal; git?: GitAdapter; gh?: GhAdapter; dryRun?: boolean; target?: boolean; targetBranch?: string; branches?: boolean; issues?: SyncDirection | false; pruneClosed?: boolean }`
   - `interface RemoteSyncResult { pushedRefs: string[]; prunedBranches: string[]; skipped: string[]; failures: { ref: string; code: string; message: string }[]; issues?: IssueSyncResult; dryRun: boolean }`
   - `async function syncRemote(workspace: string, options: RemoteSyncOptions = {}): Promise<RemoteSyncResult>`
     which: applies the "no selector given = all true" default from the
     table above (the CLI layer in T7 passes fully-resolved booleans, so
     `syncRemote` itself just trusts `target`/`branches`/`issues` as given —
     the default resolution happens once, in `commands.ts`, not duplicated
     here); when `target` is set, resolves the branch to push via the
     Target-branch resolution algorithm above, including its safe explicit
     target validation (this is the only place that
     algorithm runs — `pushedRefs`/`failures` report on the resolved branch
     name, not the literal string `"target"`); collects
     `refs/heads/codepatrol/*` and `refs/tags/codepatrol/*` when `branches`
     is set; pushes each selected ref via `git.push("origin", ref)`
     accumulating per-ref failures instead of aborting the whole run; and
     calls `syncIssues(workspace, direction, { signal, dryRun, gh })`
     unchanged when `issues` is not `false` — `dryRun` is passed straight
     through, so `syncIssues`'s own existing behavior governs: its
     unconditional `gh.assertAvailable`/`gh.listIssues` reads still run,
     and only its writes (`ensureLabel`/`createIssue`/`closeIssue`,
     `writeBacklog`) are suppressed, exactly as `issues sync --dry-run`
     already behaves today. `syncRemote` introduces **no new dry-run logic
     for the issues branch** — this is deliberate, not an oversight: `dryRun`
     for `sync` as a whole means zero remote *mutations*, not zero remote
     calls (see spec's Outcome and AC-6), and `syncIssues` already satisfies
     that definition unmodified. When `dryRun` is set, `syncRemote` records
     intended refs in `pushedRefs` and performs **zero** `git.push` calls
     (this part of dry-run *is* new logic, since `git.push` has no
     dry-run concept of its own).
3. Implement `pruneClosed` inside `syncRemote`, after the push loop. For
   each `refs/heads/codepatrol/<work-id>` branch: skip unless that ref was
   pushed successfully in this run (never when its push is in `failures`),
   and skip unless the Change's record folds to `state === "terminal"`
   (obtained via `inspectChanges`/`foldChange`, so a still-active Change is
   never pruned). Delete via the existing
   `git.deleteBranch(name, headSha, signal)` — its `update-ref -d <ref>
   <expected>` form refuses to delete a ref that has moved — and record the
   name in `prunedBranches`. **Never** delete a `refs/tags/codepatrol/*`
   ref: the tag is what keeps checkpoint objects reachable and the Change
   visible to `inspectChanges`. Under `dryRun`, record intended names in
   `prunedBranches` and call `deleteBranch` zero times.
4. Create `src/change/sync.test.ts` with injected doubles: a `GitAdapter`
   double recording every `push` and `deleteBranch` call, and a `GhAdapter`
   double. Cover:
   (a) with the `GitAdapter` double's `currentBranch` returning a
   `codepatrol/<work-id>` branch for a real fixture Change targeting
   `main`, target-only push resolves and pushes exactly `main`
   (resolution step 3); (a2) with `currentBranch` returning `main` itself
   and **multiple** fixture Changes (at least two) each recording `main`
   as their target, target-only push still resolves and pushes `main`
   exactly once — the red-capable regression for the returned-review
   finding: a version of step 4 requiring an exactly-one match would fail
   this case; (a3) with `currentBranch`
   returning an unrelated branch name matching no Change's `codepatrol/`
   prefix and no Change's `target_branch`, target-only push **rejects**
   with `INVALID_ARGUMENT` and the double's `push` is never called (step
   5); (a4) `targetBranch: "release"` pushes `release` regardless of what
   `currentBranch` returns (step 1, override); (a5) invalid explicit values
   including `":refs/heads/name"`, `"HEAD:other"`, and `"main..old"`
   reject with `INVALID_ARGUMENT` before the double records any `push` call,
   proving no remote-deletion/refspec syntax reaches `GitAdapter.push`; (b)
   `branches: true`
   pushes retained Change branches and their tags; (c) a failing push on one
   ref is reported in `failures` while other refs still push; (d)
   `dryRun: true` yields a populated `pushedRefs` with **zero** recorded
   `push` calls, and — with `issues` selected — **zero** recorded `gh` write
   calls (`ensureLabel`/`createIssue`/`closeIssue`) **while the double's
   `assertAvailable` and `listIssues` are recorded as called** — asserting
   the read-still-happens behavior explicitly (this is AC-6's "zero remote
   mutations, not zero remote calls" contract, proven rather than assumed);
   (e) `issues` delegates to `syncIssues` and surfaces its result; (f)
   **`pruneClosed` deletes a
   terminal Change's branch only after its push succeeded** — assert
   `prunedBranches` contains it and `deleteBranch` was called with that
   ref's head SHA; (g) **a failed push blocks the prune** — with a double
   whose `push` rejects for that ref, assert `deleteBranch` was never
   called and the branch is absent from `prunedBranches`; (h) **a
   non-terminal Change is never pruned** even when its push succeeds;
   (i) **no `refs/tags/codepatrol/*` ref is ever deleted** in any of the
   above (assert `deleteBranch` was never called with a tag ref).
5. Run `npm run typecheck`, then `npm test`. Expected: all green with the
   new cases added.

**Task result:** diff, `npm test` output, appended to `apply/journal.md`.

### T7 — Wire `sync` into the CLI

**Purpose:** Expose the command with a testable, network-free adapter seam.
Completes AC-6, AC-11.

**Depends on:** T6

**Files:**

- Modify: `src/cli/args.ts`
- Modify: `src/cli/commands.ts`
- Modify: `src/cli/output.ts`
- Modify: `src/cli/cli.test.ts`

**Steps:**

1. Re-read `args.ts:31-63` (`BOOLEAN_FLAGS`, `KNOWN`, `COMMAND_OPTIONS`,
   `KNOWN_COMMANDS`), `commands.ts:24-26` (`CommandOverrides`, currently
   `{ gh?: GhAdapter }` with no `git` field), `commands.ts:206-211` (the
   `issues.sync` case, showing exactly how `overrides?.gh` threads into a
   composed function's options), and `output.ts:48-54` (help lines) plus
   `:176-187` (`renderIssueSyncResult`) — the three parallel registries the
   CLI keeps in sync by hand.
2. In `args.ts`: add `target: boolean; branches: boolean; issues: boolean;
   pruneClosed: boolean; targetBranch?: string;` to the `ParsedArgs`
   interface (immediately after `dryRun?: boolean;` at `:30`); add
   `target`, `branches`, `issues`, `prune-closed` to `BOOLEAN_FLAGS` and
   `KNOWN` (`direction` and `dry-run` are already registered — reused
   as-is); add `target-branch` to `KNOWN` only (it is a **value** flag,
   like `direction`/`stage`, not a boolean — do **not** add it to
   `BOOLEAN_FLAGS`); set the four boolean fields in `parseArgs`'s returned
   object via `values.has(...)`, matching the existing
   `force`/`exact`/`dryRun` pattern, and `targetBranch:
   values.get("target-branch")?.[0]`, matching the existing
   `direction: values.get("direction")?.[0]` pattern exactly; and add
   `["sync", new Set(["target", "branches", "issues", "direction",
   "target-branch", "prune-closed", "dry-run"])]` to `COMMAND_OPTIONS` —
   the exact flag set from T6's CLI flag contract table, no more, no less.
3. In `commands.ts`, add `git?: GitAdapter` to `CommandOverrides`
   (`:24-26`), importing `GitAdapter` as a type from `../change/git.js`
   (`commands.ts` currently imports only `GhAdapter` from
   `../change/issue-sync.js`, confirmed by its import list — this is a new
   import, not a rename). Satisfies AC-11's interface half.
4. Boolean flags in `parseArgs` resolve via `values.has(name)`, so
   `args.target`/`args.branches`/`args.issues` are always `true`/`false`,
   never `undefined` — there is no way to distinguish "flag omitted" from
   "flag explicitly false" at that layer, so the default resolves on
   values, not presence. In `commands.ts`, add a `case "sync":` that
   computes `const noSelector = !args.target && !args.branches &&
   !args.issues;` and resolves `target: noSelector || args.target`,
   `branches: noSelector || args.branches`, `issues: (noSelector ||
   args.issues) ? (args.direction ?? "both") as SyncDirection : false` —
   this is exactly T6's table ("no selector flag true" implies the
   permissive default; any one true narrows to the given subset). Maps the
   result plus `dryRun`/`pruneClosed`/`targetBranch: args.targetBranch` to
   `RemoteSyncOptions` (T6's resolution algorithm handles `targetBranch`
   being `undefined` — that is precisely what triggers branch resolution
   instead of the override), calls
   `syncRemote(workspace, { ..., ...(overrides?.git ? { git: overrides.git
   } : {}), ...(overrides?.gh ? { gh: overrides.gh } : {}) })` — threading
   the new `git` override through exactly like `gh` already threads into
   `issues.sync` — and returns
   `{ data, text: renderRemoteSyncResult(data) }`. Satisfies AC-11's wiring
   half.
5. In `output.ts`: add a `sync [--target-branch <name>] [--dry-run] [--prune-closed]` help line
   beside the existing `issues sync` line, and add `renderRemoteSyncResult`
   modeled on `renderIssueSyncResult` — one summary line plus indented
   detail lines for pushed refs, pruned branches, skipped refs, and
   failures.
6. In `cli.test.ts`: add cases asserting, through the real arg parser with
   an **injected `GitAdapter` double passed as `overrides.git`** (and a
   `GhAdapter` double as `overrides.gh` for the issues-selected cases) —
   never a real `origin` remote: (a) `sync` with no selector flags resolves
   `target`/`branches`/`issues` all `true` (the default row of T6's table)
   and the double records the expected push calls with **zero** real
   network access; (b) `sync --branches` resolves only `branches: true`,
   `target: false`, `issues: false` (narrowing); (c) `sync --prune-closed`
   alone still defaults `branches` to `true` (so pruning has refs to
   consider) per the same default rule; (d) an unknown flag for `sync`
   (e.g. `--force`) is rejected by `COMMAND_OPTIONS` validation; (e)
   `sync --target-branch release` resolves `targetBranch: "release"`
   through to `syncRemote`, distinct from `undefined` when the flag is
   omitted; (f) `sync --target-branch :refs/heads/name` is rejected before
   the injected Git adapter records a push. Satisfies AC-11's CLI-test half.
7. Run `npm run typecheck`, then `npm test`. Expected: all green.

**Task result:** diff, `npm test` output, appended to `apply/journal.md`.

### T8 — Rename the skill and correct every document that shows `push` or `commit+push`

**Purpose:** Documentation must not contradict the shipped validator or
advertise an action Close can no longer perform. Satisfies AC-7.

**Depends on:** T7

**Files:**

- Add: `skills/codepatrol-sync/SKILL.md`
- Delete: `skills/codepatrol-git/SKILL.md`
- Modify: `skills/catalog.yaml`
- Modify: `skills/codepatrol-close/SKILL.md`
- Modify: `skills/_shared/STAGE-IO.md`
- Modify: `skills/_shared/CODEPATROL-CLI.md`

**Steps:**

1. Re-read `skills/codepatrol-git/SKILL.md` in full,
   `skills/catalog.yaml`'s `codepatrol-git` entry (`:95-101`),
   `skills/codepatrol-close/SKILL.md:13` (the action-naming sentence, "choose
   `commit`, `commit+push`, or `rollback`" — two occurrences in one
   sentence) and `:36` (the opt-in push-mechanism sentence — a **separate**
   site from `:13`), `skills/_shared/STAGE-IO.md:11` (its own Close
   affordance example, "`commit`, `commit+push`, `rollback`"), and
   `skills/_shared/CODEPATROL-CLI.md:94-102` (the `close.json` prose and
   example, which currently shows `"push": true` and the phrase "via
   AskUserQuestion" in a `commit+push`-flavored authority string).
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
4. In `skills/codepatrol-close/SKILL.md`: at line 13, change "choose
   `commit`, `commit+push`, or `rollback`. Require the user to state the
   work id and exactly one action: `commit`, `commit+push`, or `rollback`."
   to name only `commit`/`rollback` (both occurrences in the sentence); at
   line 36, replace the opt-in push sentence with a statement that Close
   performs no remote action and that `codepatrol sync` owns pushing; also
   state that Close squashes to one commit and retains the Change branch.
5. In `skills/_shared/STAGE-IO.md:11`, change "Close will output `commit`,
   `commit+push`, `rollback`" to name only `commit`/`rollback`.
6. In `skills/_shared/CODEPATROL-CLI.md`, remove `push` from the `close.json`
   prose and example (leaving `outcome`, `actor`, `authority`), rewrite the
   example's authority text so it no longer describes a `commit+push`
   flow (e.g. "User selected commit via AskUserQuestion for <work-id>; ran
   `codepatrol sync --target` afterward to push."), and add a `sync` line to
   the command list.
7. Run `npm run lint:skills`. Expected: passes. Run
   `grep -rln "commit+push" skills/ src/ scripts/` and
   `grep -rn "codepatrol-git" skills/ src/ scripts/`. Expected: **zero**
   hits for both.

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
   nothing, `grep -n "push" src/change/orchestrator.ts` shows no
   `git.push` call under `closeChange`, and
   `grep -rln "commit+push" skills/ src/ scripts/` returns **zero** hits
   (AC-5, AC-7).
3. Run `git diff --stat main -- . ':!.codepatrol'` and reconcile against the
   spec's forecast: `src/change/{orchestrator,git,types,sync}.ts`,
   `src/cli/{args,commands,output}.ts`,
   `skills/codepatrol-sync/SKILL.md` (added),
   `skills/codepatrol-git/SKILL.md` (deleted), `skills/catalog.yaml`,
   `skills/codepatrol-close/SKILL.md`, `skills/_shared/STAGE-IO.md`,
   `skills/_shared/CODEPATROL-CLI.md`, and the four test files
   (`src/change/git.test.ts`, `src/change/close-push.test.ts`,
   `src/change/sync.test.ts`, `src/cli/cli.test.ts`). Any file outside that
   set is undeclared surface and must be explained in the journal.
4. Confirm no DC trigger fired: pruning stays behind `--prune-closed` and
   is never automatic (DC-1); no fetch/rebase/force/PR was added (DC-2); no
   issue annotation was added (DC-3); the remote branch list is never
   pruned by any command (DC-4).
5. Rollback check: confirm a single `git revert` of the resulting commit(s)
   would restore fast-forward Close, branch deletion, the `push` field, and
   remove `sync` (including `--prune-closed`) entirely.

**Task result:** the `npm run verify` output, grep results, `git diff --stat`
reconciliation, and residual-risk statement appended to `apply/journal.md`.
