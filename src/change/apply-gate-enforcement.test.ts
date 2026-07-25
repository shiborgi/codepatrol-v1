import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { parse } from "yaml";
import { join } from "node:path";
import { startChange, transitionChange, inspectChanges } from "./orchestrator.js";
import { NodeGitAdapter } from "./git.js";
import { CodepatrolError } from "../shared/errors.js";

function gitCommand(workspace: string, args: string[]): string { return execFileSync("git", args, { cwd: workspace, encoding: "utf8" }).trim(); }
function binding(workspace: string, path: string) { return { path, sha256: createHash("sha256").update(readFileSync(join(workspace, path))).digest("hex"), intent: "create" as const }; }
function at(second: number) { return { now: new Date(`2026-07-24T10:00:${String(second).padStart(2, "0")}.000Z`) }; }
function writeGitignore(workspace: string): void { writeFileSync(join(workspace, ".gitignore"), ".codepatrol/runtime/\n.codepatrol/docs/\n"); }
function initRepo(workspace: string): void { writeGitignore(workspace); gitCommand(workspace, ["init", "-b", "main"]); writeFileSync(join(workspace, "README.md"), "baseline\n"); gitCommand(workspace, ["add", "."]); gitCommand(workspace, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "baseline"]); }
function writeConfig(workspace: string, config: any) { mkdirSync(join(workspace, ".codepatrol"), { recursive: true }); writeFileSync(join(workspace, ".codepatrol/config.json"), JSON.stringify(config)); }

