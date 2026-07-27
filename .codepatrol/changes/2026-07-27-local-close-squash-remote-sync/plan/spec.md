# Specification — Close squash-merges and retains the branch locally; new `sync` command owns every remote action

## Intent

- Origin: user request
- Mode: feature
- Target baseline: `main` @ `7380920` (branch `codepatrol/2026-07-27-local-close-squash-remote-sync`), clean tree, `npm run verify` green (217/217)
- Governing constraints: `skills/_shared/CHANGE.md` — "Close is the only normal terminal mutation … It never fetches, pushes, rebases, forces or resolves conflicts"; `skills/codepatrol-git/SKILL.md` already states the intended invariant "This command makes the first outbound network call in the entire CLI. Every other command remains fully local." No ADR directory exists in this repo (absent by design).
- Substrate state: graph not re-synced — every affected symbol was located by direct read/grep during this Plan attempt and is cited by `file:line` in `plan/evidence/investigation.md`.
- Improvement signals (from `.codepatrol/docs/improvement-reports/2026-07-27-checkpoint-delete-artifact-add-fix.md`, most recent by mtime): "Review stage returned 2+ times — surface the top review defects to the next Plan" (acted on directly: this Plan performs the self-check that Change introduced, and every design claim below is measured or reproduced rather than asserted); "Top error code: INVALID_ARGUMENT (4)" (payload-shape friction, already addressed by `2026-07-26-document-transition-close-payloads`, not actionable here); "Command `change.session` was invoked 49 times" (workflow/tooling concern, unrelated file, independently tracked backlog item).
- Problem: two distinct defects, one request. (a) Close fast-forwards the *entire* feature branch onto the target, so **825 of 833 commits on `main` (99.0%) are lifecycle bookkeeping** — the last Change alone put 38 commits on `main` for a 2-file production delta, making `main`'s history unusable for `log`/`blame`/`bisect`. (b) Close performs an opt-in `git push`, making it the only lifecycle stage that touches the network and violating the invariant `codepatrol-git`'s own documentation already asserts; there is no single place that owns remote interaction, so pushing the target, publishing a Change branch, and reconciling issues are three unrelated mechanisms (one buried in Close, one absent, one in `issues sync`).
- Outcome: Close becomes **fully local** and puts **exactly one commit** on the target — a squash whose tree is byte-identical to the Verify-accepted terminal tree — while **retaining** the feature branch so the full lifecycle history stays checkout-able locally until it has been published. (Lineage itself is anchored by the terminal tag, which Close already creates and which alone suffices — see Current evidence; retention exists for local inspectability, not for lineage.) A new `codepatrol sync` command becomes the single owner of every remote action: pushing the target branch, publishing retained Change branches and terminal tags, reconciling GitHub issues (by delegating to the existing `syncIssues`), and — once a closed Change's branch is safely on the remote — **deleting that branch locally**, so the local ref namespace stays bounded while its history lives on the remote. `codepatrol-git` is renamed to `codepatrol-sync` to match.

## Scope

### In scope

