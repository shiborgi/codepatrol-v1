# Plan — codepatrol-git: two-way backlog/GitHub-issue sync

- Work id: `2026-07-25-issue-tracker-sync`
- Governing spec: `spec.md`
- Target baseline: `main` @ `932edcc79127c3fb84510e1a4b621efb9fc63774`

## Goal and approach

Add a `GhAdapter`/`NodeGhAdapter` pair mirroring `src/change/git.ts`'s subprocess-wrapper idiom,
widen `src/change/backlog.ts`'s schema additively (`"github-issue"` source kind, optional
`workId`, optional `externalRef`), implement the pull/push reconciliation algorithm from the spec
in a new `src/change/issue-sync.ts`, wire it into the CLI as `issues sync [--direction
pull|push|both] [--dry-run]`, and expose it as a new directly-invoked `support`-role skill
`codepatrol-git`. Every test uses an in-memory `FakeGhAdapter` — no real network calls anywhere in
the suite.

## Global constraints

- No new npm dependency (no GitHub SDK) — `gh` CLI only, via `execFile`, matching `git.ts`.
- No change to `orchestrator.ts`'s `backlogItemId` linkage flow, `upsertBacklogItem`,
  `linkBacklogItem`, `listBacklog`, or `findBacklogItem` signatures.
- Every existing `items.yaml` record (all currently `close-trace`/`plan-followup` with a
  `workId`) must continue to validate unchanged — schema widening is strictly additive.
- `scripts/lint-skills.mjs` and `scripts/skills-contract.test.mjs` must both pass with the new
  skill as `role: support` (not `primary` — the six-name primary list is closed and enforced).
- Never run a real `gh issue create`/`gh issue close`/`gh label create` against the actual
  `shiborgi/codepatrol` repo from a test — tests use `FakeGhAdapter` exclusively.
- Before writing `NodeGhAdapter`, re-run `gh issue create --help`, `gh issue close --help`, `gh
  label create --help`, `gh issue list --help` against the installed `gh` version and confirm the
  flags match `plan/evidence/investigation.md`'s captured evidence (installed version may have
  changed between Plan and Apply).

## Simplicity proof

- Selected rung: local reuse
- Reused capabilities: `src/change/git.ts`'s adapter idiom (mirrored, not imported — a different
  interface for a different CLI); `src/change/backlog.ts`'s existing
  `readBacklog`/`writeBacklog`/`classifyPriority`; the user's own authenticated `gh` CLI session
  (no new credential handling).
- Forbidden speculative surface: no multi-provider abstraction, no label-filter config, no
  per-item opt-in push flag, no pagination loop beyond the single `--limit 1000` call — all
  explicitly rejected in the spec's Alternatives/Deferred constraints.
- Expected surface delta: new `src/change/issue-sync.ts`, new `src/change/issue-sync.test.ts`, new
  `skills/codepatrol-git/SKILL.md`; modified `src/change/backlog.ts`, `src/cli/args.ts`,
  `src/cli/commands.ts`, `src/cli/output.ts`, `skills/catalog.yaml`,
  `scripts/skills-contract.test.mjs`.

## Acceptance mapping

| Criterion | Task(s) | Verification |
|---|---|---|
| AC-1 | T2, T3 | `node --test src/change/issue-sync.test.ts` |
| AC-2 | T2, T3 | `node --test src/change/issue-sync.test.ts` |
| AC-3 | T2, T3 | `node --test src/change/issue-sync.test.ts` |
| AC-4 | T2, T3 | `node --test src/change/issue-sync.test.ts` |
| AC-5 | T2, T3 | `node --test src/change/issue-sync.test.ts` |
| AC-6 | T2, T3 | `node --test src/change/issue-sync.test.ts` |
| AC-7 | T2, T3 | `node --test src/change/issue-sync.test.ts` |
| AC-8 | T2, T3 | `node --test src/change/issue-sync.test.ts` |
| AC-9 | T7 | `npm run verify` |

## Dependency order

