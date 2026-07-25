import type { ChangeView, Stage } from "../change/types.js";
import type { BacklogItem } from "../change/backlog.js";
import type { IssueSyncResult } from "../change/issue-sync.js";
import type { GraphImpactData, GraphNeighborsData, GraphOverviewData, OutlineFile } from "../graph/service.js";
import type { GraphNode } from "../graph/model.js";
import { formatTable, mermaidModuleMap } from "../graph/render.js";
import type { CodepatrolError } from "../shared/errors.js";

export interface SuccessEnvelope {
	ok: true;
	command: string;
	workspace: string;
	data: unknown;
	warnings: string[];
}

export interface ErrorEnvelope {
	ok: false;
	command: string;
	error: { code: string; message: string; retryable: boolean; details?: unknown };
}

export function successEnvelope(command: string, workspace: string, data: unknown, warnings: string[] = []): SuccessEnvelope {
	return { ok: true, command, workspace, data, warnings };
}

export function errorEnvelope(command: string, error: CodepatrolError): ErrorEnvelope {
	return {
		ok: false,
		command,
		error: { code: error.code, message: error.message, retryable: error.retryable, ...(error.details === undefined ? {} : { details: error.details }) },
	};
}

export const HELP = `codepatrol <group> <command> [options]

Status commands:
  status [--all] [--as-of <ISO>]

Change lifecycle commands:
  next [--stage <stage>]
  change start --input <file|->
  change inspect --id <work-id>
  change summary --id <work-id>
  change transition --id <work-id> --input <file|->
  change session --id <work-id> --input <file|->
  change doctor --id <work-id>
  change close --id <work-id> --input <file|->
  backlog add --input <file|->
  backlog list [--status <candidate|scheduled|done|dismissed>]

Issue sync commands:
  issues sync [--direction pull|push|both] [--dry-run]

Graph commands:
  graph sync [--force]
  graph overview [--path <path>]
  graph outline --file <path>
  graph find --query <text> [--exact]
  graph neighbors [--symbol <name|id>] [--file <path>] [--relation <type>...]
  graph impact [--file <path>...] [--symbol <name|id>...] [--since-ref <ref>] [--include-ambiguous]

Global options:
  --workspace <path>   Explicit workspace (then CODEPATROL_WORKSPACE, then cwd)
  --format text|json   Output format (default: text)
  --help               Show help
  --version            Show version`;

export function renderOverview(data: GraphOverviewData): string {
	if (data.path !== undefined) {
		const files = data.files ?? [];
		if (files.length === 0) return `No graph files under "${data.path}".`;
		return [
			`# Orientation — ${data.path} (${files.length} files)`, "",
			formatTable(["file", "symbols", "exported", "fan-in", "fan-out", "test"], files.map((file) => [
				file.file, String(file.symbols), String(file.exported), String(file.fanIn), String(file.fanOut), file.isTest ? "yes" : "",
			])),
		].join("\n");
	}
	const clusters = data.clusters ?? [];
	return [
		`# Architecture overview — ${data.stats.files} files, ${data.stats.symbols} symbols, ${clusters.length} clusters`, "",
		"## Clusters",
		formatTable(["cluster", "files", "e.g."], clusters.slice(0, 12).map((cluster) => [cluster.label, String(cluster.files.length), cluster.files.slice(0, 3).join(", ")])),
		"", "## Entry points",
		(data.entryPoints?.length ? data.entryPoints.map((entry) => `- ${entry.file} — ${entry.reason}`).join("\n") : "(none detected)"),
		"", "## Top fan-in (most depended upon)",
		formatTable(["file", "importers"], (data.topFanIn ?? []).map((item) => [item.file, String(item.count)])),
		"", "## Top fan-out (most dependencies)",
		formatTable(["file", "imports"], (data.topFanOut ?? []).map((item) => [item.file, String(item.count)])),
		"", "## Module map", mermaidModuleMap(clusters, data.clusterEdges ?? []),
	].join("\n");
}

export function renderOutline(files: OutlineFile[]): string {
	if (files.length === 0) return "No graph files matched the requested path.";
	return files.map((file) => [
		`## ${file.file} — ${file.exported.length} exported, ${file.internal.length} internal`,
		...file.exported.map((symbol) => `- exported ${symbol.kind} ${symbol.name} (line ${symbol.line})`),
		...(file.internal.length ? [`- internals: ${file.internal.map((symbol) => symbol.name).join(", ")}`] : []),
	].join("\n")).join("\n\n");
}

export function renderFind(nodes: GraphNode[]): string {
	if (!nodes.length) return "No matching definitions in the graph.";
	return nodes.map((node) => `${node.file}:${node.line} ${node.name} (${node.kind}, ${node.exported ? "exported" : "internal"}) — ${node.id}`).join("\n");
}