- **Close squashes**: replace `closeWork`'s `git.mergeFf(tag)` with a squash so the target gains exactly one commit whose tree equals the terminal tag's tree.
- **Close stays re-entrant**: both `closeWork`'s commit-outcome guard and `completeFinalization`'s target-head postcondition currently treat "target head equals `terminalCommit`" as the completed state. That holds for a fast-forward and **fails for a squash**, whose target head is a new commit equal to neither the base nor the terminal commit — so a recovery re-run would throw `TARGET_ADVANCED`. Both guards must instead treat **"the target's tree already equals the terminal tag's tree"** as the completed state, so Close remains idempotent after a partial failure.
- **Close retains the feature branch on the `commit` outcome**: stop deleting `refs/heads/codepatrol/<work-id>` when the outcome is `commit`. The terminal tag is still created before any other ref mutation.
- **Inspection dedupe (required by retention)**: `inspectChanges` must not validate the same resolved head twice. A retained branch and its terminal tag point at the same commit, so today's code would run one full `validateCheckpointLineage` per closed Change on **every** inspection — a measured ~2x latency regression (~8.8s → ~17s at today's 32 closed Changes) growing linearly forever. Skip re-validating a ref whose resolved head SHA was already validated in the same `inspectChanges` call.
- **Close becomes local-only**: remove `push` from `CloseInput`, remove `pushError`/`pushSuggestion` from `CloseResult`, remove the push call and the "Consider: …" text from `src/cli/commands.ts`, and update `skills/codepatrol-close/SKILL.md` to state Close never touches the network.
- **`commit+push` is removed as a Close action, everywhere it is named**: since Close can no longer push under any input, offering a compound "commit and push" action would resurrect the two-owners problem this Change exists to remove. `codepatrol next --stage close` reports exactly two actions, `commit` and `rollback`, not three. This touches every site that names the three-action list as a unit: `src/cli/commands.ts`'s `closeOptions`, `src/cli/output.ts`'s help text, `skills/codepatrol-close/SKILL.md`'s own action-naming sentence, and `skills/_shared/STAGE-IO.md`'s example — not only the mechanism sentence about the `push: true` field.
- **New `codepatrol sync` command** (`src/change/sync.ts` + CLI wiring in `args.ts`/`commands.ts`/`output.ts`), the single remote owner, with explicit opt-in targets: push the target branch, push retained Change branches and their terminal tags, and run issue reconciliation by calling the existing `syncIssues`. It must support `--dry-run`, meaning **zero remote mutations** — consistent with `issues sync --dry-run`'s own already-shipped definition (`skills/codepatrol-git/SKILL.md`: "zero `gh` write calls and zero `items.yaml` writes"), not zero remote calls of any kind: `syncIssues`'s unconditional `gh.assertAvailable`/`gh.listIssues` reads still run under dry-run, exactly as they already do today, since changing that is out of scope (see Out of scope).
- **`sync --target`'s deterministic branch selection**: `ChangeIdentity.target_branch` is stored per Change, not per workspace, and no git-config "current branch's target" mechanism exists — so which branch `--target` pushes must be resolved, not assumed. The rule, total over every input: if the current branch is `codepatrol/<work-id>`, resolve that Change (`inspectChanges({ workId, all: true })`, matching `change.inspect`/`change.summary`/`change.doctor`'s own existing pattern) and push its `identity.target_branch`; otherwise, if the current branch itself is some Change's recorded `target_branch` (checked against every Change, `inspectChanges({ all: true })`), push it; otherwise reject with `INVALID_ARGUMENT` naming the unresolved branch — never guess. An explicit `--target-branch <name>` flag bypasses resolution entirely for scripted or already-known-target use.
- **`sync --prune-closed`**: after a Change branch has been **successfully pushed**, and only when that Change's record is terminal, delete the local `refs/heads/codepatrol/<work-id>`. Ordering is load-bearing: push first, delete only on success; a failed push must leave the branch in place. The terminal tag is **never** deleted — it is what keeps checkpoint objects reachable and the Change visible to `inspectChanges` (verified: after `git gc --prune=now` with the branch deleted and the tag kept, every checkpoint object survives and `isAncestor(checkpoint, tag)` still passes). Deletion reuses the existing `GitAdapter.deleteBranch(name, expectedSha)`, whose `update-ref -d <ref> <expected>` form refuses to delete a ref that has moved. This replaces the previous revision's unbounded-growth deferral; what remains deferred is only that pruning is opt-in (DC-1) and that the remote is never pruned (DC-4).
- **Skill rename `codepatrol-git` → `codepatrol-sync`**: rewrite `skills/codepatrol-git/SKILL.md` as `skills/codepatrol-sync/SKILL.md` covering the broader remote scope, and update `skills/catalog.yaml`'s entry accordingly.
- Regression tests for every behavior above, in the existing test files that already cover the corresponding seams (`src/change/git.test.ts` for close/git semantics, `src/change/close-push.test.ts` repurposed or removed, a new `src/change/sync.test.ts` for the sync command, `src/cli/cli.test.ts` for CLI wiring).

