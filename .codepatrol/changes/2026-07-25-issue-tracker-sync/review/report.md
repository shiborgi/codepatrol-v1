# Review — codepatrol-git: two-way backlog/GitHub-issue sync

- Change: `2026-07-25-issue-tracker-sync`
- Incoming revision: 2 (Plan attempt 2)
- Reviewed revision: 2
- Reviewer: opencode (codepatrol-review skill)
- Evidence date: 2026-07-25T22:31Z

## Scope and evidence

Evaluated Plan attempt 2 on its own merits against the live tree, then reconciled the projection:

- `codepatrol change inspect --id 2026-07-25-issue-tracker-sync` → stage `review`, attempt 2, state `ready`; checked out on `codepatrol/2026-07-25-issue-tracker-sync` at `ccdbdde` (plan-2 checkpoint transition; plan-2 content `519eb41`, tree `87fbf414`). Plan attempt 1 is `invalidated`; review attempt 1 is `returned` — both correctly superseded.
- Artifact hashes re-verified (`shasum -a 256`): `spec.md` `3b4a667d…`, `plan.md` `643b490d…`, `investigation.md` `c10bde51…` — all match the attempt-2 bindings.
- Plan-1 → Plan-2 diff is **`plan.md` only** (35+/11−); `spec.md` and `investigation.md` are byte-identical to attempt 1, so the verified contract is unchanged.
- Baseline intact: `main` @ `932edcc` (unchanged), confirmed an ancestor of the branch — no target advance.
- Cited codebase facts re-checked (no production edits occurred between attempts, so these remain accurate): `src/change/git.ts:33-36` (`NodeGitAdapter` takes `workspace`, `run` passes `cwd: this.workspace`); `src/change/backlog.ts:32,34,47-54` (two source kinds, `externalRef` absent from `ALLOWED_ITEM_KEYS`, `validateSource` requires `workId`); `src/cli/args.ts:99` (`positionals.join(".")` dispatch); `src/cli/commands.ts:51` (`executeCommand(args, workspace, signal)`); `scripts/lint-skills.mjs:7,102-111` (closed six-name primary set; frontmatter `description,name` only); `scripts/skills-contract.test.mjs:11` (exact ten-name `support` array); `skills/catalog.yaml` (`codepatrol-status` directly-invoked shape); `CONTEXT.md:52-54` (Rejected Integration Surface escape hatch this Change adopts).
- Executability of the corrected T1 test checked against `src/change/backlog.test.ts:1-7`: `mkdtempSync`, `mkdirSync`, `writeFileSync`, `rmSync`, `tmpdir`, `join`, and `stringify` are all already imported — the test runs as written.

## Findings

None. Both defects recorded against Plan attempt 1 are resolved correctly and with no collateral change:

- Prior Finding 1 (inverted T1 red assertion): `plan.md` T1 step 1 now keeps exactly one genuinely red-capable assertion — the `github-issue`-with-`externalRef`-without-`workId` `readBacklog` round-trip. It throws today (`externalRef` not in `ALLOWED_ITEM_KEYS`, `github-issue` not in `VALID_SOURCE_KINDS`) and passes after T1. The two `assert.throws` lines are retained as regression guards for unchanged behavior (existing kinds still require `workId`; `github-issue` forbids `workId`), correctly described as green-before-and-after rather than red. The red→green cycle is now sound and the assertion matches its titled invariant.
- Prior Finding 2 (T2 not anchored to `workspace`): T2 step 2 now mandates `constructor(readonly workspace: string)` and `cwd: this.workspace` on every `execute(...)`, citing `git.ts:33`; the sample code matches. T3's invariants add a private `ghFor(workspace, options)` returning `options.gh ?? new NodeGhAdapter(workspace)` (mirroring `orchestrator.ts`'s `gitFor`), so the real adapter is constructed with the resolved workspace exactly once, and the `FakeGhAdapter` override remains the only path tests touch.

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none | Contract-complete and unchanged from attempt 1 | — |
| `plan.md` | none (attempt 2 already corrects the two attempt-1 defects) | T1 red/green restored; T2 workspace anchoring restored | none |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T2, T3 | yes — `syncIssues` undefined before T3 | covered |
| AC-2 | yes | T2, T3 | yes — dismissed↔open reversal | covered |
| AC-3 | yes | T2, T3 | yes — scheduled/done immunity | covered |
| AC-4 | yes | T1, T2, T3 | yes — open unlinked import + schema round-trip (T1 red assertion + T3 behavior) | covered |
| AC-5 | yes | T2, T3 | yes — closed unlinked never imported | covered |
| AC-6 | yes | T2, T3 | yes — exactly one `createIssue` | covered |
| AC-7 | yes | T2, T3 | yes — done/dismissed reason mapping | covered |
| AC-8 | yes | T2, T3 | yes — `dryRun` zero-write/zero-mutation | covered |
| AC-9 | yes | T7a, T8 | yes — eleven-name `support` array + `npm run verify` | covered |

