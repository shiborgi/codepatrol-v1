import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeChange, startChange, transitionChange } from "./orchestrator.js";
import { NodeGitAdapter } from "./git.js";
import { CodepatrolError } from "../shared/errors.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function git(workspace: string, args: string[]): string { return execFileSync("git", args, { cwd: workspace, encoding: "utf8" }).trim(); }
function at(second: number) { return { now: new Date(`2026-07-27T10:00:${String(second).padStart(2, "0")}.000Z`) }; }

describe("close performs no remote action", () => {
	test("close rejects input carrying push before touching git", async () => {
		const workspace = mkdtempSync(join(tmpdir(), "codepatrol-no-push-input-"));
		try {
			git(workspace, ["init", "-b", "main"]); writeFileSync(join(workspace, ".gitignore"), ".codepatrol/runtime/\n.codepatrol/docs/\n"); writeFileSync(join(workspace, "README.md"), "baseline\n"); git(workspace, ["add", "."]); git(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "baseline"]);
			await assert.rejects(closeChange(workspace, "2026-07-27-no-push", { outcome: "commit", actor: "codex", authority: "approved", push: true } as never), (error: unknown) => error instanceof CodepatrolError && error.code === "INVALID_ARGUMENT" && /push/.test((error as Error).message));
		} finally { rmSync(workspace, { recursive: true, force: true }); }
	});

	test("close never invokes git.push during a commit outcome", async () => {
		const root = mkdtempSync(join(tmpdir(), "codepatrol-no-push-run-"));
		const workspace = join(root, "workspace");
		try {
			mkdirSync(workspace, { recursive: true });
			git(workspace, ["init", "-b", "main"]); writeFileSync(join(workspace, ".gitignore"), ".codepatrol/runtime/\n.codepatrol/docs/\n"); writeFileSync(join(workspace, "README.md"), "baseline\n"); git(workspace, ["add", "."]); git(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "baseline"]);
			const id = "2026-07-27-no-push-run";
			await startChange(workspace, { workId: id, title: "No push", targetBranch: "main", actor: "codex" }, at(1));
			const opts = { now: at(2).now };
			const hashOf = (p: string) => createHash("sha256").update(readFileSync(join(workspace, p))).digest("hex");
			const h = (p: string) => ({ path: p, sha256: hashOf(p), intent: "create" as const });
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
			let pushCalled = false;
			const git2 = new NodeGitAdapter(workspace);
			git2.push = async () => { pushCalled = true; throw new Error("should not push"); };
			await closeChange(workspace, id, { outcome: "commit", actor: "test", authority: "approved" }, { ...opts, git: git2 });
			assert.equal(pushCalled, false);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});