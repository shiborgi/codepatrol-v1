# Apply journal — Validate `change session` stage/attempt at the CLI boundary

## T1 — Validate `stage`/`attempt` at the `change.session` CLI boundary

**Changed paths:** `src/cli/commands.ts` (+19/-6), `src/cli/cli.test.ts` (+47)

**Red signal observed:** ran `node --import jiti/register --test src/cli/cli.test.ts`
before implementation. The two new negative tests failed as expected — but
with `CHANGE_NOT_FOUND` (exit 4), not the `CHANGE_CONFLICT` shown in the
spec's improvement-report evidence, because the test uses a nonexistent Change
id (`does-not-matter`) so `primeStageSession` throws its own lookup error
before ever reaching the stage/attempt comparison. This still proves the
defect: no validation runs before the payload reaches `session.ts`, and
neither failure is `INVALID_ARGUMENT`. The third new test (AC-3
characterization: well-formed but stale `stage`/`attempt` against a real
started Change) passed before any code change, confirmed deliberately to
prove it characterizes existing behavior rather than a new one.

**Implementation:** value-imported `STAGES` from `../change/types.js`
(alongside the existing `Stage` type import); added
`requireSessionCoordinates(payload, id)` near `requireSeed`, validating
`payload.stage` is a `STAGES` member and `payload.attempt` is
`Number.isSafeInteger(x) && x >= 1`, each throwing `INVALID_ARGUMENT` (exit 2)
naming the received value and pointing at `codepatrol change inspect --id
<id>`. Called once at the top of `case "change.session":`, replacing every
downstream `payload.stage`/`payload.attempt` reference with the narrowed
`stage`/`attempt` locals.

**Deviation from plan snippet:** the plan's illustrative helper body returned
`{ stage: payload.stage as Stage, attempt: payload.attempt }` — implemented
verbatim, but `tsc --noEmit` (TS2322) confirmed control-flow narrowing does
not survive an `Array.prototype.includes` guard on an `unknown`-typed
property access, so the `as Stage` cast in the return statement is load-bearing,
not optional as the plan prose might read. No behavior change, purely a
type-level clarification; documented here rather than returning to Plan since
it does not change scope, interfaces, or acceptance.

**Green:** `node --import jiti/register --test src/cli/cli.test.ts` — 15/15
pass, including the 3 new tests (AC-1, AC-2, AC-3) and all 12 pre-existing
tests in the file (no regression, including the untouched "CLI change session
supports read-only status projection" test which always sent well-formed
`stage`/`attempt`). `npm run typecheck` — 0 errors.

**Assessment (assess-change axes, self-applied, bounded task diff):**
Contract — AC-1/AC-2/AC-3 delivered and verified red-capable; nothing
delivered outside declared scope. Code — correctness: the new guard runs
before any `session.ts` call, so a malformed request never reaches business
logic (confirmed by reading the call site — `requireSessionCoordinates` is
the first statement in the case body after `payload` parsing); the existing
`CHANGE_CONFLICT` check in `session.ts:157,215` is untouched (not read-diffed,
confirmed via `git diff` showing zero changes to `src/change/session.ts`).
Verification quality: both new negative tests were observed red before the
fix and green after; the characterization test was confirmed green in both
states. No security/trust-boundary crossing (CLI arg parsing only). No
undeclared scope, duplication, or drive-by change — `git diff --stat` shows
only the two declared files. Simplicity — matches spec's "direct local
change" rung; no new dependency, file, or public interface. **Verdict:
approve**, no blocking finding.

**Deviations:** the type-cast clarification above; no scope, interface, or
acceptance change.

**Risks:** none new — matches the spec's Risks and mitigations section
verbatim (numeric-string `attempt` risk confirmed absent from every repo
caller during Plan evidence-gathering, unaffected by this implementation).

## T2 — Document the `session.json` payload shape

**Changed paths:** `skills/_shared/CODEPATROL-CLI.md` (+14)

**Implementation:** added a fenced JSON example directly after the existing
command-list block, plus one sentence stating `stage`/`attempt` must come
from a fresh `change inspect` projection, never assumed or hardcoded.

