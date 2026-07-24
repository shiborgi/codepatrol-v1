import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { defaultGateRunner } from "./apply-gate.js";

describe("defaultGateRunner", () => {
	test("non-zero child exit resolves with exitCode !== 0 and captured output", async () => {
		const r = await defaultGateRunner({ command: ["node", "-e", "process.stderr.write('boom');process.exit(3)"] }, process.cwd());
		assert.equal(r.exitCode, 3);
		assert.match(r.output, /boom/);
		assert.equal(typeof r.elapsedMs, "number");
	});
	test("zero exit resolves exitCode 0", async () => {
		const r = await defaultGateRunner({ command: ["node", "-e", "process.exit(0)"] }, process.cwd());
		assert.equal(r.exitCode, 0);
	});
});
