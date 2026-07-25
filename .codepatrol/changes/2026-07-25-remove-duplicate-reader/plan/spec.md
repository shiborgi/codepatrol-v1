# Specification — Remove unsafe duplicate YAML reader

## Intent

- Origin: improve-codebase
- Mode: bug
- Target baseline: `main` @ `5893504e8d417cc7a832aecbf0c10cbb65208d48`, clean tree
- Governing constraints: `CONTEXT.md` term **Change** ("immutable identity, ordered events");
  no ADR governs this seam. None otherwise — this is an internal read-path correction with no
  externally observable contract change.
- Substrate state: graph synced at this Change's start (70 files, 1914 symbols)
- Problem: `src/change/improvement-report.ts` reads and parses `change.yaml` through a private,
  duplicated implementation that bypasses the centralized `migrateRecord` normalization and
  `assertChangeRecord`/`foldChange` validation that every other reader in the codebase relies on
  (`src/change/store.ts:13-20`). This silently undercounts stats for Changes still carrying the
  legacy `"finalize"` stage name, and silently downgrades any genuinely corrupt `change.yaml` into
  an empty "no trace" report instead of surfacing the failure.
- Outcome: `generateImprovementReport` reads every existing `change.yaml` through the one
  canonical, migrating, validating boundary; a missing Change directory still yields an empty
  report, but a present-and-corrupt `change.yaml` now throws the same `CodepatrolError` every
  other reader would raise, and legacy `"finalize"`-stage records are correctly folded into
  `"close"` counts.

Improvement signals: Top error code: INVALID_ARGUMENT (3). Investigate the first occurrence's
args and stage context. — Command "change.transition" was invoked 36 times — consider caching or
batching repeated invocations. (from `.codepatrol/docs/improvement-reports/2026-07-25-session-handoff.md`;
both are process/tooling signals unrelated to this bounded read-path fix and are left for their
own backlog items already tracked separately.)

## Scope

### In scope

- Remove the private `readChangeRecord`/`recordPathFor` pair in `src/change/improvement-report.ts`
  and replace the single call site (`improvement-report.ts:93`) with a thin wrapper that:
  (a) returns `null` when the canonical `changeRecordPath` does not exist on disk, preserving the
  existing "no Change yet" contract, and (b) otherwise delegates entirely to the canonical
  `readChangeRecord` from `src/change/store.ts`, gaining `migrateRecord` normalization and
  `assertChangeRecord`/`foldChange` validation for free.
- Drop the now-unused direct `yaml` import and the now-unused `existsSync`/`readFileSync` usages
  from that duplicate path (other uses of `existsSync`/`readdirSync`/`statSync` elsewhere in the
  file for `bytesForDir` are retained).
- Add regression coverage in `src/change/improvement-report.test.ts` for: (1) a legacy
  `"finalize"`-stage record folding into the `"close"` bucket instead of a stray `"finalize"`
  bucket, and (2) a present-but-corrupt `change.yaml` now throwing `CodepatrolError`
  (`CHANGE_INVALID`) instead of silently returning an empty report.

### Out of scope

- Any change to `src/change/store.ts`, `src/change/model.ts`, or `migrateRecord` itself — they are
  already correct and are the reused capability, not the defect.
- N1/N2/N3 from the same architecture assessment (dead error codes, core module test gaps,
  orchestrator density) — each already has its own backlog entry and is a separate, independently
  reviewable Change.
- Any change to the two "top error code" / "command invoked N times" backlog items — unrelated
  process signals, not this read-path defect.
- Migrating the two on-disk legacy-`"finalize"` `change.yaml` files
  (`2026-07-23-finalize-merge`, `2026-07-23-rename-finalize-to-close`) to the new stage name in
  place — `migrateRecord` already normalizes them at read time; rewriting historical records is a
  separate concern with its own blast radius and is not required to fix the reader.

## Current evidence

See `plan/evidence/investigation.md` for full file:line citations. Summary:

- `src/change/improvement-report.ts:29-38` — private `readChangeRecord`, parses raw YAML, never
  calls `migrateRecord`, swallows parse errors as `null`.