## Simplicity axis

- Selected rung: **confirmed** — local reuse. `gh` CLI over a GitHub SDK; `backlog.ts` reused; `git.ts` adapter idiom now mirrored fully (including the `cwd` anchoring and the `gitFor`-style `ghFor` seam).
- Safety floor: `assertAvailable` fails loud; no credential handling in this codebase; schema validation extended consistently — all retained.
- Surface delta: confirmed against the spec — 1 new source file, 1 new test file, 1 new skill, 4 modified source files, `catalog.yaml`, `skills-contract.test.mjs`; no new dependency; no new public interface beyond those listed.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| — | — | already sufficient — no removable or speculative surface survives validation | none | — |

Both deferred constraints (DC-1 `--limit 1000`; DC-2 fixed `area: "workflow"`) retain a known ceiling, observable trigger, and bounded upgrade path.

## Executability audit

- Paths/interfaces: `issues sync` → `issues.sync` dispatch resolves via `args.ts:99`; T4's `COMMAND_OPTIONS`/`KNOWN`/`BOOLEAN_FLAGS`/`ParsedArgs` additions match the existing pattern; T5's `case` matches the switch shape; T6's `overrides?: { gh?: GhAdapter }` threading is flagged in-task. Red/green sound for T1, T3, T6, T7a, T8.
- Dependencies: no new npm package; `gh` flags pinned to `investigation.md`'s captured `--help` output with a mandated Apply-time re-check for version drift.
- Rollback: additive schema + one new module → single-commit revert, no data migration.
- Context independence: the plan is self-contained; all load-bearing facts are in `spec.md`/`investigation.md` with cited `file:line`.
- No unresolved assumption remains. The previously unverified assumption (T2 cwd) is now closed.

## Verdict

`approve`

Plan attempt 2 is contract-complete and executor-ready. The specification's data model, two-way reconciliation algorithm, acceptance criteria, simplicity decision, and explicit adoption of the `CONTEXT.md` Rejected Integration Surface are all correct and verified. Both Plan-1 defects have been corrected in `plan.md` with no change to scope, interfaces, or any AC, and the corrected T1 test is executable against the live `backlog.test.ts` imports. The Review checkpoint may advance to Apply.

Next permitted transition: checkpoint Review with result `approve`; next action `codepatrol-apply 2026-07-25-issue-tracker-sync on codepatrol/2026-07-25-issue-tracker-sync`.

## External evidence sufficiency

Required and sufficient. Load-bearing external claims — `gh issue create` prints the URL (no `--json`, number parsed from URL), `gh issue close --reason {completed|not planned|duplicate}`, `gh label create --force` idempotency, `gh issue list --state all --json …`, public repo with zero existing issues, `gh` 2.96.0 authenticated — are each backed by captured output in `investigation.md` (unchanged from attempt 1, already vetted). The plan mandates an Apply-time re-run of the relevant `gh … --help` against the installed version, which is the correct handling of the only residual external-evidence risk (CLI version drift).

## Residual concerns and evidence gaps

- None blocking. Review did not run `npm run verify` (Apply/Verify authority); judgment is by static reconciliation of every cited location plus the captured `gh` evidence.
- `FakeGhAdapter`-only coverage remains structurally blind to `NodeGhAdapter`'s real-subprocess behavior (cwd, flag drift); the plan mitigates this by mandating direct comparison against `git.ts` for cwd (T2 step 2) and an Apply re-check of `gh` flags, and Verify should confirm the diff's flags match the captured evidence. Stated, not silent.
- The stray trace scratch observed earlier under `.codepatrol/changes/.codepatrol/` is no longer present in this attempt's clean checkout; not relevant to this verdict.
