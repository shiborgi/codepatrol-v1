import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { graphFind, graphImpact, graphNeighbors, graphOutline, graphOverview, graphSync } from "../graph/service.js";
import { CodepatrolError } from "../shared/errors.js";
import { resolveInside } from "../shared/workspace.js";
import type { ParsedArgs } from "./args.js";
import { requireValue, KNOWN_COMMANDS } from "./args.js";
import { renderFind, renderImpact, renderNeighbors, renderOutline, renderOverview, renderNext, renderSummary, renderBacklogList, renderIssueSyncResult } from "./output.js";
import { closeChange, inspectChanges, startChange, transitionChange } from "../change/orchestrator.js";
import { projectKanban, renderKanbanMarkdown } from "../change/board.js";
import { claimSessionItem, closeSessionItem, discardAndRebuildSession, primeStageSession, readStageSession, sessionStatus } from "../change/session.js";
import { listBacklog, upsertBacklogItem, readBacklog, type BacklogArea, type BacklogPriority, type BacklogSource, type BacklogStatus } from "../change/backlog.js";
import { syncIssues, type GhAdapter, type SyncDirection } from "../change/issue-sync.js";
import type { CloseInput, Stage, StartChangeInput, TransitionIntent } from "../change/types.js";
import { STAGES } from "../change/types.js";

export interface CommandResult {
	data: unknown;
	text: string;
	warnings?: string[];
	exitCode?: 0 | 4;
}

export interface CommandOverrides {
	gh?: GhAdapter;
}

function relativePath(workspace: string, path: string): string {
	return relative(workspace, resolveInside(workspace, path)).split("\\").join("/");
}

function requireSeed(args: ParsedArgs): void {
	if (!args.files.length && !args.symbols.length && !args.sinceRef) {
		throw new CodepatrolError("INVALID_ARGUMENT", "Pass at least one --file, --symbol, or --since-ref.", 2);
	}
}

function requireSessionCoordinates(payload: { stage?: unknown; attempt?: unknown }, id: string): { stage: Stage; attempt: number } {
	const hint = `Run \`codepatrol change inspect --id ${id}\` to read the current stage and attempt.`;
	if (typeof payload.stage !== "string" || !STAGES.includes(payload.stage as Stage)) {
		throw new CodepatrolError("INVALID_ARGUMENT", `Session stage must be one of ${STAGES.join(", ")}; got ${JSON.stringify(payload.stage) ?? "(missing)"}. ${hint}`, 2);
	}
	if (typeof payload.attempt !== "number" || !Number.isSafeInteger(payload.attempt) || payload.attempt < 1) {
		throw new CodepatrolError("INVALID_ARGUMENT", `Session attempt must be a positive integer; got ${JSON.stringify(payload.attempt) ?? "(missing)"}. ${hint}`, 2);
	}
	return { stage: payload.stage as Stage, attempt: payload.attempt };
}

function renderSync(data: Awaited<ReturnType<typeof graphSync>>): string {
	const { report } = data;
	return [
		`Code graph synced in ${report.durationMs}ms — ${data.path}`,
		`files: scanned ${report.scanned}, extracted ${report.extracted}, unchanged ${report.unchanged}, removed ${report.removed}`,
		`nodes: ${report.stats.files} files, ${report.stats.symbols} symbols`,
		`edges: imports ${report.stats.edgesByKind.imports}, calls ${report.stats.edgesByKind.calls}, inherits ${report.stats.edgesByKind.inherits}, tests ${report.stats.edgesByKind.tests}`,
	].join("\n");
}

