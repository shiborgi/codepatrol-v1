import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeWork } from "../change/backlog.js";
import type { GhAdapter, RemoteIssue } from "../change/issue-sync.js";
import { executeCommand } from "./commands.js";
import { parseArgs } from "./args.js";

function git(workspace: string, args: string[]): string { return execFileSync("git", args, { cwd: workspace, encoding: "utf8" }).trim(); }

function workspace(): string {
	const root = mkdtempSync(join(tmpdir(), "codepatrol-issues-sync-cli-"));
	writeFileSync(join(root, ".gitignore"), ".codepatrol/runtime/\n");
	git(root, ["init", "-b", "main"]);
	writeFileSync(join(root, "README.md"), "baseline\n");
	git(root, ["add", "."]);
	git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "baseline"]);
	return root;
}

const URL = (n: number) => `https://github.com/x/y/issues/${n}`;
const AT = "2026-07-25T00:00:00.000Z";

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
		const issue: RemoteIssue = { number, title, body, url: URL(number), state: "open" };
		this.issues.push(issue);
		return issue;
	}
	async editIssue(number: number, update: { title: string; body: string }): Promise<void> {
		this.edited.push({ number, ...update });
	}
	async reopenIssue(number: number): Promise<void> { this.reopened.push(number); }
	async closeIssue(number: number, reason: "completed" | "not planned"): Promise<void> {
		this.closed.push({ number, reason: String(reason) });
		const issue = this.issues.find((entry) => entry.number === number);
		if (issue) issue.state = "closed";
	}
}

test("issues sync end-to-end via executeCommand publishes canonical issues with the injected adapter", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([]);
	try {
		writeWork(root, { workId: "2026-07-26-cli-sync", priority: "p1", description: "CLI sync work", status: "open", createdAt: AT, updatedAt: AT });
		const args = parseArgs(["issues", "sync", "--workspace", root]);
		const controller = new AbortController();
		const result = await executeCommand(args, root, controller.signal, { gh });
		assert.equal(gh.created.length, 1);
		assert.equal(gh.created[0]?.title, "[p1] 2026-07-26-cli-sync");
		assert.deepEqual(gh.labelsEnsured, ["codepatrol-backlog"]);
		const data = result.data as { created: string[] };
		assert.deepEqual(data.created, ["2026-07-26-cli-sync"]);
		assert.match(result.text, /1 created/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("issues sync --dry-run reports would-be actions and performs zero mutations", async () => {
	const root = workspace();
	const gh = new FakeGhAdapter([]);
	try {
		writeWork(root, { workId: "2026-07-26-cli-dry", priority: "p3", description: "Dry run work", status: "open", createdAt: AT, updatedAt: AT });
		const args = parseArgs(["issues", "sync", "--workspace", root, "--dry-run"]);
		const controller = new AbortController();
		const result = await executeCommand(args, root, controller.signal, { gh });
		assert.equal(gh.created.length, 0);
		assert.equal(gh.labelsEnsured.length, 0);
		const data = result.data as { created: string[]; dryRun: boolean };
		assert.deepEqual(data.created, ["2026-07-26-cli-dry"]);
		assert.equal(data.dryRun, true);
		assert.match(result.text, /\(dry run\)/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("issues sync --direction is rejected as an unknown option", () => {
	assert.throws(() => parseArgs(["issues", "sync", "--direction", "push"]), /Unknown option: --direction/);
});

test("sync --direction is rejected as an unknown option", () => {
	assert.throws(() => parseArgs(["sync", "--issues", "--direction", "both"]), /Unknown option: --direction/);
});
