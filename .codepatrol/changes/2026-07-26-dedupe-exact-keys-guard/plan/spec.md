# Specification — Extract a shared exact-keys schema guard, parameterized on error code

## Intent

- Origin: improve-codebase
- Mode: architecture
- Target baseline: `main` @ `45ba75a` (branch `codepatrol/2026-07-26-dedupe-exact-keys-guard`), clean tree, `npm run verify` green (215/215)
- Governing constraints: same behavior-preservation discipline as the two immediately preceding architecture Changes on this backlog (`2026-07-26-remove-dead-path-builders`, `2026-07-26-centralize-codepatrol-paths`) — byte-identical error output, proven by the test suite, task-per-file with a gate after every task.
- Substrate state: graph not re-synced — the exact call sites were located by direct `grep`/read during `2026-07-26-src-structure-revalidation` and re-verified fresh during this Plan attempt.
- Improvement signals (from `.codepatrol/docs/improvement-reports/2026-07-26-centralize-codepatrol-paths.md`, most recent by mtime): `change.session` invocation count (24) and a recurring "session item(s) claimed but never closed" note — both generic lifecycle telemetry, already tracked as their own backlog item (`session-item-s-claimed-but-never-closed-...`), not actionable for this Change's scope.
- Problem: the "reject any object key not in an explicit allow-set" idiom is hand-rolled 11 times across 5 files in `src/change/`, including two **byte-identical private functions under different names** (`orchestrator.ts`'s `exactInput` and `model.ts`'s `exactKeys`). This is backlog item S2, filed by `2026-07-26-src-structure-revalidation`.
- Outcome: `shared/errors.ts` gains one exported `assertExactKeys` helper, parameterized on the `ErrorCode`/exit-code pair each site needs (`INVALID_ARGUMENT`/2 for CLI-boundary input in `orchestrator.ts`; `CHANGE_INVALID`/4 for persisted-record schema validation everywhere else). `exactInput` and `exactKeys` become thin, differently-parameterized wrappers around the one shared implementation (preserving their names and every existing call site unchanged); the remaining seven inline sites call the shared helper directly. Every thrown error's code, exit code, and message text remains byte-identical to today's, including a pre-existing inconsistency (some messages redundantly prefix "CHANGE_INVALID: " onto their own text, some do not) — that inconsistency is preserved exactly, not normalized, since normalizing it would change observable message text and is a different, unfiled concern.

## Scope

### In scope

- Add `assertExactKeys(value, allowed, label, code?, exitCode?)` to `src/shared/errors.ts`.
- Redirect `orchestrator.ts`'s `exactInput` and `model.ts`'s `exactKeys` to thin-wrap the shared helper (names, signatures, and all existing call sites unchanged).
- Redirect the five `backlog.ts`/`session.ts` inline sites (`backlog.ts` ×4: `validateSource`, `validateExternalRef`, `validateItem`, `validate`; `session.ts` ×1: the per-item key loop inside `validate`) to call the shared helper directly.
- Redirect all three `usage.ts` `validateRun` inline sites (the run, measured-characters, and unavailable-characters allow-sets) to call the shared helper directly.

### Out of scope

