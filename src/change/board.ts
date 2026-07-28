import type { ChangeView, RunUsage, Stage, UsageSummary } from "./types.js";
import { aggregateUsage } from "./usage.js";
import { PRIORITY_ORDER, type WorkItem } from "./backlog.js";

export interface KanbanRow { workId: string; backlog: string; plan: string; review: string; apply: string; verify: string; close: string; priority: WorkItem["priority"] | null; createdAt: string }
export interface KanbanBoard { generatedAsOf: string | null; rows: KanbanRow[] }

function duration(ms: number | undefined): string { if (ms === undefined) return "-"; const seconds = Math.floor(ms / 1000); const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); const rest = seconds % 60; return hours ? `${hours}h${String(minutes).padStart(2, "0")}m` : minutes ? `${minutes}m${String(rest).padStart(2, "0")}s` : `${rest}s`; }

function tokenText(usage: UsageSummary): string { return `${usage.characters.total}${usage.characters.complete ? "" : "~"}tok ${usage.characters.coverage}`; }

function runsWithAsOf(runs: RunUsage[], asOf?: string): RunUsage[] {
	if (!asOf) return runs;
	const end = Date.parse(asOf);
	return runs.map((run) => run.finished_at ? run : { ...run, finished_at: asOf, elapsed_ms: Math.max(0, end - Date.parse(run.started_at)) });
}

function stageCell(view: ChangeView, stage: Stage, asOf?: string): string {
	const attempts = view.attempts[stage]; if (!attempts.length) return "";
	const last = attempts.at(-1)!; const usage = aggregateUsage(runsWithAsOf(attempts.flatMap((item) => item.runs), asOf));
	return `${last.harness ?? "-"} | #${last.attempt} | ${duration(usage.activeMs)} | ${tokenText(usage)}`;
}

const DESCRIPTION_MAX = 80;

function firstLine(description: string): string {
	return description.split("\n").find((line) => line.trim())?.trim() ?? "";
}

function truncate(value: string): string {
	return value.length > DESCRIPTION_MAX ? `${value.slice(0, DESCRIPTION_MAX - 1)}…` : value;
}

function backlogCell(workId: string, work: WorkItem | undefined): string {
	if (!work) return `[--] ${workId}`;
	const summary = truncate(firstLine(work.description));
	return summary ? `[${work.priority}] ${work.workId} — ${summary}` : `[${work.priority}] ${work.workId}`;
}

export function projectKanban(works: WorkItem[], changes: ChangeView[], options: { asOf?: string; all?: boolean } = {}): KanbanBoard {
	const workById = new Map<string, WorkItem>();
	for (const work of works) {
		if (workById.has(work.workId)) throw new Error(`Conflicting Work copies: ${work.workId}`);
		workById.set(work.workId, work);
	}
	const seenChanges = new Set<string>();
	const rows = new Map<string, KanbanRow>();
	for (const view of changes) {
		if (!options.all && view.state === "terminal") continue;
		const workId = view.identity.work_id;
		if (seenChanges.has(workId)) throw new Error(`Conflicting Change copies: ${workId}`);
		seenChanges.add(workId);
		const work = workById.get(workId);
		rows.set(workId, {
			workId,
			backlog: backlogCell(workId, work),
			plan: stageCell(view, "plan", options.asOf),
			review: stageCell(view, "review", options.asOf),
			apply: stageCell(view, "apply", options.asOf),
			verify: stageCell(view, "verify", options.asOf),
			close: stageCell(view, "close", options.asOf),
			priority: work?.priority ?? null,
			createdAt: work?.createdAt ?? view.identity.created_at,
		});
	}
	for (const work of works) {
		if (rows.has(work.workId)) continue;
		if (!options.all && work.status !== "open") continue;
		rows.set(work.workId, { workId: work.workId, backlog: backlogCell(work.workId, work), plan: "", review: "", apply: "", verify: "", close: "", priority: work.priority, createdAt: work.createdAt });
	}
	const rank = (row: KanbanRow) => row.priority === null ? PRIORITY_ORDER.length : PRIORITY_ORDER.indexOf(row.priority);
	const sorted = [...rows.values()].sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt) || a.workId.localeCompare(b.workId));
	return { generatedAsOf: options.asOf ?? null, rows: sorted };
}

function escape(value: string): string { return value.replaceAll("|", "\\|").replaceAll("\n", " "); }

export function renderKanbanMarkdown(board: KanbanBoard): string {
	const header = "| Backlog | Plan | Review | Apply | Verify | Close |\n|---|---|---|---|---|---|\n";
	return header + board.rows.map((row) => `| ${escape(row.backlog)} | ${escape(row.plan)} | ${escape(row.review)} | ${escape(row.apply)} | ${escape(row.verify)} | ${escape(row.close)} |`).join("\n") + (board.rows.length ? "\n" : "");
}
