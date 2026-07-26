# Plan evidence — shared exact-keys schema guard

All commands re-run fresh during this Plan attempt against `main`@`45ba75a`.

## Full site inventory, re-confirmed

```
$ grep -n "contains unknown field\|cannot own" src/ -r --include="*.ts" | grep -v test
src/change/usage.ts:17
src/change/orchestrator.ts:35
src/change/model.ts:11
src/change/backlog.ts:53,67,77,96
src/change/session.ts:25,26,33
```

9 sites total across 5 files matching the "reject unknown keys" family
(`session.ts:25` is the denylist half of the combined loop, explicitly
excluded per Scope's Out of scope — only `session.ts:26`'s allow-set half
and `session.ts:33`'s independent item-loop are candidates, and only the
latter is a pure single-condition site eligible for the shared helper).

## Byte-identical duplicate confirmed by direct comparison

```
$ sed -n '34,36p' src/change/orchestrator.ts
function exactInput(value: Record<string, unknown>, allowed: string[], label: string): void {
	for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new CodepatrolError("INVALID_ARGUMENT", `${label} contains unknown field ${key}.`, 2);
}

$ sed -n '10,12p' src/change/model.ts
function exactKeys(value: object, allowed: string[], label: string): void {
	for (const key of Object.keys(value)) if (!allowed.includes(key)) invalid(`${label} contains unknown field ${key}.`);
}
```

Loop bodies are structurally identical (`Object.keys` + `includes` +
throw); only the error-throwing path differs (`exactInput` inlines
`INVALID_ARGUMENT`/2; `exactKeys` delegates to `invalid()`, which always
uses `CHANGE_INVALID`/4 and prepends a `CHANGE_INVALID: ` text prefix).

## Call-site counts (governs the "8 call sites unchanged" AC-2 claim)

```
$ grep -c "exactInput(" src/change/orchestrator.ts
5   # 1 definition + 4 calls
$ grep -c "exactKeys(" src/change/model.ts
5   # 1 definition + 4 calls
```

4 + 4 = 8 combined call sites across the two functions, none of which the
plan's task steps modify (only the two function bodies change).

## `allowed` parameter shape per site (governs `assertExactKeys`'s union type)

```
$ sed -n '37,40p' src/change/backlog.ts
const ALLOWED_ITEM_KEYS = new Set([...]);
const ALLOWED_SOURCE_KEYS = new Set([...]);
const ALLOWED_EXTERNAL_REF_KEYS = new Set([...]);
const ALLOWED_ROOT_KEYS = new Set([...]);
```

`backlog.ts` and `session.ts`'s local `allowed` (line 32) both use `Set`;
`orchestrator.ts`, `model.ts`, `usage.ts` all use array literals/params —
confirmed by reading every call site directly, not inferred from type
signatures alone. `assertExactKeys`'s `readonly string[] | ReadonlySet<string>`
union accepts both without requiring any call site to convert its existing
data structure.

## Message-prefix inconsistency, confirmed present and preserved

```
$ grep -n "CHANGE_INVALID: Backlog" src/change/backlog.ts
53: ... CHANGE_INVALID: Backlog item ${itemId} source contains unknown field ...
67: ... CHANGE_INVALID: Backlog item ${itemId} externalRef contains unknown field ...
96: ... CHANGE_INVALID: Backlog root contains unknown field ...
```

Line 77 (`validateItem`) has no such prefix — confirmed by reading it
directly (`Backlog item at index ${index} contains unknown field ${key}.`).
This is a genuine pre-existing inconsistency within the same file, not a
transcription error in this evidence — preserved exactly per spec's
Alternatives (not normalized).

## Import shape per consumer (confirms every import change is an extension,
never a new line)

```
$ grep -n "shared/errors" src/change/orchestrator.ts src/change/model.ts src/change/backlog.ts src/change/session.ts src/change/usage.ts
orchestrator.ts:4:import { CodepatrolError } from "../shared/errors.js";
model.ts:1:import { CodepatrolError } from "../shared/errors.js";
backlog.ts:4:import { CodepatrolError } from "../shared/errors.js";
session.ts:5:import { CodepatrolError } from "../shared/errors.js";
usage.ts:1:import { CodepatrolError } from "../shared/errors.js";
```

All five already import `CodepatrolError` — every T2-T6 import edit
extends an existing line.

## Layering re-confirmation

`src/shared/errors.ts` read in full: exports only `ErrorCode`,
`CodepatrolError`, `operationalError`; no import from `change/` anywhere in
the file. Adding one pure function introduces no new dependency edge.

## Precedent

`2026-07-26-centralize-codepatrol-paths` and
`2026-07-26-remove-dead-path-builders` (both closed) are the direct
precedent for this Change's discipline: keep existing function names as
thin wrappers where call sites are numerous, task-per-file with a test
gate after every task, explicit DC entries for anything adjacent but out
of scope rather than scope creep. `2026-07-26-architecture-assessment-v3`'s
"Considered, not filed" section (for the very duplication this Change now
fixes, at a 2-site count) is the precedent for this Change's own "Noted,
not filed" treatment of the adjacent `requireObject`-family idiom.
