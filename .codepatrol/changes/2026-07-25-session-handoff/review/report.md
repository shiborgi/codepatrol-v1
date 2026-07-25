# Review — Faithful per-stage todo lists: reconcile the Stage Session from durable evidence

- Change: `2026-07-25-session-handoff`
- Incoming revision: 2 (Plan attempt 2)
- Reviewed revision: 2
- Reviewer: claude-sonnet-5 (default persona)
- Evidence date: 2026-07-25T17:06:30Z

## Scope and evidence

Reviewed at branch `codepatrol/2026-07-25-session-handoff`, Plan attempt 2 checkpoint `4b99624` (transition commit `1eb4a41`), base `c8d8ddc` (`main`, unchanged), clean worktree. Plan attempt 2 is the response to Apply attempt 1's contract-defect return (which found two dependency-parser defects while priming this Change's own session against its own `plan.md`); it adds T1 (parser hardening) and rewords this Change's own `plan.md` `**Depends on:**` lines to be bare `None`/`T<n>` lists.

Declared Plan-attempt-2 artifact hashes re-computed and matched `change.yaml` exactly:

- `plan/spec.md` → `3febaf90…750650` (intent `modify`) ✓
- `plan/plan.md` → `19eb31fc…bcf5f9` (intent `modify`) ✓
- `plan/evidence/investigation.md` → `5ba079d2…5d194b7` (intent `modify`; hash identical to attempt 1 — unchanged) ✓

History reconciled with the projection: Plan 1 invalidated, Review 1 invalidated (prior `approve` superseded), Apply 1 `returned`, Plan 2 completed, Review 2 active. The `return apply` commit `92adcf2` sits correctly between the two Plan attempts.

Code citations verified by reading each cited file/line in full:

- `src/change/session.ts` (139 lines): `deriveItems` `:48-62`; `:49` single opaque item for every non-Apply stage; `:50-61` Apply `### T<n>` parse (`:53`) and `**Depends on:**` parse (`:57`); `:58` dependency parser with both defects; `validate()` `:19-46` incl. self-dep rejection at `:36`, cycle check `:37-44`, 256 KB bound `:45`; `loadOrDerive` `:81-93` (load path `:85-91` returns on-disk session untouched); `claimSessionItem` `:107-125`; `closeSessionItem` `:127-133`; `discardAndRebuildSession` `:135-139` (always re-derives all-open, reads `plan.md` never `apply/journal.md`); locking `:108`/`:128`. **All confirmed.**
- `src/change/trace.ts` (104 lines): `TraceEntry` `:4-7` (3 variants); `append` `:53` with internal fail-open `:67-69`; `read` `:81-94` (structural cast, tolerates unknown shapes); `close` `:96-104`; 10 MB rotation `:10`. **All confirmed.**
- `src/change/orchestrator.ts:254-259` `required` map (plan→spec.md+plan.md; review→report.md; apply→journal.md; verify→report.md); `:186` `try { trace.append(...) } catch { /* fire-and-forget */ }` pattern. **Confirmed.**
- `src/cli/main.ts:58` traces `{kind:"command",command,args}` — `change session`'s `args` carries only `{id,input}`, so item-level actions are never traced (Finding 4). **Confirmed.**
- `.gitignore:6` `.codepatrol/runtime/` covers both sessions and traces; `git check-ignore -v` hits a session path. **Confirmed.**
- `skills/_shared/SESSION.md:11-12` "the accepted Change artifacts reconstruct it" (the unimplemented promise — Finding 1); `CONTEXT.md:34` Stage Session term; `scripts/skills-contract.test.mjs:30-31` existing SESSION.md assertions. **Confirmed.**
- `src/change/change.test.ts:10` imports, `:102` prime, `:123-126` Apply derivation (`["T1","T2"]`), `:127` rebuild-guard, `:150-163` sessionStatus, `:190` no-write-on-read. **Confirmed.**

First-hand evidence reproduced directly in this session:

