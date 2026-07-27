import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as trace from "./trace.js";
import { CodepatrolError } from "../shared/errors.js";

describe("trace", () => {
	test("path returns the runtime traces path under the workspace", () => {
		const workspace = mkdtempSync(join(tmpdir(), "codepatrol-trace-"));
		try {
			const p = trace.path(workspace, "w1");
			assert.equal(p, `${realpathSync(workspace)}/.codepatrol/runtime/traces/w1.jsonl`);
		} finally { rmSync(workspace, { recursive: true, force: true }); }
	});

	test("open creates the file and parent directories; open is idempotent", () => {
		const workspace = mkdtempSync(join(tmpdir(), "codepatrol-trace-"));
		try {
			trace.open(workspace, "w1");
			assert.equal(existsSync(trace.path(workspace, "w1")), true);
			trace.open(workspace, "w1");
			assert.equal(existsSync(trace.path(workspace, "w1")), true);
			assert.equal(readFileSync(trace.path(workspace, "w1"), "utf8"), "");
		} finally { rmSync(workspace, { recursive: true, force: true }); }
	});

	test("append creates the file lazily on first append; close removes it", () => {
		const workspace = mkdtempSync(join(tmpdir(), "codepatrol-trace-"));
		try {
			trace.append(workspace, "w1", { kind: "command", at: "2026-07-24T00:00:00.000Z", command: "change start", args: {} });
			trace.append(workspace, "w1", { kind: "event", at: "2026-07-24T00:00:01.000Z", stage: "plan", attempt: 1, type: "stage-began" });
			const entries = trace.read(workspace, "w1");
			assert.equal(entries.length, 2);
			assert.equal(entries[0]?.kind, "command");
			assert.equal(entries[1]?.kind, "event");
			trace.close(workspace, "w1");
			assert.equal(existsSync(trace.path(workspace, "w1")), false);
		} finally { rmSync(workspace, { recursive: true, force: true }); }
	});

	test("read returns an empty array when the file is absent", () => {
		const workspace = mkdtempSync(join(tmpdir(), "codepatrol-trace-"));
		try {
			assert.deepEqual(trace.read(workspace, "missing"), []);
		} finally { rmSync(workspace, { recursive: true, force: true }); }
	});

	test("read skips malformed lines and keeps the rest", () => {
		const workspace = mkdtempSync(join(tmpdir(), "codepatrol-trace-"));
		try {
			trace.open(workspace, "w2");
			trace.append(workspace, "w2", { kind: "command", at: "2026-07-24T00:00:00.000Z", command: "x", args: {} });
			trace.appendRaw(workspace, "w2", "not-json-line");
			trace.append(workspace, "w2", { kind: "event", at: "2026-07-24T00:00:01.000Z", stage: "plan", attempt: 1, type: "stage-began" });
			const entries = trace.read(workspace, "w2");
			assert.equal(entries.length, 2);
		} finally { rmSync(workspace, { recursive: true, force: true }); }
	});

	test("close on a missing file is not an error", () => {
		const workspace = mkdtempSync(join(tmpdir(), "codepatrol-trace-"));
		try {
			trace.close(workspace, "never-opened");
		} finally { rmSync(workspace, { recursive: true, force: true }); }
	});

	test("path rejects a work id that escapes the traces directory but stays inside the workspace", () => {
		const workspace = mkdtempSync(join(tmpdir(), "codepatrol-trace-"));
		try {
			assert.throws(
				() => trace.path(workspace, "../../escape-marker"),
				(error: unknown) => error instanceof CodepatrolError && error.code === "INVALID_WORKSPACE",
			);
			assert.equal(existsSync(join(workspace, ".codepatrol", "escape-marker.jsonl")), false);
		} finally { rmSync(workspace, { recursive: true, force: true }); }
	});

	test("path rejects a work id that escapes the workspace entirely", () => {
		const workspace = mkdtempSync(join(tmpdir(), "codepatrol-trace-"));
		try {
			assert.throws(
				() => trace.path(workspace, "../../../../full-escape-marker"),
				(error: unknown) => error instanceof CodepatrolError && error.code === "INVALID_WORKSPACE",
			);
			assert.equal(existsSync(join(workspace, "..", "..", "..", "..", "full-escape-marker.jsonl")), false);
		} finally { rmSync(workspace, { recursive: true, force: true }); }
	});

	test("path rejects a work id that pivots through a symlink inside the traces directory", () => {
		const workspace = mkdtempSync(join(tmpdir(), "codepatrol-trace-"));
		try {
			mkdirSync(join(workspace, "elsewhere"));
			mkdirSync(join(workspace, ".codepatrol", "runtime", "traces"), { recursive: true });
			symlinkSync(join(workspace, "elsewhere"), join(workspace, ".codepatrol", "runtime", "traces", "link"));
			assert.throws(
				() => trace.path(workspace, "link/trace"),
				(error: unknown) => error instanceof CodepatrolError && error.code === "INVALID_WORKSPACE",
			);
			assert.deepEqual(readdirSync(join(workspace, "elsewhere")), []);
		} finally { rmSync(workspace, { recursive: true, force: true }); }
	});

	test("append and appendRaw are silent and write nothing for a containment-violating work id", () => {
		const workspace = mkdtempSync(join(tmpdir(), "codepatrol-trace-"));
		try {
			trace.append(workspace, "../../escape-marker", { kind: "command", at: "2026-07-27T00:00:00.000Z", command: "x", args: {} });
			trace.appendRaw(workspace, "../../escape-marker", "{}");
			assert.deepEqual(trace.read(workspace, "../../escape-marker"), []);
			const created = readdirSync(workspace, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
			assert.deepEqual(created.map((entry) => entry.name), []);
		} finally { rmSync(workspace, { recursive: true, force: true }); }
	});

	test("read returns an empty array for a containment-violating work id", () => {
		const workspace = mkdtempSync(join(tmpdir(), "codepatrol-trace-"));
		try {
			assert.deepEqual(trace.read(workspace, "../../escape-marker"), []);
		} finally { rmSync(workspace, { recursive: true, force: true }); }
	});

	test("legitimate slug-shaped work ids are unaffected", () => {
		const workspace = mkdtempSync(join(tmpdir(), "codepatrol-trace-"));
		try {
			const id = "2026-07-27-example-change";
			const p = trace.path(workspace, id);
			assert.equal(p, `${realpathSync(workspace)}/.codepatrol/runtime/traces/${id}.jsonl`);
			trace.append(workspace, id, { kind: "command", at: "2026-07-27T00:00:00.000Z", command: "change inspect", args: {} });
			trace.append(workspace, id, { kind: "event", at: "2026-07-27T00:00:01.000Z", stage: "plan", attempt: 1, type: "stage-began" });
			const entries = trace.read(workspace, id);
			assert.equal(entries.length, 2);
			assert.equal(entries[0]?.kind, "command");
			assert.equal(entries[1]?.kind, "event");
			trace.close(workspace, id);
			assert.equal(existsSync(p), false);
		} finally { rmSync(workspace, { recursive: true, force: true }); }
	});

	test("redact masks well-known secret fields and any Authorization header", () => {
		const redacted = trace.redact({
			provider: { name: "lmstudio", options: { baseURL: "http://x", apiKey: "sk-secret", headers: { Authorization: "Bearer xyz", "X-Other": "fine" } } },
			model: "should-stay",
			extra: { secret: "leaks", label: "fine" },
		}) as Record<string, unknown>;
		const provider = redacted.provider as { options: { apiKey: string; headers: Record<string, string> } };
		assert.equal(provider.options.apiKey, "[REDACTED]");
		assert.equal(provider.options.headers.Authorization, "[REDACTED]");
		assert.equal(provider.options.headers["X-Other"], "fine");
		assert.equal(redacted.model, "should-stay");
		assert.equal((redacted.extra as { secret: string }).secret, "[REDACTED]");
		assert.equal((redacted.extra as { label: string }).label, "fine");
	});
});
