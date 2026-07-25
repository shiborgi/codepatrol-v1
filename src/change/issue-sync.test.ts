import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify, parse } from "yaml";
import { syncIssues, type GhAdapter, type RemoteIssue } from "./issue-sync.js";
import { backlogPath, readBacklog } from "./backlog.js";

function workspace(): string {
	const root = mkdtempSync(join(tmpdir(), "codepatrol-issue-sync-"));
	mkdirSync(join(root, ".codepatrol", "backlog"), { recursive: true });
	return root;
}

function seed(root: string, items: object[]): void {
	writeFileSync(backlogPath(root), stringify({ schema_version: 1, items }, { lineWidth: 0 }));
}

function itemAt(root: string, id: string): Record<string, unknown> {
	const list = readBacklog(root).items as unknown as Array<Record<string, unknown>>;
	return list.find((entry) => entry.id === id)!;
}

class FakeGhAdapter implements GhAdapter {
	issues: RemoteIssue[];
	created: Array<{ title: string; body: string; label: string }> = [];
	closed: Array<{ number: number; reason: string }> = [];
	labelsEnsured: string[] = [];
	assertAvailableCalled = 0;
	listCalled = 0;
	private nextNumber: number;
	constructor(issues: RemoteIssue[] = []) {
		this.issues = issues;
		this.nextNumber = (issues.at(-1)?.number ?? 0) + 1;
	}
	async assertAvailable(): Promise<void> { this.assertAvailableCalled++; }
	async listIssues(): Promise<RemoteIssue[]> { this.listCalled++; return this.issues; }
	async ensureLabel(name: string): Promise<void> { this.labelsEnsured.push(name); }
	async createIssue(title: string, body: string, label: string): Promise<RemoteIssue> {
		this.created.push({ title, body, label });
		const number = this.nextNumber++;
		const issue: RemoteIssue = { number, title, url: `https://github.com/x/y/issues/${number}`, state: "open" };
		this.issues.push(issue);
		return issue;
	}
	async closeIssue(number: number, reason: "completed" | "not planned"): Promise<void> {
		this.closed.push({ number, reason: String(reason) });
		const issue = this.issues.find((entry) => entry.number === number);
		if (issue) issue.state = "closed";
	}
}

const URL = (n: number) => `https://github.com/x/y/issues/${n}`;