- **Both T1 parser defects reproduced via `node -e`** against the literal cited lines: `T2 (… T3-exclusive.)` for task T3 → `["T2","T3"]` (self-dep, hard-blocks at `validate():36`); `None (docs/skills only; file-disjoint from T1–T3)` → guard tests the whole line (false) → `["T1","T3"]` (silent phantom deps). Happy path `T1, T2` → `["T1","T2"]` and `None` → `[]` parse unchanged. The T1 fix (leading-token guard + self-ref filter) yields the AC-9-expected `["T2"]` and `[]`.
- **The handoff incident (Finding 2)** verified verbatim in the durable, git-tracked `2026-07-25-docs-consolidation` Apply journal (`:11`, `:109`): "a prior Apply session's Stage Session claimed T1–T4 'complete' with no journal, no artifacts, and no checkpoint… The session was stale/untrustworthy and was rebuilt".
- **The cross-harness `### T<n> — … / Result: complete` convention (Finding 3)** verified in both journals under their terminal tags: commit-scoping (opencode/MiniMax-M3) and docs-consolidation (claude-sonnet-5) each carry `### T1…T4` with `- Result: complete`.

## Findings

None that block approval. One cosmetic observation recorded below; no bounded or material defect survives validation.

### minor — evidence (cosmetic, non-blocking) — AC ordering

`spec.md` lists AC-1…AC-7, then AC-9, then AC-8 (AC-9 precedes AC-8). `plan.md`'s acceptance-mapping table orders them AC-9, AC-1…AC-7, AC-8. All nine criteria are present, unambiguous, non-overlapping, and each maps to exactly one task and one red-capable verification; the reordering is purely typographical and does not affect implementability, verification, or coverage. No correction required for approval.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none | no blocking finding | none |
| `plan/plan.md` | none | no blocking finding | none |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 (multi-item checklist per stage; apply/close unchanged) | yes | T2 | yes — red: derivation still returns single `<stage>-work` (count/id mismatch) | covered |
| AC-2 (artifact present→`closed` w/ `result`; absent→`open`) | yes | T3 | yes — red: reconciliation cases return items `open` | covered |
| AC-3 (Apply `T<n>` closed iff journal has `### T<n>`) | yes | T3 | yes — red: strict-subset journal leaves the absent task `open`; exercised both directions in one fixture | covered |
| AC-4 (rebuild keeps backed progress, drops unbacked claims) | yes | T3 | yes — red: rebuild-after-partial-work returns unbacked claim `closed` today | covered |
| AC-5 (one `{kind:"session"}` trace entry per claim/close; fail-open) | yes | T4 | yes — red: no `session` entries exist in the trace today | covered |
| AC-6 (abandoned-item recommendation present/absent) | yes | T4 | yes — red: recommendation absent today; both polarities asserted | covered |
| AC-7 (SESSION.md + CONTEXT.md + 4 skills + contract test) | yes | T5 | yes — red: contract test fails on missing `/reconcil/i` and `/re-?prime/i`; `lint:skills` validates skill edits | covered |
| AC-8 (`npm run verify` exit 0) | yes | T6 | yes — `applyGate` machine-gates the `implemented` checkpoint | covered |
| AC-9 (no self-dep; leading-token `None` guard; happy path unchanged) | yes | T1 | yes — red reproduced this session: T3 self-dep throws `CHANGE_INVALID`; `None (…T1–T3)` yields phantom `["T1","T3"]` | covered |

## Simplicity axis

- Selected rung: **confirmed** — direct local change. One existing function (`deriveItems`) gains a narrowed dependency parse, a per-stage table, and a reconciliation predicate; two existing functions (`claim`/`close`) gain one traced line each; one existing report gains one aggregation. No new module, store, CLI verb, schema field, or dependency.
- Reuse maximised: per-stage artifact set from `orchestrator.ts:254-259`; `### T<n>` heading already parsed at `session.ts:53` and already mandated by `plan.md`'s `**Task result:**`; the entire `trace.append → generateImprovementReport → Close-hook → backlog` pipeline used unmodified; existing `change.test.ts:99-190` fixtures.
- Safety floor: session stays disposable, gitignored and non-governing (contract preserved, not amended — `SESSION.md`/`CONTEXT.md`/`AGENTS.md`); reconciliation is read-only and runs only on derivation (`loadOrDerive:85-91` return path untouched → in-flight `claimed` items never disturbed); trace stays fail-open (existing internal `try/catch` plus the defensive outer wrap); existing fail-closed validation, 256 KB bound, dependency-cycle check, and workspace locking untouched; checkpoint validation and `parseStatusPaths` untouched.
- Surface delta: `src/change/{session,trace,improvement-report}.ts`, `src/change/{change,improvement-report}.test.ts`, `skills/_shared/SESSION.md`, `CONTEXT.md`, four `skills/codepatrol-{plan,review,apply,verify}/SKILL.md`, `scripts/skills-contract.test.mjs`. No new files, no config/runtime-state layout change — matches the spec forecast.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| — | — | already sufficient | — | no finding survives validation on the simplicity axis |

