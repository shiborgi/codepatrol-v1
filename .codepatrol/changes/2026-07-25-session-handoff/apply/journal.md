# Implementation — Faithful per-stage todo lists and harness handoff

- Package revision: 3
- Approval: `review/report.md` verdict `approve`
- Target start ref: `3f4c087f1a228cd1498c935a64edf97bd7e1c894`
- Actor: `minimax-m3`
- Status: implemented

## Baseline reconciliation

`codepatrol change inspect --id 2026-07-25-session-handoff --workspace "$PWD" --format json` validated Plan attempt 3 and Review attempt 3 artifact hashes with no warnings. The checkout is `codepatrol/2026-07-25-session-handoff`; target `main` remains at recorded base `c8d8ddc815dd19912ce91fb6973a703100083a3a`; Review result is `approve`; Apply attempt 3 is active; the tracked tree was clean before Apply began. The attempt-3 Stage Session primed successfully with T1 and T5 ready and T2, T3, T4, T6 dependency-blocked.

## Task journal

### T1 — Harden the dependency parser

- Claim/workflow item: T1
- Started: 2026-07-25T17:44:12.303Z
- Files changed: `src/change/session.ts`, `src/change/change.test.ts`
- Simplicity check: Two defensive narrowings remain inside the existing expression; no export, schema, file or dependency was added.
- Surface delta: The leading token governs `None`/`Nothing`, dependency tokens are de-duplicated, and the owning task id is filtered.
- Red evidence: `node --test --import jiti/register src/change/change.test.ts` failed only because T3 derived a self-dependency from the accepted literal prose and `validate()` raised `CHANGE_INVALID`.
- Green evidence: The same command passed 22/22; `npm run typecheck` exited 0.
- Assessment: Both incident lines now derive `T3 → ["T2"]` and `T4 → []`; bare `T1, T2` and bare `None` remain unchanged.
- Result: complete

### T2 — Derive a real checklist for every stage

- Claim/workflow item: T2
- Started: 2026-07-25T17:46:18.140Z
- Files changed: `src/change/session.ts`, `src/change/change.test.ts`
- Simplicity check: A module-local stage table maps explicitly into the unchanged `SessionItem` shape; Apply parsing and Close fallback remain intact.
- Surface delta: Plan now derives `spec`, `plan`, `evidence`; Review and Verify derive `report`; Close remains `close-work`.
- Red evidence: `node --test --import jiti/register src/change/change.test.ts` failed on Plan's opaque `plan-work` versus the expected three-item checklist.
- Green evidence: The same command passed 23/23; `npm run typecheck` exited 0.
- Assessment: Item ordering and Plan's `plan → spec` dependency are deterministic; private artifact metadata is not written into the session schema.
- Result: complete

### T3 — Reconcile derived items against durable evidence

- Claim/workflow item: T3
- Started: 2026-07-25T17:48:00.612Z
- Files changed: `src/change/session.ts`, `src/change/change.test.ts`
- Simplicity check: Two module-private helpers reuse the already-loaded `ChangeRecordV2`, existing artifact hashes, `resolveInside`, and the established `### T<n>` convention; no schema, store, module or additional record read was added.
- Surface delta: Derivation checks non-empty files/directories, exact and `report-*.md` prefix evidence, Apply journal headings, and same-stage prior-attempt hashes normalized to workspace-relative binding paths.
- Red evidence: The focused suite produced five valid reconciliation failures: delivered exact/directory items stayed open, journaled T1/T2 stayed open, rebuild lost backed T1, fresh post-stale report stayed open, and persona reports stayed open.
- Green evidence: `src/change/change.test.ts` passed 28/28; `src/change/change.test.ts src/cli/cli.test.ts` passed 40/40; `npm run typecheck` exited 0.
- Assessment: Stale consolidated and persona reports remain open; fresh evidence closes only on derivation/rebuild; false prefixes and empty files remain open; rebuilt items carry machine-authored evidence without stale claims.
- Result: complete

### T4 — Item-level trace entries and the abandoned-item signal

