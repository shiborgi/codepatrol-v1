# Plan evidence — `src/` structural revalidation

Commands run and files read during this Plan attempt, against `main` @
`5f569db`. Analyser output was always re-confirmed by a direct `grep` before
being reported as a finding.

## Substrate

```
$ codepatrol graph sync
files 73  symbols 2121
edges {'imports': 416, 'calls': 4368, 'inherits': 18, 'tests': 153}
```

34 non-test production files under `src/`; largest: `orchestrator.ts` (477),
`graph/analysis.ts` (240), `graph/service.ts` (237), `graph/link.ts` (235),
`graph/extract.ts` (216), `session.ts` (217), `improvement-report.ts` (218),
`cli/commands.ts` (213), `backlog.ts` (207).

## Method

Two scratch Python analysers (in the session scratchpad, not committed):

1. `analyze_deps.py` — parses every `import … from "./x.js"` across all
   non-test `src/**/*.ts`, normalises specifiers with `os.path.normpath`
   (an earlier version omitted this and silently produced an empty
   cross-module matrix; the bug was caught because the output was
   implausible, and is recorded here because it is why every conclusion
   below carries an independent `grep` confirmation).
2. `cycles_and_tests.py` — DFS cycle detection over the same import graph,
   plus a test-file → production-file import map.

## Layering (positive finding)

```
change -> shared  (24 imports)
cli    -> change  (10)
cli    -> graph   (5)
cli    -> shared  (6)
cli    -> root    (1)
graph  -> shared  (6)
```

No other cross-module edge exists. Independently confirmed:

```
$ grep -rln 'from "\.\./cli/' src/change/ src/graph/ src/shared/ --include="*.ts"
(no output)
$ grep -rln 'from "\.\./change/' src/graph/ src/shared/ --include="*.ts"
(no output)
```

`shared/` imports nothing from `src/`. Cycle check over all 34 production
files: **none**.

External runtime dependencies by module — `change`: `yaml` plus `node:*`;
`cli`, `graph`, `shared`: `node:*` only. `yaml` is the only non-stdlib
runtime import anywhere in `src/`.

## S1 — path-layout scatter

```
$ grep -rn '"\.codepatrol/\|`\.codepatrol/' src/ --include="*.ts" | grep -v "\.test\.ts" | grep -v "^src/shared/state.ts"
```

~28 matches across 8 production files. Duplicate builders for the same
path, confirmed by reading each site:

- `.codepatrol/changes/<id>/change.yaml`: `orchestrator.ts:24`
  (`relativeRecord`) and `store.ts:11` (`changeRecordPath`).
- `.codepatrol/changes/<id>/<stage>/`: `orchestrator.ts:123`,
  `validation.ts:24`, `validation.ts:43`.
- `.codepatrol/backlog/items.yaml`: `backlog.ts:47` (`backlogPath`) and
  `orchestrator.ts:265`; prefix again at `orchestrator.ts:269`, `:292`.
- Stage-artifact paths: `orchestrator.ts:255-258`, and `session.ts:123`
  separately.
- `.codepatrol/runtime/`: `orchestrator.ts:25`, `:27`, despite
  `state.ts:5` (`stateRoot`).

`src/shared/state.ts` read in full (19 lines): owns `STATE_VERSION`,
`stateRoot`, `graphStatePath`, `lockPath`, `stageSessionPath` — i.e. it is
already the designated home for exactly this knowledge, but only the
`runtime/` subtree adopted it.

## S2 — duplicated schema guard

```
$ grep -rn "contains unknown field\|cannot own" src/ --include="*.ts" | grep -v test
```

10 sites across 6 files: `orchestrator.ts:34`, `model.ts:11`,
`backlog.ts:52`, `backlog.ts:66`, `backlog.ts:76`, `backlog.ts:95`,
`session.ts:25`, `session.ts:26`, `session.ts:33`, `usage.ts:17`.

Both helper bodies read directly and compared:

```typescript
// orchestrator.ts:33-35
function exactInput(value: Record<string, unknown>, allowed: string[], label: string): void {
	for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new CodepatrolError("INVALID_ARGUMENT", `${label} contains unknown field ${key}.`, 2);
}
// model.ts:10-12
function exactKeys(value: object, allowed: string[], label: string): void {
	for (const key of Object.keys(value)) if (!allowed.includes(key)) invalid(`${label} contains unknown field ${key}.`);
}
```

Identical logic; the only difference is the throw path (`invalid()` wraps
`CHANGE_INVALID`/exit 4 vs `INVALID_ARGUMENT`/exit 2) — which is the
parameterisation any shared helper must accept. `exactKeys` is used 5× within
`model.ts` (`grep -c`).

Companion non-empty-string idiom: `grep -c "must be a non-empty string"` →
`backlog.ts` 8, `orchestrator.ts` 2, `cli/commands.ts` 1.

## S3 — CLI registry sync (latent)

```
cases  : 19
options: 19
in COMMAND_OPTIONS but no case: []
case but not in COMMAND_OPTIONS: []
```

Verified by set-comparing `case "x.y":` labels in `commands.ts` against
`["x.y", new Set(…)]` keys in `args.ts`. Currently in sync — the finding is
the absent compile-time link, not a live drift. The `2026-07-26-backlog-resolve`
red-test output quoted in the spec is from that Change's own Apply journal.

## S4 — test coverage map

Production files with no test file importing them directly:
`cli/main.ts`, `cli/output.ts`, `graph/languages.ts`, `graph/link.ts`,
`graph/queries.ts`, `shared/atomic-store.ts`, `version.ts`.

`cli/cli.test.ts` and `cli/main.test.ts` were read to confirm they spawn the
CLI as a subprocess (`spawnSync(process.execPath, […entry, …args])`) and
assert on rendered output — legitimate indirect coverage for `main.ts` and
`output.ts`. `graph/link.ts` (235 lines) has neither direct nor
subprocess-level coverage and is not named by the existing N2 item.

## Extensibility checks (positive finding)

`LanguageId` union (`languages.ts:14`), `WASM_FILE` (`languages.ts:68`), and
`QUERIES` (`queries.ts:59`) all list the same 7 languages — verified
programmatically. The latter two are typed `Record<LanguageId, …>`, so the
union is the single source of truth and `tsc` enforces both maps stay
exhaustive. `EXTENSION_LANGUAGE` (`languages.ts:53`) is
`Record<string, LanguageId>` by design (12 extensions → 7 languages).

## `shared/` cohesion (positive finding)

Every export in `src/shared/*.ts` read: `atomic-store` (2 write primitives),
`config` (load `.codepatrol/config.json`), `errors` (`ErrorCode`,
`CodepatrolError`, `operationalError`), `lock` (`acquireLock`,
`withWorkspaceLock`), `repo-files` (source-file scanning/hashing), `state`
(runtime path constants), `workspace` (resolve/contain paths). No overlap;
no module is a catch-all.

## Precedent read

`.codepatrol/changes/2026-07-26-architecture-assessment-v3/plan/spec.md` read
in full to (a) avoid duplicating its findings, (b) reuse its zero-diff
assessment shape, and (c) honour its `docs/`-namespace constraint. Its "F3
considered, not filed" paragraph is the reason S2's evidence explicitly
states the site count that changed the decision.
