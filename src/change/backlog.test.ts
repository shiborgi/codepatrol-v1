import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { addWork, listWork, migrateLegacyBacklog, readWork, resolveWork, workPath, writeWork, type WorkItem } from "./backlog.js";
import type { ChangeView } from "./types.js";

function workspace(): string {
	const root = mkdtempSync(join(tmpdir(), "codepatrol-work-"));
	mkdirSync(join(root, ".codepatrol"), { recursive: true });
	return root;
}

function readYaml(root: string, workId: string): Record<string, unknown> {
	return parse(readFileSync(join(root, ".codepatrol/work", `${workId}.yaml`), "utf8")) as Record<string, unknown>;
}

const WORK: WorkItem = {
	workId: "2026-07-27-example-work",
	priority: "p1",
	description: "Example description",
	status: "open",
	createdAt: "2026-07-27T00:00:00.000Z",
	updatedAt: "2026-07-27T00:00:00.000Z",
};

function legacyItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: "example-legacy-item",
		title: "Legacy title",
		priority: "p2",
		area: "workflow",
		status: "candidate",
		evidence: [],
		source: { kind: "close-trace", workId: "2026-07-24-source" },
		workId: null,
		count: 1,
		firstSeenAt: "2026-07-25T10:00:00.000Z",
		lastSeenAt: "2026-07-25T11:00:00.000Z",
		...overrides,
	};
}

function writeLegacy(root: string, items: Record<string, unknown>[]): void {
	mkdirSync(join(root, ".codepatrol/backlog"), { recursive: true });
	writeFileSync(join(root, ".codepatrol/backlog/items.yaml"), stringify({ schema_version: 1, items }, { lineWidth: 0 }));
}

function changeView(workId: string, overrides: Record<string, unknown> = {}): ChangeView {
	return {
		identity: { work_id: workId, title: `Title for ${workId}`, created_at: "2026-07-26T00:00:00.000Z", branch: `codepatrol/${workId}`, target_branch: "main", base_commit: "0".repeat(40) },
		stage: "close",
		attempt: 1,
		state: "terminal",
		outcome: "committed",
		revision: 1,
		attempts: { plan: [], review: [], apply: [], verify: [], close: [] },
		usage: { activeMs: 0, characters: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0, measuredRuns: 0, totalRuns: 0, coverage: "0/0", complete: true } },
		...overrides,
	} as ChangeView;
}

