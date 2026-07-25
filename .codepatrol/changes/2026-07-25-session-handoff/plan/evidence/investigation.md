# Investigation — Faithful per-stage todo lists and harness handoff

- Work id: `2026-07-25-session-handoff`
- Baseline: `main` @ `c8d8ddc815dd19912ce91fb6973a703100083a3a`; clean worktree; graph synced (70 files, 1826 symbols).

## The two candidate mechanisms, read in full

### Stage Session — `src/change/session.ts` (140 lines, read in full)

- Storage: `.codepatrol/runtime/sessions/<work-id>/<stage>/<attempt>.json` (`src/shared/state.ts:21-22`). **Gitignored** via `.gitignore:6` (`.codepatrol/runtime/`) — verified with `git check-ignore -v`, which reports the rule hit.
- Shape (`:11-12`): mutable `SessionItem[]` with `id`, `title`, `status: open|claimed|closed`, `dependencies[]`, optional `claim{actor,at}`, `result` (≤4000 chars), `artifacts[]`.
- Protocol: `primeStageSession` (`:99`), `claimSessionItem` (`:107`), `closeSessionItem` (`:127`), `sessionStatus` (`:64`), `discardAndRebuildSession` (`:135`) — all exposed through one CLI verb `change session --input -` with an `action` discriminator (`src/cli/commands.ts:125-137`).
- **`deriveItems` (`:48-62`) is where both defects live:**
  - `:49` — for every stage except `apply`, it returns exactly **one** opaque item: `{ id: "<stage>-work", title: "Complete <stage> stage contract", status: "open", dependencies: [] }`. Plan, Review, Verify and Close therefore have **no todo list at all** — nothing to resume, nothing to hand off, no partial progress representable.
  - `:50-61` — for `apply`, it parses `plan/plan.md`'s `### T<n> — <title>` headings (`:53`) and `**Depends on:**` lines (`:57`) into a real dependency-ordered list. This half already works and is the model the other stages lack.
  - Every derived item is unconditionally `status: "open"` (`:59`, `:49`, `:51`, `:61`). **Nothing reconciles against work already done.**
- `loadOrDerive` (`:81-93`): returns the on-disk session when it parses and validates, otherwise derives a fresh all-open one. `discardAndRebuildSession` (`:135-139`) *always* re-derives, unconditionally discarding every claim and close.

### Trace — `src/change/trace.ts` (105 lines, read in full)

- Storage: `.codepatrol/runtime/traces/<work-id>.jsonl` (`:12-14`). **Also gitignored** by the same `.gitignore:6` rule; **also** under `.codepatrol/runtime/`.
- Shape (`:4-7`): append-only JSONL, three variants — `command`, `event`, `error`. Secret-redacting (`:24-45`), size-rotating at 10 MB (`:10`, `:58-65`), fire-and-forget on failure (`:67-69`).
- Lifetime: **deleted at Close** (`:96-104`, called from `orchestrator.ts:421`), after feeding `generateImprovementReport` → recommendations → backlog items.
- Producers: every CLI command (`src/cli/main.ts:58`) and every orchestrator event (`orchestrator.ts:186, :306, :403`).

## Finding 1 — the implementation contradicts its own written contract

`skills/_shared/SESSION.md` states verbatim: *"If the file is missing or corrupt, use action `rebuild`; **the accepted Change artifacts reconstruct it**."*

`discardAndRebuildSession` (`session.ts:135-139`) does **not** reconstruct from accepted Change artifacts. It calls the same `deriveItems` and emits an all-`open` list. For Apply it reads `plan/plan.md` — the *plan*, i.e. what was intended, never `apply/journal.md` — what was actually done. For every other stage it emits one opaque placeholder. The documented promise is unimplemented. Confidence: high (contract text and implementation both read in full this session).

## Finding 2 — first-hand reproduction of the handoff failure, this workspace

`2026-07-25-docs-consolidation`'s Apply stage (closed, terminal, tag `codepatrol/committed/2026-07-25-docs-consolidation`) is a recorded instance. Its `apply/journal.md` "Baseline reconciliation" section documents, durably and git-tracked:

