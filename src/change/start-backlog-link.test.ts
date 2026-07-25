import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startChange } from "./orchestrator.js";
import { readBacklog, upsertBacklogItem, writeBacklog } from "./backlog.js";

function git(workspace: string, args: string[]): string { return execFileSync("git", args, { cwd: workspace, encoding: "utf8" }).trim(); }
function initRepo(workspace: string): void {
	writeFileSync(join(workspace, ".gitignore"), ".codepatrol/runtime/\n.codepatrol/backlog/\n");
	git(workspace, ["init", "-b", "main"]);
	writeFileSync(join(workspace, "README.md"), "baseline\n");
	git(workspace, ["add", "."]);
	git(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "baseline"]);
}

test("change start with valid backlogItemId links and schedules the item", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-start-link-"));
	try {
		initRepo(workspace);
		upsertBacklogItem(workspace, { title: "Test item", area: "workflow", evidence: [], source: { kind: "plan-followup", workId: "seed" } });
		const id = readBacklog(workspace).items[0]!.id;
		const result = await startChange(workspace, { workId: "2026-07-24-start-link-ok", title: "Link", targetBranch: "main", actor: "test", backlogItemId: id });
		assert.equal(result.identity.work_id, "2026-07-24-start-link-ok");
		const linked = readBacklog(workspace).items.find((entry) => entry.id === id);
		assert.equal(linked?.workId, "2026-07-24-start-link-ok");
		assert.equal(linked?.status, "scheduled");
	} finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("change start with missing backlogItemId fails before branch creation", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-start-link-missing-"));
	try {
		initRepo(workspace);
		await assert.rejects(startChange(workspace, { workId: "2026-07-24-start-link-missing", title: "Missing", targetBranch: "main", actor: "test", backlogItemId: "does-not-exist" }), /INVALID_ARGUMENT/);
		assert.throws(() => git(workspace, ["rev-parse", "--verify", "codepatrol/2026-07-24-start-link-missing"]), /Needed a single revision/);
	} finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("change start with dismissed backlogItemId fails before branch creation", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-start-link-dismissed-"));
	try {
		initRepo(workspace);
		upsertBacklogItem(workspace, { title: "Dismissed", area: "workflow", evidence: [], source: { kind: "plan-followup", workId: "seed" } });
		const id = readBacklog(workspace).items[0]!.id;
		const items = readBacklog(workspace).items;
		items[0]!.status = "dismissed";
		writeBacklog(workspace, { schema_version: 1, items });
		await assert.rejects(startChange(workspace, { workId: "2026-07-24-start-link-dismissed", title: "Dismissed", targetBranch: "main", actor: "test", backlogItemId: id }), /CHANGE_CONFLICT/);
		assert.throws(() => git(workspace, ["rev-parse", "--verify", "codepatrol/2026-07-24-start-link-dismissed"]), /Needed a single revision/);
	} finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("change start without backlogItemId is unchanged", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "codepatrol-start-no-link-"));
	try {
		initRepo(workspace);
		const result = await startChange(workspace, { workId: "2026-07-24-no-link", title: "No Link", targetBranch: "main", actor: "test" });
		assert.equal(result.identity.work_id, "2026-07-24-no-link");
	} finally { rmSync(workspace, { recursive: true, force: true }); }
});
