# Specification — Revalidate `src/` structure: module cohesion, boundaries, testability and extensibility

## Intent

- Origin: improve-codebase
- Mode: architecture
- Target baseline: `main` @ `5f569db` (branch `codepatrol/2026-07-26-src-structure-revalidation`), clean tree, `npm run verify` green (215/215)
- Governing constraints: `docs/runtime-state.md:20-22` forbids an "architecture namespace" — findings live in this spec plus the structured backlog, never a new `docs/` file (same constraint honored by `2026-07-26-architecture-assessment-v3`).
- Substrate state: graph synced this Plan attempt — 73 files, 2121 symbols, 416 import edges, 4368 call edges. Supplemented by two purpose-written scratch analysers (module dependency matrix + cycle detection; not committed) whose every conclusion was re-confirmed by direct `grep`/read.
- Improvement signals (from `.codepatrol/docs/improvement-reports/2026-07-26-decompose-transition-change.md`, most recent by mtime): `CHANGE_INVALID` (1 occurrence) and `change.session` invoked 25 times. Neither is an architecture signal — the first is a single self-explained validation rejection, the second is generic lifecycle telemetry already tracked as its own backlog item. Recorded per protocol, not acted on here.
- Problem: the maintainer asked for a full structural revalidation of `src/` against architecture, module, and testing best practice — cohesion, modularity, extensibility. The three prior assessments (v1/v2 on 2026-07-24, v3 on 2026-07-26) each scanned for *defects and dead code*; none analysed the codebase's **structural shape** — module boundaries, dependency direction, duplicated structural idioms, extension points, or where domain knowledge is owned. This assessment does that, and finds the layering is sound but three cross-cutting concerns have no owning module and are instead reimplemented inline across many files.
- Outcome: this spec's Current evidence section is the durable record of what was found — four ranked findings (S1-S4) with `file:line` evidence and a re-runnable method, plus explicitly-recorded positive findings so a future assessment knows what was checked and held. Each actionable finding becomes a queryable backlog item; no production code changes in this Change.

## Scope

### In scope

- Whole-`src/` structural analysis along four axes: (a) module boundaries and dependency direction, (b) cohesion — where domain knowledge is owned vs. scattered, (c) extensibility — what adding a language/command/stage costs, (d) testability — which production modules have no direct test.
- Filing each actionable finding as a priority-classified backlog item with `file:line` evidence.
- Recording positive findings (structural properties verified to hold) so future assessments do not re-derive them from scratch and can detect regression.

### Out of scope

- Implementing any finding's fix. Each is a candidate for its own bounded Change, per this repo's one-finding-per-Change discipline — the same discipline that just delivered `2026-07-26-decompose-transition-change` (N3) and `2026-07-26-remove-dead-path-builders` (F1) as separate Changes. The maintainer's "considere refatorar" is answered by producing a ranked, immediately-actionable queue with S1 named as the recommended next pickup, not by bundling a multi-module refactor into an assessment Change (which would also break the zero-production-diff shape Review and Verify expect from `mode: architecture`).
- `.pi/`, `.opencode/`, `scripts/`, `bin/`, `skills/` — the request named `src/`. Distribution-adapter and skill surfaces were spot-checked and found consistent by `2026-07-26-architecture-assessment-v3` (its evidence file records the checks); not re-audited here.
- Re-litigating findings already tracked as open backlog items (N1 dead error codes, N2 test-coverage gaps, F2 redundant validators, workflow telemetry). S4 below *extends* N2 with a newly-identified file rather than duplicating it.

## Current evidence

**Method (re-runnable).** `codepatrol graph sync` once. Then a scratch Python analyser parsed every `import ... from "./x.js"` in all 34 non-test `src/**/*.ts` files, normalised each specifier to a repo path, and built (a) a module-level dependency matrix, (b) a per-file fan-in count, (c) a DFS cycle check, (d) a test-file → production-file import map. Every finding below was then re-confirmed by a direct `grep` or file read quoted here — the analyser's output was treated as a lead, never as proof (`_shared/ROLES.md`: "graph edges are leads; verify cited locations directly", applied to an ad-hoc tool the same way).

### Positive findings (verified to hold — recorded so a future pass can detect regression)