test("workPath resolves the canonical per-work record and rejects unsafe ids", () => {
	const root = workspace();
	try {
		assert.ok(workPath(root, "2026-07-27-a").endsWith(".codepatrol/work/2026-07-27-a.yaml"));
		assert.throws(() => workPath(root, "../escape"), /work_id/);
		assert.throws(() => workPath(root, "2026-07-27-UPPER"), /work_id/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("writeWork and readWork round-trip one file per work with snake_case keys", () => {
	const root = workspace();
	try {
		writeWork(root, WORK);
		const raw = readYaml(root, WORK.workId);
		assert.equal(raw.schema_version, 1);
		assert.equal(raw.work_id, WORK.workId);
		assert.equal(raw.created_at, WORK.createdAt);
		assert.equal(raw.updated_at, WORK.updatedAt);
		assert.equal(raw.workId, undefined);
		assert.deepEqual(readWork(root, WORK.workId), WORK);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("readWork returns null when absent and rejects mismatched payload identity", () => {
	const root = workspace();
	try {
		assert.equal(readWork(root, "2026-07-27-missing"), null);
		mkdirSync(join(root, ".codepatrol/work"), { recursive: true });
		writeFileSync(join(root, ".codepatrol/work/2026-07-27-other-id.yaml"), stringify({ schema_version: 1, work_id: WORK.workId, priority: "p2", description: "x", status: "open", created_at: WORK.createdAt, updated_at: WORK.updatedAt }));
		assert.throws(() => readWork(root, "2026-07-27-other-id"), /does not match payload work_id/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("writeWork rejects invalid priority/status and malformed timestamps; reads reject unknown keys", () => {
	const root = workspace();
	try {
		assert.throws(() => writeWork(root, { ...WORK, priority: "p9" } as never), /priority/);
		assert.throws(() => writeWork(root, { ...WORK, status: "scheduled" } as never), /status/);
		assert.throws(() => writeWork(root, { ...WORK, createdAt: "not-a-date" }), /created_at/);
		assert.throws(() => writeWork(root, { ...WORK, issue: { number: 0, url: "x" } }), /issue/);
		mkdirSync(join(root, ".codepatrol/work"), { recursive: true });
		writeFileSync(join(root, ".codepatrol/work/2026-07-27-extra.yaml"), stringify({ schema_version: 1, work_id: "2026-07-27-extra", priority: "p2", description: "x", status: "open", created_at: WORK.createdAt, updated_at: WORK.updatedAt, mystery: true }));
		assert.throws(() => readWork(root, "2026-07-27-extra"), /unknown field/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("addWork creates an open work; identical re-add is idempotent; conflict fails", async () => {
	const root = workspace();
	try {
		const created = await addWork(root, { workId: "2026-07-27-add", priority: "p0", description: "First line\n\nDetails" });
		assert.equal(created.status, "open");
		assert.equal(created.priority, "p0");
		const again = await addWork(root, { workId: "2026-07-27-add", priority: "p0", description: "First line\n\nDetails" });
		assert.deepEqual(again, created);
		await assert.rejects(addWork(root, { workId: "2026-07-27-add", priority: "p2", description: "Different" }), /CHANGE_CONFLICT/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("addWork rejects terminal work and invalid input", async () => {
	const root = workspace();
	try {
		await addWork(root, { workId: "2026-07-27-term", priority: "p2", description: "x" });
		await resolveWork(root, "2026-07-27-term", "done");
		await assert.rejects(addWork(root, { workId: "2026-07-27-term", priority: "p2", description: "x" }), /CHANGE_CONFLICT/);
		await assert.rejects(addWork(root, { workId: "bad id", priority: "p2", description: "x" }), /work_id/);
		await assert.rejects(addWork(root, { workId: "2026-07-27-ok", priority: "p9" as never, description: "x" }), /priority/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("resolveWork marks done or dismissed and rejects missing or terminal work", async () => {
	const root = workspace();
	try {
		await addWork(root, { workId: "2026-07-27-resolve", priority: "p2", description: "x" });
		const resolved = await resolveWork(root, "2026-07-27-resolve", "dismissed");
		assert.equal(resolved.status, "dismissed");
		assert.ok(resolved.updatedAt >= resolved.createdAt);
		await assert.rejects(resolveWork(root, "2026-07-27-resolve", "done"), /CHANGE_CONFLICT/);
		await assert.rejects(resolveWork(root, "2026-07-27-absent", "done"), /CHANGE_INVALID/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("listWork sorts by priority, creation time then work id and filters by status", async () => {
	const root = workspace();
	try {
		writeWork(root, { ...WORK, workId: "2026-07-27-b", priority: "p3", createdAt: "2026-07-27T02:00:00.000Z" });
		writeWork(root, { ...WORK, workId: "2026-07-27-a", priority: "p1", createdAt: "2026-07-27T01:00:00.000Z" });
		writeWork(root, { ...WORK, workId: "2026-07-27-c", priority: "p1", createdAt: "2026-07-27T00:00:00.000Z" });
		writeWork(root, { ...WORK, workId: "2026-07-27-d", priority: "p0", status: "done" });
		assert.deepEqual(listWork(root).map((work) => work.workId), ["2026-07-27-d", "2026-07-27-c", "2026-07-27-a", "2026-07-27-b"]);
		assert.deepEqual(listWork(root, { status: "open" }).map((work) => work.workId), ["2026-07-27-c", "2026-07-27-a", "2026-07-27-b"]);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("reads fail with MIGRATION_REQUIRED while the legacy backlog file exists", async () => {
	const root = workspace();
	try {
		writeLegacy(root, [legacyItem()]);
		assert.throws(() => readWork(root, "2026-07-27-a"), /MIGRATION_REQUIRED/);
		assert.throws(() => listWork(root), /MIGRATION_REQUIRED/);
		await assert.rejects(addWork(root, { workId: "2026-07-27-a", priority: "p2", description: "x" }), /MIGRATION_REQUIRED/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("migration reuses a valid legacy workId and preserves issue metadata and description parts", async () => {
	const root = workspace();
	try {
		writeLegacy(root, [legacyItem({
			id: "linked-item",
			workId: "2026-07-26-linked-change",
			status: "done",
			priority: "p1",
			area: "architecture",
			evidence: ["src/x.ts:1"],
			externalRef: { provider: "github", number: 4, url: "https://github.com/x/y/issues/4" },
			count: 3,
		})]);
		const result = await migrateLegacyBacklog(root, []);
		assert.deepEqual(result.created, [".codepatrol/work/2026-07-26-linked-change.yaml"]);
		assert.equal(result.removedLegacy, true);
		assert.equal(existsSync(join(root, ".codepatrol/backlog/items.yaml")), false);
		const work = readWork(root, "2026-07-26-linked-change")!;
		assert.equal(work.status, "done");
		assert.equal(work.priority, "p1");
		assert.deepEqual(work.issue, { number: 4, url: "https://github.com/x/y/issues/4" });
		assert.match(work.description, /Legacy title/);
		assert.match(work.description, /architecture/);
		assert.match(work.description, /src\/x\.ts:1/);
		assert.match(work.description, /close-trace/);
		assert.match(work.description, /linked-item/);
		assert.equal(work.createdAt, "2026-07-25T10:00:00.000Z");
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("migration derives a dated id from an unlinked item and maps candidate to open", async () => {
	const root = workspace();
	try {
		writeLegacy(root, [legacyItem({ id: "unsafe-duplicate-yaml-reader", status: "candidate" })]);
		const result = await migrateLegacyBacklog(root, []);
		assert.deepEqual(result.created, [".codepatrol/work/2026-07-25-unsafe-duplicate-yaml-reader.yaml"]);
		const work = readWork(root, "2026-07-25-unsafe-duplicate-yaml-reader")!;
		assert.equal(work.status, "open");
		assert.equal(work.priority, "p2");
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("migration caps long ids at 96 characters with a deterministic hash suffix", async () => {
	const root = workspace();
	try {
		const longId = "x".repeat(140);
		writeLegacy(root, [legacyItem({ id: longId })]);
		const result = await migrateLegacyBacklog(root, []);
		assert.equal(result.created.length, 1);
		const workId = result.created[0]!.slice(".codepatrol/work/".length, -".yaml".length);
		assert.ok(workId.length <= 96, `expected <= 96 chars, got ${workId.length}`);
		assert.match(workId, /^2026-07-25-x+-[0-9a-f]{8}$/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("migration creates a p2 bootstrap Work for a Change with no legacy item and lets the Change outcome win", async () => {
	const root = workspace();
	try {
		writeLegacy(root, [legacyItem({ workId: "2026-07-26-linked-change", status: "candidate" })]);
		const changes = [changeView("2026-07-26-linked-change"), changeView("2026-07-27-unify-issue-change-kanban", { state: "active", outcome: undefined, stage: "apply" })];
		const result = await migrateLegacyBacklog(root, changes);
		assert.equal(result.created.length, 2);
		const linked = readWork(root, "2026-07-26-linked-change")!;
		assert.equal(linked.status, "done");
		const bootstrap = readWork(root, "2026-07-27-unify-issue-change-kanban")!;
		assert.equal(bootstrap.priority, "p2");
		assert.equal(bootstrap.status, "open");
		assert.match(bootstrap.description, /Title for 2026-07-27-unify-issue-change-kanban/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("migration dry-run performs zero writes and keeps the legacy file", async () => {
	const root = workspace();
	try {
		writeLegacy(root, [legacyItem()]);
		const result = await migrateLegacyBacklog(root, [], { dryRun: true });
		assert.equal(result.dryRun, true);
		assert.equal(result.removedLegacy, false);
		assert.equal(result.created.length, 1);
		assert.equal(existsSync(join(root, ".codepatrol/work")), false);
		assert.equal(existsSync(join(root, ".codepatrol/backlog/items.yaml")), true);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("migration retry accepts byte-identical output and fails closed on conflict", async () => {
	const root = workspace();
	try {
		writeLegacy(root, [legacyItem()]);
		const first = await migrateLegacyBacklog(root, []);
		assert.equal(first.created.length, 1);
		const second = await migrateLegacyBacklog(root, []);
		assert.deepEqual(second, { created: [], removedLegacy: false, dryRun: false });

		const root2 = workspace();
		try {
			writeLegacy(root2, [legacyItem()]);
			mkdirSync(join(root2, ".codepatrol/work"), { recursive: true });
			writeFileSync(join(root2, ".codepatrol/work/2026-07-25-example-legacy-item.yaml"), "schema_version: 1\nwork_id: 2026-07-25-example-legacy-item\npriority: p9\n");
			await assert.rejects(migrateLegacyBacklog(root2, []), /CHANGE_CONFLICT/);
			assert.equal(existsSync(join(root2, ".codepatrol/backlog/items.yaml")), true);
		} finally { rmSync(root2, { recursive: true, force: true }); }
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("migration rejects a generated id collision before any write", async () => {
	const root = workspace();
	try {
		writeLegacy(root, [legacyItem({ id: "same-legacy-id" }), legacyItem({ id: "same-legacy-id", title: "Duplicate identity" }), legacyItem({ id: "same-legacy-id", title: "Third duplicate identity" })]);
		await assert.rejects(migrateLegacyBacklog(root, []), /CHANGE_CONFLICT/);
		assert.equal(existsSync(join(root, ".codepatrol/backlog/items.yaml")), true);
		assert.equal(existsSync(join(root, ".codepatrol/work")), false);
	} finally { rmSync(root, { recursive: true, force: true }); }
});
