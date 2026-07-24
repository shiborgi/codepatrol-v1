# Verification — Architecture, skills, and workflow assessment with Stage-Session ergonomics fix

- Change: `2026-07-24-architecture-assessment`
- Verified revision: 1
- Verifier: claude-code (auditor)
- Base ref: `415f779bde14e57ad0af7ac4cd25657bcea00fcd`
- Head ref: working tree on `codepatrol/2026-07-24-architecture-assessment` (Apply checkpoint `2314e1799b84252cda168ef522566081d7a8be5d`, tree `4b1de6b42d3eda62c12cfcd96f7dca2eacd903ca`)
- Evidence date: 2026-07-24T17:32:08Z

## Scope and instruments

Read `plan/spec.md`, `plan/plan.md`, `plan/evidence/investigation.md`, `review/report.md`, `apply/journal.md` in full. Read `src/change/session.ts` (full, post-implementation), `src/cli/commands.ts` (imports + `change.session` switch), `src/change/change.test.ts` (new tests, lines 150-195), `src/cli/cli.test.ts` (new test, lines 63-160), `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md` (full). Preflight confirmed via `codepatrol change inspect --id ... --format json`: checkout on recorded branch, tree clean, Apply checkpoint/tree intact, `changes` list matches plan's declared 7 paths exactly. All commands below were executed in this session; no result is copied from `apply/journal.md`.

## Plan conformance

- T1 (session.ts projection/accessor/claim error): implemented as specified — `sessionStatus`, `readStageSession`, `BlockedItem`, `SessionStatusView` exported; `loadOrDerive` extracted; `primeStageSession` writes only when `!fromDisk`; `readStageSession` never writes. Matches plan interfaces exactly.
- T2 (CLI `status` action): implemented — `payload.action` union extended to `prime|claim|close|rebuild|status`; `status` branch calls `readStageSession` + `sessionStatus`, renders ready/blocked text. Matches plan.
- T3 (SESSION.md + contract test): `skills/_shared/SESSION.md` documents the read-only `status` action and blocking-dependency claim feedback; `scripts/skills-contract.test.mjs` asserts it (re-executed, passes). Matches plan.
- T4 (assessment doc): document exists, ranks F1-F7 with severity/evidence/follow-up, F1 marked implemented. One conformance gap found — see Findings (evidence).
- T5 (final verification/reconciliation): plan names this as an explicit task; `apply/journal.md` folds its content into a "Final verification" section without a `### T5` header. Substance (affected checks, full gate, graph sync, residual risks, rollback) is present; this is a cosmetic structural deviation, not journaled as such but immaterial to any AC.

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of the journal |
|---|---|---|---|
| AC-1 | `node --test --import jiti/register src/cli/cli.test.ts` (full suite run below includes this file; also read the assertions directly: `envelope.data.status.ready[0].id === "T1"`, `blocked[0].id === "T2"`, text matches `/T1/` and `/T2/`) | pass | yes |
| AC-2 | Read `src/change/session.ts:107-125`; traced `claimSessionItem` for a blocked item → throws `CHANGE_CONFLICT` with message `Session item is not ready: T2 — blocked by T1 (open).`; test at `change.test.ts:176-195` asserts `/T2/` and `/T1/` on the thrown message | pass | yes |
| AC-3 | Read `src/change/session.ts:81-97`: `readStageSession` calls `loadOrDerive` only, never `write`; test at `change.test.ts:165-174` asserts `existsSync(path) === false` before and after | pass | yes |
| AC-4 | `node --test --import jiti/register scripts/skills-contract.test.mjs` (included in full suite run) + read `skills/_shared/SESSION.md` diff (+4 lines documenting `status`) | pass | yes |
| AC-5 | Read `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md`; verified every cited `file:line` against the current working tree (see Findings — one stale citation found) | pass with a noted minor evidence gap | yes |
| AC-6 | `npm run verify` (re-run standalone, see Wider suite) | pass, exit 0 | yes |

## Wider suite

Re-executed independently, not trusted from the journal:

- `npm run typecheck` → exit 0.
- `npm test` → `# tests 157 / # pass 157 / # fail 0` (up from the 144-test baseline; +13 new tests across `change.test.ts`, `cli.test.ts`, and the `skills-contract` assertion).
- `npm run build` → exit 0.
- `npm run smoke:cli` → `Compiled CLI smoke passed (0.1.0).`
- `npm run lint:skills` → `Skill catalog, frontmatter, dependencies, portability, and relative links are valid.`
- Combined `npm run verify` (the exact `applyGate` command) also run standalone → exit 0.

## Blast radius

`codepatrol graph impact --since-ref 415f779` (after `graph sync`: 73 files, 1838 symbols, 1 stale node removed): 13 seeds, 21 affected files at depth 1-2, all in `src/change/*`, `src/cli/*`, `scripts/*`. The full "Affected tests" list (21 test files) is a subset of the 157 tests already re-executed above — every affected test was exercised and passed. No seam outside the plan's declared surface was touched (`src/change/model.ts`, `src/change/usage.ts` appear only under "possibly affected through ambiguous edges" — read and confirmed unmodified: `git diff 415f779..HEAD -- src/change/model.ts src/change/usage.ts` is empty).

