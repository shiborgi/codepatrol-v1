import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
	function tmpWorkspaceWithout() {
		return mkdtempSync(join(tmpdir(), "codepatrol-config-"));
	}

	function wsWith(config: any) {
		const ws = tmpWorkspaceWithout();
		mkdirSync(join(ws, ".codepatrol"), { recursive: true });
		writeFileSync(join(ws, ".codepatrol/config.json"), JSON.stringify(config));
		return ws;
	}

	test("absent config returns empty object", () => {
		const ws = tmpWorkspaceWithout();
		try {
			assert.deepEqual(loadConfig(ws), {});
		} finally {
			rmSync(ws, { recursive: true, force: true });
		}
	});

	test("valid applyGate is parsed", () => {
		const ws = wsWith({ applyGate: { command: ["npm", "run", "verify"], timeoutMs: 1000 } });
		try {
			assert.deepEqual(loadConfig(ws).applyGate, { command: ["npm", "run", "verify"], timeoutMs: 1000 });
		} finally {
			rmSync(ws, { recursive: true, force: true });
		}
	});

	test("empty command array is rejected", () => {
		const ws = wsWith({ applyGate: { command: [] } });
		try {
			assert.throws(() => loadConfig(ws), (e: any) => e.code === "CHANGE_INVALID");
		} finally {
			rmSync(ws, { recursive: true, force: true });
		}
	});

	test("unknown key is rejected", () => {
		const ws = wsWith({ applyGate: { command: ["x"] }, bogus: 1 });
		try {
			assert.throws(() => loadConfig(ws), (e: any) => e.code === "CHANGE_INVALID");
		} finally {
			rmSync(ws, { recursive: true, force: true });
		}
	});

	test("non-positive timeoutMs is rejected", () => {
		const ws = wsWith({ applyGate: { command: ["x"], timeoutMs: 0 } });
		try {
			assert.throws(() => loadConfig(ws), (e: any) => e.code === "CHANGE_INVALID");
		} finally {
			rmSync(ws, { recursive: true, force: true });
		}
	});
});