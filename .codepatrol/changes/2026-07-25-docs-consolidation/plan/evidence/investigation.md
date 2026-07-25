# Investigation — Revalidate `docs/` and `.codepatrol/` artifacts

- Work id: `2026-07-25-docs-consolidation`
- Baseline: `main` @ `9cf610d961294a0c00baa8464d79f2f950c16783`; clean worktree; `npm run verify` green (175 tests) at baseline.
- Graph synced: 70 files, 1814 symbols.

## Full inventory of `docs/` and `.codepatrol/`

`find docs -type f`:
```
docs/codepatrol/assessments/2026-07-24-architecture-v2.md
docs/codepatrol/assessments/2026-07-24-architecture-workflow.md
docs/codepatrol/improvement-reports/*.md  (11 files)
docs/runtime-state.md
docs/smoke-tests.md
```
`docs/adr/` does not exist (`ls docs/adr` → No such file or directory) — expected: `docs/runtime-state.md`/`AGENTS.md` describe it as the lazily-created location for durable ADRs, not a mandatory scaffold (confirmed by `skills/domain-modeling/SKILL.md:30`: "Create files lazily... No `docs/adr/`? Create it when the first ADR is needed."). Not a defect.

`.codepatrol/` top level: `backlog/`, `changes/` (16 work ids, this Change included), `config.json`, `runtime/`. No stray root files.

## Git-tracking status (the load-bearing fact)

```
git ls-files docs/codepatrol/
  docs/codepatrol/assessments/2026-07-24-architecture-v2.md
  docs/codepatrol/assessments/2026-07-24-architecture-workflow.md
```
Only the two assessment files are tracked. `git check-ignore -v` confirms `docs/codepatrol/improvement-reports/*.md` is ignored via `.gitignore:7` (`docs/codepatrol/improvement-reports/`). Confidence: high (direct commands).

**`docs/codepatrol/assessments/` is a git-tracked "architecture namespace" — but `docs/runtime-state.md:23-25` explicitly says:** *"No root `.codepatrol` scratch JSON, duplicate status cache, **architecture namespace** or durable ADR is supported. Durable project decisions belong in `CONTEXT.md`, `docs/adr/` or declared Change evidence."* This is a live, currently-true contradiction between the governing doc and the tracked repository state — not a hypothetical. Confidence: high (read both).

## `docs/codepatrol/assessments/` content audit

- `2026-07-24-architecture-workflow.md` (v1, baseline `415f779b`): 7 ranked findings F1–F7.
- `2026-07-24-architecture-v2.md` (v2, baseline `3ba78c14`): opens with a "v1 Reconciliation" table that resolves all 7 of v1's findings: F1/F4/F5 **delivered** (in named Changes), F2/F6 **accepted as permanent decisions** (not open work), F7 **explicitly deferred** (not open work — a conscious decision, not a task), F3 **partial, carried into v2 as N3**. So v1 contributes zero *new* open work once v2 exists — it is fully subsumed. Confidence: high (read both in full).
- v2's own "Ranked new findings" table lists 4 items **not yet resolved by any Change**: N1 (Low, dead error-code taxonomy), N2 (Medium, core module test-coverage gaps), N3 (Medium, orchestrator transition density), N4 (High, unsafe duplicate YAML reader bypassing `migrateRecord`). None of these four is referenced as "delivered," "accepted," or "deferred" anywhere; they are live open follow-up work exceeding this Change's bounded scope (this Change is about artifact/documentation hygiene, not fixing orchestrator density or dead code). Per this project's own Plan-skill instruction, this is exactly the case for `codepatrol backlog add`. Confidence: high (read in full).

`grep -rln "assessments" scripts/ src/` → **no hits**. No production code, script, or test references either assessment file's path or content. Only the two assessment docs reference each other's path in their own prose (`architecture-v2.md:7`). Confidence: high (grep).

## Backlog items already recorded this session

Per the Plan skill's instruction ("When investigation shows the work exceeds one bounded Change, call `codepatrol backlog add`"), the four open v2 findings were captured live during this investigation, **before** writing this spec, so removal of the source document (T3) does not lose any open work:

| Backlog id | Priority | Source finding |
|---|---|---|
| `unsafe-duplicate-yaml-reader-in-improvement-report-ts-bypasses-migraterecord-normalization` | p1 | N4 (High) |
| `orchestrator-transitionchangelocked-is-dense-and-mixes-validation-persona-semantics-and-storage-responsibilities` | p2 | N3 (Medium) |
| `core-module-test-coverage-gaps-atomic-store-ts-graph-languages-ts-graph-queries-ts-lack-dedicated-tests` | p2 | N2 (Medium) |
| `dead-taxonomy-unused-error-codes-artifact-invalid-and-workflow-in-errors-ts` | p3 | N1 (Low) |

Confirmed via `codepatrol backlog list --format json` (6 total items: these 4 plus 2 pre-existing close-trace items). `.codepatrol/backlog/items.yaml` committed at `4dc367e` on this branch (caller-commits contract from `skills/codepatrol-plan/SKILL.md`). Severity→priority mapping: v2's High/Medium/Medium/Low maps to p1/p2/p2/p3 — an explicit `priority` override was passed on each `backlog add` call rather than relying on `classifyPriority`'s close-trace keyword heuristic (which targets telemetry-recommendation phrasing like "invoked N times," not architecture-assessment severities).

