# Verify — Close squash-merges and retains the branch locally; new `sync` command owns every remote action

- Change: `2026-07-27-local-close-squash-remote-sync`
- Candidate: Apply attempt 2, checkpoint `7f0c47d4ec196f2240919d0fe0e9a9c8addc937a`, tree `ca58e5be9c0e949b4d14af8b82fa7c0b0f1109e3`
- Auditor: claude-sonnet-5
- Evidence date: 2026-07-27T14:22:59.000Z

## Scope and evidence

Read the full Plan (attempt 8, accepted), Review (attempt 8, approve), and
Apply journal (both attempts) before inspecting the diff — every claim in
the journal is treated as a hypothesis and independently re-derived, not
trusted.

- Re-ran `npm run verify` fresh: typecheck clean, **236/236** tests, build
  clean, smoke-cli clean, lint-skills clean. Matches the journal's claimed
  count exactly.
- `git diff --stat main -- . ':!.codepatrol'`: exactly the 19 declared
  production/test/doc files, 821 insertions / 242 deletions. No undeclared
  surface.
- `grep -rln "commit+push" skills/ src/ scripts/` and
  `grep -rln "codepatrol-git" skills/ src/ scripts/`: both zero hits,
  independently re-run, not taken from the journal.
- Read `src/change/sync.ts` in full (111 lines) and
  `git diff main -- src/change/orchestrator.ts` in full, not excerpts.

## Findings

None blocking. One residual note (non-blocking, recorded below).

### Independently re-derived, not merely re-stated from the journal

