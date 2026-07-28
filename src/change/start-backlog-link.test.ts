import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startChange, transitionChange } from "./orchestrator.js";
import { addWork, readWork, resolveWork } from "./backlog.js";

function git(workspace: string, args: string[]): string { return execFileSync("git", args, { cwd: workspace, encoding: "utf8" }).trim(); }
function initRepo(workspace: string): void {
	writeFileSync(join(workspace, ".gitignore"), ".codepatrol/runtime/\n");
	git(workspace, ["init", "-b", "main"]);
	writeFileSync(join(workspace, "README.md"), "baseline\n");
	git(workspace, ["add", "."]);
	git(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "baseline"]);
}

test("direct change start creates an open Work from the exact work id and commits it", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-start-work-create-"));
	try {
		initRepo(workspace);
		const result = await startChange(workspace, { workId: "2026-07-24-start-work", title: "Direct start title", targetBranch: "main", actor: "test" });
		assert.equal(result.identity.work_id, "2026-07-24-start-work");
		const work = readWork(workspace, "2026-07-24-start-work");
		assert.equal(work?.status, "open");
		assert.equal(work?.priority, "p2");
		assert.equal(work?.description, "Direct start title");
		const show = git(workspace, ["show", "--name-only", "--format=", "HEAD"]);
		assert.match(show, /\.codepatrol\/work\/2026-07-24-start-work\.yaml/);
	} finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("change start honors an explicit priority for newly created Work", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-start-work-priority-"));
	try {
		initRepo(workspace);
		await startChange(workspace, { workId: "2026-07-24-start-p0", title: "Urgent", targetBranch: "main", actor: "test", priority: "p0" });
		assert.equal(readWork(workspace, "2026-07-24-start-p0")?.priority, "p0");
	} finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("change start reuses an existing open Work and takes its first description line as title", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-start-work-reuse-"));
	try {
		initRepo(workspace);
		await addWork(workspace, { workId: "2026-07-24-start-reuse", priority: "p1", description: "\nExisting work summary\n\nLonger details" });
		git(workspace, ["add", ".codepatrol/work/"]);
		git(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "work"]);
		const result = await startChange(workspace, { workId: "2026-07-24-start-reuse", title: "Ignored input title", targetBranch: "main", actor: "test" });
		assert.equal(result.identity.title, "Existing work summary");
		const work = readWork(workspace, "2026-07-24-start-reuse");
		assert.equal(work?.priority, "p1");
		const show = git(workspace, ["show", "--name-only", "--format=", "HEAD"]);
		assert.doesNotMatch(show, /\.codepatrol\/work\//, "a pre-existing Work record is not re-committed");
	} finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("change start rejects a terminal Work before branch creation", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-start-work-terminal-"));
	try {
		initRepo(workspace);
		await addWork(workspace, { workId: "2026-07-24-start-terminal", priority: "p2", description: "Done work" });
		await resolveWork(workspace, "2026-07-24-start-terminal", "done");
		git(workspace, ["add", ".codepatrol/work/"]);
		git(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "work"]);
		await assert.rejects(startChange(workspace, { workId: "2026-07-24-start-terminal", title: "x", targetBranch: "main", actor: "test" }), /CHANGE_CONFLICT/);
		assert.throws(() => git(workspace, ["rev-parse", "--verify", "codepatrol/2026-07-24-start-terminal"]), /Needed a single revision/);
	} finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("change start rejects an independent backlog identity at input validation", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-start-no-link-"));
	try {
		initRepo(workspace);
		await assert.rejects(startChange(workspace, { workId: "2026-07-24-no-link", title: "x", targetBranch: "main", actor: "test", backlogItemId: "anything" } as never), /unknown field backlogItemId/);
	} finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("a start failure after Work creation deletes only the newly-owned Work", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-start-work-cleanup-"));
	try {
		initRepo(workspace);
		await addWork(workspace, { workId: "2026-07-24-pre-existing", priority: "p2", description: "Keep me" });
		mkdirSync(join(workspace, ".codepatrol/changes"), { recursive: true });
		writeFileSync(join(workspace, ".codepatrol/changes/2026-07-24-start-fails"), "not a directory\n");
		git(workspace, ["add", ".codepatrol/"]);
		git(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "blocking file"]);
		await assert.rejects(startChange(workspace, { workId: "2026-07-24-start-fails", title: "Will fail", targetBranch: "main", actor: "test" }));
		assert.equal(existsSync(join(workspace, ".codepatrol/work/2026-07-24-start-fails.yaml")), false, "no Work survives a rejected start");
		assert.ok(readWork(workspace, "2026-07-24-pre-existing"), "pre-existing Work is never deleted by cleanup");
		assert.throws(() => git(workspace, ["rev-parse", "--verify", "codepatrol/2026-07-24-start-fails"]), /Needed a single revision/);
	} finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("regression: Plan checkpoint succeeds immediately after a direct change start", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-start-work-regression-"));
	try {
		initRepo(workspace);
		const id2 = "2026-07-24-start-work-regress";
		await startChange(workspace, { workId: id2, title: "Regress", targetBranch: "main", actor: "test" });
		mkdirSync(join(workspace, ".codepatrol/changes", id2, "plan"), { recursive: true });
		writeFileSync(join(workspace, ".codepatrol/changes", id2, "plan/spec.md"), "spec\n");
		writeFileSync(join(workspace, ".codepatrol/changes", id2, "plan/plan.md"), "plan\n");
		const specSha = require("node:crypto").createHash("sha256").update("spec\n").digest("hex");
		const planSha = require("node:crypto").createHash("sha256").update("plan\n").digest("hex");
		await transitionChange(workspace, id2, { type: "usage", actor: "test", stage: "plan", run: { id: "plan-usage", started_at: "2026-07-24T03:00:00.000Z", finished_at: "2026-07-24T03:00:01.000Z", elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, { signal: undefined });
		await transitionChange(workspace, id2, { type: "checkpoint", actor: "test", stage: "plan", result: "ready", artifacts: [{ path: ".codepatrol/changes/" + id2 + "/plan/spec.md", sha256: specSha, intent: "create" }, { path: ".codepatrol/changes/" + id2 + "/plan/plan.md", sha256: planSha, intent: "create" }], nextAction: "codepatrol-review" }, { signal: undefined });
	} finally { rmSync(workspace, { recursive: true, force: true }); }
});
