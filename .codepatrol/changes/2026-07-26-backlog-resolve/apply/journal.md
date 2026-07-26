# Apply journal — Add a CLI command to mark a backlog item done/dismissed directly

## T1 — Add `resolveBacklogItem` and prove `issue-sync.ts` needs no change

**Changed paths:** `src/change/backlog.ts` (+11), `src/change/backlog.test.ts`
(+27, +1 import), `src/change/issue-sync.test.ts` (+14, +1 import)

**Red signal observed:** ran
`node --import jiti/register --test src/change/backlog.test.ts src/change/issue-sync.test.ts`
before implementation — 3 of 24 tests failed exactly as expected: the two new
`backlog.test.ts` cases and the new AC-6 `issue-sync.test.ts` case, all
because `resolveBacklogItem` did not exist yet. The other 21 pre-existing
tests were unaffected (proving the test additions didn't disturb anything
else before implementation).

**Implementation:** added `resolveBacklogItem(workspace, itemId, status, now)`
to `src/change/backlog.ts`, placed between `linkBacklogItem` and
`ListOptions`/`listBacklog`, implemented verbatim per plan.md's snippet —
mirrors `linkBacklogItem`'s exact validation shape (not-found →
`CHANGE_INVALID`, already-terminal → `CHANGE_CONFLICT`), updates only
`status` and `lastSeenAt`, persists via the existing `writeBacklog`.

**Green:** same command, all 24 tests pass, including every pre-existing
test (no regression to `upsertBacklogItem`/`linkBacklogItem`/`listBacklog`/
pull/push/dry-run behavior). `npm run typecheck` — 0 errors.

**AC-6 characterization confirmed:** the new `issue-sync.test.ts` case seeds
a `scheduled` item with an `externalRef` to an open GitHub issue, calls
`resolveBacklogItem(..., "done")`, then runs `syncIssues(root, "push", { gh })`
against the existing `FakeGhAdapter` — `result.pushed.closed` and
`gh.closed` both confirm the issue was closed, with zero changes to
`issue-sync.ts` itself (`git diff --stat` for this task touches only the
three files listed above). This proves the spec's claim that the existing
consumer logic (`issue-sync.ts:129-137`) was already correct and only the
producer was missing.

**Assessment (assess-change axes, self-applied, bounded task diff):**
Contract — AC-1, AC-2, AC-4, AC-5 (module level), and AC-6 delivered and
verified red-capable; nothing delivered outside declared scope (`issue-sync.ts`
itself untouched, confirmed by `git diff --stat`). Code — correctness:
`resolveBacklogItem` only mutates `status`/`lastSeenAt`, confirmed by the
first new test asserting every other field (`id`, `priority`, `title`)
is unchanged; the not-found and already-terminal guards were both exercised
and confirmed to throw the right error code. Verification quality: all 3 new
tests were observed red before the fix and green after. No security/trust
boundary crossed (local file mutation only, same as sibling functions). No
undeclared scope or drive-by change. Simplicity — matches spec's "local
reuse" rung exactly; zero new dependency, file, or public interface beyond
the one additive export. **Verdict: approve**, no blocking finding.

**Deviations:** none — implemented exactly per plan.md's snippet.

**Risks:** none new — matches spec's Risks and mitigations section (typo'd
id throws loudly rather than silently no-op; GitHub issue closure on next
sync is pre-existing, already-tested behavior, now proven reachable rather
than newly introduced).

## T2 — CLI command `backlog resolve --id <item-id> --status done|dismissed`

**Changed paths:** `src/cli/args.ts` (+1), `src/cli/commands.ts` (+7, +1
import), `src/cli/output.ts` (+1), `src/cli/cli.test.ts` (+22)

**Red signal observed:** ran `node --import jiti/register --test
src/cli/cli.test.ts` before implementation. The new test failed exactly as
expected: `{"code":"INVALID_ARGUMENT","message":"Unknown command:
backlog.resolve. Known commands: ..."}`, exit 2 instead of the expected 0 —
confirms `backlog.resolve` was not yet a registered command, not a setup
typo.

**Implementation:** added `["backlog.resolve", new Set(["id", "status"])]`
to `COMMAND_OPTIONS` in `args.ts` (reuses the already-known `id`/`status`
flag names, zero new flag parsing); added `resolveBacklogItem` to the
existing `backlog.js` import in `commands.ts`; added `case
"backlog.resolve":` validating `args.status` is exactly `"done"` or
`"dismissed"` (`INVALID_ARGUMENT`, exit 2) before calling
`resolveBacklogItem`; added the help-text line in `output.ts` next to
`backlog list`.

