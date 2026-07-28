import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatIssueBody, formatIssueTitle, parseWorkMarker, syncIssues, type GhAdapter, type RemoteIssue } from "./issue-sync.js";
import { listWork, readWork, writeWork, type WorkItem } from "./backlog.js";
import { CodepatrolError } from "../shared/errors.js";

function workspace(): string {
	const root = mkdtempSync(join(tmpdir(), "codepatrol-issue-sync-"));
	mkdirSync(join(root, ".codepatrol"), { recursive: true });
	return root;
}

const URL = (n: number) => `https://github.com/x/y/issues/${n}`;
const AT = "2026-07-25T00:00:00.000Z";

function work(overrides: Partial<WorkItem> = {}): WorkItem {
	return { workId: "2026-07-26-example", priority: "p2", description: "Example description", status: "open", createdAt: AT, updatedAt: AT, ...overrides };
}

function issue(number: number, overrides: Partial<RemoteIssue> = {}): RemoteIssue {
	return { number, title: "Stale title", body: "Stale body", url: URL(number), state: "open", ...overrides };
}

class FakeGhAdapter implements GhAdapter {
	issues: RemoteIssue[];
	created: Array<{ title: string; body: string; label: string }> = [];
	edited: Array<{ number: number; title: string; body: string }> = [];
	reopened: number[] = [];
	closed: Array<{ number: number; reason: string }> = [];
	labelsEnsured: string[] = [];
	private nextNumber: number;
	constructor(issues: RemoteIssue[] = []) {
		this.issues = issues;
		this.nextNumber = (issues.at(-1)?.number ?? 0) + 1;
	}
	async assertAvailable(): Promise<void> {}
	async listIssues(): Promise<RemoteIssue[]> { return this.issues; }
	async ensureLabel(name: string): Promise<void> { this.labelsEnsured.push(name); }
	async createIssue(title: string, body: string, label: string): Promise<RemoteIssue> {
		this.created.push({ title, body, label });
		const number = this.nextNumber++;
		const created: RemoteIssue = { number, title, body, url: URL(number), state: "open" };
		this.issues.push(created);
		return created;
	}
	async editIssue(number: number, update: { title: string; body: string }): Promise<void> {
		this.edited.push({ number, ...update });
		const target = this.issues.find((entry) => entry.number === number);
		if (target) { target.title = update.title; target.body = update.body; }
	}
	async reopenIssue(number: number): Promise<void> {
		this.reopened.push(number);
		const target = this.issues.find((entry) => entry.number === number);
		if (target) target.state = "open";
	}
	async closeIssue(number: number, reason: "completed" | "not planned"): Promise<void> {
		this.closed.push({ number, reason: String(reason) });
		const target = this.issues.find((entry) => entry.number === number);
		if (target) target.state = "closed";
	}
}

test("format helpers produce the exact canonical title and body marker", () => {
	const item = work({ workId: "2026-07-26-title", priority: "p1" });
	assert.equal(formatIssueTitle(item), "[p1] 2026-07-26-title");
	assert.equal(formatIssueBody(item), "Example description\n\n---\nCodepatrol-Work: 2026-07-26-title");
	assert.equal(parseWorkMarker(formatIssueBody(item)), "2026-07-26-title");
	assert.equal(parseWorkMarker("no marker here"), null);
});