test("AC-1: pull dismisses a candidate whose linked issue closed", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([{ number: 7, title: "Closed thing", url: URL(7), state: "closed" }]);
	try {
		seed(root, [{ id: "gh-issue-7", title: "Old title", priority: "p3", area: "workflow", status: "candidate", evidence: [URL(7)], source: { kind: "github-issue" }, externalRef: { provider: "github", number: 7, url: URL(7) }, workId: null, count: 1, firstSeenAt: "2026-07-25T00:00:00.000Z", lastSeenAt: "2026-07-25T00:00:00.000Z" }]);
		const result = await syncIssues(root, "pull", { gh, now: new Date("2026-07-26T00:00:00.000Z") });
		const after = itemAt(root, "gh-issue-7");
		assert.equal(after.status, "dismissed");
		assert.equal(after.title, "Closed thing");
		assert.equal(after.lastSeenAt, "2026-07-26T00:00:00.000Z");
		assert.deepEqual(result.pulled.dismissed, ["gh-issue-7"]);
		assert.equal(result.pulled.created.length, 0);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("AC-2: pull reopens a dismissed item whose linked issue is open again", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([{ number: 8, title: "Reopened", url: URL(8), state: "open" }]);
	try {
		seed(root, [{ id: "gh-issue-8", title: "Old", priority: "p3", area: "workflow", status: "dismissed", evidence: [URL(8)], source: { kind: "github-issue" }, externalRef: { provider: "github", number: 8, url: URL(8) }, workId: null, count: 1, firstSeenAt: "2026-07-25T00:00:00.000Z", lastSeenAt: "2026-07-25T00:00:00.000Z" }]);
		const result = await syncIssues(root, "pull", { gh });
		const after = itemAt(root, "gh-issue-8");
		assert.equal(after.status, "candidate");
		assert.equal(after.title, "Reopened");
		assert.deepEqual(result.pulled.reopened, ["gh-issue-8"]);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("AC-3: pull leaves scheduled and done items untouched regardless of issue state", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([
		{ number: 1, title: "S", url: URL(1), state: "closed" },
		{ number: 2, title: "D", url: URL(2), state: "closed" },
	]);
	try {
		seed(root, [
			{ id: "gh-issue-1", title: "S", priority: "p2", area: "workflow", status: "scheduled", evidence: [URL(1)], source: { kind: "github-issue" }, externalRef: { provider: "github", number: 1, url: URL(1) }, workId: "2026-07-25-x", count: 1, firstSeenAt: "2026-07-25T00:00:00.000Z", lastSeenAt: "2026-07-25T00:00:00.000Z" },
			{ id: "gh-issue-2", title: "D", priority: "p2", area: "workflow", status: "done", evidence: [URL(2)], source: { kind: "github-issue" }, externalRef: { provider: "github", number: 2, url: URL(2) }, workId: null, count: 1, firstSeenAt: "2026-07-25T00:00:00.000Z", lastSeenAt: "2026-07-25T00:00:00.000Z" },
		]);
		await syncIssues(root, "pull", { gh });
		assert.equal(itemAt(root, "gh-issue-1").status, "scheduled");
		assert.equal(itemAt(root, "gh-issue-2").status, "done");
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("AC-4: pull imports an unlinked open issue as a new github-issue candidate", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([{ number: 42, title: "Brand new bug", url: URL(42), state: "open" }]);
	try {
		const result = await syncIssues(root, "pull", { gh });
		const after = readBacklog(root).items;
		assert.equal(after.length, 1);
		const created = after[0]!;
		assert.equal(created.id, "gh-issue-42");
		assert.equal(created.source.kind, "github-issue");
		assert.equal(created.source.workId, undefined);
		assert.equal(created.status, "candidate");
		assert.equal(created.area, "workflow");
		assert.deepEqual(created.evidence, [URL(42)]);
		assert.equal(created.externalRef?.number, 42);
		assert.equal(created.externalRef?.url, URL(42));
		assert.deepEqual(result.pulled.created, ["gh-issue-42"]);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("AC-5: pull never imports a closed unlinked issue", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([{ number: 99, title: "Ancient", url: URL(99), state: "closed" }]);
	try {
		const result = await syncIssues(root, "pull", { gh });
		assert.equal(readBacklog(root).items.length, 0);
		assert.equal(result.pulled.skippedClosed, 1);
		assert.equal(result.pulled.created.length, 0);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("AC-6: push creates an issue for one unlinked candidate and records externalRef", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([]);
	try {
		seed(root, [{ id: "feat-x", title: "Ship feature X", priority: "p2", area: "workflow", status: "candidate", evidence: ["src/a.ts"], source: { kind: "plan-followup", workId: "2026-07-25-x" }, workId: null, count: 1, firstSeenAt: "2026-07-25T00:00:00.000Z", lastSeenAt: "2026-07-25T00:00:00.000Z" }]);
		const result = await syncIssues(root, "push", { gh });
		assert.equal(gh.created.length, 1);
		assert.equal(gh.created[0]?.label, "codepatrol-backlog");
		assert.deepEqual(gh.labelsEnsured, ["codepatrol-backlog"]);
		const after = itemAt(root, "feat-x");
		assert.equal(after.status, "candidate");
		assert.equal((after.externalRef as { number: number }).number, 1);
		assert.equal((after.externalRef as { url: string }).url, URL(1));
		assert.deepEqual(result.pushed.created, ["feat-x"]);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("AC-7: push closes done and dismissed items whose linked issues are still open", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([
		{ number: 11, title: "DoneOne", url: URL(11), state: "open" },
		{ number: 12, title: "DismissedOne", url: URL(12), state: "open" },
	]);
	try {
		seed(root, [
			{ id: "gh-issue-11", title: "DoneOne", priority: "p3", area: "workflow", status: "done", evidence: [URL(11)], source: { kind: "github-issue" }, externalRef: { provider: "github", number: 11, url: URL(11) }, workId: null, count: 1, firstSeenAt: "2026-07-25T00:00:00.000Z", lastSeenAt: "2026-07-25T00:00:00.000Z" },
			{ id: "gh-issue-12", title: "DismissedOne", priority: "p3", area: "workflow", status: "dismissed", evidence: [URL(12)], source: { kind: "github-issue" }, externalRef: { provider: "github", number: 12, url: URL(12) }, workId: null, count: 1, firstSeenAt: "2026-07-25T00:00:00.000Z", lastSeenAt: "2026-07-25T00:00:00.000Z" },
		]);
		const result = await syncIssues(root, "push", { gh });
		assert.deepEqual(gh.closed, [{ number: 11, reason: "completed" }, { number: 12, reason: "not planned" }]);
		assert.deepEqual(result.pushed.closed, [11, 12]);
		assert.equal(gh.created.length, 0);
		assert.equal(gh.labelsEnsured.length, 0);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("AC-8: dry-run both makes zero gh mutations and zero backlog writes while reporting the would-be result", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([{ number: 50, title: "Open unlinked", url: URL(50), state: "open" }]);
	try {
		seed(root, [{ id: "cand-1", title: "Cand one", priority: "p3", area: "workflow", status: "candidate", evidence: [], source: { kind: "plan-followup", workId: "2026-07-25-x" }, workId: null, count: 1, firstSeenAt: "2026-07-25T00:00:00.000Z", lastSeenAt: "2026-07-25T00:00:00.000Z" }]);
		const before = readFileSync(backlogPath(root), "utf8");
		const result = await syncIssues(root, "both", { gh, dryRun: true });
		assert.equal(gh.created.length, 0);
		assert.equal(gh.closed.length, 0);
		assert.equal(gh.labelsEnsured.length, 0);
		assert.equal(readFileSync(backlogPath(root), "utf8"), before);
		assert.deepEqual(result.pulled.created, ["gh-issue-50"]);
		assert.deepEqual(result.pushed.created, ["cand-1"]);
		assert.equal(result.dryRun, true);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("regression: a github-issue-sourced candidate (already has externalRef) is never re-pushed", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([]);
	try {
		seed(root, [{ id: "gh-issue-3", title: "Imported", priority: "p3", area: "workflow", status: "candidate", evidence: [URL(3)], source: { kind: "github-issue" }, externalRef: { provider: "github", number: 3, url: URL(3) }, workId: null, count: 1, firstSeenAt: "2026-07-25T00:00:00.000Z", lastSeenAt: "2026-07-25T00:00:00.000Z" }]);
		await syncIssues(root, "push", { gh });
		assert.equal(gh.created.length, 0);
		assert.equal(gh.labelsEnsured.length, 0);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("syncIssues always calls assertAvailable then listIssues once regardless of direction", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([]);
	try {
		await syncIssues(root, "pull", { gh });
		assert.equal(gh.assertAvailableCalled, 1);
		assert.equal(gh.listCalled, 1);
		gh.assertAvailableCalled = 0; gh.listCalled = 0;
		await syncIssues(root, "push", { gh });
		assert.equal(gh.assertAvailableCalled, 1);
		assert.equal(gh.listCalled, 1);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("regression: yaml in codepatrol/backlog items.yaml round-trips externalRef through readBacklog", () => {
	const root = workspace();
	try {
		const original = { schema_version: 1, items: [{ id: "gh-issue-1", title: "t", priority: "p3", area: "workflow", status: "candidate", evidence: [URL(1)], source: { kind: "github-issue" }, externalRef: { provider: "github", number: 1, url: URL(1) }, workId: null, count: 1, firstSeenAt: "2026-07-25T00:00:00.000Z", lastSeenAt: "2026-07-25T00:00:00.000Z" }] };
		writeFileSync(backlogPath(root), stringify(original, { lineWidth: 0 }));
		const raw = parse(readFileSync(backlogPath(root), "utf8")) as { items: Array<{ externalRef?: { provider: string; number: number; url: string } }> };
		assert.equal(raw.items[0]?.externalRef?.provider, "github");
		assert.equal(readBacklog(root).items[0]?.externalRef?.number, 1);
	} finally { rmSync(root, { recursive: true, force: true }); }
});