- **Layering is strictly acyclic and one-directional.** Cross-module import counts: `cli → change` (10), `cli → graph` (5), `cli → shared` (6), `cli → root` (1), `change → shared` (24), `graph → shared` (6). There is **no** `change → cli`, `graph → cli`, `graph → change`, `shared → *` edge. `shared/` imports nothing from `src/` at all. Confirmed by the dependency matrix and independently by `grep -rln 'from "\.\./cli/' src/change/ src/graph/ src/shared/` → zero matches.
- **Zero import cycles** across all 34 production files (DFS over the full import graph; no back-edge found).
- **Language extensibility is compile-time enforced.** `WASM_FILE` (`graph/languages.ts:68`) and `QUERIES` (`graph/queries.ts:59`) are both typed `Record<LanguageId, …>`, so adding a member to the `LanguageId` union (`languages.ts:14`) forces both maps to be extended or `tsc` fails. All three structures currently list the identical 7 languages — verified programmatically. `EXTENSION_LANGUAGE` (`languages.ts:53`) is correctly *not* exhaustiveness-checked, since it is many-extensions-to-one-language.
- **`shared/` is a genuine primitives layer, not a junk drawer.** Its seven modules each own one cross-cutting primitive (atomic writes, config, errors, locking, repo-file scanning, state paths, workspace resolution) with no overlap — confirmed by reading every export in the directory.
- **External dependency surface is minimal and appropriate**: `yaml` is the only non-`node:` runtime import anywhere in `src/`, and only `change/` uses it.

### S1 — `.codepatrol/` path-layout knowledge has no owning module (recommended next pickup)

The repository's storage contract (documented in `skills/_shared/CHANGE.md` as the Change directory layout) is encoded as **~28 hardcoded path literals across 8 production files**, even though `src/shared/state.ts` exists specifically to own path construction (it holds `stateRoot`, `graphStatePath`, `lockPath`, `stageSessionPath`). Concretely, the *same* path is built by more than one site:

- `.codepatrol/changes/<id>/change.yaml` — built twice: `orchestrator.ts:24` (`relativeRecord`, workspace-relative) and `store.ts:11` (`changeRecordPath`, absolute via `resolveInside`).
- `.codepatrol/changes/<id>/<stage>/` prefix — built three times: `orchestrator.ts:123`, `validation.ts:24`, `validation.ts:43`.
- `.codepatrol/backlog/items.yaml` — the real accessor is `backlog.ts:47` (`backlogPath`), but `orchestrator.ts:265` re-inlines the literal string in its allow-set, and the `.codepatrol/backlog/` prefix is re-inlined again at `orchestrator.ts:269` and `:292`.
- The four required stage-artifact paths are inline at `orchestrator.ts:255-258`, while `session.ts:123` independently hardcodes `plan/plan.md` for the same contract.
- `.codepatrol/runtime/` is re-inlined at `orchestrator.ts:25` and `:27` despite `state.ts:5` owning `stateRoot`.

This finding also **reframes the just-closed F1**: `changeDirectory` (`store.ts`) and `changeRoot` (`state.ts`) were not merely dead — they were two abandoned, competing attempts to centralize exactly this knowledge, which died because neither was ever adopted by the sites that build the paths inline. Removing them (correctly, as dead code) cleared the ground; it did not address the underlying scatter. Severity: medium. This is the highest-value finding because it is the one place where a *documented contract* has no code owner.

### S2 — The "reject unknown keys" schema guard is reimplemented 10 times across 6 files

Every module that validates a structured input or persisted record hand-rolls the same `for (const key of Object.keys(x)) if (!allowed.has(key)) throw …` idiom. Confirmed sites: `orchestrator.ts:34`, `model.ts:11`, `backlog.ts:52`, `backlog.ts:66`, `backlog.ts:76`, `backlog.ts:95`, `session.ts:26`, `session.ts:33`, `usage.ts:17`, plus the `forbidden`-key variant at `session.ts:25`.

Two of these are **byte-identical function bodies under different names in the same directory**, both private: `orchestrator.ts:33-35` (`exactInput`) and `model.ts:10-12` (`exactKeys`, used 5× within its own file). The companion "require non-empty string" idiom is likewise re-inlined (8 occurrences in `backlog.ts`, 2 in `orchestrator.ts`, 1 in `cli/commands.ts`).

A real design consideration, not a blocker: the sites deliberately differ in error code — `INVALID_ARGUMENT` (exit 2) for CLI-boundary input in `orchestrator.ts`, `CHANGE_INVALID` (exit 4) for persisted-record schema validation in `backlog.ts`/`session.ts`/`model.ts`/`usage.ts` — so any shared helper must be parameterised on the error code rather than hardcoding one.