Deferred constraints all sound: DC-1 (cross-machine handoff — reads working-tree artifacts only; mid-stage commits would collide with checkpoint delta validation `orchestrator.ts:266-270`/`:291-292`); DC-2 (4 unrelated backlog items + transition-count recommendation); DC-3 (no ADR for the reject-merger decision — rationale lives in this spec). Each has a known ceiling, observable trigger, and bounded upgrade path.

## Executability audit

- Paths/interfaces: all edits are internal to existing modules; `SessionItem`/`StageSession` schemas frozen (`schema_version` stays `1`); `TraceEntry` gains one variant — `trace.read` already tolerates unknown shapes and `generateImprovementReport` filters by `kind`, so older traces aggregate to zero abandoned items. No migration.
- Dependency direction: `session.ts` gains only a `trace` import (same fire-and-forget import `orchestrator.ts:10` already uses); `improvement-report.ts` adds one aggregation over an input it already reads. No new module, no inversion.
- Commands: gate `npm run verify` is the project's existing gate, re-enforced at Apply seal via `applyGate`.
- Red/green: every task specifies a concrete expected red (T1 throws/mis-derives; T2 count mismatch; T3 items `open`; T4 no `session` trace + absent recommendation; T5 contract-test word mismatch) — all falsifiable, none dependent on a fixture-setup error.
- Self-consistency: this Change's own `plan.md` `**Depends on:**` lines are all bare `None`/`T<n>` lists (T1 None; T2 T1; T3 T2; T4 T3; T5 None; T6 T1,T2,T3,T4,T5), so Apply can prime from it under the *current unhardened* parser before T1 lands — the Apply-1 block is resolved.
- Rollback: revert the branch; sessions are disposable, so no state survives a revert to be repaired.
- Unresolved assumption: none material.

## Verdict

`approve`

Plan attempt 2 resolves the Apply-1 contract defect both ways: it fixes the two reproduced dependency-parser defects in scope (T1, inside the same function T2/T3 already own — no new file/module/interface) and rewords this Change's own `plan.md` to be self-consistently parseable under the current parser. The technical design is sound and constraint-consistent — the session becomes a read-only projection reconciled from durable evidence (removing its competing source-of-truth claim), the one worthwhile unification (item-level trace lines → existing report → backlog) is built from existing machinery, disposability/gitignored/non-governing status is preserved, and all governing contracts (`SESSION.md`, `CONTEXT.md`, `AGENTS.md`) are honored. Every acceptance criterion AC-1…AC-9 is unambiguous and maps to a red-capable task and verification; first-hand evidence (the incident journal, the cross-harness convention, the reproduced defects) all check out. The Plan is complete enough for an independent implementer. Next permitted transition: Review checkpoint with result `approve`, advancing the Change to Apply. Next action: `codepatrol-apply 2026-07-25-session-handoff on codepatrol/2026-07-25-session-handoff`.

## External evidence sufficiency

Not required. No external/dependency/protocol claim governs the design. The semantics invoked — reading on-disk files to reconcile projection state, and an append-only trace feeding an aggregation — are internal to this codebase, established by its own conventions (the `### T<n>` journal format and the trace→report→backlog pipeline), and require no Reference Concept Analysis.

## Residual concerns and evidence gaps

- Reconciliation marks an item `closed` on the strength of a non-empty artifact (a stub could satisfy it). Acknowledged in the spec and strictly better than today's unbacked in-memory claim; the stage's real gate (checkpoint artifact hashing + `applyGate`) is unchanged and still catches stub work before sealing. Does not block approval.
- Cross-machine/fresh-clone mid-stage handoff remains unsolved (DC-1) — out of scope by design, not an oversight.
- The defensive outer `try/catch` around `trace.append` in claim/close (T4) is redundant with `trace.append`'s own internal fail-open (`trace.ts:67-69`); harmless defense-in-depth, explicitly modeled on `orchestrator.ts:186`. Does not block approval.
- Could not re-run the full baseline gate at `c8d8ddc` within this review (Review does not execute the candidate gate — that is Verify's job); the spec's baseline-green claim rests on the prior Change's terminal Close having run the same gate via `applyGate`, plus a clean typecheck of the cited files read here. Does not block approval.
