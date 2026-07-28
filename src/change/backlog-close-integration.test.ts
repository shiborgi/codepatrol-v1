import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { advanceThroughVerify } from "./git.test-helper.js";
import { closeChange, transitionChange } from "./orchestrator.js";
import { addWork, listWork, readWork, resolveWork } from "./backlog.js";
import * as trace from "./trace.js";

function git(workspace: string, args: string[]): string { return execFileSync("git", args, { cwd: workspace, encoding: "utf8" }).trim(); }
function at(second: number) { return { now: new Date(`2026-07-24T10:00:${String(second).padStart(2, "0")}.000Z`) }; }
function initRepo(workspace: string): void {
	writeFileSync(join(workspace, ".gitignore"), ".codepatrol/runtime/\n.codepatrol/docs/\n");
	git(workspace, ["init", "-b", "main"]); writeFileSync(join(workspace, "README.md"), "baseline\n"); git(workspace, ["add", "."]); git(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "baseline"]);
}
async function closeWithRun(workspace: string, id: string, outcome: "commit" | "rollback") {
	await transitionChange(workspace, id, { type: "begin", actor: "trace-test", stage: "close", nextAction: "close" }, at(15));
	await transitionChange(workspace, id, { type: "usage", actor: "trace-test", stage: "close", run: { id: "close-usage", started_at: "2026-07-22T10:00:16Z", finished_at: "2026-07-22T10:00:17Z", elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, at(17));
	return closeChange(workspace, id, { outcome, actor: "trace-test", authority: "test" }, at(20));
}

describe("close integration: Work disposition", () => {
test("close commit marks only the matching Work done in the terminal commit and leaves unrelated Work untouched", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-close-work-done-"));
	try {
		initRepo(workspace);
		const id = "2026-07-26-close-work-done";
		await addWork(workspace, { workId: "2026-07-26-unrelated", priority: "p1", description: "Unrelated work" });
		git(workspace, ["add", ".codepatrol/work/"]); git(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "work"]);
		await advanceThroughVerify(workspace, id);
		const result = await closeWithRun(workspace, id, "commit");
		assert.equal(result.outcome, "committed");
		assert.equal(readWork(workspace, id)?.status, "done");
		assert.equal(readWork(workspace, "2026-07-26-unrelated")?.status, "open");
		const show = git(workspace, ["show", "--name-only", "--format=", result.terminalCommit]);
		assert.match(show, new RegExp(`\\.codepatrol/work/${id}\\.yaml`), "the matching Work record is part of the terminal commit");
		assert.doesNotMatch(show, /2026-07-26-unrelated/, "no unrelated Work record is touched");
	} finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("close rollback marks the matching Work dismissed in the terminal tag", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-close-work-rollback-"));
	try {
		initRepo(workspace);
		const id = "2026-07-26-close-work-rollback";
		await advanceThroughVerify(workspace, id);
		const result = await closeWithRun(workspace, id, "rollback");
		assert.equal(result.outcome, "rolled-back");
		const raw = git(workspace, ["show", `${result.tag}:.codepatrol/work/${id}.yaml`]);
		assert.match(raw, /status: dismissed/);
	} finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("close recommendations remain report-only and never create Work", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-close-report-only-"));
	try {
		initRepo(workspace);
		const id = "2026-07-24-close-report-only";
		await advanceThroughVerify(workspace, id);
		for (let i = 0; i < 8; i++) trace.append(workspace, id, { kind: "command", at: `2026-07-22T10:00:0${i}.000Z`, command: "change transition", args: {} });
		const result = await closeWithRun(workspace, id, "commit");
		assert.equal(result.outcome, "committed");
		const works = listWork(workspace);
		assert.deepEqual(works.map((work) => work.workId), [id], "trace recommendations create no implicit Work");
		const show = git(workspace, ["show", "--name-only", "--format=", result.terminalCommit]);
		assert.match(show, /improvement-report\.md/, "the improvement report is still produced");
	} finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("close fails closed with CHANGE_DRIFT when a nonterminal Change lacks Work", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-close-work-missing-"));
	try {
		initRepo(workspace);
		const id = "2026-07-26-close-work-missing";
		await advanceThroughVerify(workspace, id, async () => {
			rmSync(join(workspace, ".codepatrol/work", `${id}.yaml`));
			git(workspace, ["add", ".codepatrol/work/"]); git(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "remove work"]);
		});
		await transitionChange(workspace, id, { type: "begin", actor: "trace-test", stage: "close", nextAction: "close" }, at(15));
		await transitionChange(workspace, id, { type: "usage", actor: "trace-test", stage: "close", run: { id: "close-usage", started_at: "2026-07-22T10:00:16Z", finished_at: "2026-07-22T10:00:17Z", elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, at(17));
		await assert.rejects(closeChange(workspace, id, { outcome: "commit", actor: "trace-test", authority: "test" }, at(20)), /CHANGE_DRIFT/);
	} finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("close commit succeeds when the Work was manually dismissed mid-lifecycle and records done", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-close-work-predismissed-"));
	try {
		initRepo(workspace);
		const id = "2026-07-26-close-work-predismissed";
		await advanceThroughVerify(workspace, id, async () => {
			await resolveWork(workspace, id, "dismissed");
			git(workspace, ["add", ".codepatrol/work/"]); git(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "dismiss"]);
		});
		const result = await closeWithRun(workspace, id, "commit");
		assert.equal(result.outcome, "committed");
		assert.equal(readWork(workspace, id)?.status, "done");
	} finally { rmSync(workspace, { recursive: true, force: true }); }
});
});