## Regressions

- `readySessionItems` behavior unchanged (same predicate, same call sites at `claimSessionItem` and inside the new `sessionStatus`); existing test `change.test.ts:98-107` ("Stage Sessions are scoped, claim atomically...") and `:109-128` ("Apply session rebuilds...") both re-ran and passed unchanged.
- `primeStageSession` write-on-absent behavior preserved (`loadOrDerive` extraction verified line-by-line against the pre-existing body); no change to its external contract.
- CLI `prime|claim|close|rebuild` branches unchanged in behavior (only `text` computation was refactored from a single `data.next_action` line to a per-branch `let text` — verified each non-`status` branch still sets `text = data.next_action`).
- No regression found in the 157-test full run.

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md` | yes (T4) | accepted |
| `scripts/skills-contract.test.mjs` | yes (T3) | accepted |
| `skills/_shared/SESSION.md` | yes (T3) | accepted |
| `src/change/change.test.ts` | yes (T1) | accepted |
| `src/change/session.ts` | yes (T1) | accepted |
| `src/cli/cli.test.ts` | yes (T2) | accepted |
| `src/cli/commands.ts` | yes (T2) | accepted |

`git diff --name-only 415f779..HEAD` (excluding the Change's own `.codepatrol/changes/2026-07-24-architecture-assessment/` directory) returns exactly these 7 paths — no undeclared work.

## Findings

### minor — evidence

**Verified problem:** The assessment document's F1 evidence cites `src/change/session.ts:73` for `readySessionItems`. In the final (post-T1) file, line 73 falls inside the newly added `sessionStatus` function body (`return { id: depId, status: depItem ? depItem.status : "missing" as const };`); `readySessionItems` itself now lives at line 105. This citation was accurate at Plan time (before T1 edited the file) but the plan explicitly required Apply to "verify every cited `file:line` exists" before sealing T4 (plan.md T4 step 2), and the citation was not re-checked against the post-implementation file. `src/cli/commands.ts:124-133` (the other F1 citation) still falls within the `change.session` switch and remains directionally correct, though it now shows the fixed 5-action switch rather than the pre-fix 4-action one.

**Exact location:** `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md:9` (table) and `:20` (detail section reference the same evidence via the table row).

**Impact:** Low. All six acceptance criteria independently re-verify as passing; no functional, security, or regression impact. A reader following the `session.ts:73` citation to understand the pre-fix problem will land inside the fix's own code, which is self-evidently not `readySessionItems` — mildly confusing but not misleading about the finding's substance (the prose correctly describes the problem and the fix). The other 6 findings' citations (F2-F7) target files untouched by this Change and were independently re-verified as accurate.

**Required correction:** Update the F1 evidence cell to cite a stable pre-fix reference, e.g. `src/change/session.ts:105` (current `readySessionItems` location) or a comment noting the original pre-fix line, and tighten `commands.ts:124-133` to the specific pre-existing branches if precision matters. This is a one-line documentation fix with no code or test impact.

**Disposition:** Not blocking. This is a durable-document accuracy nit in one of fifteen-plus citations, does not affect any AC-gated behavior, and is trivially correctable without another Apply round-trip. Recording as a residual risk for Close's authority record rather than returning to Apply.

## Residual risks and evidence gaps

- The minor evidence-citation gap above (F1's `session.ts:73` reference) survives this verification; it does not affect code correctness or any AC and is not being sent back to Apply.
- No `DC-N` trigger activated (spec recorded DC-1 batch-claim ceiling and DC-2 F2-F7 deferral; neither condition was hit during this implementation).
- Findings F2-F7 remain open, unimplemented, and unranked by execution — this is by design (spec Out of scope) and each carries a proposed follow-up work-id in the assessment document; no evidence gap beyond what the document itself already discloses.
- Per-run provider token usage remains `unavailable` for both the Plan and this Verify run (harness exposes no authoritative usage hook) — consistent with the established, disclosed pattern and itself the subject of finding F2.

## Verdict

`commit`

All six acceptance criteria independently re-verify as passing. The full project gate (`npm run typecheck && npm test && npm run build && npm run smoke:cli && npm run lint:skills`) was re-executed standalone in this session and exits 0, with the test count rising from 144 to 157 (13 new, targeted tests, 0 failures). The diff exactly matches the plan's declared 7-file surface with no unplanned work. Blast radius (21 affected files/tests) is fully covered by the already-passing full suite; `model.ts` and `usage.ts` (flagged as "possibly affected" through ambiguous graph edges) are confirmed unmodified. Git/ref safety confirmed: target `main` unchanged at `415f779`, Apply checkpoint tree matches the recorded value, no stray terminal tags, no secrets/transcripts under the Change directory. One minor documentation-evidence finding (a stale `file:line` citation in the assessment doc, caused by the same Change's own edits shifting a line number) is recorded but does not block Close — it is a trivial follow-up, not a defect in the delivered behavior. Next transition: `codepatrol-close 2026-07-24-architecture-assessment commit|rollback on codepatrol/2026-07-24-architecture-assessment`.
