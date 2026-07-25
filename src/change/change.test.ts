import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { foldChange, migrateRecord } from "./model.js";
import { aggregateUsage } from "./usage.js";
import { primeStageSession, claimSessionItem, closeSessionItem, discardAndRebuildSession, sessionStatus, readStageSession } from "./session.js";
import { writeChangeRecord, readChangeRecord } from "./store.js";
import { stageSessionPath } from "../shared/state.js";
import { closeChange, transitionChange } from "./orchestrator.js";
import { validateArtifactBindings } from "./validation.js";
import { CodepatrolError } from "../shared/errors.js";
import * as trace from "./trace.js";
import type { ArtifactBinding, ChangeRecordV2, Stage } from "./types.js";

function fixture(name: string): ChangeRecordV2 {
	return parse(readFileSync(resolve("src/change/fixtures", name), "utf8")) as ChangeRecordV2;
}

function recordAtStage(stage: Stage): ChangeRecordV2 {
	if (stage === "plan") return fixture("active-change.yaml");
	const record = fixture("committed-change.yaml");
	const previous = { review: "plan", apply: "review", verify: "apply", close: "verify" } as const;
	const index = record.events.findIndex((event) => event.type === "stage-checkpointed" && event.stage === previous[stage]);
	record.events = record.events.slice(0, index + 1);
	assert.equal(foldChange(record).stage, stage);
	return record;
}

function artifactBinding(record: ChangeRecordV2, relativePath: string, content: string): ArtifactBinding {
	return { path: `.codepatrol/changes/${record.identity.work_id}/${relativePath}`, sha256: createHash("sha256").update(content).digest("hex"), intent: "create" };
}

function writeStageArtifact(workspace: string, record: ChangeRecordV2, relativePath: string, content: string): void {
	const path = join(workspace, `.codepatrol/changes/${record.identity.work_id}/${relativePath}`);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
}

function reviewAttemptTwo(priorArtifacts: Array<{ relativePath: string; content: string }>): ChangeRecordV2 {
	const record = recordAtStage("apply");
	const reviewCheckpoint = record.events.find((event) => event.type === "stage-checkpointed" && event.stage === "review");
	assert.ok(reviewCheckpoint?.type === "stage-checkpointed");
	reviewCheckpoint.artifacts = priorArtifacts.map((item) => artifactBinding(record, item.relativePath, item.content));
	record.events.push(
		{ id: "stale-apply-begin", type: "stage-began", at: "2026-07-22T10:04:00Z", actor: "codex", stage: "apply", attempt: 1, next_action: "apply" },
		{ id: "stale-apply-run", type: "run-recorded", at: "2026-07-22T10:05:00Z", actor: "codex", stage: "apply", attempt: 1, run: { id: "stale-apply-run", started_at: "2026-07-22T10:04:00Z", finished_at: "2026-07-22T10:05:00Z", elapsed_ms: 60000, characters: { status: "unavailable", reason: "test" } } },
		{ id: "stale-apply-return", type: "stage-returned", at: "2026-07-22T10:05:01Z", actor: "codex", stage: "apply", attempt: 1, to_stage: "plan", reason: "replan", next_action: "plan" },
		{ id: "stale-plan-begin", type: "stage-began", at: "2026-07-22T10:06:00Z", actor: "codex", stage: "plan", attempt: 2, next_action: "plan" },
		{ id: "stale-plan-run", type: "run-recorded", at: "2026-07-22T10:07:00Z", actor: "codex", stage: "plan", attempt: 2, run: { id: "stale-plan-run", started_at: "2026-07-22T10:06:00Z", finished_at: "2026-07-22T10:07:00Z", elapsed_ms: 60000, characters: { status: "unavailable", reason: "test" } } },
		{ id: "stale-plan-done", type: "stage-checkpointed", at: "2026-07-22T10:07:01Z", actor: "codex", stage: "plan", attempt: 2, result: "ready", checkpoint: "c".repeat(40), artifacts: [], next_action: "review" },
	);
	const view = foldChange(record);
	assert.deepEqual([view.stage, view.attempt, view.state], ["review", 2, "ready"]);
	return record;
}