`2026-07-26-architecture-assessment-v3` saw a two-site version of this and explicitly declined to file it ("no functional gap… better made by whoever next touches either file"), correctly, at a count of 2. The full-codebase count is 10 sites across 6 files, which passes the threshold that assessment set. Severity: medium.

### S3 — CLI command registration is split across three parallel registries with no compile-time link

Adding one CLI command requires three coordinated edits in three files: an entry in `COMMAND_OPTIONS` (`cli/args.ts:41`), a `case` in the `executeCommand` switch (`cli/commands.ts`), and a help-text line (`cli/output.ts`). Nothing in the type system connects them; a missing `args.ts` entry surfaces only at runtime as `Unknown command: <name>`.

Lived evidence: `2026-07-26-backlog-resolve`'s Apply hit exactly this — its first red test run failed with `{"code":"INVALID_ARGUMENT","message":"Unknown command: backlog.resolve. Known commands: …"}` because the `case` existed before the `COMMAND_OPTIONS` entry. That was caught by an intentional red-first test, but only because the plan required one.

Honest classification: **latent, not live**. The three registries are currently fully in sync — verified programmatically: 19 `case` labels and 19 `COMMAND_OPTIONS` keys, set-difference empty in both directions. Discipline has been holding; the type system is not enforcing it. Severity: low.

### S4 — `graph/link.ts` (235 lines) has no direct test, extending the known N2 coverage gap

The test-import map shows seven production files with no test file importing them directly: `cli/main.ts`, `cli/output.ts`, `graph/languages.ts`, `graph/link.ts`, `graph/queries.ts`, `shared/atomic-store.ts`, `version.ts`.

Of these, `cli/main.ts` and `cli/output.ts` are legitimately covered indirectly — `cli/cli.test.ts` and `cli/main.test.ts` spawn the real CLI as a subprocess and assert on its rendered text output, which is the appropriate seam for an entry point and a renderer. `version.ts` is a one-line constant.

The existing N2 backlog item already names `atomic-store.ts`, `languages.ts`, and `queries.ts`. It does **not** name `link.ts`, which at 235 lines is the largest untested production file in the repository and holds the graph's edge-resolution logic (the step that turns extracted symbols into `imports`/`calls`/`inherits` edges — precisely the logic whose silent misbehaviour would degrade `graph impact` blast-radius output that Verify stages depend on). Severity: low-medium. Filed as an extension of N2, cross-referencing it rather than duplicating it.

### Noted, not filed

`src/change/model.ts:2-3` uses two separate `import` statements from the same module (`{ aggregateUsage }` then `{ validateRun }`, both from `./usage.js`). A one-line style nit with no functional impact and no drift risk; recording it here is sufficient, and filing a backlog item for it would lower the queue's signal-to-noise — the same judgment `2026-07-26-architecture-assessment-v3` applied to its own F3.

## Proposed design

No code change. The procedural design: file S1, S2, S3 and S4 as structured backlog items (`plan-followup`, this work id) carrying the evidence above, so each can be picked up as its own bounded Change without re-deriving this investigation. S1 is recommended as the next pickup and priced accordingly (`p2`); S2 `p2`; S3 and S4 `p3`. This spec is the durable record — no `docs/` file is created, honoring `docs/runtime-state.md`.

## Alternatives

- **Implement S1 (or all findings) inside this Change:** rejected — an assessment Change with a multi-module production diff breaks the zero-diff shape this repo's `mode: architecture` precedent establishes (v1, v2, v3 all sealed with `changes: []`), and would bundle four independent decisions into one reviewable unit. S1 alone touches at least `state.ts`, `store.ts`, `orchestrator.ts`, `validation.ts`, `session.ts`, and `backlog.ts` — that is its own Change, with its own red/green plan, not a rider on an assessment.
- **Write a `docs/codepatrol/assessments/2026-07-26-architecture-v4.md`:** rejected — explicitly forbidden by `docs/runtime-state.md:20-22`, and `2026-07-25-docs-consolidation` already retired that namespace for exactly this reason.
- **File the `model.ts` double-import nit as a fifth item:** rejected — see Noted, not filed.
- **Defer S3 entirely because it is currently in sync:** rejected — "in sync today by discipline alone" is precisely the latent-risk shape worth recording, and it already cost one red-test cycle in a recent Change. Filed at `p3` to reflect that it is latent, not urgent.