**Green:** same command, all 16 tests pass, including every pre-existing
test in the file (no regression to `backlog add`/`backlog list`/`change
session`/etc.). `npm run typecheck` — 0 errors. The new test's four
assertions each confirmed independently: happy path (exit 0, correct
`{id, status}`), bad `--status` (exit 2, `INVALID_ARGUMENT`), unknown `--id`
(exit 4, `CHANGE_INVALID`, propagated correctly through
`CodepatrolError.exitCode` → `main.ts:80` → `process.exitCode`), already-done
re-resolution (exit 4, `CHANGE_CONFLICT`).

**Assessment (assess-change axes, self-applied, bounded task diff):**
Contract — AC-3 delivered and verified red-capable; AC-4/AC-5 confirmed to
propagate correctly at the CLI layer (exit codes 4, matching spec). Code —
correctness: the CLI-boundary check runs before `resolveBacklogItem` is
called, confirmed by reading the case body; the four test paths (happy,
bad-status, bad-id, already-terminal) each exercise a distinct branch. No
security/trust-boundary crossing. No undeclared scope — `git diff --stat`
for this task shows only the four declared files. Simplicity — zero new CLI
flags, matching spec's "no new flag" claim exactly. **Verdict: approve**, no
blocking finding.

**Deviations:** none — implemented exactly per plan.md's snippets.

**Risks:** none new.

## T3 — Final verification

**Gate:** `npm run verify` (typecheck + full test suite + build + smoke-cli +
lint-skills) — all green. Test suite 208→212 (+4: 2 `backlog.test.ts` cases,
1 `issue-sync.test.ts` case, 1 `cli.test.ts` case). 0 failures, 0 new
warnings across every step.

**Diff reconciliation:** `git status --porcelain` shows exactly the seven
production files the spec declared: `src/change/backlog.ts`,
`src/change/backlog.test.ts`, `src/change/issue-sync.test.ts`,
`src/cli/args.ts`, `src/cli/commands.ts`, `src/cli/output.ts`,
`src/cli/cli.test.ts` (plus this Change's own `apply/` directory,
Apply-owned, not production). No undeclared work.

**AC reconciliation:** AC-1 — resolve to `done` (T1, `backlog.test.ts`),
green. AC-2 — resolve to `dismissed` (T1, `backlog.test.ts`), green. AC-3 —
CLI rejects bad `--status` with `INVALID_ARGUMENT` (T2, `cli.test.ts`),
green. AC-4 — missing id → `CHANGE_INVALID` at both module (T1) and CLI (T2)
layers, exit 4 confirmed. AC-5 — already-terminal → `CHANGE_CONFLICT` at both
layers, exit 4 confirmed. AC-6 — `issues sync --direction push` closes the
linked GitHub issue for a resolved item with zero changes to `issue-sync.ts`
(T1, `issue-sync.test.ts`), green.

**Surface delta reconciliation:** spec forecast "`backlog.ts` ~10 lines,
`commands.ts` ~6 lines, `args.ts` 1 line, `output.ts` 1 line, plus tests."
Actual: `backlog.ts` +11 (one line over forecast — the not-found guard
needed its own `typeof itemId` check, matching `linkBacklogItem`'s shape
exactly rather than skipping it for brevity); `commands.ts` +7 +1 import
line (forecast said ~6, the case body is 6 lines, +1 for the import edit,
matching within rounding); `args.ts` +1 exact; `output.ts` +1 exact; test
files +27/+14/+22 across three files, no forecast given beyond "tests" — all
variance is explained, no unexplained difference.

**DC-1/DC-2 trigger check:** neither activated. No evidence gathered during
this Change implicated a need for a `reason` field (DC-1) or forced
auto-resolve-on-close into this Change's scope (DC-2 remains correctly filed
as the separate backlog follow-up added during Plan).

**Graph sync:** not run — no exported symbol removed or renamed; the two new
exports (`resolveBacklogItem` from `backlog.ts`, no new export from
`commands.ts` since `case` blocks aren't exports) are purely additive.
Stated explicitly per plan.md T3 step 6 rather than run needlessly.

**Rollback check:** the seven changed files form one coherent, revertible
unit; `git revert` of the resulting commit would cleanly remove the new
command with no migration or data dependency — existing items with any
status remain valid, since `resolveBacklogItem` only ever runs on explicit
CLI invocation, never automatically.

**Residual risk:** none beyond what the spec already accepted (typo'd id
throws loudly; GitHub issue closure on next sync is pre-existing behavior).
No new risk introduced by implementation.