test("fold derives the active stage and never needs a mutable status", () => {
	const view = foldChange(fixture("active-change.yaml"));
	assert.equal(view.stage, "plan");
	assert.equal(view.attempt, 1);
	assert.match(view.nextAction ?? "", /2026-07-22-active/);
});

test("return invalidates downstream work and starts the next plan attempt", () => {
	const view = foldChange(fixture("returned-change.yaml"));
	assert.equal(view.stage, "plan");
	assert.equal(view.attempt, 2);
	assert.equal(view.attempts.review[0]?.result, "returned");
});

test("terminal fixtures traverse every stage and expose the final outcome", () => {
	const committed = foldChange(fixture("committed-change.yaml"));
	const rolledBack = foldChange(fixture("rolled-back-change.yaml"));
	assert.deepEqual([committed.state, committed.outcome, committed.revision], ["terminal", "committed", 1]);
	assert.deepEqual([rolledBack.state, rolledBack.outcome, rolledBack.revision], ["terminal", "rolled-back", 1]);
});

test("usage totals measured runs exactly once and exposes coverage", () => {
	const summary = aggregateUsage([
		{ id: "a", started_at: "2026-07-22T10:00:00.000Z", finished_at: "2026-07-22T10:00:01.000Z", elapsed_ms: 1000, characters: { status: "measured", source: "provider", input: 4, output: 6, total: 10 } },
		{ id: "b", started_at: "2026-07-22T10:00:01.000Z", finished_at: "2026-07-22T10:00:03.000Z", elapsed_ms: 2000, characters: { status: "unavailable", reason: "no hook" } },
	]);
	assert.deepEqual({ characters: summary.characters.total, coverage: summary.characters.coverage, elapsed: summary.activeMs }, { characters: 10, coverage: "1/2", elapsed: 3000 });
});

test("invalid transition and terminal payloads fail before touching Git", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-invalid-input-"));
	await assert.rejects(transitionChange(workspace, "2026-07-22-invalid", { type: "mystery" } as never), (error: unknown) => error instanceof CodepatrolError && error.code === "INVALID_ARGUMENT");
	await assert.rejects(transitionChange(workspace, "2026-07-22-invalid", { type: "checkpoint", actor: "codex", stage: "plan", result: "ready", artifacts: [{ path: ".codepatrol/changes/2026-07-22-invalid/plan/spec.md", sha256: "a".repeat(64) }], nextAction: "review" } as never), (error: unknown) => error instanceof CodepatrolError && error.code === "INVALID_ARGUMENT");
	await assert.rejects(closeChange(workspace, "2026-07-22-invalid", { outcome: "destroy", actor: "codex", authority: "yes" } as never), (error: unknown) => error instanceof CodepatrolError && error.code === "INVALID_ARGUMENT");
});

test("usage timestamps and elapsed time must agree", () => {
	assert.throws(() => aggregateUsage([{ id: "bad", started_at: "2026-07-22T10:00:02Z", finished_at: "2026-07-22T10:00:01Z", elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } }]), /timestamps and elapsed_ms/);
});

test("measured usage requires complete finite counters", () => {
	assert.throws(() => aggregateUsage([{ id: "missing", started_at: "2026-07-22T10:00:00Z", finished_at: "2026-07-22T10:00:01Z", elapsed_ms: 1000, characters: { status: "measured", source: "provider" } as never }]), /characters.input/);
	assert.throws(() => aggregateUsage([
		{ id: "max", started_at: "2026-07-22T10:00:00Z", finished_at: "2026-07-22T10:00:01Z", elapsed_ms: 1000, characters: { status: "measured", source: "provider", input: Number.MAX_SAFE_INTEGER, output: 0, total: Number.MAX_SAFE_INTEGER } },
		{ id: "overflow", started_at: "2026-07-22T10:00:01Z", finished_at: "2026-07-22T10:00:02Z", elapsed_ms: 1000, characters: { status: "measured", source: "provider", input: 1, output: 0, total: 1 } },
	]), /safe integer/);
});