### Out of scope

- **Rollback's behavior is unchanged** — it still tags `codepatrol/rolled-back/<work-id>`, leaves the target byte-identical, and deletes the branch. The request names only the commit path; changing rollback would be unrequested scope. Recorded as a decision, not a deferral.
- **Annotating the GitHub issue with its Change branch / squashed commit when closing it** — the *relation* is already derivable (`BacklogItem` carries both `workId` and `externalRef`) and the *close chain* already works end to end (Close flips linked items to `done`; `syncIssues` closes their issues). Only the comment-posting is missing, and it needs its own evidence on formatting and idempotency (re-running sync must not duplicate comments). Filed as backlog item `sync-should-annotate-the-github-issue-with-its-change-branch-and-squashed-commit-when-closing-it` (p3, `plan-followup`, this work id), committed ahead of this checkpoint.
- **Rewriting or squashing the 825 existing bookkeeping commits already on `main`** — this Change fixes the mechanism going forward only; history rewriting of a pushed branch is destructive, needs its own authority, and is not requested.
- **Any change to `syncIssues`'s own pull/push semantics** — `sync` calls it unchanged; issue reconciliation logic, direction flags, and the `codepatrol-backlog` label behavior stay exactly as they are.
- **Fetching, rebasing, force-pushing, or conflict resolution in `sync`** — `sync` only pushes refs that already exist locally and calls `gh` for issues. No `git fetch`, no `--force`, no rebase, no PR creation.
- **Making `sync` part of the lifecycle projection** — it records no Change events, owns no stage, and never mutates `change.yaml`. It stays outside Plan→Review→Apply→Verify→Close entirely.

## Current evidence

See `plan/evidence/investigation.md` for the full trace with reproductions and
timings. Load-bearing facts restated:

- 38 commits on `main` from the last Change, 1 of which touched production;
  825/833 (99.0%) of `main`'s commits are `chore(codepatrol):` bookkeeping.
- Squash verified in a scratch repo: 6 branch commits → 1 target commit, and
  `git rev-parse main^{tree}` equals the terminal tag's tree exactly.
- `validateCheckpointLineage` (`orchestrator.ts:149-162`) is called at 4 sites
  (`:303, :347, :356, :385`), every one anchored to the feature branch head,
  `HEAD` while on that branch, or the terminal tag — **never** the target
  branch. Confirmed in the scratch repo that post-squash every branch commit
  remains an ancestor of the tag and none is an ancestor of `main`.
- Measured: CLI startup 0.09s; any Change inspection ~8.8s over 32 terminal
  refs (~0.27s/ref). `next` already passes `{ all: true }`
  (`commands.ts:77`). Retained branches would duplicate one full lineage
  validation per closed Change on every inspection.
- `addRecord` (`orchestrator.ts:332-335`) throws only when two sources
  *disagree*; a retained branch's record is byte-identical to its tag's, so
  the duplicate is wasted work, not a correctness failure.
- `foldChange` sets `state = "terminal"` on `change-closed`
  (`model.ts:132`); `board.ts:30` and `commands.ts:77` both filter on it, so
  retained branches stay off the active board with no new rule.
- Close is the only remote-touching stage: `git.push` (`git.ts:106-112`) has
  exactly one production caller, `closeChangeLocked` (`orchestrator.ts:450-456`).
- `origin` is configured (`https://github.com/shiborgi/codepatrol.git`).
- **The terminal tag alone anchors lineage; the branch does not.** Deleting
  the branch is already safe today for exactly this reason. Retention is
  therefore justified by local *inspectability* (a checkout-able branch),
  not by lineage — which is why pruning it after publication costs nothing.
- **Close's re-entrancy guard is fast-forward-specific.** After `mergeFf`
  the target head equals `terminalCommit`, so a re-run no-ops; after a squash
  it equals neither the base nor the terminal commit, so the same guard
  throws `TARGET_ADVANCED`. `git.test.ts:266` already exercises that re-run
  and asserts it succeeds (line 283). Tree equality is the squash-correct
  completed-state test.
