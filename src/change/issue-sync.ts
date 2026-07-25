import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CodepatrolError } from "../shared/errors.js";
import { backlogPath, classifyPriority, readBacklog, writeBacklog, type BacklogItem } from "./backlog.js";

const execute = promisify(execFile);

export interface RemoteIssue { number: number; title: string; url: string; state: "open" | "closed" }

export interface GhAdapter {
	assertAvailable(signal?: AbortSignal): Promise<void>;
	listIssues(signal?: AbortSignal): Promise<RemoteIssue[]>;
	ensureLabel(name: string, signal?: AbortSignal): Promise<void>;
	createIssue(title: string, body: string, label: string, signal?: AbortSignal): Promise<RemoteIssue>;
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
		const raw = await this.run(["issue", "list", "--state", "all", "--json", "number,title,state,url", "--limit", "1000"], signal);
		const parsed = JSON.parse(raw) as Array<{ number: number; title: string; url: string; state: string }>;
		return parsed.map((issue) => ({ number: issue.number, title: issue.title, url: issue.url, state: issue.state.toLowerCase() as "open" | "closed" }));
	}

	async ensureLabel(name: string, signal?: AbortSignal): Promise<void> {
		await this.run(["label", "create", name, "--color", "ededed", "--description", "Codepatrol backlog", "--force"], signal);
	}

	async createIssue(title: string, body: string, label: string, signal?: AbortSignal): Promise<RemoteIssue> {
		const url = await this.run(["issue", "create", "--title", title, "--body", body, "--label", label], signal);
		const match = /\/issues\/(\d+)/.exec(url);
		if (!match) throw new CodepatrolError("OPERATION_FAILED", `Could not parse issue number from: ${url}`, 5);
		return { number: Number(match[1]), title, url, state: "open" };
	}

	async closeIssue(number: number, reason: "completed" | "not planned", signal?: AbortSignal): Promise<void> {
		await this.run(["issue", "close", String(number), "--reason", reason], signal);
	}
}

export type SyncDirection = "pull" | "push" | "both";

export interface IssueSyncOptions {
	signal?: AbortSignal;
	now?: Date;
	gh?: GhAdapter;
	dryRun?: boolean;
}

export interface IssueSyncResult {
	pulled: { created: string[]; dismissed: string[]; reopened: string[]; skippedClosed: number };
	pushed: { created: string[]; closed: number[] };
	dryRun: boolean;
}

const LABEL = "codepatrol-backlog";

export function formatIssueBody(item: BacklogItem): string {
	const workIdSuffix = item.source.workId ? ` (${item.source.workId})` : "";
	return `${item.title}\n\n${item.evidence.join("\n")}\n\n---\nPriority: ${item.priority} · Area: ${item.area}\nSource: ${item.source.kind}${workIdSuffix}`;
}

function ghFor(workspace: string, options: IssueSyncOptions): GhAdapter {
	return options.gh ?? new NodeGhAdapter(workspace);
}

export async function syncIssues(workspace: string, direction: SyncDirection, options: IssueSyncOptions = {}): Promise<IssueSyncResult> {
	if (direction !== "pull" && direction !== "push" && direction !== "both") {
		throw new CodepatrolError("INVALID_ARGUMENT", `INVALID_ARGUMENT: issues sync --direction must be one of pull|push|both, got ${direction}.`, 2);
	}
	const gh = ghFor(workspace, options);
	const signal = options.signal;
	const nowIso = (options.now ?? new Date()).toISOString();
	const dryRun = options.dryRun ?? false;

	await gh.assertAvailable(signal);
	const issues = await gh.listIssues(signal);

	const pulled: IssueSyncResult["pulled"] = { created: [], dismissed: [], reopened: [], skippedClosed: 0 };
	const pushed: IssueSyncResult["pushed"] = { created: [], closed: [] };

	const doPull = direction === "pull" || direction === "both";
	const doPush = direction === "push" || direction === "both";

	let items = readBacklog(workspace).items;

	if (doPull) {
		items = applyPull(items, issues, nowIso, pulled);
		if (!dryRun) writeBacklog(workspace, { schema_version: 1, items });
	}

	if (doPush) {
		let mutatedByPush = false;
		const toCreate = items.filter((item) => item.status === "candidate" && item.externalRef === undefined);
		if (toCreate.length > 0 && !dryRun) {
			await gh.ensureLabel(LABEL, signal);
		}
		for (const item of toCreate) {
			if (dryRun) {
				pushed.created.push(item.id);
				continue;
			}
			const created = await gh.createIssue(item.title, formatIssueBody(item), LABEL, signal);
			item.externalRef = { provider: "github", number: created.number, url: created.url };
			pushed.created.push(item.id);
			mutatedByPush = true;
		}
		for (const item of items) {
			if ((item.status === "done" || item.status === "dismissed") && item.externalRef) {
				const open = issues.find((issue) => issue.number === item.externalRef!.number && issue.state === "open");
				if (open) {
					if (!dryRun) await gh.closeIssue(open.number, item.status === "done" ? "completed" : "not planned", signal);
					pushed.closed.push(open.number);
				}
			}
		}
		if (mutatedByPush) writeBacklog(workspace, { schema_version: 1, items });
	}

	return { pulled, pushed, dryRun };
}

function applyPull(items: BacklogItem[], issues: RemoteIssue[], nowIso: string, pulled: IssueSyncResult["pulled"]): BacklogItem[] {
	const result = items.map((item) => {
		if (item.externalRef?.provider !== "github") return item;
		const issue = issues.find((entry) => entry.number === item.externalRef!.number);
		if (!issue) return item;
		if (item.status === "candidate" && issue.state === "closed") {
			pulled.dismissed.push(item.id);
			return { ...item, status: "dismissed" as const, title: issue.title, lastSeenAt: nowIso };
		}
		if (item.status === "dismissed" && issue.state === "open") {
			pulled.reopened.push(item.id);
			return { ...item, status: "candidate" as const, title: issue.title, lastSeenAt: nowIso };
		}
		if ((item.status === "scheduled" || item.status === "done") && issue.title !== item.title) {
			return { ...item, title: issue.title, lastSeenAt: nowIso };
		}
		if (issue.title !== item.title) return { ...item, title: issue.title, lastSeenAt: nowIso };
		return item;
	});

	const knownNumbers = new Set(items.filter((item) => item.externalRef?.provider === "github").map((item) => item.externalRef!.number));
	for (const issue of issues) {
		if (issue.state !== "open") { pulled.skippedClosed++; continue; }
		if (knownNumbers.has(issue.number)) continue;
		const id = `gh-issue-${issue.number}`;
		if (result.some((item) => item.id === id)) continue;
		pulled.created.push(id);
		result.push({
			id,
			title: issue.title,
			priority: classifyPriority(issue.title),
			area: "workflow",
			status: "candidate",
			evidence: [issue.url],
			source: { kind: "github-issue" },
			externalRef: { provider: "github", number: issue.number, url: issue.url },
			workId: null,
			count: 1,
			firstSeenAt: nowIso,
			lastSeenAt: nowIso,
		});
	}

	return result;
}