test("returns and run events are confined to the current active attempt", () => {
	const withoutRun = fixture("returned-change.yaml");
	withoutRun.events = withoutRun.events.filter((event) => event.type !== "run-recorded" || event.stage !== "review");
	assert.throws(() => foldChange(withoutRun), /finished run/);

	const terminal = fixture("committed-change.yaml");
	terminal.events.push({ id: "late", type: "run-recorded", at: "2026-07-22T10:10:00Z", actor: "codex", stage: "plan", attempt: 1, run: { id: "late", started_at: "2026-07-22T10:09:59Z", finished_at: "2026-07-22T10:10:00Z", elapsed_ms: 1000, characters: { status: "unavailable", reason: "late" } } });
	assert.throws(() => foldChange(terminal), /current active attempt/);
});

test("delete artifact intent requires the path to exist at the immutable baseline", () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-delete-baseline-")); const record = fixture("active-change.yaml"); const path = `.codepatrol/changes/${record.identity.work_id}/plan/obsolete.md`;
	const result = validateArtifactBindings(workspace, record, "plan", [{ path, sha256: "a".repeat(64), intent: "delete" }], { exists: () => false });
	assert.equal(result.valid, false); assert.match(result.errors.join("\n"), /Delete path was absent at the recorded baseline/);
});

test("invalid event order fails closed", () => {
	const record = fixture("active-change.yaml");
	record.events.push({ id: "evt-2", type: "stage-began", at: "2026-07-22T10:01:00.000Z", actor: "x", stage: "verify", attempt: 1, next_action: "invalid" });
	assert.throws(() => foldChange(record), /CHANGE_INVALID/);
});

test("unknown durable fields fail closed", () => {
	const record = fixture("active-change.yaml") as ChangeRecordV2 & { status?: string };
	record.status = "implementing";
	assert.throws(() => foldChange(record), /unknown field status/);
});

test("Stage Sessions are scoped, claim atomically, and close with bounded evidence", async (context) => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-session-"));
	context.after(() => { /* temporary OS directory is intentionally disposable */ });
	writeChangeRecord(workspace, fixture("active-change.yaml"));
	const session = primeStageSession(workspace, "2026-07-22-active", "plan", 1, new Date("2026-07-22T10:00:00Z"));
	assert.equal(session.items[0]?.status, "open");
	await claimSessionItem(workspace, "2026-07-22-active", "plan", 1, "spec", "codex", new Date("2026-07-22T10:00:01Z"));
	const closed = await closeSessionItem(workspace, "2026-07-22-active", "plan", 1, "spec", "validated", ["plan/spec.md"], new Date("2026-07-22T10:00:02Z"));
	assert.equal(closed.items.find((item) => item.id === "spec")?.status, "closed");
});

test("Session claims and closes append exactly one item-level trace entry each", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-session-trace-"));
	const record = fixture("active-change.yaml");
	writeChangeRecord(workspace, record);
	await claimSessionItem(workspace, record.identity.work_id, "plan", 1, "spec", "codex", new Date("2026-07-22T10:00:01Z"));
	await closeSessionItem(workspace, record.identity.work_id, "plan", 1, "spec", "done", [], new Date("2026-07-22T10:00:02Z"));
	const entries = trace.read(workspace, record.identity.work_id).filter((entry) => entry.kind === "session");
	assert.deepEqual(entries.map((entry) => ({ stage: entry.stage, attempt: entry.attempt, item: entry.item, action: entry.action, at: entry.at })), [
		{ stage: "plan", attempt: 1, item: "spec", action: "claimed", at: "2026-07-22T10:00:01.000Z" },
		{ stage: "plan", attempt: 1, item: "spec", action: "closed", at: "2026-07-22T10:00:02.000Z" },
	]);
});

test("Session claim and close remain fail-open when the trace path is unavailable", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-session-trace-failure-"));
	const record = fixture("active-change.yaml");
	writeChangeRecord(workspace, record);
	const runtime = join(workspace, ".codepatrol/runtime"); mkdirSync(runtime, { recursive: true }); writeFileSync(join(runtime, "traces"), "not a directory\n");
	const claimed = await claimSessionItem(workspace, record.identity.work_id, "plan", 1, "spec", "codex");
	const closed = await closeSessionItem(workspace, record.identity.work_id, "plan", 1, "spec", "done");
	assert.deepEqual([claimed.items[0]?.status, closed.items[0]?.status], ["claimed", "closed"]);
});