- `src/change/store.ts:13-20` — canonical `readChangeRecord`: `existsSync` guard throws
  `CHANGE_NOT_FOUND`; parse failure throws `CHANGE_INVALID`; success path always runs
  `migrateRecord` then `assertChangeRecord`/`foldChange`.
- `src/change/model.ts:39-48` — `migrateRecord` normalizes legacy `"finalize"` stage,
  `"change-finalized"` type, and `"finalize/receipt.md"` receipt path.
- `src/change/improvement-report.ts:100,132` — un-migrated `"finalize"` stage creates a
  `perStage.finalize` bucket that `STAGES.reduce` (only `plan|review|apply|verify|close`) never
  sums, silently dropping those counts from `totalAttempts`.
- `src/change/orchestrator.ts:409` — sole caller of `generateImprovementReport`, during Close,
  after the Change's `change.yaml` has already passed `assertChangeRecord` earlier in the same
  transition.
- `src/change/improvement-report.test.ts:63-74` — asserts a graceful empty-shape report for a
  workspace with no `change.yaml` at all; this contract must survive the fix.
- Two on-disk Changes still carry the legacy `stage: finalize` value in their `change.yaml`:
  `2026-07-23-finalize-merge`, `2026-07-23-rename-finalize-to-close` — confirmed live evidence of
  the migration gap, not a hypothetical.

## Proposed design

Replace the duplicate parsing/migration logic with a thin existence-gated delegation to the
canonical reader:

```typescript
import { changeRecordPath, readChangeRecord as readCanonicalChangeRecord } from "./store.js";

function readChangeRecord(workspace: string, workId: string): ChangeRecordV2 | null {
	if (!existsSync(changeRecordPath(workspace, workId))) return null;
	return readCanonicalChangeRecord(workspace, workId);
}
```

This keeps the function name and call site (`improvement-report.ts:93`) unchanged, so the rest of
`generateImprovementReport`'s event-folding loop (`:94-125`) is untouched. The only behavioral
deltas are: (1) legacy `"finalize"` events arrive already renamed to `"close"` by
`migrateRecord`, so they land in the correct `perStage.close` bucket and count toward
`totalAttempts`; and (2) a `change.yaml` that exists but fails to parse or fails
`assertChangeRecord`/`foldChange` now throws `CodepatrolError` instead of being swallowed to
`null` — matching every other reader's boundary contract instead of silently downgrading
corruption to "no trace."

`ChangeRecordV2`'s `events` field is a superset (typed `ChangeEvent[]`) of the loose
`Array<Record<string, unknown>>` the loop already narrows via inline `as {...}` casts
(`improvement-report.ts:97`), so no downstream type changes are needed.

Root cause: `improvement-report.ts` re-implemented a read path that already existed centrally in
`store.ts`, instead of importing it. The correction removes the duplicate rather than teaching it
to call `migrateRecord` itself, so there is exactly one place in the codebase that knows how to
read and normalize a `change.yaml`.

## Alternatives

- **Call `migrateRecord` inside the existing duplicate reader, keep the rest as-is.** Rejected:
  leaves a second, drifting implementation of path resolution and parsing that must be
  re-synchronized by hand every time `store.ts` changes (as already happened once — this bug is
  exactly that drift). Deleting the duplicate is the same line count and removes the recurrence
  risk permanently.
- **Make `generateImprovementReport` swallow `CodepatrolError` from the canonical reader back into
  `null`, to preserve today's "any failure → no trace" behavior exactly.** Rejected: this
  re-creates the silent-corruption-masking problem the assessment flagged as the High-severity
  risk (N4) — a genuinely corrupt `change.yaml` should be loud, not silently reported as an empty
  Change. Only the *missing-file* case is a legitimate "no trace yet" state; a present-but-broken
  file is a real defect the boundary is designed to surface.

## Simplicity decision

- Selected rung: local reuse
- Earlier rungs: no `need`/no-code rung applies (this is a correctness defect in existing code);
  `runtime/stdlib`/`native platform`/`installed dependency` don't apply since the reusable
  capability already exists in-repo (`src/change/store.ts`); no new dependency or native feature
  is required or considered.