- **Pruning the local branch after a successful push is verified safe**:
  with the branch deleted and the tag kept, `refs/heads/codepatrol` drops to
  0 refs, every checkpoint object survives
  `git reflog expire --expire=now --all && git gc --prune=now`,
  `isAncestor(checkpoint, tag)` still passes, and the remote retains the
  branch. Deleting the **tag** as well is not safe — `inspectChanges` scans
  only `refs/heads/codepatrol` and `refs/tags/codepatrol`, so the Change
  would become locally invisible.

## Proposed design

**1. Squash in `closeWork`.** The target is at `base_commit` and the terminal
tag descends from it, so a squash cannot conflict. Replace the fast-forward
with a squash-merge plus a single commit, then assert tree identity against
the terminal tag before returning — the squash is only correct if the target
tree ends up byte-identical to what Verify accepted, and that assertion is
what makes the operation verifiable rather than assumed. Two new
`GitAdapter` methods are required (`mergeSquash`, and a tree-comparison the
adapter can already do via the existing `tree(ref)`), keeping every git
invocation in the adapter as the codebase already requires.

**2. Retain the branch on `commit`.** In `closeWork`, drop the
`deleteBranch` call for the commit outcome. Ordering is unchanged: the tag is
still created before any ref mutation, so recovery semantics are preserved.
Rollback keeps its `deleteBranch` call untouched.

**3. Dedupe inspection by resolved head.** In `inspectChanges`, track the set
of head SHAs already validated in the current call and skip
`validateCheckpointLineage`/`validateAcceptedRefArtifacts` for any later ref
resolving to a SHA already processed, while still recording the ref as a
source. This is safe precisely because `addRecord` already proves the records
are identical when the heads are.

**4. Strip push from Close.** Delete the `push` field from `CloseInput`, the
`pushError`/`pushSuggestion` fields from `CloseResult`, the push block from
`closeChangeLocked`, and the "Consider: …" line from `commands.ts`.
`git.push` stays on the adapter — it moves from having one caller (Close) to
having one caller (sync).

**5. New `sync` command.** A new `src/change/sync.ts` exposing
`syncRemote(workspace, options)` where options select what to push
(target branch, Change branches, tags) and whether to reconcile issues,
plus `dryRun`. It composes existing primitives only — `git.push` for refs and
`syncIssues` for issues — and returns a structured result the CLI renders.
Wiring: one `COMMAND_OPTIONS` entry in `args.ts`, one `case` in
`commands.ts`, one help line and one renderer in `output.ts`.

**6. Rename the skill.** `skills/codepatrol-git/` → `skills/codepatrol-sync/`,
rewritten for the broader remote scope, with `skills/catalog.yaml`'s key and
`produces`/`consumes` updated to match.

## Alternatives

- **`git commit-tree` to synthesise the squash commit directly instead of
  `merge --squash` + `commit`**: rejected — `commit-tree` is a plumbing
  command needing manual parent/tree/message assembly and its own author/
  committer handling, while `merge --squash` reuses the index machinery the
  adapter already drives and was verified to produce a tree-identical result.
  No benefit proportional to the extra surface.
- **Retain the branch but move it to a non-`refs/heads/` namespace** (e.g.
  `refs/codepatrol/closed/<id>`) so `inspectChanges`'s branch scan stays
  small: rejected — it would make the retained branch non-checkout-able,
  which defeats the stated purpose of keeping it, and the measured cost is
  fully addressed by head-SHA dedupe without changing where the ref lives.
- **Keep Close's push and simply add `sync` alongside it**: rejected — leaves
  two owners of the same remote action, preserves exactly the invariant
  violation the request targets, and means a Close can still hit the network
  when the user expected a local operation.
- **Fold branch↔issue annotation into this Change**: rejected — the relation
  and the close chain already work; only comment-posting is missing, and it
  needs separate evidence on idempotency (re-running `sync` must not post
  duplicate comments). Filed as a backlog follow-up instead.