> *a prior Apply session's Stage Session claimed T1–T4 "complete" with no journal, no artifacts, and no checkpoint; none of the four tasks' actual file changes were present in the working tree… The session was stale/untrustworthy and was rebuilt.*

Both failure directions are demonstrated by that single incident:
- **False-positive progress** — a session asserted four closed items that no durable artifact corroborated. Nothing in the protocol can detect this, because the session is the only claimant and nothing cross-checks it.
- **Amnesiac recovery** — the only available remedy was `rebuild`, which discards everything and restarts the stage from zero. Had real work existed, it would have been invisible to the successor harness.

Confidence: high (durable git-tracked artifact in this repository, plus the branch history).

## Finding 3 — durable, machine-readable per-task evidence already exists and is already conventional

`plan/plan.md`'s task format mandates `**Task result:** append to apply/journal.md` for every task, and `apply/journal.md` in practice carries one `### T<n> — <title>` section per task with a `- Result: complete` line. Verified across **two different harnesses** to rule out single-author coincidence:

| Journal | Sections found |
|---|---|
| `2026-07-25-commit-scoping` (opencode / MiniMax-M3) | `### T1…`, `### T2…`, `### T3…`, `### T4…`, each followed by `- Result: complete` |
| `2026-07-25-docs-consolidation` (claude-sonnet-5) | `### T1…`, `### T2…`, `### T3…`, `### T4…`, same marker |

The reconciliation substrate the contract promises therefore **already exists on disk**, in a stable format, written by every harness, and is simply never read. Confidence: high (grepped both journals).

Equivalently for non-Apply stages: each stage's required durable artifacts are already enumerated canonically in `orchestrator.ts:254-259`'s `required` map (`plan` → `spec.md` + `plan.md`; `review` → `report.md`; `apply` → `journal.md`; `verify` → `report.md`). Existence of those files on disk is the same kind of already-available evidence.

## Finding 4 — the trace records that a session command happened, never what it did

`main.ts:58` traces every CLI invocation as `{kind:"command", command, args}`. For `change session`, `ParsedArgs` carries only `{id, input}` — `input` is a file path or `-`. The `action`, `itemId` and `actor` live inside the JSON payload read from stdin, which is never traced. So the trace can report *"`change.session` was invoked 47 times"* (and does — this is the origin of the recurring `command … was invoked N times` backlog item) but can never report *which item* was claimed, closed, or abandoned. Item-level progress is invisible to the improvement report. Confidence: high (read `main.ts:58`, `args.ts` `ParsedArgs`, `commands.ts:125-126`).

## Synergy analysis — what to unify, and what deliberately not to

The user's brief asks to unify if it reduces complexity. Compared on the axes that matter:

| | Stage Session | Trace |
|---|---|---|
| Shape | mutable keyed state, validated, dependency graph | append-only immutable log lines |
| Scope | one stage attempt | whole Change |
| Lifetime | per attempt; rebuilt freely | deleted at Close |
| Consumer | the claim/close protocol (read-modify-write, locked) | `generateImprovementReport` (read-once, aggregate) |
| Failure mode | must fail closed (validated, `CHANGE_INVALID`) | must fail open (fire-and-forget, `:67-69`) |

**Merging them into one store is rejected**: a single store cannot be simultaneously append-only and read-modify-write, fail-open and fail-closed, per-attempt and per-Change. Any merger reintroduces both shapes behind one name and *adds* complexity. Both being gitignored siblings under `.codepatrol/runtime/` is a coincidence of storage class, not evidence of duplicated responsibility.