test("Apply session rebuilds deterministic plan tasks and rejects a stale attempt", () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-apply-session-"));
	const record = fixture("active-change.yaml");
	record.events.push(
		{ id: "plan-run", type: "run-recorded", at: "2026-07-22T10:01:00Z", actor: "codex", stage: "plan", attempt: 1, run: { id: "plan-run", started_at: "2026-07-22T10:00:00Z", finished_at: "2026-07-22T10:01:00Z", elapsed_ms: 60000, characters: { status: "unavailable", reason: "test" } } },
		{ id: "plan-done", type: "stage-checkpointed", at: "2026-07-22T10:01:01Z", actor: "codex", stage: "plan", attempt: 1, result: "ready", checkpoint: "a".repeat(40), artifacts: [], next_action: "review" },
		{ id: "review-begin", type: "stage-began", at: "2026-07-22T10:01:02Z", actor: "reviewer", stage: "review", attempt: 1, next_action: "review" },
		{ id: "review-run", type: "run-recorded", at: "2026-07-22T10:02:00Z", actor: "reviewer", stage: "review", attempt: 1, run: { id: "review-run", started_at: "2026-07-22T10:01:02Z", finished_at: "2026-07-22T10:02:00Z", elapsed_ms: 58000, characters: { status: "unavailable", reason: "test" } } },
		{ id: "review-done", type: "stage-checkpointed", at: "2026-07-22T10:02:01Z", actor: "reviewer", stage: "review", attempt: 1, result: "approve", checkpoint: "b".repeat(40), artifacts: [], next_action: "apply" },
	);
	writeChangeRecord(workspace, record);
	const planDirectory = join(workspace, `.codepatrol/changes/${record.identity.work_id}/plan`);
	mkdirSync(planDirectory, { recursive: true });
	writeFileSync(join(planDirectory, "plan.md"), "### T1 — First\n\n**Depends on:** None\n\n### T2 — Second\n\n**Depends on:** T1\n");
	const session = primeStageSession(workspace, record.identity.work_id, "apply", 1, new Date("2026-07-22T10:03:00Z"));
	assert.deepEqual(session.items.map((item) => [item.id, item.dependencies]), [["T1", []], ["T2", ["T1"]]]);
	writeFileSync(stageSessionPath(workspace, record.identity.work_id, "apply", 1), "{broken", "utf8");
	assert.deepEqual(primeStageSession(workspace, record.identity.work_id, "apply", 1).items.map((item) => item.id), ["T1", "T2"]);
	assert.throws(() => discardAndRebuildSession(workspace, record.identity.work_id, "apply", 2), /not the current attempt/);
});

