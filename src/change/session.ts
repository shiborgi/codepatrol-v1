import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname } from "node:path";
import { atomicWriteJson } from "../shared/atomic-store.js";
import { CodepatrolError, assertExactKeys } from "../shared/errors.js";
import { withWorkspaceLock } from "../shared/lock.js";
import { changeDirectoryRelativePath, changeStageRelativePrefix, stageSessionPath } from "../shared/state.js";
import { resolveInside } from "../shared/workspace.js";
import { foldChange } from "./model.js";
import { readChangeRecord } from "./store.js";
import * as trace from "./trace.js";
import { STAGES, type ChangeRecordV2, type Stage } from "./types.js";

export interface SessionItem { id: string; title: string; status: "open" | "claimed" | "closed"; dependencies: string[]; claim?: { actor: string; at: string }; result?: string; artifacts?: string[] }
export interface StageSession { schema_version: 1; work_id: string; stage: Stage; attempt: number; items: SessionItem[]; next_action: string; updated_at: string }

export interface BlockedItem { id: string; title: string; blockedBy: { id: string; status: SessionItem["status"] | "missing" }[] }
export interface SessionStatusView { ready: SessionItem[]; blocked: BlockedItem[]; claimed: SessionItem[]; closed: SessionItem[] }

const forbidden = new Set(["lifecycle", "revision", "approval", "terminal", "conversation", "messages", "transcript"]);