**The genuine duplication is elsewhere, and it is the actual simplification available**: today the session is an *independent, unverified claim* about progress that competes with the durable stage artifacts as a source of truth. Removing that competition — making the session a **projection reconciled from durable evidence** rather than a parallel record — deletes a whole class of divergence (Finding 2) without adding any store. One source of truth (the stage's durable artifacts), two disposable views (session for claiming, trace for telemetry).

**The one unification worth building** is the missing item-level trace line (Finding 4): session transitions emit a trace entry, so the *existing* improvement-report → backlog pipeline can surface abandoned/re-claimed items automatically. This is ~15 LOC, reuses machinery that already exists end-to-end, adds no store, and closes the loop that Finding 2's incident had to be discovered by hand.

## Boundary: which handoff this can and cannot solve

Reconciliation reads the stage's artifacts **from the working tree**. That fully covers the realistic and observed case: the agent session dies, a fresh agent session starts on the same checkout (exactly Finding 2's incident).

It does **not** cover a successor harness on a *different* machine or a fresh clone mid-stage, because mid-stage artifacts are uncommitted until the stage checkpoint, and committing them early would collide with the checkpoint's declared-delta validation (`orchestrator.ts:266-270`, `:291-292`), which requires the candidate delta to match the declared artifact/production paths exactly. That is a genuine design tension, not an oversight, and is recorded as a deferred constraint rather than silently half-solved.

## Finding 5 — the first reconciliation design was attempt-blind (found by validation review, Plan attempt 3)

Plan attempt 2's `itemIsDelivered` credited any non-empty artifact on disk. Attempts are the unit of independence (`ROLES.md:45`), a returned attempt's artifacts stay on disk **and stay committed**, so the predicate would credit the *current* attempt with a *prior* attempt's work. Reproduced live against this Change's own state: `review/report.md` was written and sealed by review attempt 2 (`Incoming revision: 2`, `Reviewer: claude-sonnet-5`), that attempt was then invalidated by Apply attempt 2's return, and the file remains on disk and committed. The pre-fix predicate returns `true` — a future review attempt would derive `report` as `closed` having produced nothing. Exactly the "todo list misrepresents reality" failure this Change exists to eliminate, reintroduced by the Change's own fix.

The fix is decidable from data already recorded: `change.yaml` stores `artifacts[].sha256` per attempt. Verified on the live file — its hash `ec2f8295eb7fad974ce7d665533b037ad6e6a759c79383d48c2b7fb1ba3e139e` appears exactly once in `change.yaml` (the review attempt 2 binding), so "is this file stale?" is answerable without clocks, mtimes or filesystem heuristics. Confidence: high (both the defect and the fix's decidability executed this session).

## Finding 6 — persona artifacts were invisible to the first reconciliation design

Parallel Review/Verify personas do not write the consolidated `report.md`. `skills/codepatrol-review/SKILL.md:29` and `skills/codepatrol-verify/SKILL.md:28` prescribe `review/report-security.md` / `verify/report-security.md`; `src/change/orchestrator-parallel.test.ts:35,41` exercises `review/findings-security.md` and `review/findings-architecture.md`. Plan attempt 2 keyed the `review`/`verify` item on the single exact path `review/report.md`, so two personas could fully deliver and the checklist would still read `open` — understating progress, the opposite polarity of Finding 5 but the same root cause: evidence bound to one fixed filename. Fixed by prefix matching (AC-11). Confidence: high (skills and test read).

Persona *item ids* are a distinct concern: `deriveItems` is static while ids like `review-security` are chosen at runtime by the coordinator, and `personaSubEvents` only records them after a persona checkpoints — too late to seed a todo list. Claiming such an id fails today (`no such item`) and still fails after this Change; that is pre-existing behaviour, not a regression, and is recorded as DC-4 with an explicit upgrade path rather than silently frozen.

## Test-coverage baseline

There is no `session.test.ts`. Session coverage lives inside `src/change/change.test.ts` (`:99-190`, found via `grep -rln "primeStageSession"`): prime-derives-open (`:102-103`), Apply-derives-plan-tasks-with-dependencies (`:109-124`), `sessionStatus` ready/blocked (`:150-163`), no-write-on-read (`:165`), claim (`:177`). None of them exercises rebuild-after-partial-work, because that behavior does not exist yet. New tests land beside these, in the same file, reusing its fixtures.
