# Plan evidence — checkpoint git-add failure on a pre-removed delete-intent artifact

## Backlog item

Item `top-error-code-operation-failed-investigate-the-first-occurrence-s-args-and-stage-context`
(p1, workflow, source `close-trace`/`2026-07-25-docs-consolidation`, count 1,
externalRef `github.com/shiborgi/codepatrol#7`, firstSeenAt
`2026-07-25T15:13:00.612Z`). Auto-generated recommendation: "Top error code:
OPERATION_FAILED (6). Investigate the first occurrence's args and stage
context."

## Historical occurrence

`.codepatrol/changes/2026-07-25-docs-consolidation/close/improvement-report.md`
(the only improvement report across 20+ closed Changes mentioning
`OPERATION_FAILED`):

```
| OPERATION_FAILED | 6 | fatal: pathspec 'docs/codepatrol/assessments/2026-07-24-architecture-v2.md' did not match any files |
```

That Change's own `apply/journal.md` (T3, "Remove
`docs/codepatrol/assessments/`") documents the actual step sequence that
produced it: step 2 is literally **"`git rm` both files."** — a manual
`git rm` run directly by the Apply harness to delete
`docs/codepatrol/assessments/2026-07-24-architecture-v2.md` and
`.../2026-07-24-architecture-workflow.md`, ahead of declaring them as
`intent: "delete"` artifacts on the Apply checkpoint transition.

## Root cause, independently reproduced

`src/change/orchestrator.ts`'s `buildCheckpointEvent` (the function that
seals every Plan/Review/Apply/Verify checkpoint) builds one combined path
list for every declared artifact regardless of intent and stages it in one
`git add` call:

```typescript
const committedPaths = [...new Set([...paths, ...intent.artifacts.map((item) => item.path)])];
await git.add(committedPaths, options.signal);
```

(`paths` already excludes delete-intent artifacts; `committedPaths` adds
them back in via the unfiltered `intent.artifacts.map(...)`.)

`src/change/git.ts`'s `add()`:

```typescript
async add(paths: string[], signal?: AbortSignal): Promise<void> { if (paths.length) await this.run(["add", "--", ...paths], signal); }
```

`run()` throws `CodepatrolError("OPERATION_FAILED", stderr, 5, true)` on any
non-zero git exit — exactly the code/behavior seen in the historical sample.

Reproduced the exact failure directly, independent of any codepatrol code,
using only `git` in a scratch repo:

```
$ git init -q && git config user.email a@b.c && git config user.name test
$ echo hello > foo.md && git add foo.md && git commit -q -m init
$ git rm foo.md                      # stages the deletion (working tree AND index)
rm 'foo.md'
$ git status --porcelain
D  foo.md
$ git add foo.md                     # re-add the SAME already-removed path
fatal: pathspec 'foo.md' did not match any files
$ echo $?
128
```

This is the exact error text and exit behavior from the historical sample.
Root cause: once a tracked file has been fully removed via `git rm` (both
working tree and index), it is no longer a valid `git add` pathspec target
at all — `git add` only recognizes "this tracked file is missing from the
working tree, stage its deletion" when the file is *still in the index* but
gone from disk (i.e. removed via a plain `rm`, not `git rm`). A second
`git add` on an already-`git rm`'d path has nothing left to reconcile and
fails outright.

## Severity: one bad delete-intent path blocks the entire checkpoint's `git add`, not just itself

`git add -- <path1> <path2> ...` is atomic across its whole pathspec list:
if any one pathspec matches nothing, the *entire* invocation fails and
*none* of the paths are staged, even the otherwise-valid ones. Reproduced:

```
$ echo bar > bar.md          # untracked, valid file
$ git add -- bar.md foo.md   # foo.md already git rm'd
fatal: pathspec 'foo.md' did not match any files
$ git status --porcelain
D  foo.md
?? bar.md                    # bar.md was NOT staged despite being valid
```

