# Apply journal — Close auto-resolves the backlog item its Change was linked against on commit

## T1 — Auto-resolve the linked backlog item on commit Close

**Changed paths:** `src/change/orchestrator.ts` (+1 import, +8),
`src/change/backlog-close-integration.test.ts` (+1 import, +48)

**Red signal observed:** ran `node --import jiti/register --test
src/change/backlog-close-integration.test.ts` before implementation. First
attempt failed with an unplanned setup error, not the expected red: all
three new tests threw `CHANGE_CONFLICT: Change start requires a clean
worktree.` — `upsertBacklogItem`/`linkBacklogItem` write
`.codepatrol/backlog/items.yaml` to the temp git repo but the test never
committed that write before calling `advanceThroughVerify` (which calls
`startChange`, requiring a clean tree). Fixed by adding `git add
.codepatrol/backlog/ && git commit` immediately after seeding the backlog
items in all three new tests, mirroring the exact pattern already used in
`src/cli/cli.test.ts`'s "regression: Plan checkpoint succeeds after backlog
add CLI when the caller commits the file" test. After that fix, re-ran: 4/5
passed, 1 failed exactly as expected — the AC-1 test (`expected 'done',
actual 'scheduled'`), confirming the resolution step did not exist yet. The
rollback (AC-2) and already-resolved (AC-4) tests passed even before
implementation, as anticipated in plan.md step 2 (nothing resolves anything
yet, so "unchanged" is trivially true pre-implementation; re-confirmed green
post-implementation, not a sign of a weak test).

**Implementation:** added `readBacklog, resolveBacklogItem` to the existing
`./backlog.js` import in `orchestrator.ts`; added the `if (outcome ===
"committed") { ... }` best-effort resolution block immediately after the
improvement-report `try`/`catch`, implemented verbatim per plan.md's
snippet — filters `readBacklog(workspace).items` by `item.workId === workId
&& item.status === "scheduled"`, calls `resolveBacklogItem(..., "done",
now(options))` per item inside its own try/catch writing to stderr on
failure, the whole lookup itself also wrapped in a try/catch.

**Green:** same command, all 5 tests pass, including both pre-existing tests
(no regression to the improvement-report-driven candidate-upsert behavior).
`npm run typecheck` — 0 errors.

**Test setup deviation:** the mid-implementation test-harness fix above (git
commit before `advanceThroughVerify`) was not called out in plan.md's step
1 snippet, which omitted it. This is a mechanical test-setup correction, not
a scope/interface/acceptance change — the plan's own precedent (the
`cli.test.ts` regression test it should have mirrored) already established
this exact requirement; documenting here rather than returning to Plan since
no AC, file list, or design decision changed.

**Assessment (assess-change axes, self-applied, bounded task diff):**
Contract — AC-1 through AC-4 delivered and verified red-capable (AC-1
genuinely red-then-green; AC-2/AC-4 characterization, confirmed unaffected
both before and after); nothing delivered outside declared scope (`git diff
--stat` for this task touches only the two declared files). Code —
correctness: the filter only matches `workId === workId && status ===
"scheduled"`, confirmed by the isolation assertion in the AC-1 test
(`unrelated` item, linked to a different workId, stays `"scheduled"`);
rollback path confirmed untouched (AC-2); already-terminal items confirmed
skipped without error (AC-4, `resolveBacklogItem`'s `CHANGE_CONFLICT` guard
never fires because the `status === "scheduled"` filter excludes it before
the call). No security/trust-boundary crossing. No undeclared scope. Verification
quality: each new test asserts a distinct branch of the new conditional.
Simplicity — matches spec's "local reuse" rung; zero new dependency, file,
or public interface. **Verdict: approve**, no blocking finding.

**Deviations:** the test-setup fix noted above; no scope, interface, or
acceptance change.

**Risks:** none new — matches spec's Risks and mitigations section (filter
exact-match on `workId` plus `status === "scheduled"` prevents wrong-item or
double resolution; outer/inner try/catch guarantees Close's already-produced
receipt/tag/commit are never blocked by a resolution failure).

## T2 — Final verification

**Gate:** `npm run verify` (typecheck + full test suite + build + smoke-cli +
lint-skills) — all green. Test suite 212→215 (+3 new tests). 0 failures, 0
new warnings across every step.

**Diff reconciliation:** `git status --porcelain` shows exactly the two
production files the spec declared: `src/change/orchestrator.ts`,
`src/change/backlog-close-integration.test.ts` (plus this Change's own
`apply/` directory, Apply-owned, not production). No undeclared work.

**AC reconciliation:** AC-1 — commit auto-resolves the linked item to
`done`, committed in the terminal commit (T1, genuinely red-then-green).
AC-2 — rollback leaves the linked item `scheduled`, unchanged
(characterization, confirmed both pre- and post-implementation). AC-3 —
isolation: an item linked to a different `workId` is untouched (asserted
inside the AC-1 test via the `unrelated` item). AC-4 — an already-resolved
item does not block or error Close (characterization, confirmed both
states). All four green.

**Surface delta reconciliation:** spec forecast "`orchestrator.ts` +1 import
edit, +~8 lines; test file +~4 new test cases." Actual: `orchestrator.ts`
+1 import, +8 lines exactly; test file +1 import, +48 lines across 3 test
cases (spec said "~4" as an approximate count, landed at 3 — the fourth
criterion, AC-3, was folded into the AC-1 test as an additional assertion
rather than a separate test case, since it needed the same setup; no
unexplained surface, just a tighter grouping than forecast).

**DC-1/DC-2 trigger check:** neither activated. No evidence during
implementation suggested rollback-side handling was needed beyond what was
already deferred, and no retroactive-migration need arose (the one known
stale item remains a manual `backlog resolve` fix, unaffected by this
Change's forward-only trigger).

**Graph sync:** not run — no exported symbol removed or renamed; the two
new imports into `orchestrator.ts` are additive only. Stated explicitly per
plan.md T2 step 6 rather than run needlessly.

**Rollback check:** confirmed `git revert` of the resulting commit would
cleanly remove the auto-resolve step; any item already resolved by this
feature before a hypothetical revert remains a valid `done` item — reverting
only stops future auto-resolution, no data repair needed.

**Real-world validation note (informational, plan.md T2 step 8):** this
Change was started via `--backlogItemId close-does-not-auto-resolve-...`.
Its own Close (once reached, after Verify) will be the first live exercise
of this fix beyond the test suite — to be observed and reported at Close
time, not a blocking check for this task.

**Residual risk:** none beyond what the spec already accepted. No new risk
introduced by implementation.
