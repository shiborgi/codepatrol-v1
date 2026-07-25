import test from "node:test";
import assert from "node:assert/strict";
import { projectKanban, renderKanbanMarkdown } from "./board.js";
import type { ChangeView } from "./types.js";
import type { BacklogItem } from "./backlog.js";

test("Kanban columns and ordering are deterministic", () => {
	const markdown = renderKanbanMarkdown({ generatedAsOf: null, rows: [] });
	assert.equal(markdown, "| Work | Branch | Backlog | Plan | Review | Apply | Verify | Close | Total |\n|---|---|---|---|---|---|---|---|---|\n");
});

test("Kanban is locale independent and reports partial token coverage", () => {
	const view: ChangeView = {
		identity: { work_id: "2026-07-22-b", title: "B", created_at: "2026-07-22T00:00:00Z", branch: "codepatrol/2026-07-22-b", target_branch: "main", base_commit: "a".repeat(40) },
		stage: "plan", attempt: 1, state: "active", nextAction: "codepatrol-plan 2026-07-22-b", revision: 1,
		attempts: {
			plan: [{ attempt: 1, status: "active", artifacts: [], runs: [{ id: "r", started_at: "2026-07-22T00:00:00Z", finished_at: "2026-07-22T00:00:01Z", elapsed_ms: 1000, characters: { status: "unavailable", reason: "no hook" } }] }],
			review: [], apply: [], verify: [], close: [],
		},
		usage: { activeMs: 1000, characters: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0, measuredRuns: 0, totalRuns: 1, coverage: "0/1", complete: false } },
	};
	const output = renderKanbanMarkdown(projectKanban([view]));
	assert.match(output, /0~c 0\/1/); assert.match(output, /codepatrol\/2026-07-22-b/);
	assert.match(output, /next: codepatrol-plan 2026-07-22-b/);
	assert.match(renderKanbanMarkdown(projectKanban([view], { asOf: "2026-07-22T00:01:00Z" })), /cycle 1m00s/);
});

const BASE_VIEW: ChangeView = {
	identity: { work_id: "2026-07-22-x", title: "X", created_at: "2026-07-22T00:00:00Z", branch: "codepatrol/2026-07-22-x", target_branch: "main", base_commit: "a".repeat(40) },
	stage: "plan", attempt: 1, state: "active", nextAction: "codepatrol-plan 2026-07-22-x", revision: 1,
	attempts: { plan: [], review: [], apply: [], verify: [], close: [] },
	usage: { activeMs: 0, characters: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0, measuredRuns: 0, totalRuns: 0, coverage: "0/0", complete: true } },
};

function item(over: Partial<BacklogItem>): BacklogItem {
	return {
		id: "x", title: "X", priority: "p2", area: "workflow", status: "candidate",
		evidence: [], source: { kind: "plan-followup", workId: "seed" }, workId: null, count: 1,
		firstSeenAt: "2026-07-22T00:00:00Z", lastSeenAt: "2026-07-22T00:00:00Z", ...over,
	};
}

test("projectKanban renders a backlog-only row when given a candidate with no workId", () => {
	const only = item({ id: "promote-me", workId: null });
	const board = projectKanban([], { backlogItems: [only] });
	assert.equal(board.rows.length, 1);
	assert.equal(board.rows[0]!.branch, "-");
	assert.equal(board.rows[0]!.backlog, "p2 · candidate");
	assert.equal(board.rows[0]!.plan, "-");
	assert.equal(board.rows[0]!.workId, "promote-me");
	const md = renderKanbanMarkdown(board);
	assert.match(md, /promote-me X/);
	assert.match(md, /p2 · candidate/);
});

test("projectKanban links a promoted backlog item into its Change row only (no duplicate)", () => {
	const promoted = item({ id: "linked", workId: "2026-07-22-x", priority: "p1", status: "scheduled" });
	const board = projectKanban([BASE_VIEW], { backlogItems: [promoted] });
	assert.equal(board.rows.length, 1);
	assert.equal(board.rows[0]!.workId, "2026-07-22-x");
	assert.equal(board.rows[0]!.backlog, "p1 · linked");
});

test("projectKanban mixes promoted and backlog-only correctly", () => {
	const promoted = item({ id: "linked", workId: "2026-07-22-x", priority: "p1" });
	const unlinked = item({ id: "queued", workId: null, priority: "p3" });
	const board = projectKanban([BASE_VIEW], { backlogItems: [promoted, unlinked] });
	assert.equal(board.rows.length, 2);
	assert.equal(board.rows[0]!.workId, "2026-07-22-x");
	assert.equal(board.rows[0]!.backlog, "p1 · linked");
	assert.equal(board.rows[1]!.workId, "queued");
	assert.equal(board.rows[1]!.backlog, "p3 · candidate");
});

test("projectKanban without backlogItems leaves the Backlog cell as -", () => {
	const board = projectKanban([BASE_VIEW]);
	assert.equal(board.rows[0]!.backlog, "-");
});

test("renderKanbanMarkdown header has Backlog as the first stage column", () => {
	const md = renderKanbanMarkdown({ generatedAsOf: null, rows: [] });
	assert.match(md, /\| Work \| Branch \| Backlog \|/);
});