**AC-10 fix (the actual defect Verify-1 caught) — traced the ref-format
mismatch to its root and confirmed the fix line by line.**
`GitAdapter.refs(prefix)` (`git.ts:86-89`) runs `for-each-ref
--format=%(refname:short) <prefix>` — for `refs/heads/codepatrol/`, this
returns short names like `codepatrol/<work-id>` (git strips only
`refs/heads/`, not the rest). `GitAdapter.deleteBranch(name, expected)`
(`git.ts:83`) does `update-ref -d refs/heads/${name}` — it expects that same
short form and prefixes `refs/heads/` itself. In `sync.ts`, `branchRefs` is
built from exactly this short-form `branches` array (`:79`), the prune map's
keys are built as `codepatrol/${work_id}` (`:97`, same short form), and
`git.deleteBranch(ref, ...)` (`:105`) passes that short form straight
through — all three now agree on one format. Confirmed this is a real fix,
not just a claim, via `src/change/sync.test.ts:223-243`
("`sync --prune-closed` deletes a terminal Change's branch after a
successful push and never its tag"), which drives a **real** git repository
through a full Close, then asserts `git branch --list <ref>` is empty,
`git tag --list <tagRef>` is non-empty, and `inspectChanges` still resolves
the Change as `terminal`/`committed` afterward — not a hand-rolled fake that
could mask the same bug the fixture is supposed to catch.

**AC-6 refspec-injection guard — reproduced the vulnerability class
directly, confirmed the fix closes it.** `NodeGitAdapter.push` (`git.ts:106-112`)
runs `git push origin <value>` — git treats the final argument as a
refspec, and `:refs/heads/name` is a valid refspec meaning "push nothing to
refs/heads/name," i.e. delete it remotely. `sync.ts:36-40`'s
`isSafeBranchName` reuses the exact regex and reject-conditions from
`assertStartInput` (`orchestrator.ts:44-45`, confirmed byte-identical) and
is called (`:51`) **before** `options.targetBranch` is ever assigned to
`branch`, which is the only path to `git.push` in the target block. Traced
`":refs/heads/name"` and `"HEAD:other"` through the regex by hand: both fail
`^[A-Za-z0-9]` or the mid-string charset (no `:` allowed) and are rejected.
`src/cli/cli.test.ts:457-467` proves this at the CLI boundary with a real
`parseArgs`/`executeCommand` round-trip and an injected adapter, asserting
both `INVALID_ARGUMENT` and zero recorded pushes.

**AC-1/AC-2/AC-9 (squash, tree identity, re-entrancy) — read the full
`closeWork`/`completeFinalization` diff, not the journal's summary.**
`closeWork` (`orchestrator.ts`, current) squashes via `mergeSquash` +
`commit`, then asserts `git.tree("HEAD") === git.tree(tag)` and throws
`CHANGE_DRIFT` if not; the `deleteBranch` call for the commit outcome is
gone entirely (rollback's `deleteBranch` call is untouched, confirmed by
diff). `completeFinalization`'s precondition now accepts `base_commit` **or**
tree-equality against the tag as the completed state — replacing the old
`terminalCommit`-equality check, which would have wrongly rejected a
squashed re-run. `git.test.ts:290-318` ("commit finalization squashes the
target to one tree-identical commit and retains the branch") drives a full
Plan→Review→Apply→Verify→Close lifecycle through a real repo, injects a
post-squash failure, re-runs Close successfully afterward
(`result.outcome === "committed"`), and separately proves genuine
post-terminal drift on the feature branch still correctly raises
`CHANGE_DRIFT` — the re-entrancy fix did not weaken drift detection.

**AC-4 (inspection dedupe) — confirmed via a counting adapter against a
real repo**, not a mock returning canned values: `git.test.ts:320-345`
closes a real Change (branch and tag share one commit), counts
`isAncestor` calls before and after pruning the branch, and asserts the
call count is bounded rather than doubled — consistent with
`validatedHeads` (`orchestrator.ts`, `inspectChanges`) skipping a second
full `validateCheckpointLineage` pass for an already-seen head.

**Cumulative diff scope re-verified against the live `main`, not against
the journal's own file list.** Apply attempt 1's checkpoint declared 19
`changes[]` paths; attempt 2's declared 3 (`sync.ts`, `sync.test.ts`,
`cli.test.ts` — the files the Verify-1 return actually touched). The
*cumulative* diff against `main` (independently computed, not read from
either checkpoint event) is exactly those same 19 files — confirms the
two-attempt declaration correctly composes to the real total delta.

### Residual, non-blocking

`sync.ts:57-58`: `if (!view) throw new CodepatrolError("CHANGE_NOT_FOUND", ...)`
after `inspectChanges(workspace, { workId, all: true })` is unreachable —
`inspectChanges` itself already throws `CHANGE_NOT_FOUND` when a `workId`
query matches zero records (confirmed: `orchestrator.ts`'s `filtered.length
!== 1` check), so `view` can never be `undefined` at that line. Harmless
defensive dead code, not a correctness defect; not worth a return for a
one-line no-op guard with zero behavioral effect. Noted for a future
cleanup pass, not blocking this Change.

## Acceptance coverage

| Criterion | Independently confirmed | Evidence |
|---|---|---|
| AC-1 | yes | `git.test.ts:290-318`: 1 commit, branch+tag retained |
| AC-2 | yes | same test: tree equality asserted; corrupted-squash test (`git.test.ts:347+`) rejects |
| AC-3 | yes | same test: `inspectChanges` resolves terminal/committed post-Close |
| AC-4 | yes | `git.test.ts:320-345`: counting adapter, bounded `isAncestor` calls |
| AC-5 | yes | `close-push.test.ts` rewritten; `exactInput` list has no `push`; grep confirms no `git.push` under `closeChange` |
| AC-6 | yes | `sync.test.ts` (10 cases) + `cli.test.ts` (6 sync cases): resolution, dry-run mutation-only suppression, refspec rejection |
| AC-7 | yes | `codepatrol-git` 0 hits, `commit+push` 0 hits, `lint:skills` clean |
| AC-8 | yes | `npm run verify` 236/236, 0 failures |
| AC-9 | yes | `git.test.ts:290-318`: re-run after injected post-squash failure succeeds |
| AC-10 | yes | `sync.test.ts:223-262`: real-repo prune-after-push, blocked-by-failure, non-terminal-never-pruned |
| AC-11 | yes | `CommandOverrides.git` present; `cli.test.ts` sync cases inject `GitAdapter`, zero real network |

## Simplicity axis

- Selected rung confirmed unchanged from Plan: direct local edits plus one
  bounded new module reusing existing primitives (`git.push`,
  `deleteBranch`, `syncIssues`, the `assertStartInput` branch grammar). No
  new dependency, no new protocol.
- Safety floor intact: tree-identity assertion is real and red-capable
  (verified above, not assumed); lineage remains fully validatable via the
  retained tag; no remote ref is ever deleted (confirmed: the only
  `deleteBranch`/`git.push` calls in the diff are local-branch prune and
  explicit opt-in pushes, both gated and tested).
- One harmless dead branch noted above; no removable production surface
  otherwise.

## Executability audit

Every task's stated files and claims were checked against the live diff,
not assumed from the journal. No gap found between what Plan specified,
what Apply claims, and what the repository actually contains.

## Storage taxonomy and Git/ref safety

- No new persisted data shape; `CloseInput`/`CloseResult` only lose fields.
- No remote ref is ever deleted by any code path in this diff — confirmed
  by reading every `git.push`/`deleteBranch` call site in `sync.ts` and
  `orchestrator.ts`.
- `--target-branch` cannot reach `git.push` with an unsafe value — traced
  above.
- Local branch pruning only follows a successful push of that exact ref in
  the same invocation, and never touches a `refs/tags/*` ref — confirmed
  by direct read of the prune loop's `branchRefs`/`terminal` filtering.

## Graph blast radius

Not re-synced this session; not required — every touched symbol is a
body-level or additive change within already-indexed files
(`orchestrator.ts`, `git.ts`, `types.ts`, `commands.ts`, `args.ts`,
`output.ts`) plus one new leaf module (`sync.ts`) with no exported symbol
name reused elsewhere. No public interface was removed except the deleted
`CloseInput.push`/`CloseResult.pushError`/`pushSuggestion` fields, whose
only production and test consumers are all inside this same diff (confirmed
by the AC-5 grep).

## Verdict

`commit`

Every acceptance criterion was independently re-derived against live
source and real, non-mocked-away regression tests — not accepted on the
journal's word. The two defects Verify-1 and prior Review rounds caught
(the ref-format mismatch and the refspec-injection gap) are both genuinely
fixed, traced line-by-line, not merely re-asserted. One harmless dead
branch is noted but does not block. `npm run verify` is green at 236/236.

## Residual risks

- DC-1 (pruning is opt-in, not automatic — local branches still accumulate
  without `--prune-closed`), DC-2 (no fetch/rebase/force/PR), DC-3 (no
  issue annotation), DC-4 (no remote pruning) all carry stated ceilings and
  triggers from Plan; none is newly introduced or worsened by this diff.
- The one-line dead `CHANGE_NOT_FOUND` guard noted above (no behavioral
  risk).

## Candidate binding

Apply attempt 2 checkpoint `7f0c47d4ec196f2240919d0fe0e9a9c8addc937a`, tree
`ca58e5be9c0e949b4d14af8b82fa7c0b0f1109e3`, on branch
`codepatrol/2026-07-27-local-close-squash-remote-sync`.