- Irreducible complexity: the existence-gated `null` guard in front of the canonical reader — the
  one behavioral difference (`generateImprovementReport` must not throw for a genuinely
  never-started Change) that the canonical `readChangeRecord` does not itself provide.
- Safety floor: reliability (no report generation should crash on legacy data), correctness
  (stats must reflect the real event stream), and clear-failure (corruption must not be silently
  hidden) all remain mandatory and are exactly what this change restores.
- Expected surface delta: 1 file modified (`src/change/improvement-report.ts`: −10/+5 lines
  net, one new import, two deleted); 1 test file modified (`src/change/improvement-report.test.ts`:
  two new test cases added); no new files, no new dependencies, no public interface change (the
  module's exported `generateImprovementReport`/`ImprovementReport` signatures are unchanged).

## Deferred constraints

None — the fix fully closes the identified gap for both known failure modes (legacy stage name,
corrupt file) within its bounded scope; there is no accepted ceiling being deferred.

## Compatibility and rollout

- Migration: none required. `migrateRecord` already normalizes legacy records at read time; no
  on-disk `change.yaml` needs rewriting.
- Compatibility: `ImprovementReport`'s shape is unchanged; only the accuracy of `perStage`/
  `totalAttempts` for legacy-stage Changes improves, and only a genuinely corrupt file's failure
  mode changes (from silent empty report to thrown `CodepatrolError`, matching the rest of the
  codebase).
- Observability: unaffected — no new logging surface introduced.
- Rollback: revert the single commit; no data migration to undo.
- Operational impact: none — this only affects `close` stage improvement-report generation, a
  best-effort artifact, not the Change lifecycle's gating logic.

## Risks and mitigations

- Risk: a genuinely present Change with an already-slightly-malformed `change.yaml` (e.g. one
  that would have silently produced "no trace" before) now makes the Close stage's report
  generation throw, potentially blocking Close. Mitigation: `generateImprovementReport`'s only
  caller (`orchestrator.ts:409`) runs during Close, after the same Change's `change.yaml` has
  already been read and validated earlier in that same transition via the canonical path — so a
  `change.yaml` that would newly throw here would already have thrown earlier in the transition,
  before reaching this call. This is confirmed, not merely argued, in Apply by exercising the
  full Close transition test suite (`src/change/close-integration.test.ts` and friends) unchanged.
- Risk: the two on-disk legacy-`"finalize"` Changes could exhibit a subtly different report after
  the fix (their `close`-stage counts will increase). Mitigation: this is the intended correction,
  not a regression; no test currently pins the old (wrong) counts for those specific Changes.

## Acceptance criteria

- AC-1: Given a `change.yaml` with an event whose `stage` is the legacy value `"finalize"`,
  `generateImprovementReport` produces a report whose `perStage.close` (not `perStage.finalize`)
  reflects that event, and `perStage.finalize` is absent from the result.
- AC-2: Given a `change.yaml` file that exists but fails to parse (invalid YAML) or fails
  `assertChangeRecord`, calling `generateImprovementReport` throws a `CodepatrolError` (matching
  the canonical `readChangeRecord`'s error), rather than returning an empty-shape report.
- AC-3: Given a workspace with no `change.yaml` for the given `workId` at all,
  `generateImprovementReport` still returns the existing empty-shape report with the "No trace
  available for this Change." recommendation and does not throw (`improvement-report.test.ts:63-74`
  continues to pass unmodified).
- AC-4: `src/change/improvement-report.ts` no longer imports `yaml` directly, and its only
  `change.yaml` read path is the canonical `readChangeRecord` from `src/change/store.ts`.
- AC-5: `npm run verify` (typecheck, full test suite, build, smoke CLI, skill lint) exits 0.

## Decisions and open questions

- Decided: preserve the "missing file → null, no throw" contract via an explicit `existsSync`
  pre-check on the canonical `changeRecordPath`, rather than having the canonical reader itself
  grow a "tolerate missing" mode — keeps `store.ts`'s contract (always throws on missing) uniform
  for every other caller.
- Decided: do not touch the two on-disk legacy-`"finalize"` Change records — `migrateRecord`
  already handles them at read time; rewriting history is out of scope (see Out of scope).
- No open questions remain that could change scope, interfaces, or acceptance.