Deletion is fully recoverable regardless: `git log`/`git show <commit>:<path>` preserves both files' full content forever; only the working tree and `HEAD` view change. Confidence: high (standard Git property, not something this investigation needs to test).

## `docs/codepatrol/improvement-reports/` mirror — full blast radius

`src/change/improvement-report.ts:216-221`:
```ts
export function mirrorImprovementReport(workspace: string, workId: string, sourcePath: string): string {
	const mirror = join(workspace, "docs", "codepatrol", "improvement-reports", `${workId}.md`);
	mkdirSync(dirname(mirror), { recursive: true });
	copyFileSync(sourcePath, mirror);
	return mirror;
}
```
This is a **copy** of the durable source `.codepatrol/changes/<workId>/close/improvement-report.md` (written by the adjacent `writeImprovementReport`, confirmed at `:208-213`) — the mirror itself carries no information the durable Change artifact doesn't already have; it exists purely as a human-convenient, locally-browsable, gitignored copy. Confidence: high (read both functions).

`grep -rn "codepatrol/improvement-reports\|mirrorImprovementReport"` across `src/`, `scripts/`, `skills/`, `docs/`, `AGENTS.md`, `CONTEXT.md`, `.gitignore` found every reference that must move in lockstep:

| File | Reference |
|---|---|
| `src/change/improvement-report.ts:217` | the `join(...)` target path (the only production write site) |
| `src/change/improvement-report.test.ts:97-105` | asserts the mirror path equals `${workspace}/docs/codepatrol/improvement-reports/${id}.md` |
| `src/change/orchestrator.ts:369` | `assertVerifiedCandidate`'s allowed-path list (Close idempotent-recovery, terminal branch) |
| `src/change/orchestrator.ts:370` | `allowedRecovery` `Set` in the same recovery block |
| `.gitignore:7` | the ignore rule itself |
| `src/change/apply-gate-enforcement.test.ts:16` | scratch-repo `.gitignore` fixture string |
| `src/change/close-push.test.ts:26` | scratch-repo `.gitignore` fixture string |
| `src/change/backlog-close-integration.test.ts:25,49` | scratch-repo `.gitignore` fixture string (2 occurrences, identical) |
| `src/change/orchestrator-parallel.test.ts:15` | scratch-repo `.gitignore` fixture string |
| `src/change/close-integration.test.ts:18` | scratch-repo `.gitignore` fixture string |
| `src/change/git.test.ts:17,97,188,200,227` | scratch-repo `.gitignore` fixture string (5 occurrences, identical) |
| `skills/codepatrol-plan/SKILL.md:31` | brownfield instruction: "read the most recent `docs/codepatrol/improvement-reports/*.md`" |
| `docs/codepatrol/assessments/2026-07-24-architecture-workflow.md:42` | self-referential "Method note" citation — moot once T3 removes the file |

`scripts/skills-contract.test.mjs:45` only asserts `/backlog/` against the Plan skill text — no hardcoded improvement-reports path, so it is unaffected by T2. Confidence: high (grep + read).

**Why these test fixtures matter beyond cosmetics:** `src/change/orchestrator.ts:25`'s `parseStatusPaths` — the single choke point every clean-worktree pre/postcondition uses — currently exempts only `.codepatrol/runtime/`. The mirror path lives outside that exemption today because it is separately gitignored at the *Git* level (so `git status` never reports it, regardless of `parseStatusPaths`). If the mirror moves under a new `.codepatrol/docs/` and that new path is **not** added to each scratch-repo test fixture's own `.gitignore` string, those fixtures' internal `git status` calls would start reporting the mirror as untracked, and Close's postcondition (`orchestrator.ts:439`, unchanged by this Change) would fail exactly the way `2026-07-24-backlog-subsystem`'s Verify caught twice for the backlog file. This is the direct, hard-won lesson from that prior Change's two returns — applied proactively here rather than discovered by a second Verify round.

## Governing-doc surface needing amendment

`AGENTS.md:64-65`: *"Durable ADRs live in `docs/adr/`; ignored state lives only in `.codepatrol/runtime/`."* This sentence will become false the moment `.codepatrol/docs/` exists as a second gitignored location — the same class of contradiction as the assessments/ namespace issue, caught before it ships rather than after. `docs/runtime-state.md` similarly frames only `.codepatrol/runtime/` as the ignored/rebuildable root; it needs a new paragraph for `.codepatrol/docs/`, mirroring the existing "structured backlog" paragraph's shape (`docs/runtime-state.md:27-31`) that was added for the same reason in `2026-07-24-backlog-subsystem`.

## Reused precedent

`2026-07-24-backlog-subsystem` (closed `9cf610d`) already established the exact governing-doc-amendment pattern (T1: amend `AGENTS.md` + `docs/runtime-state.md` to sanction a new top-level `.codepatrol/` path before code references it) and the caller-commits-backlog-before-transition contract this investigation just exercised. No new pattern is being invented; this Change reuses both directly. Confidence: high (this session's own prior work, re-read from `skills/codepatrol-plan/SKILL.md` and `docs/runtime-state.md`'s current text, not from conversation memory).