test("Apply dependency parsing ignores self-references and prose after None", () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-apply-session-dependencies-"));
	const record = fixture("active-change.yaml");
	record.events.push(
		{ id: "dependency-plan-run", type: "run-recorded", at: "2026-07-22T10:01:00Z", actor: "codex", stage: "plan", attempt: 1, run: { id: "dependency-plan-run", started_at: "2026-07-22T10:00:00Z", finished_at: "2026-07-22T10:01:00Z", elapsed_ms: 60000, characters: { status: "unavailable", reason: "test" } } },
		{ id: "dependency-plan-done", type: "stage-checkpointed", at: "2026-07-22T10:01:01Z", actor: "codex", stage: "plan", attempt: 1, result: "ready", checkpoint: "a".repeat(40), artifacts: [], next_action: "review" },
		{ id: "dependency-review-begin", type: "stage-began", at: "2026-07-22T10:01:02Z", actor: "reviewer", stage: "review", attempt: 1, next_action: "review" },
		{ id: "dependency-review-run", type: "run-recorded", at: "2026-07-22T10:02:00Z", actor: "reviewer", stage: "review", attempt: 1, run: { id: "dependency-review-run", started_at: "2026-07-22T10:01:02Z", finished_at: "2026-07-22T10:02:00Z", elapsed_ms: 58000, characters: { status: "unavailable", reason: "test" } } },
		{ id: "dependency-review-done", type: "stage-checkpointed", at: "2026-07-22T10:02:01Z", actor: "reviewer", stage: "review", attempt: 1, result: "approve", checkpoint: "b".repeat(40), artifacts: [], next_action: "apply" },
	);
	writeChangeRecord(workspace, record);
	const planDirectory = join(workspace, `.codepatrol/changes/${record.identity.work_id}/plan`);
	mkdirSync(planDirectory, { recursive: true });
	writeFileSync(join(planDirectory, "plan.md"), "### T1 — First\n\n**Depends on:** None\n\n### T2 — Second\n\n**Depends on:** T1\n\n### T3 — Third\n\n**Depends on:** T2 (same file, session.ts; sequenced. trace.ts and improvement-report.ts are T3-exclusive.)\n\n### T4 — Fourth\n\n**Depends on:** None (docs/skills only; file-disjoint from T1–T3)\n\n### T5 — Fifth\n\n**Depends on:** T1, T2\n\n### T6 — Sixth\n\n**Depends on:** None\n");
	const session = primeStageSession(workspace, record.identity.work_id, "apply", 1);
	assert.deepEqual(session.items.map((item) => [item.id, item.dependencies]), [["T1", []], ["T2", ["T1"]], ["T3", ["T2"]], ["T4", []], ["T5", ["T1", "T2"]], ["T6", []]]);
});

test("Stage Sessions derive dependency-ordered artifact checklists for every stage", () => {
	const expected: Record<Stage, Array<[string, string[]]>> = {
		plan: [["spec", []], ["plan", ["spec"]], ["evidence", []]],
		review: [["report", []]],
		apply: [],
		verify: [["report", []]],
		close: [["close-work", []]],
	};
	for (const stage of ["plan", "review", "verify", "close"] as const) {
		const workspace = mkdtempSync(join(tmpdir(), `codepatrol-${stage}-session-items-`));
		const record = recordAtStage(stage);
		writeChangeRecord(workspace, record);
		const session = primeStageSession(workspace, record.identity.work_id, stage, 1);
		assert.deepEqual(session.items.map((item) => [item.id, item.dependencies]), expected[stage]);
		assert.equal(session.items.every((item) => item.status === "open"), true);
	}
});

test("Stage Sessions reconcile non-empty artifact and directory evidence on prime and rebuild", () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-session-artifact-reconciliation-"));
	const record = recordAtStage("plan");
	writeChangeRecord(workspace, record);
	writeStageArtifact(workspace, record, "plan/spec.md", "# Specification\n");
	writeStageArtifact(workspace, record, "plan/evidence/empty.md", "   \n");
	let session = primeStageSession(workspace, record.identity.work_id, "plan", 1);
	assert.equal(session.items.find((item) => item.id === "spec")?.status, "closed");
	assert.match(session.items.find((item) => item.id === "spec")?.result ?? "", /plan\/spec\.md/);
	assert.equal(session.items.find((item) => item.id === "plan")?.status, "open");
	assert.equal(session.items.find((item) => item.id === "evidence")?.status, "open");
	writeStageArtifact(workspace, record, "plan/evidence/investigation.md", "evidence\n");
	session = discardAndRebuildSession(workspace, record.identity.work_id, "plan", 1);
	assert.equal(session.items.find((item) => item.id === "evidence")?.status, "closed");
	assert.match(session.items.find((item) => item.id === "evidence")?.result ?? "", /plan\/evidence\/investigation\.md/);
	writeStageArtifact(workspace, record, "plan/spec.md", " \n");
	session = discardAndRebuildSession(workspace, record.identity.work_id, "plan", 1);
	assert.equal(session.items.find((item) => item.id === "spec")?.status, "open");
});

