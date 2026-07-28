import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CodepatrolError } from "../shared/errors.js";
import { listWork, writeWork, PRIORITY_ORDER, type WorkItem, type WorkIssueRef } from "./backlog.js";
import type { ChangeView } from "./types.js";

const execute = promisify(execFile);

export interface RemoteIssue { number: number; title: string; body: string; url: string; state: "open" | "closed" }

export interface GhAdapter {
	assertAvailable(signal?: AbortSignal): Promise<void>;
	listIssues(signal?: AbortSignal): Promise<RemoteIssue[]>;
	ensureLabel(name: string, signal?: AbortSignal): Promise<void>;
	createIssue(title: string, body: string, label: string, signal?: AbortSignal): Promise<RemoteIssue>;
	editIssue(number: number, update: { title: string; body: string }, signal?: AbortSignal): Promise<void>;
	reopenIssue(number: number, signal?: AbortSignal): Promise<void>;
	closeIssue(number: number, reason: "completed" | "not planned", signal?: AbortSignal): Promise<void>;
}

export class NodeGhAdapter implements GhAdapter {
	constructor(readonly workspace: string) {}

	private async run(args: string[], signal?: AbortSignal): Promise<string> {
		try {
			const result = await execute("gh", args, { cwd: this.workspace, encoding: "utf8", signal, maxBuffer: 8 * 1024 * 1024 });
			return result.stdout.trim();
		} catch (cause) {
			if (signal?.aborted) throw new CodepatrolError("CANCELLED", "Operation cancelled.", 130, true);
			const error = cause as Error & { stderr?: string };
			throw new CodepatrolError("OPERATION_FAILED", error.stderr?.trim() || error.message, 5, true);
		}
	}

	async assertAvailable(signal?: AbortSignal): Promise<void> {
		try {
			await this.run(["auth", "status"], signal);
		} catch {
			throw new CodepatrolError("OPERATION_FAILED", "gh CLI is not installed or not authenticated. Install https://cli.github.com and run `gh auth login`.", 5);
		}
	}

	async listIssues(signal?: AbortSignal): Promise<RemoteIssue[]> {
		const raw = await this.run(["issue", "list", "--state", "all", "--label", LABEL, "--json", "number,title,body,state,url", "--limit", "1000"], signal);
		const parsed = JSON.parse(raw) as Array<{ number: number; title: string; body: string; url: string; state: string }>;
		return parsed.map((issue) => ({ number: issue.number, title: issue.title, body: issue.body, url: issue.url, state: issue.state.toLowerCase() as "open" | "closed" }));
	}

	async ensureLabel(name: string, signal?: AbortSignal): Promise<void> {
		await this.run(["label", "create", name, "--color", "ededed", "--description", "Codepatrol backlog", "--force"], signal);
	}

	async createIssue(title: string, body: string, label: string, signal?: AbortSignal): Promise<RemoteIssue> {
		const url = await this.run(["issue", "create", "--title", title, "--body", body, "--label", label], signal);
		const match = /\/issues\/(\d+)/.exec(url);
		if (!match) throw new CodepatrolError("OPERATION_FAILED", `Could not parse issue number from: ${url}`, 5);
		return { number: Number(match[1]), title, body, url, state: "open" };
	}

	async editIssue(number: number, update: { title: string; body: string }, signal?: AbortSignal): Promise<void> {
		await this.run(["issue", "edit", String(number), "--title", update.title, "--body", update.body], signal);
	}

	async reopenIssue(number: number, signal?: AbortSignal): Promise<void> {
		await this.run(["issue", "reopen", String(number)], signal);
	}

	async closeIssue(number: number, reason: "completed" | "not planned", signal?: AbortSignal): Promise<void> {
		await this.run(["issue", "close", String(number), "--reason", reason], signal);
	}
}

export interface IssueSyncOptions {
	signal?: AbortSignal;
	gh?: GhAdapter;
	dryRun?: boolean;
}

export interface IssueSyncResult {
	created: string[];
	edited: string[];
	reopened: string[];
	closed: string[];
	linked: string[];
	unchanged: string[];
	dryRun: boolean;
}

const LABEL = "codepatrol-backlog";
const MARKER = "Codepatrol-Work:";

export function formatIssueTitle(work: WorkItem): string {
	return `[${work.priority}] ${work.workId}`;
}

export function formatIssueBody(work: WorkItem): string {
	return `${work.description}\n\n---\n${MARKER} ${work.workId}`;
}

export function parseWorkMarker(body: string): string | null {
	const match = new RegExp(`^${MARKER} (\\S+)\\s*$`, "m").exec(body);
	return match?.[1] ?? null;
}

function ghFor(workspace: string, options: IssueSyncOptions): GhAdapter {
	return options.gh ?? new NodeGhAdapter(workspace);
}

function effectiveStatus(work: WorkItem, changesByWorkId: Map<string, ChangeView>): WorkItem["status"] {
	const change = changesByWorkId.get(work.workId);
	if (change?.outcome === "committed") return "done";
	if (change?.outcome === "rolled-back") return "dismissed";
	return work.status;
}

type Action =
	| { kind: "create"; work: WorkItem; status: WorkItem["status"] }
	| { kind: "edit" | "reopen" | "close" | "link" | "unchanged"; work: WorkItem; issue: RemoteIssue; status: WorkItem["status"] };