function readJsonInput(workspace: string, input: string, label: string): unknown {
	if (input !== "-" && (input.trimStart().startsWith("{") || input.trimStart().startsWith("["))) {
		throw new CodepatrolError("INVALID_ARGUMENT", `${label} input looks like inline JSON, not a file path. Pipe it via stdin with \`--input -\` (for example: echo '<json>' | codepatrol … --input -) or write it to a workspace-relative file.`, 2);
	}
	const raw = input === "-" ? readFileSync(0, "utf8") : readFileSync(resolveInside(workspace, input, true), "utf8");
	try { return JSON.parse(raw); }
	catch { throw new CodepatrolError("INVALID_ARGUMENT", `${label} input is not valid JSON.`, 2); }
}

export async function executeCommand(args: ParsedArgs, workspace: string, signal: AbortSignal, overrides?: CommandOverrides): Promise<CommandResult> {
	switch (args.command) {
		case "status": {
			if (args.asOf && !Number.isFinite(Date.parse(args.asOf))) throw new CodepatrolError("INVALID_ARGUMENT", "--as-of must be an ISO timestamp.", 2);
			const data = projectKanban(await inspectChanges(workspace, { all: args.all }, { signal }), { all: args.all, ...(args.asOf ? { asOf: args.asOf } : {}), backlogItems: readBacklog(workspace).items });
			return { data, text: renderKanbanMarkdown(data) };
		}
		case "next": {
			if (args.stage && !["plan", "review", "apply", "verify", "close"].includes(args.stage)) throw new CodepatrolError("INVALID_ARGUMENT", `Unknown stage: ${args.stage}`, 2);
			const changes = (await inspectChanges(workspace, { all: true }, { signal })).filter((v) => v.state !== "terminal" && (!args.stage || v.stage === args.stage));
			const showBacklog = !args.stage || args.stage === "plan";
			const backlog = showBacklog ? listBacklog(workspace, { open: true }) : [];
			const data: { stage: string | undefined; changes: { workId: string; state: string; nextAction?: string }[]; startNew: boolean; closeOptions?: string[]; backlog?: { id: string; title: string; priority: string; area: string; status: string; count: number; workId: string | null }[] } = {
				stage: args.stage,
				changes: changes.map((v) => ({ workId: v.identity.work_id, state: v.state, nextAction: v.nextAction })),
				startNew: args.stage === "plan" || !args.stage,
				...(args.stage === "close" ? { closeOptions: ["commit", "commit+push", "rollback"] } : {})
			};
			if (showBacklog) data.backlog = backlog.map((entry) => ({ id: entry.id, title: entry.title, priority: entry.priority, area: entry.area, status: entry.status, count: entry.count, workId: entry.workId }));
			return { data, text: renderNext(args.stage as Stage | undefined, changes, showBacklog ? backlog : undefined) };
		}
		case "graph.sync": {
			const data = await graphSync(workspace, { force: args.force, signal });
			return { data, text: renderSync(data) };
		}
		case "graph.overview": {
			const data = await graphOverview(workspace, args.path ? relativePath(workspace, args.path) : undefined);
			return { data, text: renderOverview(data) };
		}
		case "graph.outline": {
			if (args.files.length > 1) throw new CodepatrolError("INVALID_ARGUMENT", "Option --file may only be passed once for graph outline.", 2);
			const data = await graphOutline(workspace, relativePath(workspace, requireValue(args.file, "file")));
			return { data, text: renderOutline(data) };
		}
		case "graph.find": {
			const data = await graphFind(workspace, requireValue(args.query, "query"), args.exact);
			return { data, text: renderFind(data) };
		}
		case "graph.neighbors": {
			if (!args.symbol && !args.file) throw new CodepatrolError("INVALID_ARGUMENT", "Pass --symbol and/or --file.", 2);
			const data = await graphNeighbors(workspace, {
				symbol: args.symbol,
				file: args.file ? relativePath(workspace, args.file) : undefined,
				relations: args.relations,
			});
			return { data, text: renderNeighbors(data) };
		}
		case "graph.impact": {
			requireSeed(args);
			const data = await graphImpact(workspace, {
				files: args.files.map((path) => relativePath(workspace, path)),
				symbols: args.symbols,
				sinceRef: args.sinceRef,
				includeAmbiguous: args.includeAmbiguous,
			});
			return { data, text: renderImpact(data) };
		}
		case "change.start": {
			const data = await startChange(workspace, readJsonInput(workspace, requireValue(args.input, "input"), "Change") as StartChangeInput, { signal });
			return { data, text: data.nextAction ?? data.identity.work_id };
		}
		case "change.inspect": {
			const data = (await inspectChanges(workspace, { workId: requireValue(args.id, "id"), all: true }, { signal }))[0];
			return { data, text: `${data.identity.work_id} ${data.stage}#${data.attempt} ${data.state}${data.nextAction ? `\nnext: ${data.nextAction}` : ""}` };
		}
		case "change.summary": {
			const view = (await inspectChanges(workspace, { workId: requireValue(args.id, "id"), all: true }, { signal }))[0];
			const data = { summary: `${view.identity.work_id} - ${view.identity.title}`, verdict: `${view.stage} attempt ${view.attempt} is ${view.state}`, next: view.nextAction ?? "none" };
			return { data, text: renderSummary(view) };
		}
		case "change.transition": {
			const data = await transitionChange(workspace, requireValue(args.id, "id"), readJsonInput(workspace, requireValue(args.input, "input"), "Transition") as TransitionIntent, { signal });
			return { data, text: data.nextAction ?? `${data.identity.work_id} ${data.state}` };
		}
		case "change.session": {
			const id = requireValue(args.id, "id"); const payload = readJsonInput(workspace, requireValue(args.input, "input"), "Session") as { action: "prime" | "claim" | "close" | "rebuild" | "status"; stage: unknown; attempt: unknown; itemId?: string; actor?: string; result?: string; artifacts?: string[] };
			const { stage, attempt } = requireSessionCoordinates(payload, id);
			let data;
			let text;
			if (payload.action === "prime") { data = primeStageSession(workspace, id, stage, attempt); text = data.next_action; }
			else if (payload.action === "claim") { data = await claimSessionItem(workspace, id, stage, attempt, requireValue(payload.itemId, "itemId"), requireValue(payload.actor, "actor")); text = data.next_action; }
			else if (payload.action === "close") { data = await closeSessionItem(workspace, id, stage, attempt, requireValue(payload.itemId, "itemId"), requireValue(payload.result, "result"), payload.artifacts); text = data.next_action; }
			else if (payload.action === "rebuild") { data = discardAndRebuildSession(workspace, id, stage, attempt); text = data.next_action; }
			else if (payload.action === "status") {
				const session = readStageSession(workspace, id, stage, attempt);
				const status = sessionStatus(session);
				data = { session, status };
				text = `Ready: ${status.ready.map(i => i.id).join(", ") || "(none)"}\n` +
					status.blocked.map(b => `${b.id} — blocked by ${b.blockedBy.map(d => `${d.id}(${d.status})`).join(", ")}`).join("\n");
			}
			else throw new CodepatrolError("INVALID_ARGUMENT", "Session action must be prime, claim, close, rebuild, or status.", 2);
			return { data, text };
		}
		case "change.doctor": {
			const data = (await inspectChanges(workspace, { workId: requireValue(args.id, "id"), all: true }, { signal }))[0];
			const session = data.state === "terminal" ? undefined : primeStageSession(workspace, data.identity.work_id, data.stage, data.attempt);
			return { data: { valid: true, change: data, session }, text: `Change ${data.identity.work_id} is structurally valid; runtime is rebuildable.` };
		}
		case "change.close": {
			const data = await closeChange(workspace, requireValue(args.id, "id"), readJsonInput(workspace, requireValue(args.input, "input"), "Close") as CloseInput, { signal });
			const baseText = `${data.outcome} ${data.terminalCommit} (${data.tag})`;
			const text = data.pushSuggestion ? `${baseText}\nConsider: ${data.pushSuggestion}` : baseText;
			return { data, text };
		}
		default: {
			const suffix = args.command.startsWith("change.") ? args.command.slice(7) : "";
			const transitionTypes = ["begin","usage","checkpoint","return","block","resume"];
			if (transitionTypes.includes(suffix)) {
				throw new CodepatrolError("INVALID_ARGUMENT", `Unknown command: ${args.command || "(none)"}. Did you mean \`change transition --id <work-id> --input -\` with type "${suffix}"?`, 2);
			}
			throw new CodepatrolError("INVALID_ARGUMENT", `Unknown command: ${args.command || "(none)"}. Known commands: ${KNOWN_COMMANDS.map((c) => c.replace(".", " ")).join(", ")}.`, 2);
		}
		case "backlog.add": {
			const payload = readJsonInput(workspace, requireValue(args.input, "input"), "Backlog") as { title?: unknown; area?: unknown; priority?: unknown; evidence?: unknown; source?: unknown };
			if (typeof payload.title !== "string" || !payload.title.trim()) throw new CodepatrolError("INVALID_ARGUMENT", "INVALID_ARGUMENT: backlog add input.title must be a non-empty string.", 2);
			const area = payload.area as BacklogArea;
			if (!["architecture", "workflow", "skills"].includes(area)) throw new CodepatrolError("INVALID_ARGUMENT", `INVALID_ARGUMENT: backlog add input.area must be one of architecture|workflow|skills, got ${payload.area}.`, 2);
			const priority = payload.priority as BacklogPriority | undefined;
			if (priority !== undefined && !["p0", "p1", "p2", "p3"].includes(priority)) throw new CodepatrolError("INVALID_ARGUMENT", `INVALID_ARGUMENT: backlog add input.priority must be one of p0|p1|p2|p3, got ${payload.priority}.`, 2);
			const evidence = Array.isArray(payload.evidence) && payload.evidence.every((entry) => typeof entry === "string") ? payload.evidence as string[] : (() => { throw new CodepatrolError("INVALID_ARGUMENT", "INVALID_ARGUMENT: backlog add input.evidence must be an array of strings.", 2); })();
			const source = payload.source as BacklogSource | undefined;
			if (!source || typeof source !== "object" || !["close-trace", "plan-followup"].includes((source as { kind?: string }).kind ?? "") || typeof (source as { workId?: unknown }).workId !== "string") throw new CodepatrolError("INVALID_ARGUMENT", "INVALID_ARGUMENT: backlog add input.source must be { kind: close-trace|plan-followup, workId: string }.", 2);
			const item = upsertBacklogItem(workspace, { title: payload.title, area, priority, evidence, source: { kind: (source as { kind: "close-trace" | "plan-followup" }).kind, workId: (source as { workId: string }).workId } });
			return { data: { id: item.id, status: item.status, count: item.count }, text: `${item.id} (status: ${item.status}, count: ${item.count})` };
		}
		case "backlog.list": {
			const status = args.status as BacklogStatus | undefined;
			if (status !== undefined && !["candidate", "scheduled", "done", "dismissed"].includes(status)) throw new CodepatrolError("INVALID_ARGUMENT", `INVALID_ARGUMENT: backlog list --status must be one of candidate|scheduled|done|dismissed, got ${status}.`, 2);
			const items = listBacklog(workspace, status ? { status } : {});
			return { data: items, text: renderBacklogList(items) };
		}
		case "issues.sync": {
			const direction = (args.direction ?? "both") as SyncDirection;
			if (!["pull", "push", "both"].includes(direction)) throw new CodepatrolError("INVALID_ARGUMENT", `INVALID_ARGUMENT: issues sync --direction must be one of pull|push|both, got ${direction}.`, 2);
			const result = await syncIssues(workspace, direction, { signal, dryRun: args.dryRun, ...(overrides?.gh ? { gh: overrides.gh } : {}) });
			return { data: result, text: renderIssueSyncResult(result) };
		}
	}
}
