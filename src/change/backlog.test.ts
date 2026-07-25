import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify } from "yaml";
import { classifyPriority, dedupKey, findBacklogItem, linkBacklogItem, listBacklog, readBacklog, upsertBacklogItem } from "./backlog.js";

function workspace(): string {
	const root = mkdtempSync(join(tmpdir(), "codepatrol-backlog-"));
	mkdirSync(join(root, ".codepatrol"), { recursive: true });
	return root;
}

const SOURCE = { kind: "close-trace" as const, workId: "2026-07-24-example" };

test("dedupKey collapses digit-variation and non-alphanumeric runs", () => {
	assert.equal(dedupKey("Command \"x\" invoked 13 times"), dedupKey("Command \"x\" invoked 47 times"));
	assert.equal(dedupKey("Top error code: CHANGE_INVALID (3)"), "top-error-code-change-invalid");
	assert.equal(dedupKey("  --foo--bar--  "), "foo-bar");
});

test("classifyPriority maps heuristics deterministically", () => {
	assert.equal(classifyPriority("Top error code: CHANGE_INVALID (2)"), "p1");
	assert.equal(classifyPriority("No orchestrator events recorded."), "p1");
	assert.equal(classifyPriority("Plan stage returned at least once — review the spec."), "p2");
	assert.equal(classifyPriority("Command \"change.transition\" was invoked 13 times — consider caching."), "p3");
	assert.equal(classifyPriority("Review stage returned 2+ times — surface the top review defects."), "p2");
	assert.equal(classifyPriority("Some other recommendation."), "p3");
});

test("upsertBacklogItem creates a candidate on empty backlog", () => {
	const root = workspace();
	try {
		const item = upsertBacklogItem(root, { title: "No orchestrator events recorded.", area: "workflow", evidence: [], source: SOURCE });
		assert.equal(item.status, "candidate");
		assert.equal(item.count, 1);
		assert.equal(item.workId, null);
		assert.equal(item.source.kind, "close-trace");
		const list = listBacklog(root);
		assert.equal(list.length, 1);
		assert.equal(list[0]?.id, item.id);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("a second upsert with the same dedupKey bumps count and keeps the higher priority", () => {
	const root = workspace();
	try {
		const first = upsertBacklogItem(root, { title: "Command \"x\" invoked 13 times", area: "workflow", evidence: [], source: SOURCE });
		const before = readBacklog(root).items[0]!;
		const second = upsertBacklogItem(root, { title: "Command \"x\" invoked 47 times", area: "workflow", priority: "p1", evidence: [], source: { kind: "plan-followup", workId: SOURCE.workId } });
		assert.equal(second.count, 2);
		assert.equal(second.priority, "p1");
		assert.equal(second.id, first.id);
		const after = readBacklog(root).items[0]!;
		assert.equal(after.title, before.title);
		assert.deepEqual(after.evidence, before.evidence);
		assert.equal(after.count, 2);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("a done item is not resurrected to candidate on bump", () => {
	const root = workspace();
	try {
		const before = upsertBacklogItem(root, { title: "X", area: "workflow", evidence: [], source: SOURCE });
		const id = readBacklog(root).items[0]!.id;
		const items = readBacklog(root).items;
		items[0]!.status = "done";
		writeFileSync(join(root, ".codepatrol/backlog/items.yaml"), stringify({ schema_version: 1, items }, { lineWidth: 0 }));
		const next = upsertBacklogItem(root, { title: "X", area: "workflow", evidence: [], source: SOURCE });
		assert.equal(next.status, "done");
		assert.equal(next.count, 2);
		assert.equal(next.firstSeenAt, before.firstSeenAt);
		assert.equal(next.title, before.title);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("linkBacklogItem sets workId and status, throws on missing or dismissed", () => {
	const root = workspace();
	try {
		const created = upsertBacklogItem(root, { title: "Y", area: "workflow", evidence: [], source: SOURCE });
		const linked = linkBacklogItem(root, created.id, "2026-07-24-linked");
		assert.equal(linked.workId, "2026-07-24-linked");
		assert.equal(linked.status, "scheduled");
		assert.throws(() => linkBacklogItem(root, "does-not-exist", "2026-07-24-other"), /CHANGE_INVALID/);
		const items = readBacklog(root).items;
		items[0]!.status = "dismissed";
		writeFileSync(join(root, ".codepatrol/backlog/items.yaml"), stringify({ schema_version: 1, items }, { lineWidth: 0 }));
		assert.throws(() => linkBacklogItem(root, created.id, "2026-07-24-other"), /CHANGE_CONFLICT/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("listBacklog filters by status and open, sorts priority then count", () => {
	const root = workspace();
	try {
		upsertBacklogItem(root, { title: "Command \"x\" invoked 13 times", area: "workflow", evidence: [], source: SOURCE });
		upsertBacklogItem(root, { title: "Top error code: CHANGE_INVALID", area: "architecture", priority: "p1", evidence: [], source: SOURCE });
		upsertBacklogItem(root, { title: "Plan stage returned", area: "workflow", priority: "p2", evidence: [], source: SOURCE });
		const all = listBacklog(root);
		assert.equal(all.length, 3);
		assert.equal(all[0]?.priority, "p1");
		assert.equal(all[1]?.priority, "p2");
		assert.equal(all[2]?.priority, "p3");
		const candidateOnly = listBacklog(root, { status: "candidate" });
		assert.equal(candidateOnly.length, 3);
		const items = readBacklog(root).items;
		items[0]!.status = "dismissed";
		writeFileSync(join(root, ".codepatrol/backlog/items.yaml"), stringify({ schema_version: 1, items }, { lineWidth: 0 }));
		const open = listBacklog(root, { open: true });
		assert.equal(open.length, 2);
		assert.ok(open.every((entry) => entry.status === "candidate" || entry.status === "scheduled"));
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("findBacklogItem returns null when absent", () => {
	const root = workspace();
	try {
		assert.equal(findBacklogItem(root, "missing"), null);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("readBacklog rejects malformed yaml (unknown top-level key)", () => {
	const root = workspace();
	try {
		mkdirSync(join(root, ".codepatrol/backlog"), { recursive: true });
		writeFileSync(join(root, ".codepatrol/backlog/items.yaml"), stringify({ schema_version: 1, items: [], mystery: true }, { lineWidth: 0 }));
		assert.throws(() => readBacklog(root), /CHANGE_INVALID/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});