test("Apply reconciliation closes exactly the tasks journaled with T headings", () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-session-apply-reconciliation-"));
	const record = recordAtStage("apply");
	writeChangeRecord(workspace, record);
	writeStageArtifact(workspace, record, "plan/plan.md", "### T1 — First\n\n**Depends on:** None\n\n### T2 — Second\n\n**Depends on:** T1\n\n### T3 — Third\n\n**Depends on:** T2\n");
	writeStageArtifact(workspace, record, "apply/journal.md", "# Implementation\n\n### T1 — First\n\nDelivered.\n\n### T2 — Second\n\nDelivered.\n");
	const session = primeStageSession(workspace, record.identity.work_id, "apply", 1);
	assert.deepEqual(session.items.map((item) => [item.id, item.status]), [["T1", "closed"], ["T2", "closed"], ["T3", "open"]]);
	assert.match(session.items.find((item) => item.id === "T1")?.result ?? "", /apply\/journal\.md has ### T1/);
});

test("Apply rebuild preserves backed progress and drops unbacked claims", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-session-apply-rebuild-"));
	const record = recordAtStage("apply");
	writeChangeRecord(workspace, record);
	writeStageArtifact(workspace, record, "plan/plan.md", "### T1 — First\n\n**Depends on:** None\n\n### T2 — Second\n\n**Depends on:** None\n\n### T3 — Third\n\n**Depends on:** None\n");
	primeStageSession(workspace, record.identity.work_id, "apply", 1);
	await claimSessionItem(workspace, record.identity.work_id, "apply", 1, "T1", "codex");
	await closeSessionItem(workspace, record.identity.work_id, "apply", 1, "T1", "closed without evidence");
	await claimSessionItem(workspace, record.identity.work_id, "apply", 1, "T3", "codex");
	writeStageArtifact(workspace, record, "apply/journal.md", "### T1 — First\n");
	const rebuilt = discardAndRebuildSession(workspace, record.identity.work_id, "apply", 1);
	const backed = rebuilt.items.find((item) => item.id === "T1");
	const unbacked = rebuilt.items.find((item) => item.id === "T3");
	assert.deepEqual([backed?.status, backed?.claim, backed?.result?.startsWith("reconciled:")], ["closed", undefined, true]);
	assert.deepEqual([unbacked?.status, unbacked?.claim, unbacked?.result], ["open", undefined, undefined]);
});

test("reconciliation rejects stale prior-attempt evidence and refreshes only on rebuild", () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-session-stale-reconciliation-"));
	const oldContent = "old review\n";
	const record = reviewAttemptTwo([{ relativePath: "review/report.md", content: oldContent }]);
	writeChangeRecord(workspace, record);
	writeStageArtifact(workspace, record, "review/report.md", oldContent);
	let session = primeStageSession(workspace, record.identity.work_id, "review", 2);
	assert.equal(session.items.find((item) => item.id === "report")?.status, "open");
	writeStageArtifact(workspace, record, "review/report.md", "fresh review\n");
	session = primeStageSession(workspace, record.identity.work_id, "review", 2);
	assert.equal(session.items.find((item) => item.id === "report")?.status, "open");
	session = discardAndRebuildSession(workspace, record.identity.work_id, "review", 2);
	assert.equal(session.items.find((item) => item.id === "report")?.status, "closed");
	assert.match(session.items.find((item) => item.id === "report")?.result ?? "", /review\/report\.md/);
});