- **Also squash-rewrite the 825 bookkeeping commits already on `main`**:
  rejected — destructive rewrite of already-pushed history, unrequested, and
  independent of fixing the mechanism going forward.

## Simplicity decision

- Selected rung: direct local change plus one new bounded module. The squash,
  retention, and dedupe are all body-level edits to existing functions; only
  `sync` is genuinely new surface, and it composes two existing primitives
  (`git.push`, `syncIssues`) rather than introducing new remote mechanics.
- Earlier rungs: not applicable for `sync` — there is no existing command
  that can own "every remote action" (Close's push is the thing being
  removed, and `issues sync` covers only issues), so the new command is the
  smallest structure that satisfies the single-owner requirement.
- Irreducible complexity: the local/remote split is the point of the request,
  so one new command boundary is inherent, not speculative. The inspection
  dedupe is likewise forced — it is not an optimisation but the precondition
  that makes branch retention viable at all, established by measurement.
- Safety floor: the target's tree after Close must remain byte-identical to
  the Verify-accepted terminal tree (asserted in code, not assumed);
  checkpoint lineage must remain fully validatable after Close; the existing
  217-test suite must stay green.
- Expected surface delta: `src/change/orchestrator.ts` (squash,
  squash-aware re-entrancy guards, retention, dedupe, push removal),
  `src/change/git.ts` (+1 adapter method, `mergeSquash`; pruning reuses the
  existing `deleteBranch`),
  `src/change/types.ts` (`CloseInput`/`CloseResult` field removals),
  `src/change/sync.ts` (new), `src/cli/{args,commands,output}.ts` (wiring),
  `skills/codepatrol-sync/SKILL.md` (renamed from `codepatrol-git`),
  `skills/codepatrol-close/SKILL.md`, `skills/catalog.yaml`, plus tests in
  `src/change/git.test.ts`, `src/change/close-push.test.ts` (repurposed),
  a new `src/change/sync.test.ts`, and `src/cli/cli.test.ts`.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | Pruning is opt-in (`sync --prune-closed`), not automatic, so a user who never passes the flag still accumulates local branches | `refs/heads/codepatrol/*` grows by one ref per closed-but-unpruned Change; the head-SHA dedupe bounds the *validation* cost but each ref still costs one `git.head` + one `git.show` per inspection | A user reports inspection latency climbing with many closed Changes and reports never having run `sync --prune-closed` | Make pruning the default for closed Changes in `sync`, or prompt for it, once real usage shows the opt-in is routinely missed |
| DC-4 | Pruning removes only the local branch; the remote accumulates one branch per closed Change forever | `origin` grows a `codepatrol/<work-id>` branch per Change, which no Codepatrol command removes | The remote's branch list becomes unwieldy, or a hosting-provider ref limit is approached | Add a remote-prune capability to `sync` with its own explicit authority gate, since deleting remote refs is destructive and outside this Change's "never delete remote refs" boundary |
| DC-2 | `sync` pushes only refs that already exist locally; it never fetches, and so cannot detect that the remote has advanced ahead of the local target | A push against an advanced remote fails with git's own non-fast-forward error rather than a Codepatrol-diagnosed `TARGET_ADVANCED` | A user reports a confusing raw git rejection from `sync` | Add a fetch-and-compare preflight to `sync`, reusing the `TARGET_ADVANCED` taxonomy Close already uses locally |
| DC-3 | Branch↔issue annotation is not implemented (only the existing derivable relation and auto-close) | Closed issues carry no pointer back to the branch or squashed commit that resolved them | The filed backlog item is scheduled, or a user asks which commit closed an issue | Implement the filed follow-up with its own idempotency evidence |

## Compatibility and rollout

