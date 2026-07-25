# Verification — Faithful per-stage todo lists and harness handoff

- Change: `2026-07-25-session-handoff`
- Verified revision: 3 (Apply attempt 3)
- Verifier: claude-sonnet-5 (default persona)
- Base ref: `c8d8ddc815dd19912ce91fb6973a703100083a3a` (`main`)
- Head ref: `codepatrol/2026-07-25-session-handoff` @ `7c3bfa5` (HEAD; apply content checkpoint `5720cf8`)
- Evidence date: 2026-07-25T18:10:00Z

## Scope and instruments

Read all durable stage artifacts: Plan attempt 3 (`spec.md`/`plan.md`/`investigation.md`, hashes re-verified), Review attempt 3 `report.md` (verdict `approve`), Apply attempt 3 `journal.md` (hash `fd31a683…` matches declared). Evaluated the candidate from artifacts only — no access to the Apply stage's chat history (Apply was run by `minimax/MiniMax-M3` via opencode in a separate session).

Candidate binding confirmed: `git rev-parse 5720cf8^{tree}` = `78d1c07ce27fbbab0df3b2135a0cbaf3a47b1cbd`, equal to the recorded Apply tree; `5720cf8` is an ancestor of HEAD; `git diff --stat 5720cf8 HEAD -- src/ scripts/ skills/ CONTEXT.md` is empty (HEAD's only change vs the checkpoint is `change.yaml` bookkeeping); working tree porcelain empty; branch = `codepatrol/2026-07-25-session-handoff`; `main` at `c8d8ddc` (no target advance); no terminal tag.

Diff audited: `c8d8ddc` → apply content checkpoint `5720cf8`. Commands run in this session: `git`, `node --test --import jiti/register`, `npm run verify`, `codepatrol graph {impact,sync}`, `codepatrol change session`, and two isolated `git worktree` red probes. Node v22.23.1.

## Plan conformance

Task-by-task diff audit against `plan.md`. Every change matches the approved Plan 3; no deviation.

- **T1 (`session.ts` dependency parse):** leading-token guard (`split(/\s+/,1)[0]` tested against `/^(none|nothing)[.,;:]?$/i`) replaces the whole-line test; extracted tokens de-duplicated (`new Set`) and self-references filtered (`!== match[1]`). Matches plan T1 exactly. Happy path unchanged.
- **T2 (`session.ts` `STAGE_ITEMS`):** module-local table — plan→`spec`/`plan`(dep `spec`)/`evidence`; review→`report`; verify→`report`; apply/close absent (fall through unchanged). `deriveItems` maps via `reconcile`. Matches plan T2 exactly.
- **T3 (`session.ts` `staleHashes` + `itemIsDelivered` + `reconcile`):** freshness gate keys candidate files by workspace-relative binding path (`.codepatrol/changes/<id>/<evidencePath>`) against same-stage non-current-attempt `artifacts[].sha256` from `change.yaml` — this is the path-normalization the plan left to the implementer, correctly resolved. Prefix matching (`<stem>.md` + `<stem>-*.md`) for persona awareness; directory scan for `plan/evidence/`; Apply `### T<n>` journal match. `deriveItems` threads the already-loaded `record` (loadOrDerive/discardAndRebuild now keep `readChangeRecord`'s result before `foldChange` — zero new read). Matches plan T3 exactly, including AC-10/AC-11.
- **T4 (`trace.ts` union variant; `session.ts` claim/close appends; `improvement-report.ts` aggregation):** `TraceEntry` gains `kind:"session"`; claim/close each append one entry inside the lock wrapped in `try/catch`; the report adds an ordered Set (`claimed` adds, `closed` deletes, key = `stage/attempt/item`) and one recommendation. Matches plan T4 exactly.
- **T5 (`SESSION.md`, `CONTEXT.md`, 4 `SKILL.md`, `skills-contract.test.mjs`):** contract/skill text extended in place; contract test gains `/reconcil/i` + `/re-?prime/i`; `close` untouched. Matches plan T5.
- **T6:** the hardcoded-attempt rehearsal defect (Apply-2's return) is fixed — step 3 now reads `data.attempt` from `change inspect` and never hardcodes; the journal records the live attempt-3 rebuild output as proof.

Surface delta = exactly the 12 declared paths, matching the Plan-3 forecast. `git diff --check` clean. No new file, dependency, schema field, store, CLI verb, or runtime-state layout.

## Acceptance re-verification

| Criterion | Command re-executed | Result | Independent of the journal |
|---|---|---|---|
| AC-1 (multi-item checklist per stage) | live `change session --action prime` for verify → `[("report","open","")]` (was opaque `verify-work`); full gate | pass | yes |
| AC-2 (artifact present→`closed`; absent→`open`) | `change.test.ts` reconciliation cases; live prime (no verify/report.md → `open`) | pass | yes |
| AC-3 (Apply `T<n>` closed iff journal `### T<n>`) | `change.test.ts` strict-subset fixture; journal's live rebuild (T1–T5 closed, T6 open) | pass | yes |
| AC-4 (rebuild keeps backed, drops unbacked) | `change.test.ts` rebuild case | pass | yes |
| AC-5 (one `{kind:"session"}` trace entry per claim/close; fail-open) | `change.test.ts` + `trace.test.ts` (43/43) | pass | yes |
| AC-6 (abandoned-item recommendation present/absent) | `improvement-report.test.ts` | pass | yes |
| AC-7 (SESSION.md + CONTEXT.md + 4 skills + contract) | `scripts/skills-contract.test.mjs` (8/8); `npm run lint:skills` | pass | yes |
| AC-8 (`npm run verify` exit 0) | `npm run verify` → `VERIFY_EXIT=0` | pass | yes |
| AC-9 (no self-dep; leading-token None guard) | red probe below; `change.test.ts` parser case | pass | yes |
| AC-10 (attempt-scoped freshness gate) | red probe below; `change.test.ts` stale-hash case | pass | yes |
| AC-11 (persona-aware prefix evidence) | red probe below; `change.test.ts` persona case | pass | yes |

Red-capability independently falsified in isolated worktrees at `5720cf8` (not copied from the journal):

- **AC-9:** reverted only T1's parser to the baseline expression → `"Apply dependency parsing ignores self-references and prose after None"` → `not ok`, `error: 'Session item T3 has invalid dependency T3.'` (`# fail 1`). Restored by discarding the worktree.
- **AC-10 + AC-11:** disabled only the freshness gate inside `qualifyingFile` (always return source) → test 21 `"reconciliation rejects stale prior-attempt evidence and refreshes only on rebuild"` → `not ok` (stale artifact wrongly credited `closed`), and test 22 `"reconciliation accepts fresh persona reports and rejects stale or false-prefix matches"` → `not ok` (stale persona files wrongly credited) (`# fail 2`). Restored by discarding the worktree.

Both probes confirm the new behaviours are load-bearing, not vacuous. The candidate checkout was untouched after each probe (HEAD and porcelain re-verified).

## Wider suite

- `npm run verify` (the configured `applyGate` and plan T6 gate): exit `0`.
  - `typecheck` (`tsc --noEmit`): clean.
  - `test`: `# tests 188 / # pass 188 / # fail 0`.
  - `build` (`clean-dist` + `tsc -p tsconfig.build.json`): clean.
  - `smoke:cli`: `Compiled CLI smoke passed (0.1.0)`.
  - `lint:skills`: `Skill catalog, frontmatter, dependencies, portability, and relative links are valid.`
- No warnings emitted by any gate step.

## Blast radius

`codepatrol graph impact --since-ref c8d8ddc` seeds `src/change/{session,trace,improvement-report}.ts` (+ 9 change-owned artifacts / test files). `affectedTests` = 25 modules (the session/report/trace/cli/skills-contract suites); `possiblyAffected` = 9 non-test modules (`backlog.ts`, `model.ts`, `usage.ts`, `validation.ts`, graph/*, shared/*) — depth-2/3 transitive dependents of the edited modules. Every `affectedTests` entry and every `possiblyAffected` module is exercised by `npm test` (188/188). The change is additive (one optional `TraceEntry` variant, internal helpers, a threaded parameter); no surviving interface drift. `codepatrol graph sync`: 70 files, 1914 symbols (baseline 1826 → +88 from the new code), 0 removed — matches the journal.

## Regressions

Full `npm test` (188/188) green on the candidate, including every pre-existing session test in `change.test.ts`, the parallel-persona orchestrator test, all lifecycle/transition/close tests, and the trace/improvement-report suites. The signature/shape changes are backward-compatible (`SessionItem`/`StageSession` frozen; `TraceEntry` gains a variant that `trace.read` and the report tolerate). No behaviour drift at surviving interfaces.

## Unplanned changes

| Path | Declared in spec/plan | Disposition |
|---|---|---|
| `src/change/session.ts` | yes | accepted |
| `src/change/trace.ts` | yes | accepted |
| `src/change/improvement-report.ts` | yes | accepted |
| `src/change/change.test.ts` | yes | accepted |
| `src/change/improvement-report.test.ts` | yes | accepted |
| `skills/_shared/SESSION.md` | yes | accepted |
| `CONTEXT.md` | yes | accepted |
| `skills/codepatrol-{plan,review,apply,verify}/SKILL.md` (4) | yes | accepted |
| `scripts/skills-contract.test.mjs` | yes | accepted |

`git diff --name-only c8d8ddc 5720cf8 -- src/ scripts/ skills/ CONTEXT.md` returns exactly those 12 paths. No unplanned production change. Durable tree under `.codepatrol/changes/2026-07-25-session-handoff/` contains only the 6 expected stage artifacts + `change.yaml`; no runtime-state leakage.

## Findings

None. The implementation conforms task-for-task to Plan 3; all eleven acceptance criteria independently pass; the full gate is green; the two most novel behaviours (AC-9 parser, AC-10/AC-11 freshness+persona gate) are red-capable and were falsified directly; the candidate commit/tree binding is intact; no unplanned or regressing change.

DC-1 through DC-4 did not trigger: cross-machine handoff stays deferred (DC-1); the 4 unrelated backlog items + transition-count recommendation untouched (DC-2); no ADR written (DC-3); persona item-ids not derived — pre-existing `claim review-security` failure unchanged (DC-4).

## Residual risks and evidence gaps

- **Uncheckpointed stale artifact** (acknowledged in the journal): a prior attempt that wrote an artifact then crashed/returned *before* checkpointing leaves an uncommitted file with no `change.yaml` binding, so the freshness gate cannot flag it. Bounded by other lifecycle guards (transitions require clean trees; the file would be swept or block the next checkpoint) and far rarer than the committed-stale case the gate does catch. Does not block.
- **Non-empty stub** can reconcile an item `closed`; strictly better than today's unbacked claim, and the stage's real gate (checkpoint artifact hashing + `applyGate`) still catches stub work before sealing. Does not block.
- **DC-1** cross-machine/fresh-clone mid-stage handoff remains unsolved (out of scope by design).
- The defensive outer `try/catch` around `trace.append` in claim/close is redundant with `trace.append`'s own internal fail-open (`trace.ts:67-69`); harmless defence-in-depth. Does not block.
- No evidence gap blocks this verdict; every claim cites a command executed in this session or an exact verified location.

## Verdict

`commit`

The candidate is implementation-complete and acceptance-complete: the diff conforms task-for-task to approved Plan 3 (T1–T6); AC-1…AC-11 independently pass, with AC-9 and AC-10/AC-11 red-capability falsified in isolated worktrees; the full `applyGate`/`npm run verify` exits 0 with 188/188 tests; the blast radius is fully covered by the green suite; no unplanned, stale-crediting, or regressing change exists; and the Apply candidate commit `5720cf8` / tree `78d1c07ce27fbbab0df3b2135a0cbaf3a47b1cbd` is intact and bound. Next Change transition: checkpoint Verify with result `commit`, advancing to Close. Next action: `codepatrol-close 2026-07-25-session-handoff commit|rollback on codepatrol/2026-07-25-session-handoff`.