test("reconciliation accepts fresh persona reports and rejects stale or false-prefix matches", () => {
	const freshWorkspace = mkdtempSync(join(tmpdir(), "codepatrol-session-persona-reconciliation-"));
	const freshRecord = recordAtStage("review");
	writeChangeRecord(freshWorkspace, freshRecord);
	writeStageArtifact(freshWorkspace, freshRecord, "review/report-security.md", "security\n");
	writeStageArtifact(freshWorkspace, freshRecord, "review/report-architecture.md", "architecture\n");
	let session = primeStageSession(freshWorkspace, freshRecord.identity.work_id, "review", 1);
	assert.equal(session.items.find((item) => item.id === "report")?.status, "closed");
	assert.match(session.items.find((item) => item.id === "report")?.result ?? "", /review\/report-(architecture|security)\.md/);
	writeStageArtifact(freshWorkspace, freshRecord, "review/report-security.md", " \n");
	writeStageArtifact(freshWorkspace, freshRecord, "review/report-architecture.md", " \n");
	writeStageArtifact(freshWorkspace, freshRecord, "review/reporting.md", "not a report item\n");
	writeStageArtifact(freshWorkspace, freshRecord, "review/report.md.bak", "not a report item\n");
	writeStageArtifact(freshWorkspace, freshRecord, "review/findings-security.md", "not a report item\n");
	session = discardAndRebuildSession(freshWorkspace, freshRecord.identity.work_id, "review", 1);
	assert.equal(session.items.find((item) => item.id === "report")?.status, "open");

	const staleWorkspace = mkdtempSync(join(tmpdir(), "codepatrol-session-stale-persona-reconciliation-"));
	const prior = [{ relativePath: "review/report-security.md", content: "old security\n" }, { relativePath: "review/report-architecture.md", content: "old architecture\n" }];
	const staleRecord = reviewAttemptTwo(prior);
	writeChangeRecord(staleWorkspace, staleRecord);
	for (const artifact of prior) writeStageArtifact(staleWorkspace, staleRecord, artifact.relativePath, artifact.content);
	session = primeStageSession(staleWorkspace, staleRecord.identity.work_id, "review", 2);
	assert.equal(session.items.find((item) => item.id === "report")?.status, "open");
});

test("gate field is allowed on stage-checkpointed", () => {
	const record = fixture("active-change.yaml");
	const run = {
		id: "uuid-run", type: "run-recorded", at: "2026-07-22T10:30:00.000Z", actor: "test", stage: "plan", attempt: 1,
		run: { id: "run-1", started_at: "2026-07-22T10:00:00.000Z", finished_at: "2026-07-22T10:30:00.000Z", elapsed_ms: 1800000, characters: { status: "unavailable", reason: "test" } }
	};
	record.events.push(run as any);
	const cp = {
		id: "uuid", type: "stage-checkpointed", at: "2026-07-22T11:00:00.000Z", actor: "test", stage: "plan", attempt: 1,
		result: "ready", checkpoint: "0000000000000000000000000000000000000000", tree: "0000000000000000000000000000000000000000", artifacts: [], next_action: "review",
		gate: { command: "npm test", exit_code: 0, elapsed_ms: 100, at: "2026-07-22T11:00:00.000Z" }
	};
	record.events.push(cp as any);
	try {
		const view = foldChange(record);
		assert.equal(view.stage, "review");
	} catch (e: any) {
		assert.fail(e.message);
	}
});

test("sessionStatus reports ready and dependency-blocked items", () => {
  const session = {
    schema_version: 1 as const, work_id: "2026-07-22-active", stage: "apply" as const, attempt: 1,
    next_action: "x", updated_at: "2026-07-22T10:00:00Z",
    items: [
      { id: "T1", title: "a", status: "closed" as const, dependencies: [] },
      { id: "T2", title: "b", status: "open" as const, dependencies: ["T1"] },
      { id: "T3", title: "c", status: "open" as const, dependencies: ["T2"] },
    ],
  };
  const view = sessionStatus(session);
  assert.deepEqual(view.ready.map((i) => i.id), ["T2"]);
  assert.deepEqual(view.blocked.map((b) => [b.id, b.blockedBy.map((d) => [d.id, d.status])]), [["T3", [["T2", "open"]]]]);
});

test("readStageSession does not write when no session file exists", () => {
  const workspace = mkdtempSync(join(tmpdir(), "codepatrol-status-"));
  const record = fixture("active-change.yaml");
  writeChangeRecord(workspace, record);
  const path = stageSessionPath(workspace, record.identity.work_id, "plan", 1);
  assert.equal(existsSync(path), false);
  const view = readStageSession(workspace, record.identity.work_id, "plan", 1);
  assert.equal(view.items[0]?.status, "open");
  assert.equal(existsSync(path), false);
});