- **Breaking payload change**: `close.json` no longer accepts `push`. Because
  `assertCloseInput` uses an exact-keys guard, an existing caller passing
  `push: true` will now fail with `INVALID_ARGUMENT: Close contains unknown
  field push.` This is intended and must be documented, along with the
  removal of `commit+push` as a named action, at every site that currently
  shows either: `skills/codepatrol-close/SKILL.md` (both its action-naming
  sentence and its push-mechanism sentence), `skills/_shared/STAGE-IO.md`
  (its Close-affordance example), `skills/_shared/CODEPATROL-CLI.md` (the
  `close.json` example and its authority-text prose), `src/cli/commands.ts`
  (`closeOptions`), and `src/cli/output.ts` (the Close options help line) —
  six sites total, confirmed by `grep -rln "commit+push" skills/ src/
  scripts/`. No shipped text may contradict the validator or advertise an
  action Close can no longer perform.
- **No Change-record schema change**: no event shape, checkpoint field, or
  `change.yaml` structure changes. Records written before this Change remain
  valid and readable.
- **Existing closed Changes are unaffected**: their branches are already
  deleted and their tags already exist; the dedupe and retention only affect
  Changes closed after this ships.
- **Rollback of this Change**: revert the commit — Close returns to
  fast-forward + branch deletion, `sync` disappears, and the `push` field
  returns. No data migration either way, since nothing persisted changes shape.
- Observability: `sync` is the only command that can produce network errors;
  its result object reports per-target success/failure so a partial remote
  failure is visible rather than silent.

## Risks and mitigations

- Risk: the squash silently produces a target tree that differs from what
  Verify accepted (e.g. a subtle index or `.gitignore` interaction),
  shipping unreviewed content to `main`. Mitigation: assert tree identity
  against the terminal tag in code immediately after the squash commit and
  fail the Close if it differs — reproduced as passing in a scratch repo, and
  covered by a dedicated regression test (AC-2), so this is enforced rather
  than trusted.
- Risk: branch retention silently degrades every inspection. Mitigation: the
  dedupe is in scope and gated by an explicit acceptance criterion that
  measures inspection cost against a workspace containing retained branches
  (AC-4), rather than assuming the dedupe works.
- Risk: removing `CloseInput.push` breaks a caller mid-flight with a
  confusing error. Mitigation: the exact-keys guard already produces a
  precise, field-naming message; both documentation sites that show `push`
  are updated in the same Change (see Compatibility), so no shipped guidance
  contradicts the validator.
- Risk: `sync` becomes a grab-bag that slowly absorbs unrelated remote-ish
  behavior. Mitigation: its scope is pinned by DC-2/DC-3 and by the explicit
  Out-of-scope list (no fetch, rebase, force, PRs, or lifecycle events); it
  composes existing primitives and records no Change state.

## Acceptance criteria