function matchIssue(work: WorkItem, issues: RemoteIssue[], claimed: Map<number, string>): RemoteIssue | null {
	const matches = new Map<number, RemoteIssue>();
	if (work.issue) {
		const stored = issues.find((issue) => issue.number === work.issue!.number);
		if (stored) matches.set(stored.number, stored);
	}
	for (const issue of issues) {
		if (parseWorkMarker(issue.body) === work.workId) matches.set(issue.number, issue);
	}
	for (const issue of issues) {
		if (issue.title === formatIssueTitle(work)) matches.set(issue.number, issue);
	}
	if (matches.size > 1) throw new CodepatrolError("CHANGE_CONFLICT", `CHANGE_CONFLICT: Work ${work.workId} matches multiple remote issues: ${[...matches.keys()].join(", ")}.`, 4);
	const match = [...matches.values()][0] ?? null;
	if (match) {
		const owner = claimed.get(match.number);
		if (owner && owner !== work.workId) throw new CodepatrolError("CHANGE_CONFLICT", `CHANGE_CONFLICT: remote issue #${match.number} is claimed by both ${owner} and ${work.workId}.`, 4);
		if (work.issue && work.issue.number !== match.number) throw new CodepatrolError("CHANGE_CONFLICT", `CHANGE_CONFLICT: Work ${work.workId} stores issue #${work.issue.number} but matches #${match.number}.`, 4);
	}
	return match;
}

export async function syncIssues(workspace: string, changes: ChangeView[], options: IssueSyncOptions = {}): Promise<IssueSyncResult> {
	const gh = ghFor(workspace, options);
	const signal = options.signal;
	const dryRun = options.dryRun ?? false;

	await gh.assertAvailable(signal);
	const issues = await gh.listIssues(signal);
	const works = listWork(workspace);
	const changesByWorkId = new Map(changes.map((change) => [change.identity.work_id, change]));

	const claimed = new Map<number, string>();
	const actions: Action[] = [];
	for (const work of works) {
		const status = effectiveStatus(work, changesByWorkId);
		const issue = matchIssue(work, issues, claimed);
		if (!issue) {
			actions.push({ kind: "create", work, status });
			continue;
		}
		claimed.set(issue.number, work.workId);
		const canonicalTitle = formatIssueTitle(work);
		const canonicalBody = formatIssueBody(work);
		if (!work.issue || work.issue.number !== issue.number) {
			actions.push({ kind: "link", work, issue, status });
		}
		if (issue.title !== canonicalTitle || issue.body !== canonicalBody) {
			actions.push({ kind: "edit", work, issue, status });
		}
		if (status === "open" && issue.state === "closed") {
			actions.push({ kind: "reopen", work, issue, status });
		} else if (status !== "open" && issue.state === "open") {
			actions.push({ kind: "close", work, issue, status });
		}
		if (!actions.some((action) => action.work.workId === work.workId)) actions.push({ kind: "unchanged", work, issue, status });
	}

	const result: IssueSyncResult = { created: [], edited: [], reopened: [], closed: [], linked: [], unchanged: [], dryRun };
	const priorityRank = (work: WorkItem) => PRIORITY_ORDER.indexOf(work.priority);
	const ordered = actions.slice().sort((a, b) => priorityRank(a.work) - priorityRank(b.work) || a.work.workId.localeCompare(b.work.workId));

	if (!dryRun && ordered.some((action) => action.kind === "create")) await gh.ensureLabel(LABEL, signal);

	const localUpdates = new Map<string, WorkIssueRef>();
	for (const action of ordered) {
		const { work } = action;
		switch (action.kind) {
			case "create": {
				result.created.push(work.workId);
				if (dryRun) break;
				const created = await gh.createIssue(formatIssueTitle(work), formatIssueBody(work), LABEL, signal);
				if (action.status !== "open") await gh.closeIssue(created.number, action.status === "done" ? "completed" : "not planned", signal);
				localUpdates.set(work.workId, { number: created.number, url: created.url });
				break;
			}
			case "link": {
				result.linked.push(work.workId);
				if (!dryRun) localUpdates.set(work.workId, { number: action.issue.number, url: action.issue.url });
				break;
			}
			case "edit": {
				result.edited.push(work.workId);
				if (!dryRun) await gh.editIssue(action.issue.number, { title: formatIssueTitle(work), body: formatIssueBody(work) }, signal);
				break;
			}
			case "reopen": {
				result.reopened.push(work.workId);
				if (!dryRun) await gh.reopenIssue(action.issue.number, signal);
				break;
			}
			case "close": {
				result.closed.push(work.workId);
				if (!dryRun) await gh.closeIssue(action.issue.number, action.status === "done" ? "completed" : "not planned", signal);
				break;
			}
			case "unchanged": {
				result.unchanged.push(work.workId);
				break;
			}
		}
	}

	if (!dryRun) {
		for (const [workId, issue] of [...localUpdates.entries()].sort(([a], [b]) => a.localeCompare(b))) {
			const current = listWork(workspace).find((work) => work.workId === workId);
			if (current) writeWork(workspace, { ...current, issue });
		}
	}

	for (const key of ["created", "edited", "reopened", "closed", "linked", "unchanged"] as const) result[key].sort();
	return result;
}
