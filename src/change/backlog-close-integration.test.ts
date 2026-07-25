import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { advanceThroughVerify } from "./git.test-helper.js";
import { closeChange, transitionChange } from "./orchestrator.js";
import { readBacklog } from "./backlog.js";
import * as trace from "./trace.js";

function git(workspace: string, args: string[]): string { return execFileSync("git", args, { cwd: workspace, encoding: "utf8" }).trim(); }
function at(second: number) { return { now: new Date(`2026-07-24T10:00:${String(second).padStart(2, "0")}.000Z`) }; }
function readItems(workspace: string): { id: string; title: string; status: string; priority: string; source: { kind: string; workId: string } }[] {
	const path = join(workspace, ".codepatrol", "backlog", "items.yaml");
	if (!existsSync(path)) return [];
	return (parse(readFileSync(path, "utf8")) as { items: { id: string; title: string; status: string; priority: string; source: { kind: string; workId: string } }[] }).items;
}

describe("close integration: backlog feed", () => {
test("close writes non-filler recommendations as close-trace items with deterministic priority", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-close-backlog-"));
	try {
		writeFileSync(join(workspace, ".gitignore"), ".codepatrol/runtime/\n.codepatrol/docs/\n");
		git(workspace, ["init", "-b", "main"]); writeFileSync(join(workspace, "README.md"), "baseline\n"); git(workspace, ["add", "."]); git(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "baseline"]);
		const id = "2026-07-24-close-backlog";
		await advanceThroughVerify(workspace, id);
		for (let i = 0; i < 8; i++) trace.append(workspace, id, { kind: "command", at: `2026-07-22T10:00:0${i}.000Z`, command: "change transition", args: {} });
		await transitionChange(workspace, id, { type: "begin", actor: "trace-test", stage: "close", nextAction: "close" }, at(15));
		await transitionChange(workspace, id, { type: "usage", actor: "trace-test", stage: "close", run: { id: "close-usage", started_at: "2026-07-22T10:00:16Z", finished_at: "2026-07-22T10:00:17Z", elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, at(17));
		const result = await closeChange(workspace, id, { outcome: "commit", actor: "trace-test", authority: "test" }, at(20));
		assert.equal(result.outcome, "committed");
		const items = readItems(workspace);
		const invoked = items.find((entry) => entry.title.includes('invoked'));
		assert.ok(invoked, "expected an 'invoked N times' backlog item");
		assert.equal(invoked!.source.kind, "close-trace");
		assert.equal(invoked!.source.workId, id);
		assert.equal(invoked!.priority, "p3");
		assert.equal(invoked!.status, "candidate");
		const show = git(workspace, ["show", "--name-only", "--format=", result.terminalCommit]);
		assert.match(show, /\.codepatrol\/backlog\/items\.yaml/, "the backlog file must be part of the terminal commit so the change is genuinely git-tracked");
	} finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("close with only filler recommendations adds nothing", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-close-backlog-empty-"));
	try {
		writeFileSync(join(workspace, ".gitignore"), ".codepatrol/runtime/\n.codepatrol/docs/\n");
		git(workspace, ["init", "-b", "main"]); writeFileSync(join(workspace, "README.md"), "baseline\n"); git(workspace, ["add", "."]); git(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "baseline"]);
		const id = "2026-07-24-close-backlog-empty";
		await advanceThroughVerify(workspace, id);
		await transitionChange(workspace, id, { type: "begin", actor: "trace-test", stage: "close", nextAction: "close" }, at(15));
		await transitionChange(workspace, id, { type: "usage", actor: "trace-test", stage: "close", run: { id: "close-usage", started_at: "2026-07-22T10:00:16Z", finished_at: "2026-07-22T10:00:17Z", elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, at(17));
		const result = await closeChange(workspace, id, { outcome: "commit", actor: "trace-test", authority: "test" }, at(20));
		assert.equal(result.outcome, "committed");
		const items = readItems(workspace);
		assert.equal(items.length, 0);
		const show = git(workspace, ["show", "--name-only", "--format=", result.terminalCommit]);
		assert.doesNotMatch(show, /\.codepatrol\/backlog\/items\.yaml/, "no backlog file should be created or committed when there are no recommendations");
	} finally { rmSync(workspace, { recursive: true, force: true }); }
});
});
