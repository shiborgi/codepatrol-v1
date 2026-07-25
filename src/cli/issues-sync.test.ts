import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify } from "yaml";
import { backlogPath } from "../change/backlog.js";
import type { GhAdapter, RemoteIssue } from "../change/issue-sync.js";
import { executeCommand } from "./commands.js";
import { parseArgs } from "./args.js";

function workspace(): string {
	const root = mkdtempSync(join(tmpdir(), "codepatrol-issues-sync-cli-"));
	mkdirSync(join(root, ".codepatrol", "backlog"), { recursive: true });
	return root;
}

class FakeGhAdapter implements GhAdapter {
	issues: RemoteIssue[];
	created: Array<{ title: string; body: string; label: string }> = [];
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

test("issues sync --direction push end-to-end via executeCommand with injected FakeGhAdapter", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([]);
	try {
		writeFileSync(backlogPath(root), stringify({ schema_version: 1, items: [{ id: "feat-1", title: "Feature one", priority: "p2", area: "workflow", status: "candidate", evidence: [], source: { kind: "plan-followup", workId: "2026-07-25-x" }, workId: null, count: 1, firstSeenAt: "2026-07-25T00:00:00.000Z", lastSeenAt: "2026-07-25T00:00:00.000Z" }] }, { lineWidth: 0 }));
		const args = parseArgs(["issues", "sync", "--workspace", root, "--direction", "push"]);
		const controller = new AbortController();
		const result = await executeCommand(args, root, controller.signal, { gh });
		assert.equal(gh.created.length, 1);
		assert.deepEqual(gh.labelsEnsured, ["codepatrol-backlog"]);
		const data = result.data as { pushed: { created: string[] } };
		assert.deepEqual(data.pushed.created, ["feat-1"]);
		assert.match(result.text, /Push: 1 created/);
		assert.match(result.text, /created: feat-1/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("issues sync --direction both with --dry-run reports would-be result and performs zero mutations", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([{ number: 9, title: "Open unlinked", url: "https://github.com/x/y/issues/9", state: "open" }]);
	try {
		writeFileSync(backlogPath(root), stringify({ schema_version: 1, items: [{ id: "cand-1", title: "Cand one", priority: "p3", area: "workflow", status: "candidate", evidence: [], source: { kind: "plan-followup", workId: "2026-07-25-x" }, workId: null, count: 1, firstSeenAt: "2026-07-25T00:00:00.000Z", lastSeenAt: "2026-07-25T00:00:00.000Z" }] }, { lineWidth: 0 }));
		const args = parseArgs(["issues", "sync", "--workspace", root, "--dry-run"]);
		const controller = new AbortController();
		const result = await executeCommand(args, root, controller.signal, { gh });
		assert.equal(gh.created.length, 0);
		assert.equal(gh.closed.length, 0);
		assert.equal(gh.labelsEnsured.length, 0);
		const data = result.data as { pulled: { created: string[] }; pushed: { created: string[] }; dryRun: boolean };
		assert.deepEqual(data.pulled.created, ["gh-issue-9"]);
		assert.deepEqual(data.pushed.created, ["cand-1"]);
		assert.equal(data.dryRun, true);
		assert.match(result.text, /\(dry run\)/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("issues sync --direction bogus throws INVALID_ARGUMENT before any gh call", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([]);
	try {
		const args = parseArgs(["issues", "sync", "--workspace", root, "--direction", "sideways"]);
		const controller = new AbortController();
		await assert.rejects(executeCommand(args, root, controller.signal, { gh }), /INVALID_ARGUMENT/);
		assert.equal(gh.created.length, 0);
		assert.equal(gh.labelsEnsured.length, 0);
	} finally { rmSync(root, { recursive: true, force: true }); }
});