Concretely: if any checkpoint declares even one delete-intent artifact whose
file was already removed via `git rm` ahead of the transition, the *entire*
checkpoint's `git add` fails — including staging every other legitimately
new/modified artifact in the same checkpoint, not merely the one bad path.
This matches the historical sample's count of **6** occurrences for a
single 2-file deletion (consistent with a harness retrying the whole
checkpoint transition multiple times after each failure, each retry hitting
the same already-`git rm`'d path again).

## Why the existing `commit()` step is unaffected

`git commit -- <paths>` was checked separately and does **not** have this
atomicity/pathspec-matching hazard once the index already reflects the
correct state for every path (confirmed: a commit spanning both a newly
`git add`-staged file and an already-`git rm`'d-staged deletion succeeds
cleanly). Only the `git add` step is implicated. Confirmed no other
`git.add()` call site in `orchestrator.ts` is exposed to a delete-intent
artifact: `commitMetadata` (line 98, non-checkpoint events) only ever adds
`relativeRecord(workId)` plus optional `extraPaths` (currently always
empty); Close's receipt commit (line 416) only adds a just-`writeFileSync`'d
receipt file (always create-intent); Close's terminal commit (line 443)
only adds the record path, an optional improvement-report path, and the
backlog file (never a caller-declared delete-intent artifact). Only
`buildCheckpointEvent` (line 291) accepts caller-declared `intent: "delete"`
artifacts and folds them into a single `git add`.

## Existing, precedented fix primitive already in the codebase

`GitAdapter.unstage()` (`git.ts:76`) already exists and does exactly what a
delete-intent path needs, idempotently:

```typescript
async unstage(paths: string[], signal?: AbortSignal): Promise<void> { if (paths.length) await this.run(["rm", "--cached", "--ignore-unmatch", "--", ...paths], signal); }
```

`--ignore-unmatch` makes this a no-op success (not a failure) when the path
is already fully removed from the index — reproduced directly:

```
$ git rm --cached --ignore-unmatch foo.md   # foo.md already git rm'd
$ echo $?
0
```

`--cached` only touches the index (never the working tree), so it is also
correct for the currently-working "plain `rm`, still tracked" case: the
working-tree file is already gone; `--cached` just finalizes untracking it
in the index, identical in effect to what `git add` currently does for that
case. `unstage()` currently has exactly one call site: `startChangeLocked`'s own
failure-recovery path (`orchestrator.ts:195`, unstaging the record path if
`change start` fails after already staging it) — not `buildCheckpointEvent`.
Confirmed by `grep -n "git.unstage(\|\.unstage(" src/change/orchestrator.ts`
(single hit). The method is exported on `GitAdapter` and already exercised
by existing tests, just not yet reused for checkpoint's delete-intent path.

## No existing test coverage for this path

`grep -rn '"delete"' src/change/*.test.ts` finds two hits: `change.test.ts:120`
(a pure `validateArtifactBindings` unit test, no git interaction) and
`git.test.ts:162` (asserts that declaring *both required* Plan artifacts as
`intent: "delete"` is rejected as `CHANGE_INVALID` — a different, unrelated
rule: required stage artifacts may never use `delete`). No test exercises a
valid, *optional* delete-intent artifact whose file was removed via `git rm`
ahead of the checkpoint transition — the exact scenario that failed.

## Returned-review correction

Attempt 1 was returned `fix-first` (`review/report.md`). Re-verified both
findings directly before correcting:

1. **AC-3 had no real verification**: `plan.md`'s Acceptance mapping
   claimed `git.test.ts:157-163` ("checkpoint cannot satisfy required
   artifacts with delete bindings") was "existing plain-`rm` coverage" for
   the unchanged-behavior case (AC-3). Re-read that test directly (see "No
   existing test coverage for this path" above): it asserts a `CHANGE_INVALID`
   *rejection* for required artifacts declared `delete` — it never removes a
   file with plain `rm`, never seals a successful checkpoint, and is
   unrelated to AC-3's actual claim. Confirmed: no test anywhere exercises a
   successful checkpoint of an optional delete-intent artifact removed via
   plain `rm`. Fixed by adding a dedicated second test case for exactly this
   scenario, alongside the `git rm` case.
2. **Unsafe task ordering**: T2's step 3 asked Apply to "revert T1 locally,
   run the test to see it fail, then reapply T1" mid-task — an ad hoc,
   error-prone local revert instead of the standard red-before-fix pattern
   used throughout this session's own prior Changes. Fixed by reordering:
   write both regression tests first (against the still-unfixed code,
   proving the `git rm` case is genuinely red and the plain-`rm` case is
   already green — i.e. a true characterization test, not a vacuous one),
   *then* apply the orchestrator.ts fix, then confirm both cases pass.

## Attempt 2 correction: the real historical incident used `changes[]`, not `artifacts[intent=delete]`

Attempt 2 was returned `fix-first` on a Plan-executability finding (the
proposed test fixture couldn't satisfy `intent:"delete"` artifact
validation). Investigating that finding surfaced a deeper, more important
correction: **the fix itself was targeting the wrong field.**

`src/change/validation.ts:24` (`validateWithReader`) requires every
`intent.artifacts[]` binding's `path` to start with the checkpointing
stage's own directory prefix (`.codepatrol/changes/<work-id>/<stage>/`),
via `changeStageRelativePrefix`. Re-checked the real historical incident's
actual declared checkpoint payload directly from `change.yaml`:

```
$ python3 -c "import yaml; d=yaml.safe_load(open('.codepatrol/changes/2026-07-25-docs-consolidation/change.yaml')); [print('artifacts:',e.get('artifacts'),'\nchanges:',e.get('changes')) for e in d['events'] if e.get('type')=='stage-checkpointed' and e.get('stage')=='apply']"
artifacts: [{'path': '.../apply/journal.md', 'sha256': '...', 'intent': 'create'}]
changes: ['.gitignore', 'AGENTS.md', 'docs/codepatrol/assessments/2026-07-24-architecture-v2.md', 'docs/codepatrol/assessments/2026-07-24-architecture-workflow.md', ...]
```

`docs/codepatrol/assessments/2026-07-24-architecture-v2.md` — the exact
path from the historical `OPERATION_FAILED` sample — is in **`changes[]`**,
not `artifacts[]`. It could never have been declared as an `artifacts[]`
binding in the first place (it doesn't start with
`.codepatrol/changes/2026-07-25-docs-consolidation/apply/`, so
`validateWithReader` would reject it as "Artifact is not owned by apply").
`changes[]` is the separate, Apply-only field representing the *complete
production delta* as a flat array of path strings — with **no `intent`
field at all**, since it must include every create, modify, and delete in
one list (enforced by the `actualProduction === declaredProduction`
reconciliation, not by `validateWithReader`).

Re-reading `buildCheckpointEvent`'s original code with this correction:

```typescript
const paths = [...intent.artifacts.filter((item) => item.intent !== "delete").map((item) => item.path), ...(intent.changes ?? [])];
...
const committedPaths = [...new Set([...paths, ...intent.artifacts.map((item) => item.path)])];
await git.add(committedPaths, options.signal);
```

`intent.changes` (every `changes[]` entry, including deleted files) flows
into `paths` unconditionally. Attempt 2's fix only split out
`intent.artifacts.filter(intent === "delete")` — it left `paths` (and
therefore every `changes[]` entry, deleted or not) going through the exact
same unconditional `git.add(paths, ...)` call. **The fix as specified in
attempt 2 would not have fixed the actual historical incident at all** —
it fixed a structurally-identical but never-actually-triggered code path
(`artifacts[intent="delete"]`), while leaving the evidenced, real one
(`changes[]`) exactly as broken as before.

### Corrected design: route by on-disk existence, not by declared intent

Since `changes[]` entries carry no intent marker, the fix cannot key off
`item.intent` at all for the `changes[]` portion. The uniform, correct
signal is **whether the path currently exists in the workspace**: a
create/modify path always exists at staging time (enforced for `artifacts`
by `validateWithReader`; implied for `changes` entries that aren't
deletions); a deletion (`artifacts[intent="delete"]`, or a `changes[]`
entry the caller has already removed by whatever method) never does.
Reproduced the corrected approach directly in a scratch repo, mixing a
`git rm`'d deletion, an untracked new file, and a modified existing file in
one combined staging pass:

```
$ git rm -q old.md            # simulate prior git rm
$ echo new > new.md            # untracked create
$ echo more >> base.md         # tracked modify
$ python3 -c "
import subprocess, os
paths = ['old.md', 'new.md', 'base.md']
toAdd = [p for p in paths if os.path.exists(p)]
toUnstage = [p for p in paths if not os.path.exists(p)]
if toAdd: subprocess.run(['git','add','--']+toAdd, check=True)
if toUnstage: subprocess.run(['git','rm','--cached','--ignore-unmatch','--']+toUnstage, check=True)
"
$ git status --porcelain
M  base.md
A  new.md
D  old.md
```

All three staged correctly in one pass, no error. `existsSync` and
`resolveInside` (the same workspace-relative, symlink-safe resolver
`validateArtifactBindings`'s own reader already uses) are already imported
in `src/change/orchestrator.ts` — no new imports needed.

### Test design simplification this correction enables

Because `changes[]` entries are **not** subject to `validateWithReader`'s
baseline-existence rule (that rule only applies to `artifacts[]` bindings),
a regression test for the real, evidenced bug needs no multi-attempt/
return lifecycle to construct a valid baseline — it only needs a file that
already exists on the branch before the Apply checkpoint runs (the same
pattern the existing `"checkpoint rejects a production path committed
outside its declaration"` test already uses via its `EARLY.txt` setup:
commit a scratch file directly via raw `git` calls before any stage
transition, then reference it in a later checkpoint's declared paths).
This avoids
entirely the baseline-fixture complexity attempt 2's return correctly
flagged for the `artifacts[intent="delete"]` case — because this Change's
regression tests now target `changes[]`, that complexity doesn't apply.

A dedicated test for `artifacts[intent="delete"]` routing through the same
corrected staging code is not added in this Change: no historical incident
evidences it as broken (the existing `git.test.ts:157-163` test only
exercises the unrelated *rejection* of required-artifact deletions, before
any staging code runs), and the corrected fix's existence-based routing
handles it via the identical mechanism already proven for `changes[]` —
adding a second, more complex fixture to test the same code path a second
way is disproportionate to the actual evidence. See DC-2.

## Precedent for scope discipline

This Change follows the same discipline as the two immediately preceding
process-fix Changes on this backlog (`2026-07-25-session-input-validation`,
`2026-07-26-document-transition-close-payloads`,
`2026-07-27-plan-self-consistency-check`): narrow, evidenced, reproduced
before proposing a fix, smallest change that closes the concretely
identified gap.