describe("apply gate enforcement", () => {
	test("enforces gate correctly at apply checkpoint", async () => {
		const workspace = mkdtempSync(join(tmpdir(), "codepatrol-gate-"));
		try {
			initRepo(workspace);
			const git = new NodeGitAdapter(workspace);
			const id = "2026-07-24-gate-test";
			await startChange(workspace, { workId: id, title: "Gate test", targetBranch: "main", actor: "codex" }, at(1));
			
			// Setup Plan -> Review -> Apply
			mkdirSync(join(workspace, `.codepatrol/changes/${id}/plan`), { recursive: true });
			writeFileSync(join(workspace, `.codepatrol/changes/${id}/plan/spec.md`), "spec\n");
			writeFileSync(join(workspace, `.codepatrol/changes/${id}/plan/plan.md`), "plan\n");
			await transitionChange(workspace, id, { type: "usage", actor: "test", stage: "plan", run: { id: "p1", started_at: at(2).now.toISOString(), finished_at: at(3).now.toISOString(), elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, at(4));
			await transitionChange(workspace, id, { type: "checkpoint", actor: "test", stage: "plan", result: "ready", nextAction: "next", artifacts: [binding(workspace, `.codepatrol/changes/${id}/plan/spec.md`), binding(workspace, `.codepatrol/changes/${id}/plan/plan.md`)] }, at(5));
			
			await transitionChange(workspace, id, { type: "begin", actor: "test", stage: "review", nextAction: "next" }, at(6));
			await transitionChange(workspace, id, { type: "usage", actor: "test", stage: "review", run: { id: "r1", started_at: at(7).now.toISOString(), finished_at: at(8).now.toISOString(), elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, at(9));
			mkdirSync(join(workspace, `.codepatrol/changes/${id}/review`), { recursive: true });
			writeFileSync(join(workspace, `.codepatrol/changes/${id}/review/report.md`), "report\n");
			await transitionChange(workspace, id, { type: "checkpoint", actor: "test", stage: "review", result: "approve", nextAction: "next", artifacts: [binding(workspace, `.codepatrol/changes/${id}/review/report.md`)] }, at(10));
			
			await transitionChange(workspace, id, { type: "begin", actor: "test", stage: "apply", nextAction: "next" }, at(11));
			await transitionChange(workspace, id, { type: "usage", actor: "test", stage: "apply", run: { id: "a1", started_at: at(12).now.toISOString(), finished_at: at(13).now.toISOString(), elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, at(14));
			mkdirSync(join(workspace, `.codepatrol/changes/${id}/apply`), { recursive: true });
			writeFileSync(join(workspace, `.codepatrol/changes/${id}/apply/journal.md`), "journal\n");
			
			const applyCheckpointIntent = { type: "checkpoint" as const, actor: "test", stage: "apply" as const, result: "implemented" as const, nextAction: "next", artifacts: [binding(workspace, `.codepatrol/changes/${id}/apply/journal.md`)], changes: [".codepatrol/config.json"] };

			// AC-1: failing gate blocks the seal
			writeConfig(workspace, { applyGate: { command: ["x"] } });
			await assert.rejects(
				() => transitionChange(workspace, id, applyCheckpointIntent, { git, gate: async () => ({ exitCode: 1, output: "fail", elapsedMs: 5 }) }),
				(err: CodepatrolError) => err.code === "APPLY_GATE_FAILED"
			);
			
			const viewsFail = await inspectChanges(workspace, { workId: id });
			const failEvents = parse(readFileSync(join(workspace, `.codepatrol/changes/${id}/change.yaml`), "utf8")).events;
			assert.equal(failEvents.filter((e: any) => e.type === "stage-checkpointed" && e.stage === "apply").length, 0);

			// AC-2: passing gate seals with summary
			let called = 0;
			await transitionChange(workspace, id, applyCheckpointIntent, { git, gate: async () => { called++; return { exitCode: 0, output: "", elapsedMs: 7 }; } });
			assert.equal(called, 1);
			const viewsPass = await inspectChanges(workspace, { workId: id });
			const passEvents = parse(readFileSync(join(workspace, `.codepatrol/changes/${id}/change.yaml`), "utf8")).events;
			const applyEv = passEvents.filter((e: any) => e.type === "stage-checkpointed" && e.stage === "apply")[0] as any;
			assert.equal(applyEv.gate.exit_code, 0);
			assert.equal(applyEv.gate.command, "x");

			// AC-3: no config => runner never called
			// Start new change to test this since previous one is no longer in apply
			gitCommand(workspace, ["checkout", "main"]);
			const id2 = "2026-07-24-gate-test2";
			await startChange(workspace, { workId: id2, title: "Gate test 2", targetBranch: "main", actor: "codex" }, at(15));
			mkdirSync(join(workspace, `.codepatrol/changes/${id2}/plan`), { recursive: true });
			writeFileSync(join(workspace, `.codepatrol/changes/${id2}/plan/spec.md`), "spec\n");
			writeFileSync(join(workspace, `.codepatrol/changes/${id2}/plan/plan.md`), "plan\n");
			await transitionChange(workspace, id2, { type: "usage", actor: "test", stage: "plan", run: { id: "p2", started_at: at(16).now.toISOString(), finished_at: at(17).now.toISOString(), elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, at(18));
			await transitionChange(workspace, id2, { type: "checkpoint", actor: "test", stage: "plan", result: "ready", nextAction: "next", artifacts: [binding(workspace, `.codepatrol/changes/${id2}/plan/spec.md`), binding(workspace, `.codepatrol/changes/${id2}/plan/plan.md`)] }, at(19));
			await transitionChange(workspace, id2, { type: "begin", actor: "test", stage: "review", nextAction: "next" }, at(20));
			await transitionChange(workspace, id2, { type: "usage", actor: "test", stage: "review", run: { id: "r2", started_at: at(21).now.toISOString(), finished_at: at(22).now.toISOString(), elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, at(23));
			mkdirSync(join(workspace, `.codepatrol/changes/${id2}/review`), { recursive: true });
			writeFileSync(join(workspace, `.codepatrol/changes/${id2}/review/report.md`), "report\n");
			// Remove config to test AC-3
			rmSync(join(workspace, ".codepatrol/config.json"), { force: true });

			// AC-4: plan/review/verify + persona checkpoints never call the runner
			// Test AC-4 on review checkpoint here
			let calledReview = 0;
			await transitionChange(workspace, id2, { type: "checkpoint", actor: "test", stage: "review", result: "approve", nextAction: "next", artifacts: [binding(workspace, `.codepatrol/changes/${id2}/review/report.md`)] }, { git, gate: async () => { calledReview++; return { exitCode: 0, output: "", elapsedMs: 7 }; }, now: at(24).now });
			assert.equal(calledReview, 0);

			await transitionChange(workspace, id2, { type: "begin", actor: "test", stage: "apply", nextAction: "next" }, at(25));
			await transitionChange(workspace, id2, { type: "usage", actor: "test", stage: "apply", run: { id: "a2", started_at: at(26).now.toISOString(), finished_at: at(27).now.toISOString(), elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } }, at(28));
			mkdirSync(join(workspace, `.codepatrol/changes/${id2}/apply`), { recursive: true });
			writeFileSync(join(workspace, `.codepatrol/changes/${id2}/apply/journal.md`), "journal\n");
			
			let calledApplyNoConfig = 0;
			await transitionChange(workspace, id2, { type: "checkpoint" as const, actor: "test", stage: "apply" as const, result: "implemented" as const, nextAction: "next", artifacts: [binding(workspace, `.codepatrol/changes/${id2}/apply/journal.md`)], changes: [] }, { git, gate: async () => { calledApplyNoConfig++; return { exitCode: 0, output: "", elapsedMs: 7 }; }, now: at(29).now });
			assert.equal(calledApplyNoConfig, 0);
			const noConfigEvents = parse(readFileSync(join(workspace, `.codepatrol/changes/${id2}/change.yaml`), "utf8")).events;
			const applyEvNoConfig = noConfigEvents.filter((e: any) => e.type === "stage-checkpointed" && e.stage === "apply")[0] as any;
			assert.equal(applyEvNoConfig.gate, undefined);

		} finally { rmSync(workspace, { recursive: true, force: true }); }
	});
});