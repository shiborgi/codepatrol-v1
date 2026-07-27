import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeChange, startChange, transitionChange } from "./orchestrator.js";
import type { GitAdapter } from "./git.js";
import type { GhAdapter } from "./issue-sync.js";
import { syncRemote } from "./sync.js";
import { CodepatrolError } from "../shared/errors.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function git(workspace: string, args: string[]): string { return execFileSync("git", args, { cwd: workspace, encoding: "utf8" }).trim(); }
function at(second: number) { return { now: new Date(`2026-07-27T10:00:${String(second).padStart(2, "0")}.000Z`) }; }
function hashOf(workspace: string, path: string) { return createHash("sha256").update(readFileSync(join(workspace, path))).digest("hex"); }

class RecordingGit implements GitAdapter {
	workspace: string;
	pushes: { remote: string; branch: string }[] = [];
	deletes: { name: string; expected: string }[] = [];
	currentBranchValue: string;
	constructor(workspace: string, currentBranchValue: string) { this.workspace = workspace; this.currentBranchValue = currentBranchValue; }
	async assertTrusted(): Promise<void> {}
	async status(): Promise<string> { return ""; }
	async currentBranch(): Promise<string> { return this.currentBranchValue; }
	async head(): Promise<string> { return "a".repeat(40); }
	async tree(): Promise<string> { return "b".repeat(40); }
	async branchExists(): Promise<boolean> { return false; }
	async createBranch(): Promise<void> {}
	async checkout(): Promise<void> {}
	async add(): Promise<void> {}
	async unstage(): Promise<void> {}
	async commit(): Promise<string> { return "c".repeat(40); }
	async tag(): Promise<void> {}
	async deleteBranch(name: string, expected: string): Promise<void> { this.deletes.push({ name, expected }); }
	async mergeFf(): Promise<void> {}
	async mergeSquash(): Promise<void> {}
	async refs(prefix: string): Promise<string[]> {
		if (prefix === "refs/heads/codepatrol/") return [`codepatrol/${this.workIdForRefs}`].filter(Boolean);
		if (prefix === "refs/tags/codepatrol/") return [`codepatrol/committed/${this.workIdForRefs}`].filter(Boolean);
		return [];
	}
	workIdForRefs = "";
	async show(): Promise<string | undefined> { return undefined; }
	async pathExists(): Promise<boolean> { return false; }
	async readFile(): Promise<Buffer | undefined> { return undefined; }
	async files(): Promise<string[]> { return []; }
	async changedPaths(): Promise<string[]> { return []; }
	async isAncestor(): Promise<boolean> { return true; }
	async push(remote: string, branch: string): Promise<string> { this.pushes.push({ remote, branch }); return ""; }
}

class FakeGh implements GhAdapter {
	asserted = false; listed = false; closed = 0; created = 0; labelled = false;
	async assertAvailable(): Promise<void> { this.asserted = true; }
	async listIssues(): Promise<never[]> { this.listed = true; return []; }
	async ensureLabel(): Promise<void> { this.labelled = true; }
	async createIssue(): Promise<never> { this.created++; throw new Error("should not be called under dry-run"); }
	async closeIssue(): Promise<void> { this.closed++; throw new Error("should not be called under dry-run"); }
}