`T1 → T2 → T3`; `T4 → T5` (CLI wiring, depends on T2's exported `syncIssues`/types); `T5 → T6`
(integration test depends on the CLI wiring existing); `T6 → T7a`; independently, `T7b` (skill +
catalog + contract test) depends only on nothing produced by T1–T6 and can run any time before the
final T8 verification — ordered last here only for narrative clarity, not because it is blocked.
`T8` depends on everything.

### T1 — Widen the backlog schema

**Purpose:** Satisfies the schema half of AC-4 (`source.kind: "github-issue"`, no `workId`) and
AC-6 (`externalRef` field) by making `backlog.ts` accept and validate the new shape.

**Depends on:** none

**Files:**

- Modify: `src/change/backlog.ts`

**Interfaces:**

- Consumes: nothing new
- Produces: `BacklogSourceKind` gains `"github-issue"`; `BacklogSource.workId` becomes
  `workId?: string`; new exported `ExternalRef` interface; `BacklogItem` gains `externalRef?:
  ExternalRef`
- Invariants/errors: `validateSource` throws `CodepatrolError("CHANGE_INVALID", ...)` if `workId`
  is present for `kind: "github-issue"`, or absent/empty for the other two kinds; a new
  `validateExternalRef` throws the same error class for any unknown key, wrong `provider`,
  non-positive-integer `number`, or empty `url`

**Simplicity proof:** Additive schema change only — every existing validator function keeps its
current required-field checks for the two existing kinds; no existing call site
(`upsertBacklogItem`, `linkBacklogItem`) changes behavior.

**Surface delta:** 0 new files; ~20 lines added/changed in `backlog.ts`.

**Steps:**

1. Add the test below to `src/change/backlog.test.ts` (existing file — check it exists and follow
   its structure) before implementing, to observe red. (Review finding: the previous draft of this
   test asserted `upsertBacklogItem` throws for `{ kind: "github-issue" }` with no `workId` —
   backwards, since that shape is exactly what T1 makes *valid*, and `upsertBacklogItem` is never
   the real construction path for `github-issue` items in any case — `syncIssues` in T3 builds
   `github-issue` items directly, since their `id` is `gh-issue-<number>`, not
   `dedupKey(title)`. This corrected version tests `validateSource`'s real invariant — `workId`
   forbidden for `github-issue`, required for the existing two kinds — through the same
   `readBacklog`/`writeBacklog` round-trip `syncIssues` will actually use, and keeps exactly one
   assertion that is genuinely red before T1 and green after.)

   ```typescript
   test("validateSource requires workId for close-trace/plan-followup but forbids it for github-issue", () => {
   	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-backlog-"));
   	try {
   		// unchanged existing-kind behavior: workId still required for plan-followup
   		assert.throws(() => upsertBacklogItem(workspace, { title: "x", area: "workflow", evidence: [], source: { kind: "plan-followup" } as never }), /CHANGE_INVALID/);
   		const itemsDir = join(workspace, ".codepatrol", "backlog"); mkdirSync(itemsDir, { recursive: true });
   		const itemsPath = join(itemsDir, "items.yaml");
   		// github-issue MUST NOT carry a workId
   		writeFileSync(itemsPath, stringify({ schema_version: 1, items: [{ id: "gh-issue-1", title: "t", priority: "p3", area: "workflow", status: "candidate", evidence: [], source: { kind: "github-issue", workId: "should-not-be-here" }, workId: null, count: 1, firstSeenAt: "2026-07-25T00:00:00.000Z", lastSeenAt: "2026-07-25T00:00:00.000Z" }] }));
   		assert.throws(() => readBacklog(workspace), /CHANGE_INVALID/);
   		// github-issue WITHOUT workId, WITH externalRef, round-trips cleanly — this is the red-capable assertion
   		writeFileSync(itemsPath, stringify({ schema_version: 1, items: [{ id: "gh-issue-1", title: "t", priority: "p3", area: "workflow", status: "candidate", evidence: ["https://github.com/x/y/issues/1"], source: { kind: "github-issue" }, externalRef: { provider: "github", number: 1, url: "https://github.com/x/y/issues/1" }, workId: null, count: 1, firstSeenAt: "2026-07-25T00:00:00.000Z", lastSeenAt: "2026-07-25T00:00:00.000Z" }] }));
   		const backlog = readBacklog(workspace);
   		assert.equal(backlog.items[0]?.externalRef?.number, 1);
   		assert.equal(backlog.items[0]?.source.workId, undefined);
   	} finally { rmSync(workspace, { recursive: true, force: true }); }
   });
   ```

   Run: `node --test src/change/backlog.test.ts`. Expected red: the final `readBacklog` call
   throws today, because `"github-issue"` is not yet in `VALID_SOURCE_KINDS` and `externalRef` is
   not yet in `ALLOWED_ITEM_KEYS` — the test fails before reaching its final assertions.
2. In `backlog.ts`, change `BacklogSourceKind`, `BacklogSource`, add `ExternalRef`, add
   `externalRef?: ExternalRef` to `BacklogItem`, add `"externalRef"` to `ALLOWED_ITEM_KEYS`, add
   `"github-issue"` to `VALID_SOURCE_KINDS`.
3. Update `validateSource`: branch on `obj.kind === "github-issue"` — require `obj.workId ===
   undefined` (else `CHANGE_INVALID`); else require the existing non-empty-string check.
4. Add `validateExternalRef(ref: unknown, itemId: string): ExternalRef | undefined` (returns
   `undefined` when `ref === undefined`; otherwise validates shape as above) and call it from
   `validateItem`, storing the result on the returned `BacklogItem`.
5. Run `node --test src/change/backlog.test.ts`. Expected green.

### T2 — GhAdapter and NodeGhAdapter

**Purpose:** Satisfies the adapter half of every AC by providing the subprocess wrapper
`syncIssues` (T3) depends on.

**Depends on:** none (parallel-safe with T1 — different files)

**Files:**

- Create: `src/change/issue-sync.ts` (adapter portion only in this task; `syncIssues` added in T3
  in the same file)

**Interfaces:**

- Produces: `RemoteIssue`, `GhAdapter`, `NodeGhAdapter` (as specified in `spec.md`'s Proposed
  design)
- Invariants/errors: every method throws `CodepatrolError("OPERATION_FAILED", <gh stderr or
  message>, 5, true)` on subprocess failure or cancellation, mirroring
  `NodeGitAdapter.run`/`runBuffer` in `src/change/git.ts:32-49` exactly (same `execFile` +
  `promisify` pattern, same `signal?.aborted` → `CodepatrolError("CANCELLED", ..., 130, true)`
  check first)

**Simplicity proof:** Direct structural mirror of `NodeGitAdapter` — no new subprocess-handling
pattern invented.

**Surface delta:** +1 file (~60 lines).

**Steps:**

1. Before implementing, run these against the installed `gh` to confirm flags still match
   `plan/evidence/investigation.md`: `gh issue create --help`, `gh issue close --help`, `gh label
   create --help`, `gh issue list --help`. Note any drift in the Apply journal if found.
2. Implement `NodeGhAdapter` per the spec's Proposed design, using
   `promisify(execFile)` exactly as `git.ts` does. It **must** take `workspace` in its constructor
   and pass `cwd: this.workspace` to every `execute(...)` call, exactly like `NodeGitAdapter`
   (`git.ts:33`) — a `codepatrol issues sync --workspace /elsewhere` invocation from a different
   `process.cwd()` must still resolve `gh` against the declared workspace, not the shell's cwd
   (Review Finding 2; this is invisible to `FakeGhAdapter`-only tests, so get it right here by
   direct comparison against `git.ts`, not by test feedback):

   ```typescript
   import { execFile } from "node:child_process";
   import { promisify } from "node:util";
   import { CodepatrolError } from "../shared/errors.js";

   const execute = promisify(execFile);
   export interface RemoteIssue { number: number; title: string; url: string; state: "open" | "closed" }
   export interface GhAdapter {
   	assertAvailable(signal?: AbortSignal): Promise<void>;
   	listIssues(signal?: AbortSignal): Promise<RemoteIssue[]>;
   	ensureLabel(name: string, signal?: AbortSignal): Promise<void>;
   	createIssue(title: string, body: string, label: string, signal?: AbortSignal): Promise<RemoteIssue>;
   	closeIssue(number: number, reason: "completed" | "not planned", signal?: AbortSignal): Promise<void>;
   }
   export class NodeGhAdapter implements GhAdapter {
   	constructor(readonly workspace: string) {}
   	private async run(args: string[], signal?: AbortSignal): Promise<string> {
   		try {
   			const result = await execute("gh", args, { cwd: this.workspace, encoding: "utf8", signal, maxBuffer: 8 * 1024 * 1024 });
   			return result.stdout.trim();
   		} catch (cause) {
   			if (signal?.aborted) throw new CodepatrolError("CANCELLED", "Operation cancelled.", 130, true);
   			const error = cause as Error & { stderr?: string };
   			throw new CodepatrolError("OPERATION_FAILED", error.stderr?.trim() || error.message, 5, true);
   		}
   	}
   	async assertAvailable(signal?: AbortSignal): Promise<void> {
   		try { await this.run(["auth", "status"], signal); }
   		catch { throw new CodepatrolError("OPERATION_FAILED", "gh CLI is not installed or not authenticated. Install https://cli.github.com and run `gh auth login`.", 5); }
   	}
   	async listIssues(signal?: AbortSignal): Promise<RemoteIssue[]> {
   		const raw = await this.run(["issue", "list", "--state", "all", "--json", "number,title,state,url", "--limit", "1000"], signal);
   		return (JSON.parse(raw) as Array<{ number: number; title: string; url: string; state: string }>).map((i) => ({ number: i.number, title: i.title, url: i.url, state: i.state.toLowerCase() as "open" | "closed" }));
   	}
   	async ensureLabel(name: string, signal?: AbortSignal): Promise<void> {
   		await this.run(["label", "create", name, "--color", "ededed", "--description", "Codepatrol backlog", "--force"], signal);
   	}
   	async createIssue(title: string, body: string, label: string, signal?: AbortSignal): Promise<RemoteIssue> {
   		const url = await this.run(["issue", "create", "--title", title, "--body", body, "--label", label], signal);
   		const match = /\/issues\/(\d+)/.exec(url);
   		if (!match) throw new CodepatrolError("OPERATION_FAILED", `Could not parse issue number from: ${url}`, 5);
   		return { number: Number(match[1]), title, url, state: "open" };
   	}
   	async closeIssue(number: number, reason: "completed" | "not planned", signal?: AbortSignal): Promise<void> {
   		await this.run(["issue", "close", String(number), "--reason", reason], signal);
   	}
   }
   ```

3. Run `npm run typecheck`. Expected: exits 0 (no test yet for this task — behavior is exercised
   indirectly through T3's `FakeGhAdapter`-based tests, since asserting against `execFile`
   directly would require mocking `node:child_process`, which the codebase does not currently do
   anywhere for `git.ts` either — instead, T5's CLI integration test and T3's unit tests are the
   red/green evidence for the whole module).

### T3 — syncIssues orchestration and unit tests

**Purpose:** Satisfies AC-1 through AC-8 directly.

**Depends on:** T1, T2

**Files:**

- Modify: `src/change/issue-sync.ts` (add `syncIssues`, `SyncDirection`, `IssueSyncOptions`,
  `IssueSyncResult`, `formatIssueBody`)
- Create: `src/change/issue-sync.test.ts`

**Interfaces:**

- Consumes: `GhAdapter` (T2), `readBacklog`/`writeBacklog`/`classifyPriority`/`backlogPath` (T1,
  `backlog.ts`)
- Produces: `syncIssues(workspace: string, direction: SyncDirection, options?: IssueSyncOptions):
  Promise<IssueSyncResult>` as specified
- Invariants/errors: never calls `writeBacklog` or any `GhAdapter` mutation method when
  `options.dryRun` is true; never re-pushes a `github-issue`-sourced item (guarded by
  `!item.externalRef` filter); `syncIssues` resolves its adapter via a private `ghFor(workspace,
  options): GhAdapter { return options.gh ?? new NodeGhAdapter(workspace); }`, mirroring
  `orchestrator.ts`'s `gitFor` exactly — this is the one place `NodeGhAdapter` is constructed with
  the real `workspace` (Review Finding 2); `options.gh` (the `FakeGhAdapter` override) is always
  used when supplied, so no test ever touches the real subprocess path

**Simplicity proof:** Single pass over one fetched issue snapshot; no caching layer, no retry
logic, no rate-limit handling beyond what `gh` itself provides — none of these are required by any
AC.

**Surface delta:** ~90 lines added to `issue-sync.ts`; +1 test file (~150 lines).

**Steps:**

1. Add a `FakeGhAdapter` at the top of `issue-sync.test.ts` (test-local, not exported from
   production code — this is test infrastructure, not a reusable capability):

   ```typescript
   class FakeGhAdapter implements GhAdapter {
   	issues: RemoteIssue[];
   	created: Array<{ title: string; body: string; label: string }> = [];
   	closed: Array<{ number: number; reason: string }> = [];
   	labelsEnsured: string[] = [];
   	private nextNumber: number;
   	constructor(issues: RemoteIssue[] = []) { this.issues = issues; this.nextNumber = (issues.at(-1)?.number ?? 0) + 1; }
   	async assertAvailable(): Promise<void> {}
   	async listIssues(): Promise<RemoteIssue[]> { return this.issues; }
   	async ensureLabel(name: string): Promise<void> { this.labelsEnsured.push(name); }
   	async createIssue(title: string, body: string, label: string): Promise<RemoteIssue> {
   		this.created.push({ title, body, label });
   		const issue = { number: this.nextNumber++, title, url: `https://github.com/x/y/issues/${this.nextNumber - 1}`, state: "open" as const };
   		this.issues.push(issue);
   		return issue;
   	}
   	async closeIssue(number: number, reason: "completed" | "not planned"): Promise<void> {
   		this.closed.push({ number, reason });
   		const issue = this.issues.find((i) => i.number === number); if (issue) issue.state = "closed";
   	}
   }
   ```

2. Write tests (each in its own `mkdtempSync` workspace, `try/finally rmSync`, following every
   existing `backlog.test.ts`/`improvement-report.test.ts` convention) for, at minimum:
   - AC-1: seed a `candidate` item with `externalRef` to a `FakeGhAdapter` issue set to closed;
     run `syncIssues(workspace, "pull", { gh })`; assert `status === "dismissed"`.
   - AC-2: same, reversed (`dismissed` item, issue open → `candidate`).
   - AC-3: seed a `scheduled` item and a `done` item, both linked to closed issues; run pull;
     assert both `status` values unchanged.
   - AC-4: seed one open, unlinked `FakeGhAdapter` issue; run pull; assert exactly one new item
     with `id: gh-issue-<n>`, `source.kind === "github-issue"`, no `workId`, correct
     `externalRef`.
   - AC-5: seed one closed, unlinked issue; run pull; assert no new item created.
   - AC-6: seed a `candidate` item with no `externalRef`; run `syncIssues(workspace, "push", {
     gh })`; assert `gh.created.length === 1` and the item now has a matching `externalRef`.
   - AC-7: seed a `done` item and a `dismissed` item, each linked to an open `FakeGhAdapter`
     issue; run push; assert `gh.closed` contains `{number, reason: "completed"}` and
     `{number, reason: "not planned"}` respectively.
   - AC-8: seed one unlinked candidate and one open unlinked issue; run `syncIssues(workspace,
     "both", { gh, dryRun: true })`; assert `gh.created.length === 0`, `gh.closed.length === 0`,
     `gh.labelsEnsured.length === 0`, and `readBacklog(workspace)` is byte-identical to the
     pre-sync state, while the returned `IssueSyncResult` still reports the item that *would*
     have been created/pushed.
   - A `github-issue`-sourced candidate (created by a prior pull) is never passed to
     `gh.createIssue` on a subsequent push (regression guard for the "never re-push" invariant).

   Run: `node --test src/change/issue-sync.test.ts`. Expected red: `syncIssues` does not exist
   yet.
3. Implement `syncIssues` per the spec's Proposed design (pull phase, then push phase, single
   `listIssues()` fetch shared by both).
4. Run `node --test src/change/issue-sync.test.ts`. Expected green: every test above passes.

### T4 — CLI argument wiring

**Purpose:** Exposes `direction`/`dry-run` as parsed CLI options for the `issues.sync` command.

**Depends on:** none (parallel-safe with T1–T3 — different file, only needs the command-name
string, not the implementation)

**Files:**

- Modify: `src/cli/args.ts`

**Interfaces:**

- Produces: `COMMAND_OPTIONS` gains `["issues.sync", new Set(["direction", "dry-run"])]`; `KNOWN`
  gains `"direction"`, `"dry-run"`; `BOOLEAN_FLAGS` gains `"dry-run"`; `ParsedArgs` gains
  `direction?: string; dryRun?: boolean`, populated as `values.get("direction")?.[0]` and
  `values.has("dry-run")`

**Simplicity proof:** Follows the exact existing pattern for every other command's options
(`backlog.list`'s `status`, `graph.impact`'s several flags) — no new parsing mechanism.

**Surface delta:** ~6 lines changed in `args.ts`.

**Steps:**

1. Add the fields/sets/map-entry described above.
2. Run `npm run typecheck`. Expected: exits 0 (no dedicated `args.test.ts` exists per current
   repo layout — checked in T1's investigation; `cli.test.ts`'s integration tests in T6 exercise
   this parsing indirectly).

### T5 — CLI command dispatch and output rendering

**Purpose:** Wires `issues sync` end-to-end: parses → calls `syncIssues` → renders result.

**Depends on:** T3 (needs `syncIssues`/`IssueSyncResult`), T4 (needs `ParsedArgs.direction`/`dryRun`)

**Files:**

- Modify: `src/cli/commands.ts`
- Modify: `src/cli/output.ts`

**Interfaces:**

- Consumes: `syncIssues`, `SyncDirection`, `IssueSyncResult` from `../change/issue-sync.js`
- Produces: new `"issues.sync"` case in `executeCommand`'s switch; new `renderIssueSyncResult(result:
  IssueSyncResult): string` in `output.ts`; `HELP` gains an "Issue sync commands:" section

**Invariants/errors:** invalid `--direction` (anything other than `pull`/`push`/`both`) throws
`CodepatrolError("INVALID_ARGUMENT", ...)` before calling `syncIssues`, matching `backlog.list`'s
existing `--status` validation style exactly.

**Simplicity proof:** One new `case` block matching the existing switch's shape; one new render
function matching `renderBacklogList`'s shape (plain string, no template engine).

**Surface delta:** ~15 lines in `commands.ts`, ~10 lines in `output.ts`.

**Steps:**

1. In `commands.ts`, add:

   ```typescript
   case "issues.sync": {
   	const direction = (args.direction ?? "both") as SyncDirection;
   	if (!["pull", "push", "both"].includes(direction)) throw new CodepatrolError("INVALID_ARGUMENT", `INVALID_ARGUMENT: issues sync --direction must be one of pull|push|both, got ${direction}.`, 2);
   	const result = await syncIssues(workspace, direction, { signal, dryRun: args.dryRun });
   	return { data: result, text: renderIssueSyncResult(result) };
   }
   ```

2. In `output.ts`, add `renderIssueSyncResult` (plain multi-line summary: pulled
   created/dismissed/reopened/skippedClosed counts, pushed created/closed counts, and a `(dry
   run)` suffix when `result.dryRun`), and add to `HELP`:

   ```
   Issue sync commands:
     issues sync [--direction pull|push|both] [--dry-run]
   ```

3. Run `npm run typecheck`. Expected: exits 0.

### T6 — CLI integration test

**Purpose:** Confirms the full parse → dispatch → render path works together, using dependency
injection to keep the real `gh` binary out of the test.

**Depends on:** T5

**Files:**

- Modify: `src/cli/cli.test.ts` (or create `src/cli/issues-sync.test.ts` if `cli.test.ts` does not
  already accept an injectable `gh` — check `executeCommand`'s signature first; if it does not
  currently accept an options bag for injection, this task must also thread one through, since
  `executeCommand(args, workspace, signal)` as seen in `commands.ts:109` has no adapter-injection
  parameter today)

**Interfaces:**

- Consumes: `executeCommand` (may need a fourth parameter, e.g. `overrides?: { gh?: GhAdapter }`,
  threaded only to the `"issues.sync"` case — every other case ignores it)

**Invariants/errors:** the test must never invoke the real `gh` binary.

**Simplicity proof:** Minimal threading of one optional override parameter, scoped to the one
command that needs it; no global DI container.

**Surface delta:** ~4 lines changed in `commands.ts`'s signature if threading is needed; +1 test
(or new small test file).

**Steps:**

1. Inspect `executeCommand`'s current signature and every existing call site
   (`main.ts`, any test file) before deciding whether to add a parameter or accept the
   `FakeGhAdapter` some other way (e.g. a module-level injectable default is rejected — global
   mutable state — prefer a parameter).
2. Add a CLI-level test seeding a temp workspace's `items.yaml`, calling `executeCommand({
   command: "issues.sync", direction: "push", ... } as ParsedArgs, workspace, signal, { gh: new
   FakeGhAdapter() })`, and asserting the returned `data`/`text` matches an expected
   `IssueSyncResult`.
   Run: `node --test src/cli/cli.test.ts`. Expected red before wiring, green after.
3. Run `npm run typecheck && node --test src/cli/cli.test.ts`. Expected: exits 0.

### T7a — Skill and catalog

**Purpose:** Exposes the feature as the user-requested `codepatrol-git` skill.

**Depends on:** T5 (the skill's body references the real CLI command it wraps)

**Files:**

- Create: `skills/codepatrol-git/SKILL.md`
- Modify: `skills/catalog.yaml`
- Modify: `scripts/skills-contract.test.mjs`

**Interfaces:** none (documentation/manifest only)

**Simplicity proof:** Thin wrapper matching `codepatrol-status`'s shape exactly — no new
lifecycle semantics, no Change mutation.

**Surface delta:** +1 file (~30 lines), ~10 lines changed across the two manifest/test files.

**Steps:**

1. Write `skills/codepatrol-git/SKILL.md` with frontmatter `name: codepatrol-git`,
   `description: (codepatrol) Two-way sync the local backlog with GitHub issues on the current
   origin remote via the gh CLI. Use to pull open issues into backlog candidates and push
   unlinked candidates as new issues.` and a body describing: run `codepatrol issues sync
   [--direction pull|push|both] [--dry-run]`, reproduce its output verbatim, never touch Change
   lifecycle state, requires `gh auth login` to already be done.
2. Add the `codepatrol-git` entry to `skills/catalog.yaml`: `role: support`, `invokedBy: []`,
   `mayInvoke: []`, `consumes: [backlog items, GitHub issues on origin]`, `produces: [reconciled
   backlog items, reconciled GitHub issues]`, `mutation: artifacts`.
3. Add `"codepatrol-git"` to `scripts/skills-contract.test.mjs`'s `support` array (alphabetical
   position after `"codebase-design"`, before `"diagnose-bug"`).
4. Run `npm run lint:skills`. Expected: exits 0 with "Skill catalog, frontmatter, dependencies,
   portability, and relative links are valid."
5. Run `node --test scripts/skills-contract.test.mjs`. Expected: green (the updated `support`
   array now matches the catalog).

### T8 — Full verification and graph refresh

**Purpose:** Satisfies AC-9; maps every criterion back to a passing gate; confirms no undeclared
surface change.

**Depends on:** T1, T2, T3, T4, T5, T6, T7a

**Files:** none (verification only)

**Steps:**

1. Run `npm run typecheck`. Expected: exits 0.
2. Run `npm test`. Expected: exits 0, including every new test from T1, T3, T6, T7a.
3. Run `npm run build`. Expected: exits 0.
4. Run `npm run smoke:cli`. Expected: exits 0.
5. Run `npm run lint:skills`. Expected: exits 0.
6. Run `git diff --stat 932edcc79127c3fb84510e1a4b621efb9fc63774` and confirm exactly the files
   listed in the spec's Simplicity decision "Expected surface delta" changed — reconcile and
   explain any difference before proceeding.
7. Confirm zero real `gh issue create`/`gh issue close`/`gh label create` calls were made against
   `shiborgi/codepatrol` during Apply (`gh issue list --state all --json number --limit 5` should
   still return `[]`, matching the pre-Change baseline captured in
   `plan/evidence/investigation.md`) — this is a hard requirement, not a suggestion.
8. Run `codepatrol graph sync` and confirm it completes with no new extraction errors for every
   changed/new file.
9. Rollback check: reverting the single Apply commit restores the prior (no-sync) behavior with no
   data migration to undo (schema widening was additive-only).
10. Residual risk check: confirm DC-1 (1000-issue ceiling) and DC-2 (fixed `area: "workflow"`) are
    both stated as accepted, not silently worked around; confirm no test exercised the real `gh`
    binary.