- Claim/workflow item: T4
- Started: 2026-07-25T17:52:54.803Z
- Files changed: `src/change/session.ts`, `src/change/trace.ts`, `src/change/improvement-report.ts`, `src/change/change.test.ts`, `src/change/improvement-report.test.ts`
- Simplicity check: One trace union variant, two fail-open appends, and one ordered Set aggregation reuse the existing trace → report → backlog pipeline without new wiring or storage.
- Surface delta: Claim/close entries carry stage, attempt, item, action and timestamp; report advice names tuple-scoped claims lacking a later close.
- Red evidence: The focused command failed only because session claim/close emitted zero item trace entries and no abandoned/reclaimed recommendation existed.
- Green evidence: `src/change/change.test.ts src/change/improvement-report.test.ts src/change/trace.test.ts` passed 43/43; `npm run typecheck` exited 0. The injected trace-directory failure logged twice while both session mutations completed.
- Assessment: Ordered close removes only its exact stage/attempt/item tuple; a later reclaim reopens abandonment; trace I/O remains unable to fail claim or close.
- Result: complete

### T5 — Align the written contract and the session-priming skills

- Claim/workflow item: T5
- Started: 2026-07-25T17:56:00.655Z
- Files changed: `skills/_shared/SESSION.md`, `CONTEXT.md`, `skills/codepatrol-plan/SKILL.md`, `skills/codepatrol-review/SKILL.md`, `skills/codepatrol-apply/SKILL.md`, `skills/codepatrol-verify/SKILL.md`, `scripts/skills-contract.test.mjs`
- Simplicity check: Existing contract and lifecycle paragraphs were extended in place; Close remains untouched because it primes no session.
- Surface delta: Shared terminology now states derivation/reconciliation; each priming workflow requires re-prime plus status before claiming on handoff.
- Red evidence: `node --test --import jiti/register scripts/skills-contract.test.mjs` failed only at the new `/reconcil/i` assertion.
- Green evidence: The same command passed 8/8; `npm run lint:skills` exited 0.
- Assessment: Existing disposability and `never own lifecycle` text remains verbatim; no catalog, frontmatter, link or workflow-order change was introduced.
- Result: complete

### T6 — Final verification and reconciliation

- Claim/workflow item: T6
- Started: 2026-07-25T17:57:56.878Z; reclaimed after the planned rebuild at 2026-07-25T17:59:04.999Z
- Files changed: `.codepatrol/changes/2026-07-25-session-handoff/apply/journal.md`
- Simplicity check: Final verification activated no deferred design or additional surface.
- Surface delta: The dirty production set is exactly the 12 files forecast by the accepted Plan; the only additional durable path is this Apply-owned journal.
- Red evidence: T1–T5 recorded their planned red-capable failures; T6 is verification-only.
- Green evidence: `npm run verify` exited 0 with 188/188 tests, build, CLI smoke and skill lint passing; `git diff --check` exited 0.
- Handoff rehearsal command: `codepatrol change inspect --id 2026-07-25-session-handoff --workspace "$PWD" --format json` projected Apply attempt 3; rebuilding exactly attempt 3 produced this output:

```json
{"ok":true,"command":"change.session","workspace":"/Users/wada/Development/agents/codepatrol","data":{"schema_version":1,"work_id":"2026-07-25-session-handoff","stage":"apply","attempt":3,"items":[{"id":"T1","title":"Harden the dependency parser","dependencies":[],"status":"closed","result":"reconciled: apply/journal.md has ### T1"},{"id":"T2","title":"Derive a real checklist for every stage","dependencies":["T1"],"status":"closed","result":"reconciled: apply/journal.md has ### T2"},{"id":"T3","title":"Reconcile derived items against durable evidence","dependencies":["T2"],"status":"closed","result":"reconciled: apply/journal.md has ### T3"},{"id":"T4","title":"Item-level trace entries and the abandoned-item signal","dependencies":["T3"],"status":"closed","result":"reconciled: apply/journal.md has ### T4"},{"id":"T5","title":"Align the written contract and the session-priming skills","dependencies":[],"status":"closed","result":"reconciled: apply/journal.md has ### T5"},{"id":"T6","title":"Final verification and reconciliation","dependencies":["T1","T2","T3","T4","T5"],"status":"open"}],"next_action":"Execute accepted Apply tasks T1-T6 in dependency order for 2026-07-25-session-handoff on Apply attempt 3","updated_at":"2026-07-25T17:58:51.160Z"},"warnings":[]}
```