describe("codepatrol sync", () => {
	test("sync --target rejects refspec, deletion, and unsafe branch names before any push", async () => {
		const root = mkdtempSync(join(tmpdir(), "codepatrol-sync-target-"));
		try {
			for (const unsafe of [":refs/heads/name", "HEAD:other", "main..old", "../escape", "with space"]) {
				await assert.rejects(syncRemote(root, { target: true, targetBranch: unsafe, git: new RecordingGit(root, "main") }), (error: unknown) => error instanceof CodepatrolError && error.code === "INVALID_ARGUMENT");
			}
			const safe = new RecordingGit(root, "main");
			await syncRemote(root, { target: true, targetBranch: "release", git: safe });
			assert.deepEqual(safe.pushes, [{ remote: "origin", branch: "release" }]);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	test("sync --target without explicit branch resolves through the current branch and Changes", async () => {
		const root = mkdtempSync(join(tmpdir(), "codepatrol-sync-resolve-"));
		const workspace = join(root, "workspace");
		try {
			mkdirSync(workspace, { recursive: true });
			git(workspace, ["init", "-b", "main"]); writeFileSync(join(workspace, ".gitignore"), ".codepatrol/runtime/\n.codepatrol/docs/\n"); writeFileSync(join(workspace, "README.md"), "baseline\n"); git(workspace, ["add", "."]); git(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "baseline"]);
			const id = "2026-07-27-sync-target"; await startChange(workspace, { workId: id, title: "Sync target", targetBranch: "main", actor: "codex" }, at(1));
			const opts = { now: at(2).now };
			const h = (p: string) => ({ path: p, sha256: hashOf(workspace, p), intent: "create" as const });
			mkdirSync(join(workspace, `.codepatrol/changes/${id}/plan`), { recursive: true }); writeFileSync(join(workspace, `.codepatrol/changes/${id}/plan/spec.md`), "s\n"); writeFileSync(join(workspace, `.codepatrol/changes/${id}/plan/plan.md`), "p\n");
			await transitionChange(workspace, id, { type: "usage", actor: "test", stage: "plan", run: { id: "p", started_at: at(2).now.toISOString(), finished_at: at(3).now.toISOString(), elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, opts);
			await transitionChange(workspace, id, { type: "checkpoint", actor: "test", stage: "plan", result: "ready", nextAction: "next", artifacts: [h(`.codepatrol/changes/${id}/plan/spec.md`), h(`.codepatrol/changes/${id}/plan/plan.md`)] }, opts);
			await transitionChange(workspace, id, { type: "begin", actor: "test", stage: "review", nextAction: "next" }, opts);
			await transitionChange(workspace, id, { type: "usage", actor: "test", stage: "review", run: { id: "r", started_at: at(4).now.toISOString(), finished_at: at(5).now.toISOString(), elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, opts);
			mkdirSync(join(workspace, `.codepatrol/changes/${id}/review`), { recursive: true }); writeFileSync(join(workspace, `.codepatrol/changes/${id}/review/report.md`), "r\n");
			await transitionChange(workspace, id, { type: "checkpoint", actor: "test", stage: "review", result: "approve", nextAction: "next", artifacts: [h(`.codepatrol/changes/${id}/review/report.md`)] }, opts);
			await transitionChange(workspace, id, { type: "begin", actor: "test", stage: "apply", nextAction: "next" }, opts);
			await transitionChange(workspace, id, { type: "usage", actor: "test", stage: "apply", run: { id: "a", started_at: at(6).now.toISOString(), finished_at: at(7).now.toISOString(), elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, opts);
			mkdirSync(join(workspace, `.codepatrol/changes/${id}/apply`), { recursive: true }); writeFileSync(join(workspace, `.codepatrol/changes/${id}/apply/journal.md`), "a\n"); writeFileSync(join(workspace, "README.md"), "changed\n");
			await transitionChange(workspace, id, { type: "checkpoint", actor: "test", stage: "apply", result: "implemented", nextAction: "next", artifacts: [h(`.codepatrol/changes/${id}/apply/journal.md`)], changes: ["README.md"] }, opts);
			await transitionChange(workspace, id, { type: "begin", actor: "test", stage: "verify", nextAction: "next" }, opts);
			await transitionChange(workspace, id, { type: "usage", actor: "test", stage: "verify", run: { id: "v", started_at: at(8).now.toISOString(), finished_at: at(9).now.toISOString(), elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, opts);
			mkdirSync(join(workspace, `.codepatrol/changes/${id}/verify`), { recursive: true }); writeFileSync(join(workspace, `.codepatrol/changes/${id}/verify/report.md`), "v\n");
			await transitionChange(workspace, id, { type: "checkpoint", actor: "test", stage: "verify", result: "commit", nextAction: "next", artifacts: [h(`.codepatrol/changes/${id}/verify/report.md`)] }, opts);
			await transitionChange(workspace, id, { type: "begin", actor: "test", stage: "close", nextAction: "next" }, opts);
			await transitionChange(workspace, id, { type: "usage", actor: "test", stage: "close", run: { id: "c", started_at: at(10).now.toISOString(), finished_at: at(11).now.toISOString(), elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, opts);
			await closeChange(workspace, id, { outcome: "commit", actor: "test", authority: "approved" }, opts);

			const fake = new RecordingGit(workspace, "main");
			const result = await syncRemote(workspace, { target: true, git: fake });
			assert.deepEqual(fake.pushes, [{ remote: "origin", branch: "main" }]);
			assert.equal(result.pushedRefs.includes("main"), true);

			const unresolved = new RecordingGit(workspace, "totally-unrelated");
			await assert.rejects(syncRemote(workspace, { target: true, git: unresolved }), (error: unknown) => error instanceof CodepatrolError && error.code === "INVALID_ARGUMENT");
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	test("sync --dry-run performs zero push writes while still running gh reads", async () => {
		const workspace = mkdtempSync(join(tmpdir(), "codepatrol-sync-dryrun-"));
		try {
			git(workspace, ["init", "-b", "main"]); writeFileSync(join(workspace, ".gitignore"), ".codepatrol/runtime/\n.codepatrol/docs/\n"); writeFileSync(join(workspace, "README.md"), "baseline\n"); git(workspace, ["add", "."]); git(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "baseline"]);
			const fake = new RecordingGit(workspace, "main");
			const gh = new FakeGh();
			const result = await syncRemote(workspace, { target: true, targetBranch: "main", issues: "both", dryRun: true, git: fake, gh });
			assert.equal(fake.pushes.length, 0);
			assert.equal(gh.asserted, true);
			assert.equal(gh.listed, true);
			assert.equal(gh.created, 0);
			assert.equal(gh.closed, 0);
			assert.equal(result.dryRun, true);
		} finally { rmSync(workspace, { recursive: true, force: true }); }
	});

	test("sync --branches collects branch and tag refs without pushing when nothing is selected", async () => {
		const workspace = mkdtempSync(join(tmpdir(), "codepatrol-sync-branches-"));
		try {
			git(workspace, ["init", "-b", "main"]); writeFileSync(join(workspace, ".gitignore"), ".codepatrol/runtime/\n.codepatrol/docs/\n"); writeFileSync(join(workspace, "README.md"), "baseline\n"); git(workspace, ["add", "."]); git(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "baseline"]);
			const fake = new RecordingGit(workspace, "main");
			fake.workIdForRefs = "2026-07-27-sync-branches";
			const result = await syncRemote(workspace, { branches: true, dryRun: true, git: fake });
			assert.equal(fake.pushes.length, 0);
			assert.ok(result.pushedRefs.includes(`codepatrol/${fake.workIdForRefs}`));
			assert.ok(result.pushedRefs.includes(`codepatrol/committed/${fake.workIdForRefs}`));
		} finally { rmSync(workspace, { recursive: true, force: true }); }
	});
});