**Deviation from plan step 1's illustrative snippet:** the plan's code block
showed only 5 fields (`action`, `stage`, `attempt`, `itemId`, `actor` — a
`claim` example). AC-4 in the governing spec requires the example to cover
"all fields: `action`, `stage`, `attempt`, `itemId`, `actor`, `result`,
`artifacts`" — a stricter reading than the plan's own snippet satisfies.
Resolved by using a `close` action example instead (the action that legitimately
carries `result`/`artifacts` alongside `itemId`/`actor`), with prose noting
`itemId`/`actor` are for `claim` and `itemId`/`result`/`artifacts` are for
`close`. This is a doc-only mechanical correction — no interface, scope, or
acceptance-criteria change; it makes the delivered doc match AC-4's literal
text more closely than the plan's own worked example did, so implementing it
directly rather than returning to Plan over a documentation wording gap.

**Verification:** `npm run lint:skills` — passes, no new warnings, both
before and after the field-set correction (confirms the doc edit does not
break skill-contract assertions over `_shared/*.md`).

**Risks:** none — documentation-only change.

## T3 — Final verification

**Gate:** `npm run verify` (typecheck + full test suite + build + smoke-cli +
lint-skills) — all green. Test suite 205→208 (+3, matching T1's new tests).
0 failures, 0 new warnings across every step.

**Diff reconciliation:** `git status --porcelain` shows exactly the three
production files the spec declared as expected surface delta:
`src/cli/commands.ts`, `src/cli/cli.test.ts`,
`skills/_shared/CODEPATROL-CLI.md` (plus this Change's own
`.codepatrol/changes/2026-07-25-session-input-validation/apply/` directory,
which is Apply-owned, not production). No undeclared work.

**AC reconciliation:** AC-1 — "CLI change session rejects an invalid stage
before touching session state" (T1), green. AC-2 — "CLI change session
rejects a missing or invalid attempt before touching session state" (T1),
green. AC-3 — "CLI change session still reports CHANGE_CONFLICT for a
well-formed but stale stage/attempt" (T1), green, unchanged message
`Session <stage>/<attempt> is not the current attempt.` confirmed verbatim.
AC-4 — `skills/_shared/CODEPATROL-CLI.md` fenced example plus sourcing
sentence (T2), confirmed by re-reading the file; corrected during T2 to
literally include all 7 named fields per the spec's stricter reading of
AC-4 (see T2 deviation note).

**Surface delta reconciliation:** spec forecast "1 modified source file
(~15 lines), 1 modified doc file (~15 lines), 1 modified test file (3 new
test cases)." Actual: `src/cli/commands.ts` +19/-6 (helper function +
call-site edit, slightly more than the ~15-line forecast because the
five-branch dispatch needed `payload.stage`→`stage`/`payload.attempt`→
`attempt` renamed at each of five call sites, not just one); `src/cli/cli.test.ts`
+47 (3 test blocks, matches plan.md's snippet size, spec's "2-3 new test
cases" forecast is exact); `skills/_shared/CODEPATROL-CLI.md` +14 (matches
~15-line forecast). No unexplained difference — the `commands.ts` variance is
a direct, mechanical consequence of the five existing dispatch branches all
referencing the now-validated fields, visible in the plan's own step 4
instruction ("replace every `payload.stage`/`payload.attempt` reference").

**DC-1 trigger check:** not activated — no evidence gathered during this
Change implicated a `session.json` field other than `stage`/`attempt`.

**Graph sync:** not run — no exported symbol, module boundary, or public
interface changed (confirmed by `git diff --stat`: no new files, no renamed
exports; `commands.ts`'s existing `executeCommand` export signature is
unchanged). Stated explicitly per plan.md T3 step 6 rather than run
needlessly.

**Rollback check:** the three changed files form one coherent, revertible
unit; `git revert` of the resulting commit would cleanly restore prior
(unvalidated) behavior with no migration or data dependency, matching the
spec's Compatibility and rollout section.

**Residual risk:** none beyond what the spec already accepted (numeric-string
`attempt` risk, confirmed absent from every repo caller; doc-example staleness
risk, mitigated by the added sourcing sentence). No new risk introduced by
implementation.
