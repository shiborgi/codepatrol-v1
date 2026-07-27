# Investigation — persona checkpoint artifact ownership and hash validation

## Baseline and method

- Change: `2026-07-27-persona-checkpoint-artifact-validation`
- Target: `main` at `5698a92330832ecf0b991892dd5c9a82c897bff4`
- Source: GitHub issue #18 / backlog id
  `persona-review-and-verify-checkpoints-skip-artifact-ownership-and-sha-validation-before-committing-submitted-paths`,
  filed as a `plan-followup` from `2026-07-27-src-architecture-audit`,
  selected as the next-most-critical p1 item after
  `2026-07-27-trace-path-workspace-containment` (path traversal, already
  fixed and closed) — this is the only remaining p1 item with a direct
  integrity/security impact rather than a concurrency race or recovery gap.
- Graph: synced clean at baseline (76 files, 3 re-extracted from the
  preceding Change, 0 removed).
- Gate: `npm run verify` green at baseline before this investigation began
  (242 tests, matching main's state after the trace-path fix).

## The vulnerable seam

`src/change/orchestrator.ts:254-298`, `buildCheckpointEvent`:

```typescript
const personaCheckpoint = persona && (intent.stage === "review" || intent.stage === "verify");
const missing = personaCheckpoint ? [] : required[intent.stage].filter(...);
if (missing.length) throw ...;
if (!personaCheckpoint) await validateWorkspaceArtifacts(git, workspace, record, intent.stage, intent.artifacts, undefined, options.signal);
const paths = [...intent.artifacts.filter(...).map(...), ...(intent.changes ?? [])]; paths.forEach(ensurePath);
const allowed = new Set([...paths, ...]);
...
if (unexpected.length && !personaCheckpoint) throw ...;
...
if (!personaCheckpoint && JSON.stringify(actualProduction) !== JSON.stringify(declaredProduction)) throw ...;
...
const checkpoint = await git.commit(..., committedPaths); // stages and commits whatever `paths` names, unconditionally
```

`validateWorkspaceArtifacts` → `validateStageArtifacts` →
`validateArtifactBindings` → `validateWithReader`
(`src/change/validation.ts:23-41`) is the ONLY code path that checks, per
declared artifact binding: (a) `binding.path.startsWith(prefix)` — the
artifact belongs to the current stage's own directory
(`.codepatrol/changes/<workId>/<stage>/`); (b) `shaBuffer(content) !==
binding.sha256` — the declared hash actually matches the file's real
content; (c) create/modify/delete consistency against the recorded
baseline. For a persona checkpoint (`intent.stage` is `review` or `verify`
**and** the caller supplies a `persona` field — the coordinator/agent
pattern documented in `codepatrol-review`/`codepatrol-verify`'s own SKILL.md
for parallel personas like `review-security`, `review-architecture`), this
entire function call is skipped. None of (a), (b), or (c) is checked.
`buildCheckpointEvent` then stages (`git.add`) and commits
(`git.commit(..., committedPaths)`) exactly the paths the caller declared,
with no independent verification that those paths or their claimed
content-hashes are legitimate.

`src/change/model.ts:112-128`, the fold for `stage-checkpointed`: for a
persona event (`ckptPersona` truthy), `current().status = "active"; break;`
— the event's `artifacts` array is **not** assigned onto the attempt's
projected `artifacts` field at all (`Object.assign(current(), {...,
artifacts: event.artifacts, ...})` only runs for the non-persona branch).
The persona's declared bindings exist solely in the raw, append-only event
log — they are invisible to `ChangeView.attempts[stage][].artifacts` and to
any later validation that reads that projected field
(`validateRefArtifacts`/`validateAcceptedRefArtifacts`, used by Verify's
fresh-eyes re-check of prior stages' accepted artifacts). A forged hash
recorded in a persona's checkpoint event is therefore never checked by any
code path, at any point in the Change's lifecycle.

## Reproduced exploits (real orchestrator, disposable sandbox repositories)

All three reproductions ran `startChange`/`transitionChange` directly from
`src/change/orchestrator.ts` against a freshly initialized, disposable git
repository in the OS temp directory (the same harness pattern
`orchestrator-parallel.test.ts` already uses) — never against this
repository's own workspace. Each sandbox was deleted immediately after
confirming and recording its result.

**Exploit A — cross-stage production-file injection: blocked (existing
defense confirmed, not a gap).** Attempted to declare a persona artifact at
a real production path (`src/change/rogue.ts`, outside
`.codepatrol/changes/<id>/` entirely) during a Review persona checkpoint.
Result: rejected with `CHANGE_CONFLICT: Checkpoint commit does not match
its declared artifact and production paths.` — the unconditional final
check at `orchestrator.ts:296-297` (`finalProduction` vs
`declaredProduction`, which runs for every checkpoint including persona
ones) already catches this, because `intent.changes` (the only path by
which a path outside the change directory could be declared as
"production") is validated by `model.ts:116-118` to be Apply-only
(`"Only Apply checkpoints may declare production changes."`). This
confirms the production/source-code boundary is already sound; the real
gap is narrower and lives entirely inside
`.codepatrol/changes/<workId>/`.

**Exploit B — forged content hash accepted and permanently recorded.**
A Review persona (`review-security`) checkpointed a real, legitimately-owned
artifact (`review/findings-security.md`, real content
`"real security findings\n"`) but declared `sha256:
"ffff...ffff"` (64 `f` characters) instead of the file's actual hash
(`490755...`). The checkpoint was accepted with no error. The forged hash
is now the permanent, immutable record in `change.yaml`'s event log for
that persona's finding — any later reader trusting `event.artifacts[].sha256`
as proof of exactly what content was reviewed is deceived, with nothing in
the system able to detect or flag the mismatch after the fact.

**Exploit C — cross-stage-directory content injection, before that stage
has even begun.** A Review persona (`review-security`) checkpointed a
declared artifact at `.codepatrol/changes/<id>/apply/journal.md` — a path
under a *different* stage's own directory, one Review has no ownership of,
for a stage (`apply`) that had not even started yet. The checkpoint was
accepted with no error, and `git show --stat HEAD~1` (the checkpoint's own
content commit) confirms the file was actually created and committed:
`.codepatrol/changes/<id>/apply/journal.md | 1 +`. Nothing in the system
rejected this stage-directory-ownership violation, because the one function
that checks `binding.path.startsWith(prefix)` — the ownership check — was
never called for this persona checkpoint.

## Confirmed scope boundary: what is *not* broken

- `finalProduction`/`declaredProduction` equality (`orchestrator.ts:296-297`)
  runs unconditionally (no `personaCheckpoint` guard) and, combined with
  `model.ts`'s Apply-only restriction on `intent.changes`, already prevents
  any checkpoint — persona or not — from smuggling a change to a real
  production/source path. Exploit A confirms this defense is real, not
  assumed.
- The "undeclared worktree paths" check (`orchestrator.ts:268-269`) and the
  `actualProduction`/`declaredProduction` mid-flight check
  (`orchestrator.ts:270-271`) are intentionally skipped for persona
  checkpoints for a legitimate reason unrelated to this defect: after an
  earlier persona's checkpoint, its already-committed artifact remains part
  of the changed-paths delta since `baselineRef`, and a later sibling
  persona's checkpoint would otherwise false-positive on that sibling's
  file as an "unexpected" path. This is confirmed by tracing
  `orchestrator-parallel.test.ts`'s existing two-persona-plus-consolidation
  test, which depends on exactly this tolerance to pass. This Change does
  not touch either check.
- The "required artifact" check (`orchestrator.ts:262`, `missing[]`) is
  correctly persona-exempt for the same structural reason: personas use
  freeform filenames (`findings-<persona>.md`), not the single canonical
  `report.md`/`journal.md` the consolidating checkpoint must declare. This
  Change does not touch this check.

## Precise gap and its fix seam

The gap is isolated to exactly one thing: `validateWorkspaceArtifacts`
(and beneath it, `validateStageArtifacts` →
`validateArtifactBindings` → `validateWithReader`,
`src/change/validation.ts:23-50`) is not called at all for a persona
checkpoint. That function actually performs two logically distinct checks
in one pass:

1. **Per-binding checks** (`validateWithReader:27-38`): ownership prefix,
   hash match, and create/modify/delete-vs-baseline consistency. These
   check only the bindings the *current* call declares — they have no
   dependency on any other file's presence and are safe to run for a
   persona checkpoint exactly as-is.
2. **Completeness check** (`validateWithReader:39`): every file currently
   present under the stage's directory must be declared by *this specific
   call*. This is the one part genuinely incompatible with incremental
   multi-persona commits, confirmed by tracing exactly why the original
   author bypassed the whole function rather than a narrower part of it —
   persona 2's checkpoint would otherwise see persona 1's already-committed
   sibling file and flag it as "undeclared."

No other backlog-filed finding shares this file or seam; this is a
minimal, correctly-scoped, standalone fix.