- Assessment: The live successor-harness path recovered every journaled item as closed, discarded the in-memory T6 claim, left unjournaled T6 open, and allowed T6 to be reclaimed from the rebuilt projection.
- Result: complete

## Deviations

None.

## Acceptance evidence

| Criterion | Implementation | Verification | Result |
|---|---|---|---|
| AC-1 | `STAGE_ITEMS` plus unchanged Apply/Close fallbacks | Per-stage checklist regression; full gate | pass |
| AC-2 | Non-empty exact/directory evidence reconciliation | Prime/rebuild artifact test | pass |
| AC-3 | Apply `### T<n>` journal matching | Strict-subset journal test and live rehearsal | pass |
| AC-4 | Explicit rebuild re-derives and drops unbacked claims | Backed T1/unbacked T3 rebuild test | pass |
| AC-5 | Tuple-shaped claim/close trace entries inside the session lock | Exact-entry and injected trace-failure tests | pass |
| AC-6 | Ordered abandoned-session Set aggregation | Positive, negative, tuple and reclaim report tests | pass |
| AC-7 | Shared contract, glossary, four priming skills and contract assertions | 8/8 contract tests; skill lint | pass |
| AC-8 | Complete candidate gate | `npm run verify` exited 0 with 188/188 tests | pass |
| AC-9 | Leading-token empty guard, de-duplication and self filtering | Literal incident parser regression | pass |
| AC-10 | Same-stage prior-attempt artifact-hash freshness gate | Stale exact and persona binding tests | pass |
| AC-11 | Exact `report.md` and `report-*.md` evidence matching | Fresh/stale/empty/false-prefix persona tests | pass |

## Surface delta

The actual production delta exactly matches the accepted forecast: `src/change/session.ts`, `src/change/trace.ts`, `src/change/improvement-report.ts`, `src/change/change.test.ts`, `src/change/improvement-report.test.ts`, `skills/_shared/SESSION.md`, `CONTEXT.md`, `skills/codepatrol-plan/SKILL.md`, `skills/codepatrol-review/SKILL.md`, `skills/codepatrol-apply/SKILL.md`, `skills/codepatrol-verify/SKILL.md`, and `scripts/skills-contract.test.mjs`. No new file, dependency, session schema field, store, CLI verb, configuration, lifecycle event, checkpoint rule or runtime-state layout was added. The only Apply-owned durable artifact is this journal. DC-1 through DC-4 did not trigger.

## Final verification

- T1: focused parser red; `change.test.ts` 22/22 green; typecheck passed.
- T2: checklist red; `change.test.ts` 23/23 green; typecheck passed.
- T3: five reconciliation reds; `change.test.ts` 28/28 and combined session/CLI 40/40 green; typecheck passed.
- T4: trace/report reds; session/report/trace command 43/43 green; typecheck passed.
- T5: contract red; contract command 8/8 green; skill lint passed.
- `npm run verify` — typecheck, 188/188 tests, build, CLI smoke and skill lint passed.
- Live Apply-attempt-3 rebuild — T1–T5 reconciled closed and T6 open; T6 was then reclaimable.
- `git diff --check` — passed.
- `codepatrol graph sync --workspace "$PWD" --format json` — 70 files, 1,914 symbols, 6 extracted, 64 unchanged.
- Rollback: revert the branch; sessions are disposable, so no runtime repair is required.
- Residual risks: DC-1 cross-machine handoff remains deferred; DC-2 unrelated backlog items remain; DC-3 no ADR exists for the rejected merger; DC-4 persona-specific item ids remain coordinator work; an uncheckpointed stale artifact cannot be detected by recorded hashes; a non-empty stub can reconcile closed but still cannot satisfy the stage checkpoint/gate.

## Apply run metrics

- Run: `apply-20260725T174403Z`
- Started: `2026-07-25T17:44:03.008Z`
- Finished: `2026-07-25T18:01:34.139Z`
- Elapsed: 1051131 ms
- Provider usage: unavailable — harness exposes no authoritative provider usage hook
- Measured-run coverage: 0/1
- Model: `minimax/MiniMax-M3`
- Harness: `opencode`
