# Plan evidence — centralizing `.codepatrol/` path-layout knowledge

All commands re-run fresh during this Plan attempt against `main`@`2e6549c`
(not carried forward from `2026-07-26-src-structure-revalidation`'s
evidence, gathered against an earlier commit).

## Full literal inventory, re-confirmed

```
$ grep -n '"\.codepatrol/\|`\.codepatrol/' src/change/orchestrator.ts src/change/validation.ts src/change/session.ts src/change/store.ts src/change/backlog.ts src/shared/state.ts
```

Output cross-checked line-by-line against the exact code shown in
`spec.md`'s Current evidence and `plan.md`'s task steps — every citation in
both documents was copy-verified from this grep's actual output, not
retyped from memory of the prior assessment.

## Scope boundary check — no other production file

```
$ grep -rn '\.codepatrol/backlog\|\.codepatrol/changes\|\.codepatrol/runtime' src/ --include="*.ts" | grep -v "\.test\.ts" | grep -v -e state.ts -e orchestrator.ts -e validation.ts -e session.ts -e store.ts -e backlog.ts
src/change/git.test-helper.ts:15-16  (test fixture helper, not production source)
src/graph/store.ts:4                 (docblock comment, not code)
src/graph/store.ts:133               (metadata string value, write-only, never read back as a path)
```

Confirms the six-file touch list in `spec.md`'s Scope is exhaustive for
production path-construction sites; the three exclusions are each
individually justified in Scope's Out of scope / DC-1/DC-2.

## Existing import shape per consumer (governs whether T2-T6 add a new
import line or extend one)

```
$ head -10 src/change/backlog.ts   # no shared/state.js import
$ head -10 src/change/validation.ts # no shared/state.js import
$ head -10 src/change/session.ts    # line 7: import { stageSessionPath } from "../shared/state.js";
$ head -30 src/change/orchestrator.ts # no shared/state.js import (imports from ./store.js, ./backlog.js, ./validation.js instead)
```

`session.ts` is the only file needing an import *extension* rather than a
new line; the plan's T5 step 1 reflects this exactly.

## `relativeRecord` call-site count (governs the "zero external call sites
change" claim)

```
$ grep -c "relativeRecord(" src/change/orchestrator.ts
```

15 call sites within the file, all passing a `workId`/`string` argument and
expecting a relative path string back — confirms keeping `relativeRecord`'s
name and signature (only redirecting its one-line body) is required to
avoid a much larger diff, and is sufficient since every caller's usage
pattern is identical.

## `buildCheckpointEvent`'s two `.startsWith` sites (governs plan.md T6
step 9's "exactly two occurrences" claim)

```
$ grep -c '!path.startsWith(`\.codepatrol/changes/\${workId}/`) && !path.startsWith("\.codepatrol/backlog/")' src/change/orchestrator.ts
2
```

Confirmed exactly two, both inside `buildCheckpointEvent` (the
`actualProduction` line and the `finalProduction` line), none elsewhere in
the file.

## Layering re-confirmation

```
$ head -1 src/shared/state.ts
import { resolveInside } from "./workspace.js";
```

`shared/state.ts` imports only from `./workspace.js` (another `shared/`
module) — confirms adding `change/*.ts → shared/state.js` import edges
introduces no new cross-module dependency direction; `change → shared` is
already the established edge (`2026-07-26-src-structure-revalidation`'s
dependency matrix: 24 existing imports along it, zero in the reverse
direction).

## Precedent

`2026-07-26-decompose-transition-change` (closed, `main`@`5f569db`) is the
direct precedent for touching `orchestrator.ts` with a
behavior-preservation-only discipline: task-per-concern, `npm test` after
every step, extra scrutiny where the file's history warrants it. Its
`plan.md` was re-read to confirm this Change's T6 sub-step structure
(aligned to `orchestrator.ts`'s own existing function boundaries:
early-helpers / `buildCheckpointEvent` / `closeChangeLocked`) follows the
same shape.