test("claim of a blocked item names the blocking dependency", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "codepatrol-apply-session-claim-"));
  const record = fixture("active-change.yaml");
  record.events.push(
    { id: "plan-run", type: "run-recorded", at: "2026-07-22T10:01:00Z", actor: "codex", stage: "plan", attempt: 1, run: { id: "plan-run", started_at: "2026-07-22T10:00:00Z", finished_at: "2026-07-22T10:01:00Z", elapsed_ms: 60000, characters: { status: "unavailable", reason: "test" } } },
    { id: "plan-done", type: "stage-checkpointed", at: "2026-07-22T10:01:01Z", actor: "codex", stage: "plan", attempt: 1, result: "ready", checkpoint: "a".repeat(40), artifacts: [], next_action: "review" },
    { id: "review-begin", type: "stage-began", at: "2026-07-22T10:01:02Z", actor: "reviewer", stage: "review", attempt: 1, next_action: "review" },
    { id: "review-run", type: "run-recorded", at: "2026-07-22T10:02:00Z", actor: "reviewer", stage: "review", attempt: 1, run: { id: "review-run", started_at: "2026-07-22T10:01:02Z", finished_at: "2026-07-22T10:02:00Z", elapsed_ms: 58000, characters: { status: "unavailable", reason: "test" } } },
    { id: "review-done", type: "stage-checkpointed", at: "2026-07-22T10:02:01Z", actor: "reviewer", stage: "review", attempt: 1, result: "approve", checkpoint: "b".repeat(40), artifacts: [], next_action: "apply" },
  );
  writeChangeRecord(workspace, record);
  const planDirectory = join(workspace, `.codepatrol/changes/${record.identity.work_id}/plan`);
  mkdirSync(planDirectory, { recursive: true });
  writeFileSync(join(planDirectory, "plan.md"), "### T1 — First\n\n**Depends on:** None\n\n### T2 — Second\n\n**Depends on:** T1\n");
  primeStageSession(workspace, record.identity.work_id, "apply", 1, new Date("2026-07-22T10:03:00Z"));
  await assert.rejects(
    claimSessionItem(workspace, record.identity.work_id, "apply", 1, "T2", "codex"),
    (e: unknown) => e instanceof CodepatrolError && e.code === "CHANGE_CONFLICT" && /T2/.test(e.message) && /T1/.test(e.message),
  );
});

function toLegacy(record: ChangeRecordV2): any {
  const clone = structuredClone(record) as any;
  for (const event of clone.events) {
    if (event.stage === "close") event.stage = "finalize";
    if (event.type === "change-closed") event.type = "change-finalized";
    if (event.receipt === "close/receipt.md") event.receipt = "finalize/receipt.md";
    if (event.run && event.run.characters) { event.run.tokens = event.run.characters; delete event.run.characters; }
  }
  return clone;
}

test("migrateRecord reverses every legacy field and leaves modern records unchanged", () => {
  const modern = fixture("committed-change.yaml");
  const migrated = migrateRecord(toLegacy(modern));
  assert.deepEqual(migrated, modern);
  assert.deepEqual(migrateRecord(structuredClone(modern)), modern);
});

test("legacy records project identically to their modern equivalent", () => {
  const modern = fixture("committed-change.yaml");
  assert.deepEqual(foldChange(migrateRecord(toLegacy(modern))), foldChange(fixture("committed-change.yaml")));
});

test("foldChange no longer migrates: raw legacy throws, migrated legacy folds", () => {
  const modern = fixture("committed-change.yaml");
  assert.throws(() => foldChange(toLegacy(modern) as ChangeRecordV2), (e: unknown) => e instanceof CodepatrolError && e.code === "CHANGE_INVALID");
  assert.doesNotThrow(() => foldChange(migrateRecord(toLegacy(modern))));
});

test("readChangeRecord migrates a legacy change.yaml at the read boundary", () => {
  const workspace = mkdtempSync(join(tmpdir(), "codepatrol-legacy-"));
  const modern = fixture("committed-change.yaml");
  const dir = join(workspace, `.codepatrol/changes/${modern.identity.work_id}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "change.yaml"), stringify(toLegacy(modern), { lineWidth: 0 }));
  const read = readChangeRecord(workspace, modern.identity.work_id);
  assert.deepEqual(read, modern);
  assert.doesNotThrow(() => foldChange(read));
});
