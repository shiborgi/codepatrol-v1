import { CodepatrolError } from "../shared/errors.js";
import { inspectChanges } from "./orchestrator.js";
import type { GitAdapter } from "./git.js";
import { NodeGitAdapter } from "./git.js";
import type { IssueSyncResult, GhAdapter } from "./issue-sync.js";
import { syncIssues, type SyncDirection } from "./issue-sync.js";

export interface RemoteSyncOptions {
	signal?: AbortSignal;
	git?: GitAdapter;
	gh?: GhAdapter;
	dryRun?: boolean;
	target?: boolean;
	targetBranch?: string;
	branches?: boolean;
	issues?: SyncDirection | false;
	pruneClosed?: boolean;
}

export interface RemoteSyncResult {
	pushedRefs: string[];
	prunedBranches: string[];
	skipped: string[];
	failures: { ref: string; code: string; message: string }[];
	issues?: IssueSyncResult;
	dryRun: boolean;
}

const BRANCH_PREFIX = "refs/heads/codepatrol/";
const TAG_PREFIX = "refs/tags/codepatrol/";

function gitFor(workspace: string, options: RemoteSyncOptions): GitAdapter {
	return options.git ?? new NodeGitAdapter(workspace);
}

function isSafeBranchName(value: string): boolean {
	if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)) return false;
	if (value.includes("..") || value.includes("//") || value.endsWith("/") || value.includes("@{")) return false;
	return true;
}

export async function syncRemote(workspace: string, options: RemoteSyncOptions = {}): Promise<RemoteSyncResult> {
	const git = gitFor(workspace, options);
	const signal = options.signal;
	const dryRun = options.dryRun ?? false;
	const result: RemoteSyncResult = { pushedRefs: [], prunedBranches: [], skipped: [], failures: [], dryRun };

	if (options.target) {
		let branch: string;
		if (options.targetBranch !== undefined) {
			if (!isSafeBranchName(options.targetBranch)) throw new CodepatrolError("INVALID_ARGUMENT", "targetBranch is not a safe Git branch name.", 2);
			branch = options.targetBranch;
		} else {
			const current = await git.currentBranch(signal);
			if (current.startsWith("codepatrol/")) {
				const workId = current.slice("codepatrol/".length);
				const view = (await inspectChanges(workspace, { workId, all: true }, { signal, git }))[0];
				if (!view) throw new CodepatrolError("CHANGE_NOT_FOUND", `Change not found: ${workId}.`, 4);
				branch = view.identity.target_branch;
			} else {
				const views = await inspectChanges(workspace, { all: true }, { signal, git });
				if (!views.some((view) => view.identity.target_branch === current)) {
					throw new CodepatrolError("INVALID_ARGUMENT", `Cannot resolve a target branch from ${current}; pass --target-branch <name>.`, 2);
				}
				branch = current;
			}
		}
		result.pushedRefs.push(branch);
		if (!dryRun) {
			try { await git.push("origin", branch, signal); }
			catch (cause) { const error = cause as { code?: string; message?: string }; result.failures.push({ ref: branch, code: error.code ?? "PUSH_FAILED", message: error.message ?? String(cause) }); }
		}
	}

	if (options.branches) {
		const branches = await git.refs(BRANCH_PREFIX, signal);
		const tags = await git.refs(TAG_PREFIX, signal);
		for (const ref of [...branches, ...tags]) {
			result.pushedRefs.push(ref);
			if (!dryRun) {
				try { await git.push("origin", ref, signal); }
				catch (cause) { const error = cause as { code?: string; message?: string }; result.failures.push({ ref, code: error.code ?? "PUSH_FAILED", message: error.message ?? String(cause) }); }
			}
		}
	}

	if (options.issues !== undefined && options.issues !== false) {
		result.issues = await syncIssues(workspace, options.issues, { signal, dryRun, ...(options.gh ? { gh: options.gh } : {}) });
	}

	if (options.pruneClosed && !dryRun) {
		const views = await inspectChanges(workspace, { all: true }, { signal, git });
		const terminal = new Map<string, string>();
		for (const view of views) {
			if (view.state === "terminal") terminal.set(`codepatrol/${view.identity.work_id}`, view.terminalCommit ?? "");
		}
		for (const ref of result.pushedRefs) {
			if (!ref.startsWith(BRANCH_PREFIX)) continue;
			if (result.failures.some((failure) => failure.ref === ref)) continue;
			if (!terminal.has(ref.slice(BRANCH_PREFIX.length))) continue;
			const expected = terminal.get(ref.slice(BRANCH_PREFIX.length))!;
			try { await git.deleteBranch(ref.slice(BRANCH_PREFIX.length), expected, signal); result.prunedBranches.push(ref); }
			catch (cause) { const error = cause as { code?: string; message?: string }; result.failures.push({ ref, code: error.code ?? "DELETE_FAILED", message: error.message ?? String(cause) }); }
		}
	}

	return result;
}