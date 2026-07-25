# Review — codepatrol-git: two-way backlog/GitHub-issue sync

- Change: `2026-07-25-issue-tracker-sync`
- Incoming revision: 1
- Reviewed revision: 1 (no in-place edits; `fix-first` returns to a new Plan attempt)
- Reviewer: opencode (codepatrol-review skill)
- Evidence date: 2026-07-25T22:00Z

## Scope and evidence

Reconciled the projection against Git and declared artifacts before judging:

- `codepatrol change inspect --id 2026-07-25-issue-tracker-sync` → stage `review`, attempt 1, state `ready`; branch `codepatrol/2026-07-25-issue-tracker-sync` checked out at `d439257` (the plan checkpoint transition commit; plan content commit `f034d81`, tree `39fb69a`). Matches `change.yaml`'s `stage-checkpointed` event.
- Artifact hashes re-verified with `shasum -a 256`: `spec.md` `3b4a667d…`, `plan.md` `25a7ca45…`, `investigation.md` `c10bde51…` — all match `change.yaml` bindings.
- Baseline confirmed: target `main` @ `932edcc…`; feature branch starts from `406698c` (start) → `1c53f74` (usage) → `f034d81` (plan content) → `d439257` (checkpoint plan). No target advance; base commit unchanged.
- Cited files/interfaces re-checked against the actual tree: `src/change/git.ts:7-44` (`GitAdapter`/`NodeGitAdapter.run` passes `cwd: this.workspace`, constructor takes `workspace`); `src/change/backlog.ts:9-54` (`BacklogStatus` includes `done`/`dismissed`, `VALID_SOURCE_KINDS` is exactly the two kinds, `ALLOWED_ITEM_KEYS` lacks `externalRef`, `validateSource` requires `workId` unconditionally, `upsertBacklogItem` derives `id` from `dedupKey(title)`); `src/cli/args.ts:31-56` (dispatch + per-command option validation); `src/cli/commands.ts:51,154-181` (`executeCommand` signature `args, workspace, signal` — no injection parameter; switch keyed on `positionals.join(".")`); `scripts/lint-skills.mjs:7,102-111` (six-name primary closed set; frontmatter keys exactly `description,name`; `order` only for the five lifecycle primaries); `scripts/skills-contract.test.mjs:9-11` (exact ten-name `support` array, asserted `deepEqual`); `skills/catalog.yaml` (`codepatrol-status` is `role: primary`, `invokedBy: []`, `mutation: never` — confirms a directly-invoked, empty-`invokedBy` skill is an accepted shape); `CONTEXT.md:52-54` (Rejected Integration Surface clause verbatim, with the "unless a future Change explicitly adopts them" escape hatch this Change invokes); `src/shared/errors.ts:20,42` (`OPERATION_FAILED` exit 5); existing `.codepatrol/backlog/items.yaml` entries (all `close-trace`/`plan-followup` with source-level `workId`, item-level `workId: null` — additive widening is backwards-compatible).
- Red capability re-checked for each task: T3 (`syncIssues` undefined → import/lookup failure, red), T6 (no `issues.sync` case → unknown-command, red), T7a (`lint:skills` + contract test fail until catalog and the ten-name array are updated together, red). T1's red capability is broken — see Finding 1.
- Limitations: Review did not run `npm run verify` (that is Apply/Verify authority); judgment is by static reconciliation of every cited location against the live tree plus the captured `gh --help` evidence in `investigation.md`.

## Findings

### major — plan — Finding 1: T1's red unit test assertion is inverted and can never reach green

`plan.md` T1 step 1 injects this test into `src/change/backlog.test.ts` and documents "Expected red" then "Expected green" (step 5):

```typescript
assert.throws(() => upsertBacklogItem(workspace, { title: "x", area: "workflow", evidence: [], source: { kind: "github-issue" } as never }), /CHANGE_INVALID/);
```

Traced against the live code:

- **Before implementation:** `validateSource` (`backlog.ts:51`) calls `isSourceKind("github-issue")`, which fails against `VALID_SOURCE_KINDS` (`backlog.ts:32`, exactly `close-trace | plan-followup`) → throws `CHANGE_INVALID`. The `assert.throws` therefore **passes** today; this line is not red.
- **After T1's implementation:** `validateSource` branches on `kind === "github-issue"` and requires `workId === undefined`. The input `{ kind: "github-issue" }` has no `workId` → absent → **valid**, so `upsertBacklogItem` proceeds and does not throw. `assert.throws` now **fails**.

So the assertion is green-before / red-after — the documented red→green transition is inverted, and the test as written can never be made green. The test's own title states the real invariant ("forbids [workId] for github-issue"), which is the opposite of what the assertion exercises (it omits `workId`). An independent Apply agent following T1 verbatim stalls at strict red/green: step 5's "Expected green" is unreachable.

