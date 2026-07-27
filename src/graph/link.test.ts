import { test } from "node:test";
import assert from "node:assert/strict";
import { link } from "./link.js";
import { impact } from "./analysis.js";
import { GRAPH_EXTRACTION_REVISION, fileId, symbolId, type GraphDocument } from "./model.js";

function fixture(): GraphDocument {
	return {
		version: 1,
		extractionRevision: GRAPH_EXTRACTION_REVISION,
		builtAt: new Date().toISOString(),
		files: {
			"src/target.ts": {
				hash: "h-target",
				language: "typescript",
				lineCount: 2,
				symbols: [{ name: "target", kind: "function", line: 1, endLine: 2, exported: true }],
				imports: [],
				calls: [],
				inherits: [],
			},
			"src/direct.test.ts": {
				hash: "h-direct",
				language: "typescript",
				lineCount: 4,
				symbols: [{ name: "runDirect", kind: "function", line: 2, endLine: 4, exported: false }],
				imports: [{ specifier: "./target", line: 1 }],
				calls: [{ callerIndex: 0, callee: "target", line: 3 }],
				inherits: [],
			},
			"src/unbound.test.ts": {
				hash: "h-unbound",
				language: "typescript",
				lineCount: 3,
				symbols: [{ name: "runUnbound", kind: "function", line: 1, endLine: 3, exported: false }],
				imports: [],
				calls: [{ callerIndex: 0, callee: "target", line: 2 }],
				inherits: [],
			},
		},
	};
}

test("linker: import-backed call keeps inferred confidence while the unbound global-name call is ambiguous", () => {
	const snapshot = link(fixture());

	const direct = snapshot.symbolsByName("runDirect")[0];
	const directCalls = snapshot.outEdges(direct.id, ["calls"]);
	assert.equal(directCalls.length, 1);
	assert.equal(directCalls[0].to, symbolId("src/target.ts", "target", 1));
	assert.notEqual(directCalls[0].confidence, "ambiguous");
	assert.equal(directCalls[0].confidence, "inferred");

	const unbound = snapshot.symbolsByName("runUnbound")[0];
	const unboundCalls = snapshot.outEdges(unbound.id, ["calls"]);
	assert.equal(unboundCalls.length, 1);
	assert.equal(unboundCalls[0].to, symbolId("src/target.ts", "target", 1));
	assert.equal(unboundCalls[0].confidence, "ambiguous", "a repository-wide name guess is never promoted past ambiguous");
});

test("linker: tests edges derive only from resolved imports, never from call edges", () => {
	const snapshot = link(fixture());

	const directTests = snapshot.outEdges(fileId("src/direct.test.ts"), ["tests"]);
	assert.deepEqual(directTests.map((edge) => edge.to), [fileId("src/target.ts")]);
	assert.equal(directTests[0].confidence, "extracted");

	assert.deepEqual(snapshot.outEdges(fileId("src/unbound.test.ts"), ["tests"]), [], "an unbound same-name call is not module-dependency evidence");

	const testers = snapshot.inEdges(fileId("src/target.ts"), ["tests"]).map((edge) => edge.from);
	assert.deepEqual(testers, [fileId("src/direct.test.ts")]);
});

test("impact: an ambiguous-only caller is excluded by default, surfaced as possible, included on opt-in", () => {
	const snapshot = link(fixture());
	const seed = symbolId("src/target.ts", "target", 1);

	const conservative = impact(snapshot, { symbols: [seed] });
	assert.equal(conservative.affectedFiles.has("src/unbound.test.ts"), false, "default impact must not treat a name guess as certain");
	assert.ok(conservative.possiblyAffected.includes("src/unbound.test.ts"));
	assert.ok(conservative.affectedFiles.has("src/direct.test.ts"));

	const optedIn = impact(snapshot, { symbols: [seed] }, { includeAmbiguous: true });
	assert.ok(optedIn.affectedFiles.has("src/unbound.test.ts"));
});
