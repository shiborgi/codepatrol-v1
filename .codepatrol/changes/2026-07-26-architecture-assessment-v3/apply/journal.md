# Apply journal — Whole-codebase architecture assessment (v3)

## T1 — File F1 and F2 as backlog items

**Changed paths:** `.codepatrol/backlog/items.yaml` (+32, via `codepatrol
backlog add`, committed `caaf29e`)

**Steps run:**
1. `backlog add` for F1 → id
   `dead-duplicated-codepatrol-changes-path-builder-helpers-changedirectory-store-ts-and-changeroot-state-ts-are-both-unreferenced-the-one-real-caller-hardcodes-the-literal-path-instead`,
   `{"status":"candidate","count":1}`.
2. `backlog add` for F2 → id
   `redundant-non-throwing-validators-in-validation-ts-validateartifactbindingsfromreader-has-zero-callers-anywhere-validateartifactbindings-is-only-imported-by-one-test-never-by-production-code`,
   `{"status":"candidate","count":1}`.
3. `backlog list --format json` confirmed both present with `priority:
   "p3"`, `source: { kind: "plan-followup", workId:
   "2026-07-26-architecture-assessment-v3" }`.
4. `git add .codepatrol/backlog/ && git commit` → `caaf29e`.

**Assessment (assess-change axes, self-applied, bounded task diff):**
Contract — AC-3 delivered and verified (both items present, correctly
attributed). No code touched, matching the declared investigation-only
scope. Verification quality: step 3's `backlog list` check is a direct,
independent re-read of the persisted file, not a trust of the `add`
command's own return value alone. **Verdict: approve**, no blocking
finding.

**Deviations:** none — implemented exactly per plan.md's steps.

**Risks:** none — data-only, sanctioned-exception file mutation, no
production code path affected.

## T2 — Final verification (no code touched)

**Gate:** `npm run verify` (typecheck + full test suite + build + smoke-cli +
lint-skills) — all green. 215/215 tests, unchanged from the base commit's
already-green state (confirms zero production code was touched).

**Diff reconciliation:** `git status --porcelain` shows only this Change's
own `apply/` directory (Apply-owned, not production); `git log --oneline -3`
shows the single T1 backlog commit (`caaf29e`) as the only content change
anywhere in this Change's history. No `src/`, `skills/`, or config file
touched — matches AC-4 exactly.

**AC reconciliation:** AC-1/AC-2 — satisfied by `spec.md`'s Current evidence
and Reconciliation sections (Plan-time). AC-3 — both backlog items present
with correct priority/source (T1). AC-4 — zero production diff, confirmed
above.

**DC-1 check:** not activated — no third/fourth reimplementation of the
exact-key-validation idiom surfaced during this Change; F3 remains correctly
undocumented-as-a-backlog-item per spec's Alternatives.

**Graph sync:** not run — no code changed, nothing for the graph to pick up.

**Rollback check:** `git revert` of the single backlog-add commit would
cleanly remove both items with no other dependency — no code, no schema, no
other file references either item id.

**Residual risk:** none — investigation-only Change, zero production
surface, exactly as scoped.