Impact is bounded to this one auxiliary unit test; AC verification is unaffected because the acceptance matrix maps AC-1..AC-8 to T2/T3 (`issue-sync.test.ts`), not to T1's scaffolding test.

Required correction: change the assertion to match its stated invariant — pass `{ kind: "github-issue", workId: "x" }` and assert `CHANGE_INVALID` (forbidding `workId`), and separately assert `{ kind: "github-issue" }` is accepted. Alternatively, drop the inverted assertion and rely on T3's AC-4 round-trip (which already exercises the schema through `readBacklog`/`writeBacklog`).

### major — plan/evidence — Finding 2: T2's `NodeGhAdapter` does not anchor `gh` to `workspace`, breaking the stated "mirror NodeGitAdapter exactly" invariant

The spec's Proposed design states `NodeGhAdapter` "mirrors `src/change/git.ts`'s `NodeGitAdapter` … exactly — same `execFile`-based `run` helper." The live `NodeGitAdapter` (`git.ts:33-43`) takes `workspace` in its constructor and passes `cwd: this.workspace` to `execute`. `plan.md` T2's code sample instead gives `NodeGhAdapter` a no-argument constructor and calls `execute("gh", args, { encoding: "utf8", signal, maxBuffer })` with **no `cwd`**, so `gh` resolves the repo from `process.cwd()`.

`resolveWorkspace` (`src/shared/workspace.ts:10`) resolves the workspace from `--workspace`, then `$CODEPATROL_WORKSPACE`, then `process.cwd()` — so a user running `codepatrol issues sync --workspace /elsewhere` from another directory is a supported invocation, and every other adapter (`NodeGitAdapter`) anchors to the resolved workspace precisely so this works. T2 silently regresses that invariant: `gh` would operate on the repo under `process.cwd()`, not the declared workspace.

Critically, the plan's own verification strategy cannot detect this — T3 and T6 test exclusively through `FakeGhAdapter`, which never exercises the real subprocess or its `cwd`. The defect would ship as a latent correctness bug for any `--workspace` invocation, invisible to `npm run verify`.

