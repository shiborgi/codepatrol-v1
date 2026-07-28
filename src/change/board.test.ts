import test from "node:test";
import assert from "node:assert/strict";
import { projectKanban, renderKanbanMarkdown } from "./board.js";
import type { ChangeView } from "./types.js";
import type { WorkItem } from "./backlog.js";

const AT = "2026-07-22T00:00:00Z";

function work(over: Partial<WorkItem> = {}): WorkItem {
	return { workId: "2026-07-22-x", priority: "p2", description: "First line\n\nDetails", status: "open", createdAt: AT, updatedAt: AT, ...over };
}

function view(over: Partial<ChangeView> = {}): ChangeView {
	return {
		identity: { work_id: "2026-07-22-x", title: "X", created_at: AT, branch: "codepatrol/2026-07-22-x", target_branch: "main", base_commit: "a".repeat(40) },
		stage: "plan", attempt: 1, state: "active", nextAction: "codepatrol-plan 2026-07-22-x", revision: 1,
		attempts: { plan: [], review: [], apply: [], verify: [], close: [] },
		usage: { activeMs: 0, characters: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0, measuredRuns: 0, totalRuns: 0, coverage: "0/0", complete: true } },
		...over,
	} as ChangeView;
}

test("the Markdown header is exactly the six unified columns", () => {
	const markdown = renderKanbanMarkdown({ generatedAsOf: null, rows: [] });
	assert.equal(markdown, "| Backlog | Plan | Review | Apply | Verify | Close |\n|---|---|---|---|---|---|\n");
	assert.doesNotMatch(markdown, /Work \| Branch|Total/);
});

test("a stage cell is exactly harness, latest attempt, active time and token coverage", () => {
	const v = view({
		attempts: {
			plan: [{ attempt: 1, status: "active", artifacts: [], harness: "opencode", runs: [{ id: "r", started_at: AT, finished_at: "2026-07-22T00:00:39Z", elapsed_ms: 39000, characters: { status: "measured", source: "harness", input: 800, output: 12, total: 812 } }] }],
			review: [], apply: [], verify: [], close: [],
		},
	});
	const board = projectKanban([work()], [v]);
	assert.equal(board.rows[0]!.plan, "opencode | #1 | 39s | 812tok 1/1");
	assert.equal(board.rows[0]!.review, "");
});

test("a stage cell without a harness renders - and partial token coverage uses ~", () => {
	const v = view({
		attempts: {
			plan: [{ attempt: 2, status: "active", artifacts: [], runs: [{ id: "r", started_at: AT, finished_at: "2026-07-22T00:00:01Z", elapsed_ms: 1000, characters: { status: "unavailable", reason: "no hook" } }] }],
			review: [], apply: [], verify: [], close: [],
		},
	});
	const board = projectKanban([work()], [v]);
	assert.equal(board.rows[0]!.plan, "- | #2 | 1s | 0~tok 0/1");
});

test("an open Work with no Change renders a Backlog-only row", () => {
	const board = projectKanban([work({ workId: "2026-07-22-queued", priority: "p3" })], []);
	assert.equal(board.rows.length, 1);
	assert.equal(board.rows[0]!.backlog, "[p3] 2026-07-22-queued — First line");
	assert.equal(board.rows[0]!.plan, "");
	assert.equal(board.rows[0]!.close, "");
});

test("a Work and its Change join into exactly one row", () => {
	const board = projectKanban([work({ priority: "p1" })], [view()]);
	assert.equal(board.rows.length, 1);
	assert.equal(board.rows[0]!.workId, "2026-07-22-x");
	assert.match(board.rows[0]!.backlog, /^\[p1\] 2026-07-22-x — First line$/);
});

test("rows sort by priority, creation time then work id", () => {
	const board = projectKanban([
		work({ workId: "2026-07-22-b", priority: "p3", createdAt: "2026-07-22T02:00:00Z" }),
		work({ workId: "2026-07-22-a", priority: "p1", createdAt: "2026-07-22T01:00:00Z" }),
		work({ workId: "2026-07-22-c", priority: "p1", createdAt: "2026-07-22T00:00:00Z" }),
	], []);
	assert.deepEqual(board.rows.map((row) => row.workId), ["2026-07-22-c", "2026-07-22-a", "2026-07-22-b"]);
});

test("terminal Changes and non-open Work are hidden by default and shown with --all", () => {
	const terminal = view({ state: "terminal", outcome: "committed", stage: "close" });
	const done = work({ workId: "2026-07-22-x", status: "done" });
	const dismissed = work({ workId: "2026-07-22-gone", status: "dismissed" });
	const hidden = projectKanban([done, dismissed], [terminal]);
	assert.equal(hidden.rows.length, 0);
	const shown = projectKanban([done, dismissed], [terminal], { all: true });
	assert.equal(shown.rows.length, 2);
});

test("a historical Change without Work renders a fallback row", () => {
	const board = projectKanban([], [view({ workId: undefined } as never)]);
	assert.equal(board.rows.length, 1);
	assert.equal(board.rows[0]!.backlog, "[--] 2026-07-22-x");
	assert.equal(board.rows[0]!.priority, null);
});

test("the table contains no branch, total or next-action prose", () => {
	const v = view({
		attempts: {
			plan: [{ attempt: 1, status: "active", artifacts: [], harness: "codex", runs: [{ id: "r", started_at: AT, finished_at: "2026-07-22T00:00:01Z", elapsed_ms: 1000, characters: { status: "unavailable", reason: "no hook" } }] }],
			review: [], apply: [], verify: [], close: [],
		},
	});
	const md = renderKanbanMarkdown(projectKanban([work()], [v]));
	assert.doesNotMatch(md, /codepatrol\/2026-07-22-x/);
	assert.doesNotMatch(md, /next:/);
	assert.doesNotMatch(md, /Total/);
	const rowLines = md.trim().split("\n").slice(2);
	for (const line of rowLines) assert.equal(line.split(/(?<!\\)\|/).length - 2, 6, `row must have exactly six cells: ${line}`);
});

test("long descriptions are escaped and truncated to one line", () => {
	const long = `${"x".repeat(120)} | tail`;
	const board = projectKanban([work({ description: long })], []);
	const cell = board.rows[0]!.backlog;
	assert.ok(cell.includes("…"));
	const md = renderKanbanMarkdown(board);
	const rowLine = md.trim().split("\n").at(-1)!;
	assert.equal(rowLine.split(/(?<!\\)\|/).length - 2, 6);
});
