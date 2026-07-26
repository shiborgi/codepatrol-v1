import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const project = resolve(import.meta.dirname, "..", "..");
const entry = join(project, "src", "cli", "main.ts");
function git(root: string, args: string[]): string { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); }
function workspace(): string {
	const root = mkdtempSync(join(tmpdir(), "codepatrol cli space "));
	mkdirSync(join(root, "src"));
	writeFileSync(join(root, "src", "main.ts"), "export function main() { return 42; }\n");
	writeFileSync(join(root, "src", "main.test.ts"), "import { main } from './main';\nmain();\n");
	writeFileSync(join(root, ".gitignore"), ".codepatrol/runtime/\n");
	git(root, ["init", "-b", "main"]); git(root, ["add", "."]); git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "baseline"]);
	return root;
}
function run(args: string[], input?: string) { return spawnSync(process.execPath, ["--import", "jiti/register", entry, ...args], { cwd: project, encoding: "utf8", input }); }

test("CLI graph commands retain stable JSON envelopes under runtime storage", () => {
	const root = workspace();
	try {
		const sync = run(["graph", "sync", "--workspace", root, "--format", "json"]); assert.equal(sync.status, 0, sync.stderr);
		const envelope = JSON.parse(sync.stdout); assert.equal(envelope.ok, true); assert.equal(envelope.command, "graph.sync"); assert.equal(envelope.workspace, realpathSync(root)); assert.equal(envelope.data.report.scanned, 2);
		const outline = run(["graph", "outline", "--file", "src/main.ts", "--workspace", root, "--format=json"]); assert.equal(outline.status, 0, outline.stderr); assert.equal(JSON.parse(outline.stdout).data[0].exported[0].name, "main");
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("CLI exposes only explicit Change lifecycle commands and deterministic status", () => {
	const root = workspace();
	try {
		const id = "2026-07-22-cli";
		const started = run(["change", "start", "--input", "-", "--workspace", root, "--format=json"], JSON.stringify({ workId: id, title: "CLI contract", targetBranch: "main", actor: "codex" }));
		assert.equal(started.status, 0, started.stderr || started.stdout); const startData = JSON.parse(started.stdout).data; assert.equal(startData.stage, "plan"); assert.equal(git(root, ["branch", "--show-current"]), `codepatrol/${id}`);
		const inspected = run(["change", "inspect", "--id", id, "--workspace", root, "--format=json"]); assert.equal(inspected.status, 0, inspected.stderr); assert.equal(JSON.parse(inspected.stdout).data.identity.work_id, id);
		const status = run(["status", "--workspace", root, "--format=json"]); assert.equal(status.status, 0, status.stderr); assert.equal(JSON.parse(status.stdout).data.rows[0].workId, id);
		const missingId = run(["change", "inspect", "--workspace", root, "--format=json"]); assert.equal(missingId.status, 2); assert.match(JSON.parse(missingId.stdout).error.message, /--id/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("CLI errors and Kanban clock input are stable", () => {
	const root = workspace();
	try {
		const invalid = run(["graph", "find", "--workspace", root, "--format=json"]); assert.equal(invalid.status, 2); assert.equal(JSON.parse(invalid.stdout).error.code, "INVALID_ARGUMENT");
		const clock = run(["status", "--as-of", "tomorrow", "--workspace", root, "--format=json"]); assert.equal(clock.status, 2); assert.match(JSON.parse(clock.stdout).error.message, /ISO/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("CLI change session supports read-only status projection", () => {
	const root = workspace();
	try {
		const id = "2026-07-22-cli-session";
		const started = run(["change", "start", "--input", "-", "--workspace", root, "--format=json"], JSON.stringify({ workId: id, title: "Session", targetBranch: "main", actor: "codex" }));
		assert.equal(started.status, 0, started.stderr || started.stdout);
		
		const planDirectory = join(root, `.codepatrol/changes/${id}/plan`);
		mkdirSync(planDirectory, { recursive: true });
		writeFileSync(join(planDirectory, "plan.md"), "### T1 — First\n\n**Depends on:** None\n\n### T2 — Second\n\n**Depends on:** T1\n");
		
		writeFileSync(join(root, ".codepatrol/changes", id, "change.yaml"), `schema_version: 2
identity:
  work_id: ${id}
  title: fake
  created_at: "2026-07-22T10:00:00Z"
  branch: codepatrol/${id}
  target_branch: main
  base_commit: 415f779bde14e57ad0af7ac4cd25657bcea00fcd
events:
  - id: e0
    type: change-started
    at: "2026-07-22T10:00:00Z"
    actor: codex
    stage: plan
    attempt: 1
    next_action: ...
  - id: e0b
    type: run-recorded
    at: "2026-07-22T10:00:30Z"
    actor: plan
    stage: plan
    attempt: 1
    run:
      id: run0
      started_at: "2026-07-22T10:00:00Z"
      finished_at: "2026-07-22T10:00:30Z"
      elapsed_ms: 30000
      characters:
        status: unavailable
        reason: x
  - id: e1
    type: stage-checkpointed
    at: "2026-07-22T10:01:00Z"
    actor: plan
    stage: plan
    attempt: 1
    result: ready
    checkpoint: "1111111111111111111111111111111111111111"
    tree: "1111111111111111111111111111111111111111"
    artifacts: []
    next_action: review
  - id: e2
    type: stage-began
    at: "2026-07-22T10:02:00Z"
    actor: review
    stage: review
    attempt: 1
    next_action: x
  - id: e3
    type: run-recorded
    at: "2026-07-22T10:03:00Z"
    actor: review
    stage: review
    attempt: 1
    run:
      id: run1
      started_at: "2026-07-22T10:02:00Z"
      finished_at: "2026-07-22T10:03:00Z"
      elapsed_ms: 60000
      characters:
        status: unavailable
        reason: x
  - id: e4
    type: stage-checkpointed
    at: "2026-07-22T10:04:00Z"
    actor: review
    stage: review
    attempt: 1
    result: approve
    checkpoint: "2222222222222222222222222222222222222222"
    tree: "2222222222222222222222222222222222222222"
    artifacts: []
    next_action: apply
`);

		const statusResp = run(["change", "session", "--id", id, "--input", "-", "--workspace", root, "--format=json"], JSON.stringify({ action: "status", stage: "apply", attempt: 1 }));
		assert.equal(statusResp.status, 0, statusResp.stderr || statusResp.stdout);
		
		const envelope = JSON.parse(statusResp.stdout);
		assert.equal(envelope.data.status.ready[0].id, "T1");
		assert.equal(envelope.data.status.blocked[0].id, "T2");

		const statusTextResp = run(["change", "session", "--id", id, "--input", "-", "--workspace", root], JSON.stringify({ action: "status", stage: "apply", attempt: 1 }));
		assert.match(statusTextResp.stdout, /T1/);
		assert.match(statusTextResp.stdout, /T2/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("CLI rejects inline JSON passed to --input with an actionable error", () => {
  const root = workspace();
  try {
    const res = run(["change", "transition", "--id", "2026-07-22-x", "--input", '{"type":"begin"}', "--workspace", root, "--format=json"]);
    assert.equal(res.status, 2, res.stdout);
    const err = JSON.parse(res.stdout).error;
    assert.equal(err.code, "INVALID_ARGUMENT");
    assert.match(err.message, /--input -/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("CLI suggests change transition for an unknown change.<transition-type> command", () => {
  const root = workspace();
  try {
    const res = run(["change", "begin", "--workspace", root, "--format=json"]);
    assert.equal(res.status, 2, res.stdout);
    const err = JSON.parse(res.stdout).error;
    assert.equal(err.code, "INVALID_ARGUMENT");
    assert.match(err.message, /change transition/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("CLI lists known commands for an unknown command", () => {
  const root = workspace();
  try {
    const res = run(["frobnicate", "--workspace", root, "--format=json"]);
    assert.equal(res.status, 2, res.stdout);
    const err = JSON.parse(res.stdout).error;
    assert.equal(err.code, "INVALID_ARGUMENT");
    assert.match(err.message, /change start|graph sync/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("codepatrol next lists Changes by stage with affordances", () => {
  const root = workspace();
  try {
    const id = "2026-07-22-io-demo";
    assert.equal(run(["change","start","--input","-","--workspace",root,"--format=json"], JSON.stringify({ workId: id, title: "IO", targetBranch: "main", actor: "codex" })).status, 0);
    const plan = run(["next","--stage","plan","--workspace",root,"--format=json"]);
    assert.equal(plan.status, 0, plan.stderr);
    const pd = JSON.parse(plan.stdout).data;
    assert.equal(pd.changes[0].workId, id);
    assert.equal(pd.startNew, true);
    const close = JSON.parse(run(["next","--stage","close","--workspace",root,"--format=json"]).stdout).data;
    assert.deepEqual(close.closeOptions, ["commit","commit+push","rollback"]);
    const bad = run(["next","--stage","bogus","--workspace",root,"--format=json"]);
    assert.equal(bad.status, 2); assert.equal(JSON.parse(bad.stdout).error.code, "INVALID_ARGUMENT");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("codepatrol change summary renders a uniform Summary/Verdict/Next block", () => {
  const root = workspace();
  try {
    const id = "2026-07-22-io-sum";
    run(["change","start","--input","-","--workspace",root,"--format=json"], JSON.stringify({ workId: id, title: "IO", targetBranch: "main", actor: "codex" }));
    const j = JSON.parse(run(["change","summary","--id",id,"--workspace",root,"--format=json"]).stdout).data;
    assert.ok(j.summary && j.verdict && j.next);
    const text = run(["change","summary","--id",id,"--workspace",root]).stdout;
    assert.match(text, /^Summary:/m); assert.match(text, /^Verdict:/m); assert.match(text, /^Next:/m);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("codepatrol backlog add and list dedupe, classify, and filter", () => {
  const root = workspace();
  try {
    const add1 = JSON.parse(run(["backlog","add","--input","-","--workspace",root,"--format=json"], JSON.stringify({ title: "Command \"change.transition\" invoked 13 times — consider caching.", area: "workflow", evidence: [], source: { kind: "close-trace", workId: "2026-07-24-example" } })).stdout).data;
    assert.equal(add1.status, "candidate");
    assert.equal(add1.count, 1);
    const add2 = JSON.parse(run(["backlog","add","--input","-","--workspace",root,"--format=json"], JSON.stringify({ title: "Command \"change.transition\" invoked 47 times — consider caching.", area: "workflow", priority: "p1", evidence: [], source: { kind: "plan-followup", workId: "2026-07-24-example" } })).stdout).data;
    assert.equal(add2.count, 2);
    assert.equal(add2.status, "candidate");
    const listed = JSON.parse(run(["backlog","list","--workspace",root,"--format=json"]).stdout).data;
    assert.equal(listed.length, 1);
    const text = run(["backlog","list","--workspace",root]).stdout;
    assert.match(text, /id\s*\|\s*title/);
    const filtered = JSON.parse(run(["backlog","list","--status","dismissed","--workspace",root,"--format=json"]).stdout).data;
    assert.equal(filtered.length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("CLI backlog resolve marks an item done or dismissed, rejects bad status/id/already-terminal", () => {
  const root = workspace();
  try {
    const add = JSON.parse(run(["backlog","add","--input","-","--workspace",root,"--format=json"], JSON.stringify({ title: "Resolve me", area: "workflow", evidence: [], source: { kind: "close-trace", workId: "2026-07-26-x" } })).stdout).data;
    const ok = run(["backlog","resolve","--id",add.id,"--status","done","--workspace",root,"--format=json"]);
    assert.equal(ok.status, 0, ok.stderr || ok.stdout);
    const okData = JSON.parse(ok.stdout).data;
    assert.equal(okData.id, add.id);
    assert.equal(okData.status, "done");

    const badStatus = run(["backlog","resolve","--id",add.id,"--status","bogus","--workspace",root,"--format=json"]);
    assert.equal(badStatus.status, 2, badStatus.stdout);
    assert.equal(JSON.parse(badStatus.stdout).error.code, "INVALID_ARGUMENT");

    const badId = run(["backlog","resolve","--id","does-not-exist","--status","done","--workspace",root,"--format=json"]);
    assert.equal(badId.status, 4, badId.stdout);
    assert.equal(JSON.parse(badId.stdout).error.code, "CHANGE_INVALID");

    const alreadyDone = run(["backlog","resolve","--id",add.id,"--status","dismissed","--workspace",root,"--format=json"]);
    assert.equal(alreadyDone.status, 4, alreadyDone.stdout);
    assert.equal(JSON.parse(alreadyDone.stdout).error.code, "CHANGE_CONFLICT");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("codepatrol next --stage plan includes the backlog section; --stage verify omits it", () => {
  const root = workspace();
  try {
    const id = "2026-07-22-next-backlog";
    assert.equal(run(["change","start","--input","-","--workspace",root,"--format=json"], JSON.stringify({ workId: id, title: "IO", targetBranch: "main", actor: "codex" })).status, 0);
    assert.equal(run(["backlog","add","--input","-","--workspace",root,"--format=json"], JSON.stringify({ title: "Test backlog item for next", area: "workflow", priority: "p2", evidence: [], source: { kind: "plan-followup", workId: id } })).status, 0);
    const plan = JSON.parse(run(["next","--stage","plan","--workspace",root,"--format=json"]).stdout).data;
    assert.ok(Array.isArray(plan.backlog));
    assert.equal(plan.backlog.length, 1);
    assert.equal(plan.backlog[0].priority, "p2");
    const planText = run(["next","--stage","plan","--workspace",root]).stdout;
    assert.match(planText, /Backlog:/);
    assert.match(planText, /test-backlog-item-for-next/);
    const verifyText = run(["next","--stage","verify","--workspace",root]).stdout;
    assert.doesNotMatch(verifyText, /Backlog:/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("regression: Plan checkpoint succeeds after backlog add CLI when the caller commits the file", () => {
  const root = workspace();
  try {
    const input = JSON.stringify({ title: "Split followup", area: "workflow", priority: "p2", evidence: [], source: { kind: "plan-followup", workId: "2026-07-24-cli-add-regress" } });
    assert.equal(run(["backlog","add","--input","-","--workspace",root,"--format=json"], input).status, 0);
    execFileSync("git", ["-C", root, "add", ".codepatrol/backlog/"]);
    execFileSync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "backlog"]);
    const id2 = "2026-07-24-cli-add-regress";
    assert.equal(run(["change","start","--input","-","--workspace",root,"--format=json"], JSON.stringify({ workId: id2, title: "Regress", targetBranch: "main", actor: "codex" })).status, 0);
    mkdirSync(join(root, ".codepatrol/changes", id2, "plan"), { recursive: true });
    writeFileSync(join(root, ".codepatrol/changes", id2, "plan/spec.md"), "spec\n");
    writeFileSync(join(root, ".codepatrol/changes", id2, "plan/plan.md"), "plan\n");
    assert.equal(run(["change","transition","--id",id2,"--input","-","--workspace",root,"--format=json"], JSON.stringify({ type: "usage", actor: "codex", stage: "plan", run: { id: "plan-usage", started_at: "2026-07-24T03:00:00Z", finished_at: "2026-07-24T03:00:01Z", elapsed_ms: 1000, characters: { status: "unavailable", reason: "test" } } })).status, 0);
    const specSha = createHash("sha256").update("spec\n").digest("hex");
    const planSha = createHash("sha256").update("plan\n").digest("hex");
    const transitionRes = run(["change","transition","--id",id2,"--input","-","--workspace",root,"--format=json"], JSON.stringify({ type: "checkpoint", actor: "codex", stage: "plan", result: "ready", artifacts: [{ path: ".codepatrol/changes/" + id2 + "/plan/spec.md", sha256: specSha, intent: "create" }, { path: ".codepatrol/changes/" + id2 + "/plan/plan.md", sha256: planSha, intent: "create" }], nextAction: "codepatrol-review" }));
    assert.equal(transitionRes.status, 0, transitionRes.stderr || transitionRes.stdout);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("CLI change session rejects an invalid stage before touching session state", () => {
  const root = workspace();
  try {
    const result = run(["change", "session", "--id", "does-not-matter", "--input", "-", "--workspace", root, "--format=json"], JSON.stringify({ action: "prime", stage: "bogus", attempt: 1 }));
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const error = JSON.parse(result.stdout).error;
    assert.equal(error.code, "INVALID_ARGUMENT");
    assert.match(error.message, /stage/i);
    assert.match(error.message, /change inspect/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("CLI change session rejects a missing or invalid attempt before touching session state", () => {
  const root = workspace();
  try {
    const missing = run(["change", "session", "--id", "does-not-matter", "--input", "-", "--workspace", root, "--format=json"], JSON.stringify({ action: "prime", stage: "plan" }));
    assert.equal(missing.status, 2, missing.stderr || missing.stdout);
    const missingError = JSON.parse(missing.stdout).error;
    assert.equal(missingError.code, "INVALID_ARGUMENT");
    assert.match(missingError.message, /attempt/i);
    assert.match(missingError.message, /change inspect/);

    const zero = run(["change", "session", "--id", "does-not-matter", "--input", "-", "--workspace", root, "--format=json"], JSON.stringify({ action: "prime", stage: "plan", attempt: 0 }));
    assert.equal(zero.status, 2, zero.stderr || zero.stdout);
    assert.equal(JSON.parse(zero.stdout).error.code, "INVALID_ARGUMENT");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("CLI change session still reports CHANGE_CONFLICT for a well-formed but stale stage/attempt", () => {
  const root = workspace();
  try {
    const id = "2026-07-25-stale-attempt";
    const started = run(["change", "start", "--input", "-", "--workspace", root, "--format=json"], JSON.stringify({ workId: id, title: "Stale attempt regression", targetBranch: "main", actor: "codex" }));
    assert.equal(started.status, 0, started.stderr || started.stdout);

    const wrongStage = run(["change", "session", "--id", id, "--input", "-", "--workspace", root, "--format=json"], JSON.stringify({ action: "prime", stage: "review", attempt: 1 }));
    assert.equal(wrongStage.status, 4, wrongStage.stderr || wrongStage.stdout);
    const wrongStageError = JSON.parse(wrongStage.stdout).error;
    assert.equal(wrongStageError.code, "CHANGE_CONFLICT");
    assert.equal(wrongStageError.message, "Session review/1 is not the current attempt.");

    const wrongAttempt = run(["change", "session", "--id", id, "--input", "-", "--workspace", root, "--format=json"], JSON.stringify({ action: "prime", stage: "plan", attempt: 2 }));
    assert.equal(wrongAttempt.status, 4, wrongAttempt.stderr || wrongAttempt.stdout);
    assert.equal(JSON.parse(wrongAttempt.stdout).error.code, "CHANGE_CONFLICT");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