Required correction: `NodeGhAdapter` takes `workspace` in its constructor; `run` passes `cwd: this.workspace`; `syncIssues` constructs `new NodeGhAdapter(workspace)` when no `options.gh` override is supplied (and T5's `issues.sync` case already threads `workspace` into `syncIssues`, so no new plumbing is needed there).

## Artifact adjustments

| Artifact | Change | Reason | Acceptance criteria affected |
|---|---|---|---|
| `spec.md` | none | Data model, pull/push algorithm, AC-1..AC-9, and simplicity decision are correct and complete; cited `gh`/`backlog.ts`/`git.ts` evidence checks out | — |
| `plan.md` | correct T1's inverted unit-test assertion (Finding 1); correct T2's `NodeGhAdapter` to take `workspace` and pass `cwd` (Finding 2) | restore the documented red→green cycle; honor the spec's "mirror NodeGitAdapter exactly" invariant and the workspace-anchoring convention every other adapter follows | none — no AC, interface, or scope change |

## Acceptance coverage

| Criterion | Spec is unambiguous | Plan task(s) | Verification is red-capable | Result |
|---|---|---|---|---|
| AC-1 | yes | T2, T3 | yes — `syncIssues` undefined before T3, test seeds candidate→closed-issue | covered |
| AC-2 | yes | T2, T3 | yes — dismissed↔open reversal | covered |
| AC-3 | yes | T2, T3 | yes — scheduled/done immunity | covered |
| AC-4 | yes | T1, T2, T3 | yes — open unlinked issue import; schema round-trip | covered |
| AC-5 | yes | T2, T3 | yes — closed unlinked issue never imported | covered |
| AC-6 | yes | T2, T3 | yes — candidate without `externalRef` → exactly one `createIssue` | covered |
| AC-7 | yes | T2, T3 | yes — done/dismissed → `closeIssue` reason mapping | covered |
| AC-8 | yes | T2, T3 | yes — `dryRun` zero-write + zero-`gh`-mutation assertion | covered |
| AC-9 | yes | T7a, T8 | yes — updated `skills-contract.test.mjs` eleven-name array + `npm run verify` | covered |

No AC is blocked by Findings 1–2; they defect the plan's executable instructions (one unit test, one adapter detail), not the contract or its verification matrix.

## Simplicity axis

- Selected rung: **confirmed** — local reuse. `gh` CLI (already installed/authenticated) over a GitHub SDK; `backlog.ts`'s `readBacklog`/`writeBacklog`/`classifyPriority` reused; `git.ts`'s adapter idiom mirrored (Finding 2 is precisely a failure to mirror it fully — corrected by the return).
- Safety floor: `assertAvailable` fails loud on missing/unauthenticated `gh` (no silent no-op); no credential handling enters this codebase (`gh`'s own session); schema validation extended consistently with every existing `backlog.ts` field. All retained.
- Surface delta: confirmed against the spec — 1 new source file, 1 new test file, 1 new skill, 4 modified source files, `catalog.yaml`, `skills-contract.test.mjs`; no new npm dependency; no new public interface beyond those listed.

| Category | Location | Removable surface or replacement | Safety/acceptance impact | Disposition |
|---|---|---|---|---|
| simplify | `plan.md` T1 inverted assertion | replace with the invariant-matching assertion (or drop for T3 coverage) | none | required correction (Finding 1) |
| simplify | `plan.md` T2 `NodeGhAdapter.run` | add `workspace` constructor arg + `cwd: this.workspace` | correctness for `--workspace` users | required correction (Finding 2) |

Both deferred constraints (DC-1 single `--limit 1000`; DC-2 fixed `area: "workflow"`) have a known ceiling, an observable trigger, and a bounded upgrade path — accepted, not silently worked around.

## Executability audit

- Paths/interfaces: `issues sync` → `issues.sync` dispatch key resolves correctly through `args.ts:99` (`positionals.slice(0,2).join(".")`); `COMMAND_OPTIONS`/`KNOWN`/`BOOLEAN_FLAGS`/`ParsedArgs` additions in T4 are the exact existing pattern; `executeCommand`'s new `case` matches the switch shape; `renderIssueSyncResult` matches `renderBacklogList`'s plain-string shape. T6's injection of `overrides?: { gh?: GhAdapter }` is necessary and the plan flags it (T6 step 1) — T5's code sample does not show the threading, but T6 owns it; minor narrative seam, not a defect.
- Dependencies: no new npm package; `gh` flags pinned against `investigation.md`'s captured `--help` output, with a mandated re-check at Apply (global constraint) for version drift.
- Red/green: sound for T3, T6, T7a, T8; **broken for T1** (Finding 1).
- Rollback: additive schema widening + one new module → single-commit revert, no data migration.
- Context independence: the plan is readable without Plan-stage chat history; all load-bearing facts are in `spec.md`/`investigation.md` with cited `file:line`.
- Unresolved assumption: T2's sample assumes `gh` resolves the repo from cwd (Finding 2 shows this is wrong for `--workspace`).

## Verdict

`fix-first`

The specification is contract-complete (data model, two-way reconciliation algorithm, acceptance criteria, simplicity decision, and the explicit adoption of the CONTEXT.md Rejected Integration Surface are all correct and verified against the live tree). The plan, however, carries two bounded execution defects that an independent Apply agent cannot resolve without deviating from its verbatim instructions: T1's red unit assertion is inverted (never green), and T2's `NodeGhAdapter` does not anchor to `workspace`, violating the spec's own "mirror NodeGitAdapter exactly" invariant in a way the `FakeGhAdapter`-only test strategy cannot catch. Neither changes scope, interfaces, or any AC. Review returns this attempt to Plan for a new attempt that corrects `plan.md` T1 and T2; the spec is unchanged.

Next permitted transition: a new Plan attempt on `codepatrol/2026-07-25-issue-tracker-sync`, then resubmit to Review.

## External evidence sufficiency

Required and sufficient. Load-bearing external claims — `gh issue create` has no `--json` mode (number parsed from the printed URL), `gh issue close --reason {completed|not planned|duplicate}`, `gh label create --force` is idempotent, `gh issue list --state all --json …`, the repo is public with zero existing issues and `gh` 2.96.0 is authenticated — are each backed by captured command output in `investigation.md` and re-checked here against the codebase's error-code/exit-code vocabulary (`OPERATION_FAILED`/5, `CANCELLED`/130). The plan additionally mandates an Apply-time re-run of the relevant `gh … --help` outputs against the installed version (global constraint + T2 step 1), which is the correct handling of the only residual external-evidence risk (CLI version drift).

## Residual concerns and evidence gaps

- T1 and T2 (above) are the blocking concerns; both are bounded and localized, with obvious corrections that do not touch the spec.
- Could not run `npm run verify` from Review (not Review's authority); relied on static reconciliation of every cited `file:line` and every interface the plan touches. The fake-adapter test strategy is sound for the reconciliation algorithm but is structurally blind to `NodeGhAdapter` subprocess details (cwd, flag drift) — Finding 2 is one instance; `investigation.md`'s captured `--help` output plus the mandated Apply re-check are the mitigation, and Verify should confirm the flags in the diff match that captured evidence.
- A stray trace file exists at `.codepatrol/changes/.codepatrol/runtime/traces/2026-07-25-issue-tracker-sync.jsonl` (the trace subsystem resolved its path relative to a `changes/` cwd). It is rebuildable runtime scratch, not a declared artifact, not on any production path, and is not staged by `begin`/`usage`/`return` transitions (which stage only the record). Pre-existing tooling quirk, unrelated to this Change's scope; noted for transparency, not a finding against this Plan.