## Simplicity decision

- Selected rung: need — a read-only investigation cannot be reduced further; the deliverable (findings plus filed items) is the minimum that makes the analysis actionable.
- Earlier rungs: not applicable — investigation work, not an implementation choice with a mechanism ladder.
- Irreducible complexity: none introduced; zero production surface change.
- Safety floor: not applicable (no code mutation).
- Expected surface delta: `.codepatrol/backlog/items.yaml` (+4 items). No source files.

## Deferred constraints

| ID | Chosen simplification | Known ceiling | Observable trigger | Upgrade path |
|---|---|---|---|---|
| DC-1 | Findings are filed, not fixed, in this Change | The structural issues remain in the code until each follow-up Change is picked up | Any of S1-S4's cited sites causes a real defect before its Change is scheduled | Pick up the corresponding backlog item as its own bounded Change; S1 is pre-ranked as the recommended first |
| DC-2 | Analysis covered `src/` only, per the request | A structural issue living in `scripts/`, `.pi/`, or `skills/` would not be surfaced by this pass | A defect or maintenance friction traced to a non-`src/` module's structure | Run an equivalent pass scoped to that tree, reusing this spec's method section |

## Compatibility and rollout

- No migration, no code change, no schema or config change.
- The four new backlog items are additive data in the sanctioned `.codepatrol/backlog/items.yaml`; nothing reads or depends on their absence.
- Rollback: revert the single backlog commit; the items disappear with no other state affected.
- Observability: the items are immediately visible via `codepatrol backlog list` and the Kanban Backlog column, like every other item.

## Risks and mitigations

- Risk: the scratch import analyser could miss an edge (dynamic import, re-export chain) and so overstate the "no cycles / clean layering" positive findings. Mitigation: every positive finding was re-confirmed by an independent direct `grep` quoted in the evidence file; additionally, this codebase uses no dynamic `import()` and no barrel re-export files anywhere in `src/` — both verified by grep, which is what makes single-pass static import analysis sound here.
- Risk: filing four items at once could crowd the backlog. Mitigation: two are `p3` (explicitly low-urgency), S4 is filed as an extension cross-referencing the existing N2 item rather than an independent claim on attention, and one candidate finding (the `model.ts` nit) was deliberately excluded — the queue grows by four genuinely distinct, evidence-backed entries, not by everything observed.
- Risk: S1's fix, when picked up, touches six files including `orchestrator.ts` — this repo's highest-blast-radius module. Mitigation: not this Change's risk to carry, but recorded in S1's backlog evidence so its future Plan starts with that constraint visible rather than discovering it mid-Apply.

## Acceptance criteria

- AC-1: This spec's Current evidence section contains findings S1-S4, each with `file:line` citations, and a Positive findings subsection recording the verified structural properties (acyclic layering, zero cycles, compile-time language exhaustiveness, `shared/` cohesion, minimal external deps).
- AC-2: The Method paragraph describes the analysis precisely enough to re-run: graph sync, import-graph parse over all non-test `src/**/*.ts`, module matrix, fan-in, DFS cycle check, test-import map — with the stated rule that analyser output was re-confirmed by direct grep before being reported as a finding.
- AC-3: `codepatrol backlog list --format json` (after this Change's Apply) includes exactly four new items matching S1-S4, each with `source: { kind: "plan-followup", workId: "2026-07-26-src-structure-revalidation" }`, with S1 and S2 at `priority: "p2"` and S3 and S4 at `priority: "p3"`.
- AC-4: `git diff --stat` against this Change's base commit, at Apply's completion, touches only `.codepatrol/backlog/items.yaml` — zero production source files changed.

## Decisions and open questions

- Decision: assessment-only, zero production diff; findings filed for separate bounded Changes, with S1 pre-ranked as the recommended next pickup — see Alternatives and DC-1.
- Decision: no new `docs/` file; this spec is the record — see Alternatives.
- Decision: S4 is filed as an extension of the existing N2 coverage item (naming `link.ts`, which N2 omits) rather than as a competing duplicate.
- Decision: the `model.ts` double-import nit is recorded in this spec but not filed — see Noted, not filed.
- No open questions remain that could materially change scope, interfaces, or acceptance.