- AC-1: Closing a Change with outcome `commit` adds **exactly one** commit to the target branch (`git rev-list --count <base>..<target>` returns 1), and the feature branch `refs/heads/codepatrol/<work-id>` **still exists** afterwards, as does the `codepatrol/committed/<work-id>` tag.
- AC-2: After that Close, the target branch's tree is byte-identical to the terminal tag's tree (`git rev-parse <target>^{tree}` equals `git rev-parse codepatrol/committed/<work-id>^{tree}`), and the implementation asserts this itself — a deliberately corrupted squash must fail the Close rather than complete it.
- AC-3: After that Close, `validateCheckpointLineage` still passes for the Change via both its retained branch and its terminal tag — i.e. `codepatrol change inspect --id <work-id>` and `codepatrol status --all` both succeed and report the Change as terminal/committed, and it does **not** appear in `codepatrol next --stage plan`.
- AC-4: `inspectChanges` validates each distinct resolved head SHA at most once per call: in a workspace where a closed Change has both a retained branch and a terminal tag pointing at the same commit, the number of `validateCheckpointLineage` invocations equals the number of *distinct* heads, not the number of refs (asserted via an instrumented/spy `GitAdapter` or an equivalent direct count, not by wall-clock timing).
- AC-5: `CloseInput` no longer accepts `push`: `codepatrol change close --input` with `{"outcome":"commit","actor":"…","authority":"…","push":true}` fails with `INVALID_ARGUMENT` naming the unknown field `push`; `CloseResult` no longer carries `pushError` or `pushSuggestion`; no code path under `closeChange` calls `git.push`; and `codepatrol next --stage close`'s reported action list is exactly `["commit", "rollback"]` — `commit+push` appears nowhere in `commands.ts`, `output.ts`, or their tests.
- AC-6: `codepatrol sync` exists as a CLI command, is listed in `KNOWN_COMMANDS` and the help text, and can (a) push the target branch, (b) push a retained Change branch and its terminal tag, and (c) reconcile issues by delegating to `syncIssues` — each verified against an injected adapter double, with `--dry-run` performing **zero remote mutations** (no `git.push`, no `git.deleteBranch`, no `gh.ensureLabel`/`createIssue`/`closeIssue`, no `writeBacklog`) while still reporting the intended ones; `syncIssues`'s own unconditional `gh.assertAvailable`/`gh.listIssues` reads are exercised even under `--dry-run` — an injected adapter double must observe both being called — and this is asserted as correct, inherited behavior, not a defect. Target-branch selection for (a) is deterministic per the rule above: verified for all three cases — current branch is `codepatrol/<work-id>` (resolves that Change's target), current branch is itself a recorded target (pushes it), and current branch is neither (rejects with `INVALID_ARGUMENT`, no push attempted) — plus the `--target-branch <name>` override bypassing resolution.
- AC-9: Close is re-entrant after a partial failure under squash: injecting a failure immediately after the squash succeeds causes `closeChange` to reject, and a subsequent `closeChange` with the same input **completes successfully** (`outcome === "committed"`) without throwing `TARGET_ADVANCED`, leaving exactly one commit on the target. Verified through the existing recovery test at `src/change/git.test.ts:266`, whose injected-failure double must be retargeted from `mergeFf` to `mergeSquash`.
- AC-10: `codepatrol sync --prune-closed` deletes the local `refs/heads/codepatrol/<work-id>` for a terminal Change **only after** its branch pushed successfully, and never deletes the terminal tag. With an adapter double whose `push` fails for that ref, the local branch **still exists** afterwards. After a successful prune, `codepatrol change inspect --id <work-id>` and `codepatrol status --all` still resolve the Change (lineage intact via the retained tag), and `refs/heads/codepatrol` contains no ref for it.
- AC-7: `skills/codepatrol-sync/SKILL.md` exists (replacing `skills/codepatrol-git/SKILL.md`), `skills/catalog.yaml` names `codepatrol-sync` with no dangling reference to `codepatrol-git`, `skills/codepatrol-close/SKILL.md` states Close performs no remote action and names only `commit`/`rollback` as its two actions, `skills/_shared/STAGE-IO.md`'s Close example names only `commit`/`rollback`, `skills/_shared/CODEPATROL-CLI.md`'s `close.json` example and prose no longer show `push` or `commit+push`, and `npm run lint:skills` passes.
- AC-11: `CommandOverrides` (`src/cli/commands.ts`) carries a `git?: GitAdapter` field, threaded into the `sync` command's call to `syncRemote` the same way `overrides?.gh` already threads into `syncIssues`; every `sync` CLI test in `cli.test.ts` uses an injected `GitAdapter` double and performs **zero** real network access.
- AC-8: `npm run verify` (typecheck + full suite + build + smoke-cli + lint-skills) passes with zero failures and a test count strictly greater than the 217 baseline.

## Decisions and open questions

- Decision: squash via `merge --squash` + commit, with an explicit
  post-condition asserting tree identity against the terminal tag — verified
  tree-identical in a scratch repo before being specified.
- Decision: retain the branch on `commit` only; rollback keeps deleting it —
  the request names only the commit path.
- Decision: inspection head-SHA dedupe is **in scope, not deferred** — it is
  the measured precondition that makes retention viable, not an optimisation.
- Decision: `codepatrol-git` is renamed to `codepatrol-sync` rather than
  having a second remote-owning skill added beside it — the existing skill
  already claims the "only outbound network call" invariant, so widening and
  renaming it keeps one owner instead of creating two.
- Decision: branch↔issue annotation is a filed backlog follow-up (DC-3), not
  part of this Change.
- No open questions remain that could change scope, interfaces, or acceptance.