test("canonical create publishes an open work and stores only issue metadata locally", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([]);
	try {
		writeWork(root, work({ workId: "2026-07-26-create-me", priority: "p0" }));
		const result = await syncIssues(root, [], { gh });
		assert.deepEqual(result.created, ["2026-07-26-create-me"]);
		assert.equal(gh.created.length, 1);
		assert.equal(gh.created[0]?.title, "[p0] 2026-07-26-create-me");
		assert.equal(gh.created[0]?.label, "codepatrol-backlog");
		assert.match(gh.created[0]?.body ?? "", /Codepatrol-Work: 2026-07-26-create-me/);
		assert.deepEqual(gh.labelsEnsured, ["codepatrol-backlog"]);
		const after = readWork(root, "2026-07-26-create-me")!;
		assert.deepEqual(after.issue, { number: 1, url: URL(1) });
		assert.equal(after.status, "open");
		assert.equal(after.description, "Example description");
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("a stored-number match with stale remote prose edits title and body", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([issue(7)]);
	try {
		writeWork(root, work({ workId: "2026-07-26-stale", issue: { number: 7, url: URL(7) } }));
		const result = await syncIssues(root, [], { gh });
		assert.deepEqual(result.edited, ["2026-07-26-stale"]);
		assert.deepEqual(gh.edited, [{ number: 7, title: "[p2] 2026-07-26-stale", body: "Example description\n\n---\nCodepatrol-Work: 2026-07-26-stale" }]);
		assert.equal(gh.created.length, 0);
		assert.equal(readWork(root, "2026-07-26-stale")!.issue?.number, 7);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("marker fallback discovers an issue without stored metadata and links it locally", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([issue(12, { title: "[p2] 2026-07-26-marker", body: "prose\n\n---\nCodepatrol-Work: 2026-07-26-marker" })]);
	try {
		writeWork(root, work({ workId: "2026-07-26-marker" }));
		const result = await syncIssues(root, [], { gh });
		assert.deepEqual(result.linked, ["2026-07-26-marker"]);
		assert.equal(gh.created.length, 0);
		assert.deepEqual(readWork(root, "2026-07-26-marker")!.issue, { number: 12, url: URL(12) });
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("a local open work reopens a closed remote issue", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([issue(3, { state: "closed", title: "[p2] 2026-07-26-reopen", body: "Example description\n\n---\nCodepatrol-Work: 2026-07-26-reopen" })]);
	try {
		writeWork(root, work({ workId: "2026-07-26-reopen", issue: { number: 3, url: URL(3) } }));
		const result = await syncIssues(root, [], { gh });
		assert.deepEqual(result.reopened, ["2026-07-26-reopen"]);
		assert.deepEqual(gh.reopened, [3]);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("done closes as completed and dismissed closes as not planned", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([
		issue(11, { title: "[p2] 2026-07-26-done", body: "Example description\n\n---\nCodepatrol-Work: 2026-07-26-done" }),
		issue(12, { title: "[p2] 2026-07-26-dismissed", body: "Example description\n\n---\nCodepatrol-Work: 2026-07-26-dismissed" }),
	]);
	try {
		writeWork(root, work({ workId: "2026-07-26-done", status: "done", issue: { number: 11, url: URL(11) } }));
		writeWork(root, work({ workId: "2026-07-26-dismissed", status: "dismissed", issue: { number: 12, url: URL(12) } }));
		const result = await syncIssues(root, [], { gh });
		assert.deepEqual(result.closed, ["2026-07-26-dismissed", "2026-07-26-done"]);
		assert.deepEqual(gh.closed, [{ number: 12, reason: "not planned" }, { number: 11, reason: "completed" }]);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("duplicate marker matches and cross-claimed issue numbers fail closed", async () => {
	const root = workspace();
	try {
		writeWork(root, work({ workId: "2026-07-26-dup" }));
		const gh = new FakeGhAdapter([
			issue(5, { body: "x\nCodepatrol-Work: 2026-07-26-dup" }),
			issue(6, { body: "y\nCodepatrol-Work: 2026-07-26-dup" }),
		]);
		await assert.rejects(syncIssues(root, [], { gh }), /CHANGE_CONFLICT/);

		const gh2 = new FakeGhAdapter([issue(9, { title: "[p2] 2026-07-26-a", body: "b\nCodepatrol-Work: 2026-07-26-b" })]);
		writeWork(root, work({ workId: "2026-07-26-a", issue: { number: 9, url: URL(9) } }));
		writeWork(root, work({ workId: "2026-07-26-b" }));
		await assert.rejects(syncIssues(root, [], { gh: gh2 }), /CHANGE_CONFLICT/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("hostile remote edits never alter local status, priority or description", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([issue(21, { title: "HOSTILE", body: "HOSTILE", state: "closed" })]);
	try {
		writeWork(root, work({ workId: "2026-07-26-hostile", priority: "p0", status: "done", description: "Governed locally", issue: { number: 21, url: URL(21) } }));
		await syncIssues(root, [], { gh });
		const after = readWork(root, "2026-07-26-hostile")!;
		assert.equal(after.status, "done");
		assert.equal(after.priority, "p0");
		assert.equal(after.description, "Governed locally");
		assert.equal(gh.edited.length, 1, "remote prose is overwritten from local");
		assert.equal(gh.reopened.length, 0, "local done wins over remote closed without reopening");
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("dry-run reports every action with zero local and remote writes", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([
		issue(31, { state: "closed", title: "[p2] 2026-07-26-dry-open", body: "Example description\n\n---\nCodepatrol-Work: 2026-07-26-dry-open" }),
	]);
	try {
		writeWork(root, work({ workId: "2026-07-26-dry-open", issue: { number: 31, url: URL(31) } }));
		writeWork(root, work({ workId: "2026-07-26-dry-new", priority: "p1" }));
		const before = readdirSync(join(root, ".codepatrol/work")).map((name) => [name, readFileSync(join(root, ".codepatrol/work", name), "utf8")]);
		const result = await syncIssues(root, [], { gh, dryRun: true });
		assert.equal(result.dryRun, true);
		assert.deepEqual(result.created, ["2026-07-26-dry-new"]);
		assert.deepEqual(result.reopened, ["2026-07-26-dry-open"]);
		assert.equal(gh.created.length, 0);
		assert.equal(gh.edited.length, 0);
		assert.equal(gh.reopened.length, 0);
		assert.equal(gh.labelsEnsured.length, 0);
		const after = readdirSync(join(root, ".codepatrol/work")).map((name) => [name, readFileSync(join(root, ".codepatrol/work", name), "utf8")]);
		assert.deepEqual(after, before);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("an unavailable adapter aborts sync without touching local Work", async () => {
	const root = workspace();
	class DownGh extends FakeGhAdapter {
		override async assertAvailable(): Promise<void> { throw new CodepatrolError("OPERATION_FAILED", "gh CLI is not installed or not authenticated.", 5); }
	}
	const gh = new DownGh([]);
	try {
		writeWork(root, work({ workId: "2026-07-26-offline" }));
		await assert.rejects(syncIssues(root, [], { gh }), /not installed or not authenticated/);
		assert.deepEqual(readWork(root, "2026-07-26-offline")!.issue, undefined);
		assert.equal(gh.created.length, 0);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("sync is idempotent: a second run with canonical remote state reports unchanged", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([]);
	try {
		writeWork(root, work({ workId: "2026-07-26-idem" }));
		await syncIssues(root, [], { gh });
		const second = await syncIssues(root, [], { gh });
		assert.deepEqual(second.unchanged, ["2026-07-26-idem"]);
		assert.equal(gh.created.length, 1);
		assert.equal(gh.edited.length, 0);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("local Work listing stays offline: listWork never invokes the adapter", () => {
	const root = workspace();
	try {
		writeWork(root, work({ workId: "2026-07-26-local" }));
		assert.equal(listWork(root).length, 1);
	} finally { rmSync(root, { recursive: true, force: true }); }
});
