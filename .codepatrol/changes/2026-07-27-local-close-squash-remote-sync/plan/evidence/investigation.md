# Plan evidence — local squash Close, retained branch, remote-owning sync command

All commands re-run fresh against `main`@`7380920` during this Plan attempt.

## 1. The bookkeeping-commit problem, measured

Every Change today fast-forwards its *entire* branch history onto the target.
The last closed Change (`2026-07-27-checkpoint-delete-artifact-add-fix`) put
**38 commits** on `main` for a production delta of 2 files / 34 lines:

```
$ git log --oneline 61fa981..7380920 | wc -l
38
$ git log --oneline 61fa981..7380920 --format="%h %s" -- src/ skills/ scripts/ | wc -l
1
```

37 of 38 are lifecycle bookkeeping (`begin`/`usage`/`<stage> content`/
`checkpoint`/`return`). Repository-wide:

```
$ git rev-list --count HEAD
833
$ git log --oneline --format="%s" | grep -c "^chore(codepatrol):"
825
```

**825 of 833 commits on `main` (99.0%) are Codepatrol bookkeeping.** `main`'s
history is unreadable as a project history: `git log --oneline` shows almost
nothing but lifecycle noise, and `git bisect`/`git blame` over it is dominated
by commits with empty production deltas.

## 2. Squash mechanism verified end to end

Reproduced the exact target semantics in a scratch repo — squash-merge the
terminal tag into the target, keep branch and tag:

```
$ git merge --squash codepatrol/x && git commit -m "feat: change x"
$ git rev-list --count $BASE..main
1
$ git rev-parse main^{tree}          # ec17417add4b4973f9eea21755907035535330fe
$ git rev-parse codepatrol/committed/x^{tree}   # ec17417add4b4973f9eea21755907035535330fe
TREES IDENTICAL
```

6 branch commits collapse to 1 on the target, and the resulting **tree is
byte-identical** to the terminal tag's tree. Tree identity is the property
that matters: the target's content after Close is exactly what Verify
accepted, unchanged by the squash.

## 3. Lineage validation is never anchored to the target branch

This is the property that makes squashing safe. `validateCheckpointLineage`
(`src/change/orchestrator.ts:149-162`) asserts
`git.isAncestor(event.checkpoint, ref)` for every checkpoint. Every call site
passes a branch- or tag-anchored ref, **never** the target branch:

```
$ grep -n "validateCheckpointLineage(" src/change/orchestrator.ts
303: ... validateCheckpointLineage(git, record, "HEAD", ...)     # on the feature branch
347: ... validateCheckpointLineage(git, record, head, ...)       # head of refs/heads/codepatrol/*
356: ... validateCheckpointLineage(git, record, head, ...)       # head of the terminal tag
385: ... validateCheckpointLineage(git, record, existingTag ?? "HEAD", ...)
```

Confirmed in the scratch repo: after the squash, every branch commit remains
an ancestor of the terminal tag, and none is an ancestor of `main` — which no
code path checks:

```
$ git merge-base --is-ancestor <each branch commit> codepatrol/committed/x   # all OK
$ git merge-base --is-ancestor codepatrol/x~2 main                            # NOT ancestor (expected)
```

The tag alone already preserves lineage today (that is why deleting the
branch is currently safe). Retaining the branch strictly *adds* a second
anchor; it removes none.

## 4. Retained branches double an already-dominant inspection cost — measured

Timed against the real workspace (32 terminal tags, 0 active branches):

```
$ time codepatrol backlog list       # no Change inspection
0.09s total
$ time codepatrol change summary --id <id>
8.83s total
$ time codepatrol next --stage plan
8.96s total
$ time codepatrol status --all
8.86s total
```

CLI startup is **0.09s**; everything above it (~8.7s) is Change inspection
over refs. `next` already calls `inspectChanges(workspace, { all: true })`
(`src/cli/commands.ts:77`), so it already walks all 32 terminal tags — ~0.27s
of git subprocesses per terminal ref, dominated by `validateCheckpointLineage`
running `git.tree` + `git.isAncestor` + `git.show` per checkpoint event.