function renderRelated(label: string, entries: Array<{ name: string; file?: string; line?: number; confidence?: string }> | string[] | undefined): string {
	if (!entries?.length) return `${label}: (none)`;
	return `${label}:\n${entries.map((entry) => typeof entry === "string"
		? `  - ${entry}`
		: `  - ${entry.name}${entry.file ? ` (${entry.file}:${entry.line ?? "?"})` : ""}${entry.confidence ? ` [${entry.confidence}]` : ""}`).join("\n")}`;
}

export function renderNeighbors(data: GraphNeighborsData): string {
	const sections: string[] = [];
	for (const item of data.symbols) {
		sections.push(`# ${item.symbol.file}:${item.symbol.line} ${item.symbol.name} — ${item.symbol.id}`);
		if (item.callers) sections.push(renderRelated("callers", item.callers));
		if (item.callees) sections.push(renderRelated("callees", item.callees));
		if (item.inheritors) sections.push(renderRelated("inheritors", item.inheritors));
	}
	if (data.file) {
		sections.push(`# ${data.file.file}`);
		if (data.file.importers) sections.push(renderRelated("importers", data.file.importers));
		if (data.file.imports) sections.push(renderRelated("imports", data.file.imports));
		if (data.file.tests) sections.push(renderRelated("tested by", data.file.tests));
	}
	return sections.length ? sections.join("\n") : "No matching graph neighbors.";
}

export function renderImpact(data: GraphImpactData): string {
	return [
		`# Blast radius — ${data.seeds.files.length + data.seeds.symbols.length} seed(s), ${data.affected.length} affected file(s)`,
		`Seeds: ${[...data.seeds.files, ...data.seeds.symbols].join(", ")}`,
		"",
		data.affected.length ? formatTable(["affected file", "depth"], data.affected.map((entry) => [entry.file, String(entry.depth)])) : "No dependents found.",
		"", `Affected tests: ${data.affectedTests.length ? "" : "(none found)"}`,
		...data.affectedTests.map((test) => `  - ${test}`),
		...(data.possiblyAffected.length ? ["", `Possibly affected through ambiguous edges: ${data.possiblyAffected.join(", ")}`] : []),
		...(data.unknownSeeds.length ? ["", `Seeds not in graph: ${data.unknownSeeds.join(", ")}`] : []),
	].join("\n");
}

export function renderNext(stage: Stage | undefined, changes: ChangeView[], backlog?: BacklogItem[]): string {
	const lines = [`${stage ? `Stage: ${stage}` : "All active changes"}`];
	if (changes.length) {
		lines.push("");
		lines.push(formatTable(["work_id", "state", "next_action"], changes.map(v => [v.identity.work_id, v.state, v.nextAction ?? ""])));
	} else {
		lines.push("(none)");
	}
	if (backlog && backlog.length) {
		lines.push("", "Backlog:", formatTable(["id", "priority", "area", "status", "count", "title"], backlog.map((entry) => [entry.id, entry.priority, entry.area, entry.status, String(entry.count), entry.title])));
	}
	if (stage === "plan" || !stage) {
		lines.push("", "To start a new change:", "codepatrol change start --input -");
	}
	if (stage === "close") {
		lines.push("", "Close options: commit, commit+push, rollback");
	}
	return lines.join("\n");
}

export function renderSummary(view: ChangeView): string {
	return `Summary: ${view.identity.work_id} — ${view.identity.title}\nVerdict: ${view.stage} attempt ${view.attempt} is ${view.state}${view.outcome ? ` (${view.outcome})` : ""}\nNext: ${view.nextAction ?? "none"}`;
}

export function renderBacklogList(items: BacklogItem[]): string {
	if (!items.length) return "(no backlog items)";
	return formatTable(["id", "title", "priority", "area", "status", "count"], items.map((entry) => [entry.id, entry.title, entry.priority, entry.area, entry.status, String(entry.count)]));
}

export function renderIssueSyncResult(result: IssueSyncResult): string {
	const lines: string[] = [];
	const pull = result.pulled;
	lines.push(`Pull: ${pull.created.length} created, ${pull.dismissed.length} dismissed, ${pull.reopened.length} reopened, ${pull.skippedClosed} closed skipped.`);
	if (pull.created.length) lines.push(`  created: ${pull.created.join(", ")}`);
	if (pull.dismissed.length) lines.push(`  dismissed: ${pull.dismissed.join(", ")}`);
	if (pull.reopened.length) lines.push(`  reopened: ${pull.reopened.join(", ")}`);
	const push = result.pushed;
	lines.push(`Push: ${push.created.length} created, ${push.closed.length} closed.`);
	if (push.created.length) lines.push(`  created: ${push.created.join(", ")}`);
	if (push.closed.length) lines.push(`  closed: ${push.closed.join(", ")}`);
	if (result.dryRun) lines.push("(dry run)");
	return lines.join("\n");
}
