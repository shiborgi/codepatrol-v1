# Plan evidence — whole-codebase architecture scan

Verified by direct commands run during this Plan attempt. All paths
relative to repo root, checked against `main` @ `264e87e`.

## Substrate

```
$ codepatrol graph sync
scanned: 73, extracted: 9, unchanged: 64, files: 73, symbols: 2119
edges: imports 416, calls 4370, inherits 18, tests 153
```

No `docs/adr/` directory exists (confirmed absent; by design, per
`docs/runtime-state.md` and this repo's 0-ADR-across-24-Changes history).

## Dead-export scan method

A scratch Python script (`/private/tmp/.../find_dead_exports.py`, not
committed) collected every `export function|const|class|interface|type`
declaration across all non-test `.ts` files under `src/` (215 total), then
searched every file (including tests) for a second textual occurrence of
each name outside its own declaration line. Two hits:

```
DEAD: changeDirectory (src/change/store.ts:11)
DEAD: changeRoot (src/shared/state.ts:17)
```

Both independently re-confirmed by direct `grep -rn "changeDirectory\b"
src/` and `grep -rn "changeRoot\b" src/` — each returns only its own
declaration line, zero other matches.

An earlier, cruder shell-only version of this script produced 22 false
positives (excluding same-file usages that happened to sit on a line also
containing the word "export", e.g. `export type ChangeEvent =
ChangeStartedEvent | ...`). Discarded once the bug was found; the Python
version fixes it by excluding only the exact declaration line number, not
every line containing "export" in the declaring file. Noted here because
the false-positive run is why F1's evidence emphasizes "re-confirmed by
direct grep" rather than trusting the script alone (per `_shared/ROLES.md`'s
"graph edges are leads... verify cited locations directly," applied to this
ad-hoc tool the same way).

## F2 evidence, gathered by direct read

`src/change/validation.ts` read in full (64 lines). Confirmed the two-pair
structure (throwing built on non-throwing) by reading every function body,
not inferring from names. Import-site confirmation:

```
$ grep -rn "import.*validateArtifactBindingsFromReader" src/
(no output)

$ grep -rn "import.*validateArtifactBindings\b" src/
src/change/change.test.ts:14:import { validateArtifactBindings } from "./validation.js";

$ grep -n "validateStageArtifacts\|validateStageArtifactsFromReader" src/change/orchestrator.ts
16:import { validateStageArtifacts, validateStageArtifactsFromReader, ... } from "./validation.js";
118:	... validateStageArtifacts(workspace, record, stage, bindings, baseline);
130:	validateStageArtifactsFromReader(record, stage, attempt.artifacts, reader, baseline);
```

## v2 reconciliation evidence

```
$ grep -rn "ARTIFACT_INVALID\|WORKFLOW_NOT_FOUND\|WORKFLOW_INVALID\|WORKFLOW_CONFLICT" src/shared/errors.ts
7:	| "ARTIFACT_INVALID"
13:	| "WORKFLOW_NOT_FOUND"
14:	| "WORKFLOW_INVALID"
15:	| "WORKFLOW_CONFLICT"
(zero other files matched — N1 still open)

$ find src -iname "atomic-store.test.ts" -o -iname "languages.test.ts" -o -iname "queries.test.ts"
(no output — N2 still open)

$ awk '/^async function transitionChangeLocked/{start=NR} start && /^}/{print NR-start+1; exit}' src/change/orchestrator.ts
89   # (N3 still open, materially unchanged from v2's ~88)
```

`improvement-report.ts` read in full: single reader path via
`migrateRecord`, no second/duplicate YAML-parsing function present —
confirms N4 resolved (`2026-07-25-remove-duplicate-reader`).

## Layering evidence

```
$ grep -rln "from \"\.\./cli/" src/change/ src/graph/ src/shared/ --include="*.ts"
(no output)

$ grep -rln "from \"\.\./change/" src/graph/ src/shared/ --include="*.ts"
(no output)
```

Confirms clean one-directional layering (cli → change/graph/shared;
change → graph/shared; graph/shared depend on neither cli nor change).

## Namespace-hygiene spot checks (ruled out, not filed)

- `.pi/index.ts` — legitimate pi-harness distribution adapter, referenced by
  `package.json`'s `exports["./dist/.pi/index.js"]`. Not legacy.
- `scripts/install-local.mjs`/`install-lib.mjs`/`uninstall-local.mjs`/
  `verify-install.mjs` — documented in `README.md:142-144`, tested
  (`install-lib.test.mjs`, `package-contract.test.mjs`). Not legacy.
- `.opencode/commands/*.md` — thin distribution-adapter command wrappers,
  listed in `package.json`'s `files`. Not legacy.
- `skills/catalog.yaml` — 17 entries, matching exactly the 17 non-`_shared`
  directories under `skills/`. No orphaned skill directory.
- `git ls-files dist/` — empty; `dist/` correctly gitignored, not committed.
- "OKF" (a term from memory of this repo's early history) — greped across
  all `.ts`/`.md` files; only appears inside one already-closed Change's own
  archived Plan artifacts (`2026-07-24-project-structure-review`), not in
  any live code or doc. Already fully retired, nothing to file.