function validate(session: StageSession): void {
	const keys = new Set(["schema_version", "work_id", "stage", "attempt", "items", "next_action", "updated_at"]);
	for (const key of Object.keys(session)) {
		if (forbidden.has(key)) throw new CodepatrolError("CHANGE_INVALID", `Stage Session cannot own ${key}.`, 4);
		if (!keys.has(key)) throw new CodepatrolError("CHANGE_INVALID", `Stage Session contains unknown field ${key}.`, 4);
	}
	if (session.schema_version !== 1 || !/^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/.test(session.work_id) || !STAGES.includes(session.stage) || !Number.isSafeInteger(session.attempt) || session.attempt < 1) throw new CodepatrolError("CHANGE_INVALID", "Stage Session identity is invalid.", 4);
	if (!session.next_action?.trim() || !Number.isFinite(Date.parse(session.updated_at)) || !Array.isArray(session.items) || !session.items.length) throw new CodepatrolError("CHANGE_INVALID", "Stage Session content is incomplete.", 4);
	const ids = new Set<string>();
	for (const item of session.items) {
		const allowed = new Set(["id", "title", "status", "dependencies", "claim", "result", "artifacts"]);
		assertExactKeys(item, allowed, `Session item ${item.id ?? "?"}`);
		if (!item.id?.trim() || ids.has(item.id) || !item.title?.trim() || !["open", "claimed", "closed"].includes(item.status) || !Array.isArray(item.dependencies)) throw new CodepatrolError("CHANGE_INVALID", "Stage Session item is invalid or duplicated.", 4);
		ids.add(item.id);
		if (item.result && item.result.length > 4000) throw new CodepatrolError("CHANGE_INVALID", `Session item ${item.id} result exceeds 4000 characters.`, 4);
		for (const path of item.artifacts ?? []) if (!path || path.startsWith("/") || path.split("/").includes("..") || path.length > 500) throw new CodepatrolError("CHANGE_INVALID", `Session item ${item.id} contains an unsafe artifact path.`, 4);
	}
	for (const item of session.items) for (const dependency of item.dependencies) if (!ids.has(dependency) || dependency === item.id) throw new CodepatrolError("CHANGE_INVALID", `Session item ${item.id} has invalid dependency ${dependency}.`, 4);
	const visiting = new Set<string>(); const visited = new Set<string>();
	const visit = (id: string): void => {
		if (visiting.has(id)) throw new CodepatrolError("CHANGE_INVALID", `Stage Session dependency cycle includes ${id}.`, 4);
		if (visited.has(id)) return; visiting.add(id);
		for (const dependency of session.items.find((item) => item.id === id)!.dependencies) visit(dependency);
		visiting.delete(id); visited.add(id);
	};
	for (const id of ids) visit(id);
	if (JSON.stringify(session).length > 256_000) throw new CodepatrolError("CHANGE_INVALID", "Stage Session exceeds 256 KB.", 4);
}
function write(workspace: string, session: StageSession): StageSession { validate(session); atomicWriteJson(stageSessionPath(workspace, session.work_id, session.stage, session.attempt), session); return session; }
interface StageItemTemplate { id: string; title: string; artifact: string; dependencies: string[] }
const STAGE_ITEMS: Partial<Record<Stage, StageItemTemplate[]>> = {
	plan: [
		{ id: "spec", title: "Write the Plan specification", artifact: "plan/spec.md", dependencies: [] },
		{ id: "plan", title: "Write the implementation plan", artifact: "plan/plan.md", dependencies: ["spec"] },
		{ id: "evidence", title: "Record Plan evidence", artifact: "plan/evidence/", dependencies: [] },
	],
	review: [{ id: "report", title: "Write the Review report", artifact: "review/report.md", dependencies: [] }],
	verify: [{ id: "report", title: "Write the Verify report", artifact: "verify/report.md", dependencies: [] }],
};
function staleHashes(record: ChangeRecordV2, stage: Stage, attempt: number): Map<string, Set<string>> {
	const stale = new Map<string, Set<string>>();
	for (const event of record.events) {
		if (event.type !== "stage-checkpointed" || event.stage !== stage || event.attempt === attempt) continue;
		for (const artifact of event.artifacts) {
			const hashes = stale.get(artifact.path) ?? new Set<string>();
			hashes.add(artifact.sha256); stale.set(artifact.path, hashes);
		}
	}
	return stale;
}
function itemIsDelivered(workspace: string, workId: string, stage: Stage, item: { id: string; artifact?: string }, stale: Map<string, Set<string>>): { delivered: boolean; evidence?: string } {
	const changePrefix = `${changeDirectoryRelativePath(workId)}/`;
	const qualifyingFile = (evidencePath: string): string | undefined => {
		const bindingPath = `${changePrefix}${evidencePath}`;
		const absolute = resolveInside(workspace, bindingPath);
		if (!existsSync(absolute) || !lstatSync(absolute).isFile()) return undefined;
		const content = readFileSync(absolute);
		const source = content.toString("utf8");
		if (!source.trim()) return undefined;
		const hash = createHash("sha256").update(content).digest("hex");
		return stale.get(bindingPath)?.has(hash) ? undefined : source;
	};
	if (stage === "apply" && /^T\d+$/.test(item.id)) {
		const source = qualifyingFile("apply/journal.md");
		return source !== undefined && new RegExp(`^### ${item.id}\\b`, "m").test(source)
			? { delivered: true, evidence: `apply/journal.md has ### ${item.id}` }
			: { delivered: false };
	}
	if (item.artifact?.endsWith("/")) {
		const root = resolveInside(workspace, `${changePrefix}${item.artifact.slice(0, -1)}`);
		if (!existsSync(root) || !lstatSync(root).isDirectory()) return { delivered: false };
		const entries = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile()).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
		for (const entry of entries) {
			const evidencePath = `${item.artifact}${entry.name}`;
			if (qualifyingFile(evidencePath) !== undefined) return { delivered: true, evidence: `${evidencePath} present` };
		}
		return { delivered: false };
	}
	if (item.artifact) {
		const prefix = item.artifact.endsWith(".md") ? item.artifact.slice(0, -3) : item.artifact;
		const parent = dirname(prefix); const stem = basename(prefix);
		const root = resolveInside(workspace, `${changePrefix}${parent === "." ? "" : parent}`);
		if (!existsSync(root) || !lstatSync(root).isDirectory()) return { delivered: false };
		const entries = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile() && (entry.name === `${stem}.md` || (entry.name.startsWith(`${stem}-`) && entry.name.endsWith(".md")))).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
		for (const entry of entries) {
			const evidencePath = parent === "." ? entry.name : `${parent}/${entry.name}`;
			if (qualifyingFile(evidencePath) !== undefined) return { delivered: true, evidence: `${evidencePath} present` };
		}
	}
	return { delivered: false };
}
function deriveItems(workspace: string, workId: string, stage: Stage, attempt: number, record: ChangeRecordV2): SessionItem[] {
	const stale = staleHashes(record, stage, attempt);
	const reconcile = (item: { id: string; title: string; dependencies: string[]; artifact?: string }): SessionItem => {
		const delivered = itemIsDelivered(workspace, workId, stage, item, stale);
		const base = { id: item.id, title: item.title, dependencies: [...item.dependencies] };
		return delivered.delivered && delivered.evidence ? { ...base, status: "closed", result: `reconciled: ${delivered.evidence}` } : { ...base, status: "open" };
	};
	const stageItems = STAGE_ITEMS[stage];
	if (stageItems) return stageItems.map(reconcile);
	if (stage !== "apply") return [{ id: `${stage}-work`, title: `Complete ${stage} stage contract`, status: "open", dependencies: [] }];
	const planPath = resolveInside(workspace, `${changeStageRelativePrefix(workId, "plan")}plan.md`);
	if (!existsSync(planPath)) return [{ id: "apply-work", title: "Complete apply stage contract", status: "open", dependencies: [] }];
	const source = readFileSync(planPath, "utf8");
	const matches = [...source.matchAll(/^### (T\d+)\s+[—-]\s+(.+)$/gm)];
	const items = matches.map((match, index): SessionItem => {
		const end = matches[index + 1]?.index ?? source.length;
		const section = source.slice(match.index! + match[0].length, end);
		const dependenciesLine = section.match(/^\*\*Depends on:\*\*\s*(.+)$/m)?.[1] ?? "None";
		const leadingToken = dependenciesLine.trim().split(/\s+/, 1)[0] ?? "";
		const dependencies = /^(none|nothing)[.,;:]?$/i.test(leadingToken) ? [] : [...new Set([...dependenciesLine.matchAll(/\bT\d+\b/g)].map((item) => item[0]).filter((dependency) => dependency !== match[1]))];
		return reconcile({ id: match[1], title: match[2].trim(), dependencies });
	});
	return items.length ? items : [{ id: "apply-work", title: "Complete apply stage contract", status: "open", dependencies: [] }];
}

export function sessionStatus(session: StageSession): SessionStatusView {
	const ready = readySessionItems(session);
	const claimed = session.items.filter(i => i.status === "claimed");
	const closed = session.items.filter(i => i.status === "closed");
	const blocked: BlockedItem[] = [];
	for (const item of session.items) {
		if (item.status === "open" && !ready.some(r => r.id === item.id)) {
			const blockedBy = item.dependencies.map(depId => {
				const depItem = session.items.find(i => i.id === depId);
				return { id: depId, status: depItem ? depItem.status : "missing" as const };
			}).filter(d => d.status !== "closed");
			if (blockedBy.length > 0) blocked.push({ id: item.id, title: item.title, blockedBy });
		}
	}
	return { ready, blocked, claimed, closed };
}

function loadOrDerive(workspace: string, workId: string, stage: Stage, attempt: number, now: Date): { session: StageSession, fromDisk: boolean } {
	const record = readChangeRecord(workspace, workId); const view = foldChange(record);
	if (view.stage !== stage || view.attempt !== attempt || view.state === "terminal") throw new CodepatrolError("CHANGE_CONFLICT", `Session ${stage}/${attempt} is not the current attempt.`, 4);
	const path = stageSessionPath(workspace, workId, stage, attempt);
	if (existsSync(path)) {
		try {
			const session = JSON.parse(readFileSync(path, "utf8")) as StageSession;
			validate(session);
			if (session.work_id === workId && session.stage === stage && session.attempt === attempt) return { session, fromDisk: true };
		} catch { /* Rebuild disposable corruption. */ }
	}
	return { session: { schema_version: 1, work_id: workId, stage, attempt, items: deriveItems(workspace, workId, stage, attempt, record), next_action: view.nextAction ?? `Continue ${stage} for ${workId}.`, updated_at: now.toISOString() }, fromDisk: false };
}

export function readStageSession(workspace: string, workId: string, stage: Stage, attempt: number, now = new Date()): StageSession {
	return loadOrDerive(workspace, workId, stage, attempt, now).session;
}

export function primeStageSession(workspace: string, workId: string, stage: Stage, attempt: number, now = new Date()): StageSession {
	const { session, fromDisk } = loadOrDerive(workspace, workId, stage, attempt, now);
	if (!fromDisk) return write(workspace, session);
	return session;
}

export function readySessionItems(session: StageSession): SessionItem[] { return session.items.filter((item) => item.status === "open" && item.dependencies.every((id) => session.items.find((candidate) => candidate.id === id)?.status === "closed")); }

export async function claimSessionItem(workspace: string, workId: string, stage: Stage, attempt: number, itemId: string, actor: string, now = new Date()): Promise<StageSession> {
	return withWorkspaceLock(workspace, `session-${workId}-${stage}-${attempt}`, "change.session.claim", () => {
		const session = primeStageSession(workspace, workId, stage, attempt, now);
		const item = readySessionItems(session).find((candidate) => candidate.id === itemId);
		if (!item) {
			const existingItem = session.items.find(i => i.id === itemId);
			if (!existingItem) throw new CodepatrolError("CHANGE_CONFLICT", `Session item is not ready: ${itemId} — no such item.`, 4);
			if (existingItem.status === "claimed" || existingItem.status === "closed") throw new CodepatrolError("CHANGE_CONFLICT", `Session item is not ready: ${itemId} — already ${existingItem.status}.`, 4);
			const view = sessionStatus(session);
			const blocked = view.blocked.find(b => b.id === itemId);
			if (blocked) {
				const depsText = blocked.blockedBy.map(d => `${d.id} (${d.status})`).join(", ");
				throw new CodepatrolError("CHANGE_CONFLICT", `Session item is not ready: ${itemId} — blocked by ${depsText}.`, 4);
			}
			throw new CodepatrolError("CHANGE_CONFLICT", `Session item is not ready: ${itemId}.`, 4);
		}
		const at = now.toISOString(); item.status = "claimed"; item.claim = { actor, at }; session.updated_at = at;
		try { trace.append(workspace, workId, { kind: "session", at, stage, attempt, item: itemId, action: "claimed" }); } catch {}
		return write(workspace, session);
	});
}

export async function closeSessionItem(workspace: string, workId: string, stage: Stage, attempt: number, itemId: string, result: string, artifacts: string[] = [], now = new Date()): Promise<StageSession> {
	return withWorkspaceLock(workspace, `session-${workId}-${stage}-${attempt}`, "change.session.close", () => {
		const session = primeStageSession(workspace, workId, stage, attempt, now); const item = session.items.find((candidate) => candidate.id === itemId);
		if (!item || item.status !== "claimed") throw new CodepatrolError("CHANGE_CONFLICT", `Session item is not claimed: ${itemId}.`, 4);
		const at = now.toISOString(); item.status = "closed"; item.result = result.slice(0, 4000); item.artifacts = artifacts; session.updated_at = at;
		try { trace.append(workspace, workId, { kind: "session", at, stage, attempt, item: itemId, action: "closed" }); } catch {}
		return write(workspace, session);
	});
}

export function discardAndRebuildSession(workspace: string, workId: string, stage: Stage, attempt: number, now = new Date()): StageSession {
	const record = readChangeRecord(workspace, workId); const view = foldChange(record);
	if (view.stage !== stage || view.attempt !== attempt || view.state === "terminal") throw new CodepatrolError("CHANGE_CONFLICT", `Session ${stage}/${attempt} is not the current attempt.`, 4);
	return write(workspace, { schema_version: 1, work_id: workId, stage, attempt, items: deriveItems(workspace, workId, stage, attempt, record), next_action: view.nextAction ?? `Continue ${stage}.`, updated_at: now.toISOString() });
}