`inspectChanges` iterates `refs/heads/codepatrol` unconditionally
(`orchestrator.ts:344`) and terminal tags only under `query.all`
(`orchestrator.ts:351`). **Retaining a branch per closed Change therefore adds
one full lineage validation per closed Change to every inspection** — for a
closed Change the branch head and the terminal tag head are the same commit,
so the work is exactly duplicated. At today's 32 closed Changes that is a
projected ~2x regression (~8.8s → ~17s), growing linearly and unboundedly with
every future Change.

`addRecord` (`orchestrator.ts:332-335`) already tolerates the duplicate — it
only throws when two sources disagree, and a retained branch's record is
byte-identical to its tag's — so the duplicate is pure wasted work, not a
correctness failure. Deduplicating by resolved head SHA is therefore both
safe and necessary; without it, retention ships an unbounded latency
regression.

## 5. Closed Changes stay out of the active board on their own

`foldChange` sets `state = "terminal"` on the `change-closed` event
(`src/change/model.ts:132`), and both consumers filter on it:

```
$ grep -rn 'state !== "terminal"' src/
src/change/board.ts:30       # Kanban rows
src/cli/commands.ts:77       # next --stage
```

A retained branch carries the closed record, so it folds to `terminal` and is
filtered out of `next` and the Kanban without any extra rule. Retention does
not pollute the active board.

## 6. Close is the only remote-touching lifecycle stage today

```
$ grep -rn "pushSuggestion\|pushError\|push: true" src/ skills/ | grep -v "\.push("
src/change/types.ts:55          CloseInput.push?, CloseResult.pushError/pushSuggestion
src/change/orchestrator.ts:450-456   the push call and suggestion
src/cli/commands.ts:169         "Consider: <suggestion>" text
skills/codepatrol-close/SKILL.md:36  opt-in push documentation
src/change/close-push.test.ts        4 assertions on push behavior
```

`git.push(remote, branch)` (`src/change/git.ts:106-112`) is the single remote
primitive and its only production caller is `closeChangeLocked`. Every other
CLI command is fully local.

The one other outbound-network surface already exists and is already
segregated: `codepatrol issues sync` (`src/change/issue-sync.ts`, 188 lines,
`NodeGhAdapter` over the `gh` CLI), documented by the existing
`skills/codepatrol-git/SKILL.md` whose own text already states the intended
invariant — *"This command makes the first outbound network call in the entire
CLI. Every other command remains fully local."* Close's opt-in push is the
sole violation of that stated invariant.

`origin` is configured (`https://github.com/shiborgi/codepatrol.git`), so the
push paths are real, not hypothetical.

## 7. Branch↔issue linkage already has a data home and a working close chain

`BacklogItem` (`src/change/backlog.ts:15-27`) already carries both
`workId: string | null` and `externalRef?: { provider, number, url }`. For any
item with both, the branch is `codepatrol/<workId>` and the issue is
`externalRef.number` — the relation is **derivable today, with no schema
change**.

The close-the-issue chain is also already complete end to end:

- `closeChangeLocked` flips every linked `scheduled` item to `done`
  (`orchestrator.ts:437-444`, `resolveBacklogItem(..., "done", ...)`);
- `syncIssues` push direction closes the GitHub issue for every `done` or
  `dismissed` item whose linked issue is still open
  (`issue-sync.ts:129-137`, reason `completed` / `not planned`).

What is genuinely missing is only the *annotation*: nothing posts the branch
name or squashed commit onto the issue when closing it. That is a small,
separable gap — recorded as a backlog follow-up rather than folded in here,
since it needs its own evidence about comment formatting and idempotency
(re-running sync must not post duplicate comments).

## 8. Close re-entrancy is an existing, tested guarantee that squashing silently removes

`closeWork`'s current commit-outcome guard is:

```
if (checkedOutHead === view.identity.base_commit) await git.mergeFf(tag, signal);
else if (checkedOutHead !== terminalCommit) throw CodepatrolError("TARGET_ADVANCED", …);
```

Under fast-forward this is idempotent: after a successful `mergeFf(tag)` the
target head **equals** `terminalCommit`, so a recovery re-run takes neither
branch and completes. Under squash the target head becomes a **new** commit
that is neither `base_commit` nor `terminalCommit`, so the same guard throws
`TARGET_ADVANCED`. Simulated directly against a squashed repo:

```
base_commit              = 5a88381…
terminalCommit           = 41f09a7…
target head after squash = 1cc8ea4…   (neither)
guard -> THROWS TARGET_ADVANCED
```

This is not a theoretical path. `src/change/git.test.ts:266` ("commit
finalization fast-forwards the unchanged target and preserves a terminal
tag") is precisely a close-recovery test: it injects a post-merge failure via
`FailAfterMergeGit`, asserts the rejection, drifts the branch and asserts
`CHANGE_DRIFT`, resets, then **re-runs `closeChange` and asserts it
succeeds** (`assert.equal(result.outcome, "committed")`, line 283).

Three further assertions in that same test break under squash and must be
updated deliberately rather than discovered as surprise failures:

- `FailAfterMergeGit` (`git.test.ts:57`) overrides `mergeFf`, which
  `closeWork` no longer calls once it squashes — the injected failure would
  never fire and `assert.rejects(…, /injected after merge/)` (line 278)
  would fail. The double must override `mergeSquash` instead.
- Line 283 asserts `run(["rev-parse", "HEAD"]) === result.terminalCommit`.
  Under squash HEAD is the new squash commit, not the tag's commit.
- Line 283 asserts `run(["branch", "--list", …]) === ""` (branch deleted).
  Retention inverts this.

The correct completed-state test under squash is **tree equality**: the
target's tree already equalling the terminal tag's tree means the squash
landed. That is the same basis the plan already applies to
`completeFinalization`, so both guards can use one consistent rule.

## 9. Pruning the local branch after a successful push — verified safe

The retained branch is what makes `refs/heads/codepatrol/*` grow without
bound. Deleting it locally **after** its history is safely on the remote
resolves that, and is safe precisely because the terminal tag, not the
branch, is what anchors lineage (§3).

Verified end to end against a real bare remote — push branch + tag + target,
delete the local branch, then run the most aggressive prune git offers:

```
$ git push origin codepatrol/x codepatrol/committed/x main
$ git branch -D codepatrol/x
$ git reflog expire --expire=now --all && git gc --prune=now
  refs/heads/codepatrol left: 0
  refs/tags/codepatrol  left: 1
  checkpoint object alive after aggressive gc: YES
  isAncestor(checkpoint, tag): OK
  remote still has branch: codepatrol/x
```

Every checkpoint object survives because the tag still reaches them, so
`validateCheckpointLineage` and `validateAcceptedRefArtifacts` keep working,
and `listWorkingTreeChangeIds`'s
`validateWorkspaceArtifacts(…, accepted.checkpoint, …)` path resolves too.
Meanwhile `inspectChanges`'s **unconditional** `refs/heads/codepatrol` scan
drops to zero refs for closed Changes — a strictly better outcome than the
head-SHA dedupe alone, which only avoids double-counting.

The boundary is the tag. Deleting it as well is **not** safe: `inspectChanges`
scans only `refs/heads/codepatrol` and `refs/tags/codepatrol`, so the Change
becomes invisible locally, and its objects then survive only incidentally via
`refs/remotes/origin/*` — which `git remote prune` or a differently-configured
clone can remove. Confirmed separately that a fresh `git clone` does refetch
tags by default, so history genuinely lives on the remote either way; the
local tag is kept for the tool's own validation, not for archival.

Ordering is therefore load-bearing: **push first, delete only on success.**
A failed push must leave the branch in place.

## 11. Returned-review correction: pruning-scope contradiction and missing CLI flag contract

Attempt 2 was returned `fix-first` on two findings, both independently
re-verified before correcting:

1. **Stale global constraint.** `plan.md`'s Simplicity proof still listed
   "no branch pruning (DC-1)" under "Forbidden speculative surface"
   (introduced in attempt 1, never revisited when attempt 2 added
   `sync --prune-closed`), directly contradicting the same document's T6/T7
   and `spec.md`'s Scope, all of which make pruning required, opt-in
   behavior. Confirmed by direct read: `plan.md`'s Simplicity proof
   still said this verbatim while T6 step 3 fully specifies
   `pruneClosed`'s implementation. Fixed by restating the constraint as
   "branch pruning exists only behind `--prune-closed`; DC-1 is its
   opt-in-ness, not its absence."
2. **No concrete CLI flag contract for `sync`.** `RemoteSyncOptions`
   (`plan.md` T6 step 2) defines `target?: boolean; branches?: boolean;
   issues?: SyncDirection | false` as TypeScript fields, but T7 step 2 only
   says "the target/branches/issues selectors chosen in T6" — T6 never
   names a flag. Confirmed by direct read of T7: no flag name, no default,
   no interaction with `--prune-closed` is specified anywhere. Without this
   an Apply agent has no single correct `args.ts`/`commands.ts` mapping to
   implement, and AC-6 (CLI acceptance) has nothing concrete to test against.

Designed the flag contract by extending the codebase's own existing
pattern rather than inventing a new one — `issues sync --direction
pull|push|both` (`args.ts:38,60`) is already the precedent for "one
existing boolean-adjacent flag selects reconciliation direction, a
`--dry-run` boolean gates all writes":

- `--target` (boolean, added to `BOOLEAN_FLAGS`): select pushing the target
  branch.
- `--branches` (boolean): select pushing retained Change branches and their
  terminal tags.
- `--issues` (boolean): select issue reconciliation; when set, the
  *existing* `--direction pull|push|both` flag (already registered for
  `issues.sync`, reused verbatim) controls its direction, defaulting to
  `both` exactly as `issues sync` already does.
- `--prune-closed` (boolean): as designed in attempt 2 — prune only refs
  pushed successfully in the same invocation.
- **Default when none of `--target`/`--branches`/`--issues` is given: all
  three are selected** ("sync everything"), mirroring `issues sync`'s own
  default of `direction: both` when unspecified — omitting selectors is
  already this codebase's convention for "the permissive default," not
  "do nothing." Passing any one of the three narrows to exactly the
  selected subset(s).
- `--prune-closed` requires no explicit dependency check on `--branches`:
  because pruning eligibility is defined as "the ref was pushed in *this*
  run" (T6 step 3, unchanged), passing `--prune-closed` without
  `--branches` selected simply prunes nothing (a safe no-op), since no
  branch ref appears in that run's `pushedRefs`.

## 13. Returned-review correction: `--dry-run` cannot mean zero remote calls when issues are selected

Attempt 3 was returned `fix-first` on one finding: `spec.md`'s Intent
(line 23, "make none") and AC-6 ("`--dry-run` performing **zero** remote
calls") both promise no remote traffic at all, but `plan.md` T6 step 2
requires `syncRemote` to delegate to the existing, unchanged `syncIssues`
when `issues` is selected — and `syncIssues` cannot honor that promise.
Confirmed by direct read of `src/change/issue-sync.ts:88-99`:

```typescript
export async function syncIssues(workspace: string, direction: SyncDirection, options: IssueSyncOptions = {}): Promise<IssueSyncResult> {
	...
	const dryRun = options.dryRun ?? false;
	await gh.assertAvailable(signal);
	const issues = await gh.listIssues(signal);
	...
```

`gh.assertAvailable` and `gh.listIssues` run **unconditionally**, before
`dryRun` is even read for any branching decision. `dryRun` only gates the
three *write* calls further down (`gh.ensureLabel`, `gh.createIssue`,
`gh.closeIssue`) and the two `writeBacklog` calls. This is `issues sync
--dry-run`'s own existing, already-shipped definition of dry-run: **no
remote mutations**, not **no remote calls** — confirmed this is not new
behavior this Change would introduce, by checking `issues sync --dry-run`'s
current documented contract (`skills/codepatrol-git/SKILL.md`'s own
"`--dry-run`: report the would-be result with zero `gh` **write** calls and
zero `items.yaml` writes" — write calls, not all calls, already the
precedent).

`spec.md`'s Out of scope already states "Any change to `syncIssues`'s own
pull/push semantics ... stays exactly as they are" — so changing
`syncIssues` to skip its read calls under `dryRun` is itself out of scope
(and would be a behavior change to a component this Change deliberately
does not touch). The only coherent fix compatible with that constraint is
to correct `sync`'s own promise to match the primitive it composes: `sync
--dry-run` means zero remote **mutations**, consistent across `git.push`
(already correctly scoped that way in T6 step 2's existing prose) and
`syncIssues` (inherits its existing, unchanged read-then-maybe-write
shape). `git.push`, `gh.ensureLabel`, `gh.createIssue`, `gh.closeIssue`,
`git.deleteBranch`, and both `writeBacklog` calls are the complete set of
remote/durable *mutations* `sync` can trigger; `gh.assertAvailable` and
`gh.listIssues` are read-only preconditions already exempt from dry-run in
the component being reused.

## 15. Returned-review correction: stale `commit+push` affordance and missing `GitAdapter` test seam

Attempt 4 was returned `fix-first` on two findings, both independently
re-verified before correcting.

**Finding A — `commit+push` survives in six places, not the one T5/T8
already covered.** `grep -rln "commit+push" skills/ src/ scripts/` finds:

```
skills/codepatrol-close/SKILL.md:13   "choose commit, commit+push, or rollback" (x2 in one sentence)
skills/_shared/STAGE-IO.md:11         "Close will output commit, commit+push, rollback"
skills/_shared/CODEPATROL-CLI.md:101  close.json example's authority text: "...via AskUserQuestion..."
src/cli/commands.ts:84                closeOptions: ["commit", "commit+push", "rollback"]
src/cli/output.ts:162                 "Close options: commit, commit+push, rollback"
src/cli/cli.test.ts:195               assert.deepEqual(close.closeOptions, [...,"commit+push",...])
```

T5 (which strips `push` from `CloseInput`/`CloseResult`) never touched any
of these — it only edited `types.ts`, `orchestrator.ts`'s push block, and
`commands.ts`'s "Consider: …" suggestion line, none of which overlap these
six sites. T8 step 1 only cited `codepatrol-close/SKILL.md:36` (the
mechanism sentence, "An opt-in `git push origin <target>` is allowed
when… `push: true`…") — it never cited line 13, the sentence that names
`commit+push` as one of exactly three user-facing Close **actions**. Once
`CloseInput.push` is rejected, `commit+push` is not just undocumented, it
is a listed action that unconditionally fails.

**Root design decision, not just a text fix**: since Close is now local-only
and cannot push under any input, `commit+push` cannot be redefined as a
single Close action at all — it must be **removed as a Close action**,
leaving exactly two (`commit`, `rollback`), with pushing performed as a
separate, explicit `sync --target` call afterward. This is consistent with
the Change's own single-remote-owner premise: Close offering a compound
"commit and also push" action would resurrect exactly the two-owners
problem `spec.md`'s Alternatives already rejected ("Keep Close's push and
simply add `sync` alongside it").

**Finding B — no `GitAdapter` injection seam for CLI tests.** `T7` step 5
promises `sync` CLI tests "with injected adapter overrides," but
`src/cli/commands.ts:24-26`'s `CommandOverrides` interface has only:

```typescript
export interface CommandOverrides {
	gh?: GhAdapter;
}
```

Confirmed by direct read: no `git` field exists, and the only place
`overrides` is consumed is line 209's `issues.sync` case
(`...(overrides?.gh ? { gh: overrides.gh } : {})`), which has nothing to do
with `sync`. Without a `git` override, a `cli.test.ts` case for `sync`
would need a real `origin` remote to avoid a genuine network push — exactly
what T7's own step 5 claims to avoid ("without network access"). The fix is
mechanical and follows the file's own existing pattern exactly: add
`git?: GitAdapter` to `CommandOverrides` (importing `GitAdapter` from
`../change/git.js`, not yet imported in this file — confirmed by
`grep -n "^import" src/cli/commands.ts`, which currently imports only
`GhAdapter` from `../change/issue-sync.js`), and thread it into the new
`case "sync":`'s call to `syncRemote` the same way `overrides?.gh` already
threads into `syncIssues`.

## 16. Rollback is deliberately left alone

The request names only the commit path ("apenas o commit final e merge na
branch main ... mantendo a branch da change"). Rollback's current behavior
(tag `codepatrol/rolled-back/<id>`, target byte-identical, branch deleted)
touches neither the target's history nor the squash question. Changing it
would be unrequested scope; it stays exactly as-is.