- `session.ts:25`'s `forbidden.has(key)` check (the `Stage Session cannot own ${key}` denylist) — this lives in the **same `for` loop** as the allow-set check at `session.ts:26`, but is a structurally different idiom (denylist vs. allow-set) with its own message. Splitting the combined loop into "check forbidden for all keys, then check allowed for all keys" would change **which error fires first** when an input has both an unknown key and a forbidden key in a specific order — a real, if obscure, behavior change forbidden by this Change's byte-identical discipline. Left untouched.
- The adjacent "value must be a non-null, non-array object" idiom (e.g. `orchestrator.ts`'s `requireObject`, the `if (!x || typeof x !== "object" || Array.isArray(x))` guards throughout `backlog.ts`/`model.ts`) — a different, related-but-distinct validation concern from "reject unknown keys"; not part of S2's filed evidence. Noted, not filed (see below).
- Normalizing the pre-existing "CHANGE_INVALID: " message-prefix inconsistency (present in `model.ts`'s `invalid()` helper and three of `backlog.ts`'s four sites; absent from the fourth `backlog.ts` site, `session.ts`, and `usage.ts`) — preserved exactly as evidence requires; normalizing it changes observable message text for zero behavioral gain and is outside S2's filed scope.
- S3 (CLI registry), S4 (`link.ts` coverage), N2 (test coverage), F2 (redundant validators) — independent, already-filed backlog items, unrelated files or concerns.

### Noted, not filed

The "require non-null, non-array object" guard (`requireObject` in `orchestrator.ts`; inlined 5+ times across `backlog.ts`/`model.ts`) is a second, adjacent duplication of similar shape to S2. Not filed as a new backlog item: S2's own evidence never named it, folding it in now would be scope creep on an already-approved backlog title, and a future assessment pass (or a maintainer noticing it directly) is better positioned to evidence and prioritize it on its own terms — matching this session's established discipline of not manufacturing backlog items beyond what was actually evidenced (`2026-07-26-architecture-assessment-v3`'s "Considered, not filed" section is the direct precedent for this call).

## Current evidence

All sites re-verified fresh against `main`@`45ba75a` during this Plan attempt via `grep -n "contains unknown field\|cannot own" src/ -r --include="*.ts" | grep -v test`.

- `src/change/orchestrator.ts:34-36` — `exactInput(value, allowed, label)`: `for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new CodepatrolError("INVALID_ARGUMENT", \`${label} contains unknown field ${key}.\`, 2);`. Called 4 times: `assertStartInput` (line 42), `assertTransitionIntent` (line 56), the artifact-binding validator (line 67), `assertCloseInput` (line 77).
- `src/change/model.ts:6,10-12` — `invalid(message)` (`throw new CodepatrolError("CHANGE_INVALID", \`CHANGE_INVALID: ${message}\`, 4)`) and `exactKeys(value, allowed, label)` (`for (const key of Object.keys(value)) if (!allowed.includes(key)) invalid(\`${label} contains unknown field ${key}.\`);`) — **byte-identical loop body to `exactInput`**, only the throw path differs (fixed `CHANGE_INVALID`/4 via `invalid()`, vs. `exactInput`'s fixed `INVALID_ARGUMENT`/2 inline). Called 4 times: the artifact-binding loop (line 18), `assertChangeRecord`'s record check (line 29) and identity check (line 31), the event-shape check (line 78).
- `src/change/backlog.ts:53,67,77,96` — four inline sites, each a single-use function-local loop, no wrapper: `validateSource` (message pre-fixed `CHANGE_INVALID: Backlog item ${itemId} source ...`), `validateExternalRef` (pre-fixed `CHANGE_INVALID: Backlog item ${itemId} externalRef ...`), `validateItem` (**not** pre-fixed: `Backlog item at index ${index} ...`), `validate`/root (pre-fixed `CHANGE_INVALID: Backlog root ...`). All four use a module-level `Set<string>` (`ALLOWED_SOURCE_KEYS`, `ALLOWED_EXTERNAL_REF_KEYS`, `ALLOWED_ITEM_KEYS`, `ALLOWED_ROOT_KEYS`, `.has(key)`), not an array (`.includes(key)`) — confirmed by reading their declarations at lines 37-40.
- `src/change/session.ts:32-33` — inside the per-item loop of `validate`: `const allowed = new Set([...]); for (const key of Object.keys(item)) if (!allowed.has(key)) throw new CodepatrolError("CHANGE_INVALID", \`Session item ${item.id ?? "?"} contains unknown field ${key}.\`, 4);` — a local `Set`, not pre-fixed. This site is independent of the `forbidden`/`keys` combined loop at lines 24-27 (Out of scope, above) — different function scope, different `allowed` set, no shared state between them.
- `src/change/usage.ts:17,28,33` — inside `validateRun`: the run allow-set, measured-characters allow-set, and unavailable-characters allow-set each use an inline array literal and throw `CHANGE_INVALID`/4. Their labels are respectively `Run`, `Measured characters`, and `Unavailable characters`; all three must delegate without changing message text.
- All five files (`orchestrator.ts`, `model.ts`, `backlog.ts`, `session.ts`, `usage.ts`) already import `CodepatrolError` from `../shared/errors.js` (confirmed by `grep -n "shared/errors" src/change/*.ts`) — every consumer-side change in this Change extends an existing import line; none needs a new one.
- Layering: `shared/errors.ts` currently exports only the `ErrorCode` type, `CodepatrolError` class, and `operationalError` function (read in full) — adding one pure validation function introduces no new dependency and no change to `shared/`'s zero-dependency-on-`change/` layering rule (already re-confirmed twice by the two preceding Changes on this backlog).

## Proposed design

Add to `src/shared/errors.ts`:

```typescript
export function assertExactKeys(value: object, allowed: readonly string[] | ReadonlySet<string>, label: string, code: ErrorCode = "CHANGE_INVALID", exitCode: 2 | 4 = 4): void {
	const isAllowed = (key: string) => Array.isArray(allowed) ? allowed.includes(key) : (allowed as ReadonlySet<string>).has(key);
	for (const key of Object.keys(value)) if (!isAllowed(key)) throw new CodepatrolError(code, `${label} contains unknown field ${key}.`, exitCode);
}
```

Defaults match the majority case (`CHANGE_INVALID`/4, used by 4 of 5 consumer files); `orchestrator.ts` is the sole caller that overrides both to `INVALID_ARGUMENT`/2. The `allowed` parameter accepts either an array (`orchestrator.ts`, `model.ts`, `usage.ts`'s current shape) or a `Set` (`backlog.ts`, `session.ts`'s current shape) so every call site passes its existing `allowed` value unchanged — no site needs to convert its data structure.

Redirected wrappers (names/signatures/call sites unchanged):

```typescript
// orchestrator.ts
function exactInput(value: Record<string, unknown>, allowed: string[], label: string): void {
	assertExactKeys(value, allowed, label, "INVALID_ARGUMENT", 2);
}
```

```typescript
// model.ts
function exactKeys(value: object, allowed: string[], label: string): void {
	assertExactKeys(value, allowed, `CHANGE_INVALID: ${label}`, "CHANGE_INVALID", 4);
}
```

(`exactKeys`'s wrapper bakes the `CHANGE_INVALID: ` prefix into the label it forwards, reproducing exactly what its current `invalid()`-based body produces — `invalid()` itself is untouched and keeps its other caller, the `Unknown event type` check in `model.ts`.)

Direct calls (no wrapper, each site already lives inside its own single-purpose function) for the seven remaining sites, each passing exactly the label string that reproduces today's message byte-for-byte (three of `backlog.ts`'s four sites and `model.ts`'s wrapper are the only places the "CHANGE_INVALID: " text prefix appears; `backlog.ts`'s fourth site, `session.ts`, and all three `usage.ts` sites pass a label with no such prefix, preserving the existing inconsistency exactly).

## Alternatives

- **Also normalize the message-prefix inconsistency while touching every site anyway:** rejected — changes observable error text for zero behavioral gain, outside this Change's byte-identical discipline and outside S2's filed evidence (which named the duplicated *logic*, not the *message inconsistency*, as the defect).
- **Also fold in the `requireObject`/"must be an object" idiom, since it is adjacent and touches the same functions:** rejected — see Scope's Noted, not filed; a different-shaped duplication not named by S2's evidence, and bundling it would let this Change's diff grow past what was actually scoped and reviewed as S2.
- **Split `session.ts:24-27`'s combined forbidden+allowed loop into two separate loops so its allow-set half can also use the shared helper:** rejected — see Scope's Out of scope; the two checks currently share key-iteration order, and splitting them changes which error fires first for an input violating both, a genuine (if narrow) behavior change.
- **Delete `exactInput`/`exactKeys` entirely and rewrite their ~8 call sites to call `assertExactKeys` directly:** rejected — this repo's established pattern (used by every prior architecture Change on this backlog) is to keep an existing function's name/signature and redirect only its body when eliminating internal duplication, specifically to avoid touching N call sites when 1 body edit suffices; `exactInput`/`exactKeys` together have 8 call sites across two files, all of which stay untouched under the wrapper approach.

## Simplicity decision

- Selected rung: direct local change
- Earlier rungs: not applicable — there is no lighter mechanism between "keep 11 independent implementations" and "name the shared logic once, parameterize the two things that legitimately differ (error code, exit code)."
- Irreducible complexity: the code/exit-code parameterization is real, load-bearing variation (CLI-boundary input rejection vs. persisted-record schema rejection genuinely use different error taxonomies in this codebase) — the helper's two optional parameters exist because the `orchestrator.ts` call sites require a distinct error code and exit code, not speculatively.
- Safety floor: byte-identical error `code`, `exitCode`, and message text for every one of the 11 sites, verified by the unchanged 215-test suite after every task, not assumed from the substitution being "obviously" safe.
- Expected surface delta: `shared/errors.ts` (+~5 lines, one new export); `orchestrator.ts` (~2 lines, `exactInput`'s body only); `model.ts` (~2 lines, `exactKeys`'s body only); `backlog.ts` (~4 lines, one per site); `session.ts` (~1 line); `usage.ts` (~3 lines, one per site). No new files, no dependency, no public interface removed.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | `session.ts:24-27`'s combined forbidden+allowed loop is left untouched, not migrated to the shared helper | If a similar combined denylist+allowlist pattern appears elsewhere, this file's loop remains a one-off exception | A future Change needs to add a second denylist+allowlist combination and finds no shared pattern to reuse | Extend `assertExactKeys` (or add a sibling `assertNoForbiddenOrUnknownKeys`) at that point, informed by the second real occurrence rather than speculatively now for one |
| DC-2 | The "must be a non-null, non-array object" idiom (`requireObject` and its ~5 inline counterparts) is not consolidated in this Change | The codebase retains a second, unaddressed class of validation duplication of similar shape to S2 | A future architecture pass or maintainer names it directly, the way S2 itself was named | File it as its own backlog item with its own evidence at that point, following the same one-finding-per-Change discipline this Change itself follows |

## Compatibility and rollout

- No migration: every thrown error's `code`, `exitCode`, and message text is unchanged; this only changes *where* the "reject unknown keys" logic is implemented, not what it produces.
- No config, schema, event, or checkpoint change.
- Rollback: revert the single commit (or per-task commits); every touched site reverts to its current inline or wrapper form, behavior-identical either way.
- Observability: not applicable — no runtime-visible behavior change.

## Risks and mitigations

- Risk: a subtle mismatch between an old inline message and its new `assertExactKeys` call (wrong label, wrong code, wrong exit code) silently changes a produced error. Mitigation: every site's exact before/after is stated character-for-character in this spec and the plan's task steps, cross-checked against the current source before writing either document; `npm test` after every task is the empirical proof.
- Risk: `assertExactKeys`'s `allowed: readonly string[] | ReadonlySet<string>` union accepts either shape but a future caller could pass neither correctly. Mitigation: `tsc --noEmit` is part of the gate run after every task; a type mismatch at any of the 11 sites (all of which pass an already-correctly-typed `string[]` or `Set<string>` today) would fail to compile, not silently misbehave at runtime.
- Risk: `session.ts:24-27` and `requireObject`-family duplication remain unaddressed, visible as "the fix is incomplete" to a future reader. Mitigation: both are explicit Deferred Constraints with named triggers and upgrade paths, not silently omitted — matching this Change's own precedent for how DC-1/DC-2 were handled in `2026-07-26-centralize-codepatrol-paths`.

## Acceptance criteria

- AC-1: `src/shared/errors.ts` exports `assertExactKeys` with the exact signature `(value: object, allowed: readonly string[] | ReadonlySet<string>, label: string, code?: ErrorCode, exitCode?: 2 | 4) => void`, defaulting to `("CHANGE_INVALID", 4)`.
- AC-2: `orchestrator.ts`'s `exactInput` and `model.ts`'s `exactKeys` are no longer byte-identical to each other in body — each delegates to `assertExactKeys` with its own fixed code/exit-code arguments — while every one of their 8 combined existing call sites is unchanged (confirmed by `git diff` showing zero lines changed at any call site, only at the two function bodies).
- AC-3: `grep -n "for (const key of Object.keys" src/change/orchestrator.ts src/change/model.ts src/change/backlog.ts src/change/session.ts src/change/usage.ts` returns exactly one match total across all five files (the `session.ts:24-27` combined loop, explicitly out of scope) — every other "reject unknown keys" loop, including all three in `usage.ts`, is replaced by a call to `assertExactKeys`.
- AC-4: `npm run verify` (typecheck + full test suite + build + smoke-cli + lint-skills) passes with the identical test count as the base commit (215/215, 0 failures) — proving byte-identical error behavior, not merely that it compiles.
- AC-5: `git diff --stat` against this Change's base commit touches exactly six files: `src/shared/errors.ts`, `src/change/orchestrator.ts`, `src/change/model.ts`, `src/change/backlog.ts`, `src/change/session.ts`, `src/change/usage.ts` — no test file requires modification (pure internal refactor; the existing suite is the characterization).

## Decisions and open questions

- Decision: keep `exactInput`/`exactKeys` as named wrappers rather than deleting them and rewriting 8 call sites — see Alternatives.
- Decision: `session.ts:24-27`'s combined loop and the `requireObject`-family idiom are both explicitly out of scope, recorded as DC-1/DC-2 rather than silently omitted or scope-crept into this Change.
- Decision: the pre-existing "CHANGE_INVALID: " message-prefix inconsistency is preserved exactly, not normalized — see Alternatives.
- No open questions remain that could change scope, interfaces, or acceptance.
