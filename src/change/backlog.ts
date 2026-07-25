import { existsSync, readFileSync } from "node:fs";
import { parse, stringify } from "yaml";
import { atomicWriteFile } from "../shared/atomic-store.js";
import { CodepatrolError } from "../shared/errors.js";
import { resolveInside } from "../shared/workspace.js";

export type BacklogPriority = "p0" | "p1" | "p2" | "p3";
export type BacklogArea = "architecture" | "workflow" | "skills";
export type BacklogStatus = "candidate" | "scheduled" | "done" | "dismissed";
export type BacklogSourceKind = "close-trace" | "plan-followup" | "github-issue";

export interface BacklogSource { kind: BacklogSourceKind; workId?: string }
export interface ExternalRef { provider: "github"; number: number; url: string }
export interface BacklogItem {
	id: string;
	title: string;
	priority: BacklogPriority;
	area: BacklogArea;
	status: BacklogStatus;
	evidence: string[];
	source: BacklogSource;
	externalRef?: ExternalRef;
	workId: string | null;
	count: number;
	firstSeenAt: string;
	lastSeenAt: string;
}
export interface Backlog { schema_version: 1; items: BacklogItem[] }

export const PRIORITY_ORDER: BacklogPriority[] = ["p0", "p1", "p2", "p3"];
const VALID_PRIORITIES = new Set<BacklogPriority>(PRIORITY_ORDER);
const VALID_AREAS = new Set<BacklogArea>(["architecture", "workflow", "skills"]);
const VALID_STATUSES = new Set<BacklogStatus>(["candidate", "scheduled", "done", "dismissed"]);
const VALID_SOURCE_KINDS = new Set<BacklogSourceKind>(["close-trace", "plan-followup", "github-issue"]);

const ALLOWED_ITEM_KEYS = new Set(["id", "title", "priority", "area", "status", "evidence", "source", "externalRef", "workId", "count", "firstSeenAt", "lastSeenAt"]);
const ALLOWED_SOURCE_KEYS = new Set(["kind", "workId"]);
const ALLOWED_EXTERNAL_REF_KEYS = new Set(["provider", "number", "url"]);
const ALLOWED_ROOT_KEYS = new Set(["schema_version", "items"]);

function isPriority(value: unknown): value is BacklogPriority { return typeof value === "string" && VALID_PRIORITIES.has(value as BacklogPriority); }
function isArea(value: unknown): value is BacklogArea { return typeof value === "string" && VALID_AREAS.has(value as BacklogArea); }
function isStatus(value: unknown): value is BacklogStatus { return typeof value === "string" && VALID_STATUSES.has(value as BacklogStatus); }
function isSourceKind(value: unknown): value is BacklogSourceKind { return typeof value === "string" && VALID_SOURCE_KINDS.has(value as BacklogSourceKind); }

export function backlogPath(workspace: string): string {
	return resolveInside(workspace, ".codepatrol/backlog/items.yaml");
}

function validateSource(source: unknown, itemId: string): BacklogSource {
	if (!source || typeof source !== "object" || Array.isArray(source)) throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Backlog item ${itemId} source must be an object.`, 4);
	for (const key of Object.keys(source as Record<string, unknown>)) if (!ALLOWED_SOURCE_KEYS.has(key)) throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Backlog item ${itemId} source contains unknown field ${key}.`, 4);
	const obj = source as Record<string, unknown>;
	if (!isSourceKind(obj.kind)) throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Backlog item ${itemId} source.kind is invalid.`, 4);
	if (obj.kind === "github-issue") {
		if (obj.workId !== undefined) throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Backlog item ${itemId} source.workId must be absent for kind github-issue.`, 4);
		return { kind: "github-issue" };
	}
	if (typeof obj.workId !== "string" || !obj.workId.trim()) throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Backlog item ${itemId} source.workId must be a non-empty string.`, 4);
	return { kind: obj.kind, workId: obj.workId };
}

function validateExternalRef(ref: unknown, itemId: string): ExternalRef | undefined {
	if (ref === undefined) return undefined;
	if (!ref || typeof ref !== "object" || Array.isArray(ref)) throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Backlog item ${itemId} externalRef must be an object.`, 4);
	for (const key of Object.keys(ref as Record<string, unknown>)) if (!ALLOWED_EXTERNAL_REF_KEYS.has(key)) throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Backlog item ${itemId} externalRef contains unknown field ${key}.`, 4);
	const obj = ref as Record<string, unknown>;
	if (obj.provider !== "github") throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Backlog item ${itemId} externalRef.provider must be "github".`, 4);
	if (!Number.isSafeInteger(obj.number) || (obj.number as number) < 1) throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Backlog item ${itemId} externalRef.number must be a positive integer.`, 4);
	if (typeof obj.url !== "string" || !obj.url.trim()) throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Backlog item ${itemId} externalRef.url must be a non-empty string.`, 4);
	return { provider: "github", number: obj.number as number, url: obj.url };
}

function validateItem(raw: unknown, index: number): BacklogItem {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new CodepatrolError("CHANGE_INVALID", `Backlog item at index ${index} must be an object.`, 4);
	for (const key of Object.keys(raw as Record<string, unknown>)) if (!ALLOWED_ITEM_KEYS.has(key)) throw new CodepatrolError("CHANGE_INVALID", `Backlog item at index ${index} contains unknown field ${key}.`, 4);
	const item = raw as Record<string, unknown>;
	if (typeof item.id !== "string" || !item.id.trim()) throw new CodepatrolError("CHANGE_INVALID", `Backlog item at index ${index} id must be a non-empty string.`, 4);
	if (typeof item.title !== "string" || !item.title.trim()) throw new CodepatrolError("CHANGE_INVALID", `Backlog item at index ${index} title must be a non-empty string.`, 4);
	if (!isPriority(item.priority)) throw new CodepatrolError("CHANGE_INVALID", `Backlog item ${item.id} priority is invalid.`, 4);
	if (!isArea(item.area)) throw new CodepatrolError("CHANGE_INVALID", `Backlog item ${item.id} area is invalid.`, 4);
	if (!isStatus(item.status)) throw new CodepatrolError("CHANGE_INVALID", `Backlog item ${item.id} status is invalid.`, 4);
	if (!Array.isArray(item.evidence) || item.evidence.some((entry) => typeof entry !== "string")) throw new CodepatrolError("CHANGE_INVALID", `Backlog item ${item.id} evidence must be an array of strings.`, 4);
	const source = validateSource(item.source, item.id);
	const externalRef = validateExternalRef(item.externalRef, item.id);
	if (item.workId !== null && typeof item.workId !== "string") throw new CodepatrolError("CHANGE_INVALID", `Backlog item ${item.id} workId must be a string or null.`, 4);
	if (!Number.isSafeInteger(item.count) || (item.count as number) < 1) throw new CodepatrolError("CHANGE_INVALID", `Backlog item ${item.id} count must be a positive integer.`, 4);
	if (typeof item.firstSeenAt !== "string" || !Number.isFinite(Date.parse(item.firstSeenAt))) throw new CodepatrolError("CHANGE_INVALID", `Backlog item ${item.id} firstSeenAt must be an ISO timestamp.`, 4);
	if (typeof item.lastSeenAt !== "string" || !Number.isFinite(Date.parse(item.lastSeenAt))) throw new CodepatrolError("CHANGE_INVALID", `Backlog item ${item.id} lastSeenAt must be an ISO timestamp.`, 4);
	return { id: item.id, title: item.title, priority: item.priority, area: item.area, status: item.status, evidence: item.evidence as string[], source, ...(externalRef ? { externalRef } : {}), workId: item.workId as string | null, count: item.count as number, firstSeenAt: item.firstSeenAt, lastSeenAt: item.lastSeenAt };
}

function validate(root: unknown): Backlog {
	if (!root || typeof root !== "object" || Array.isArray(root)) throw new CodepatrolError("CHANGE_INVALID", "CHANGE_INVALID: Backlog root must be an object.", 4);
	for (const key of Object.keys(root as Record<string, unknown>)) if (!ALLOWED_ROOT_KEYS.has(key)) throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Backlog root contains unknown field ${key}.`, 4);
	const obj = root as Record<string, unknown>;
	if (obj.schema_version !== 1) throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Backlog schema_version must be 1, got ${obj.schema_version}.`, 4);
	if (!Array.isArray(obj.items)) throw new CodepatrolError("CHANGE_INVALID", "CHANGE_INVALID: Backlog items must be an array.", 4);
	const items = obj.items.map((entry: unknown, index: number) => validateItem(entry, index));
	return { schema_version: 1, items };
}

export function readBacklog(workspace: string): Backlog {
	const path = backlogPath(workspace);
	if (!existsSync(path)) return { schema_version: 1, items: [] };
	let parsed: unknown;
	try { parsed = parse(readFileSync(path, "utf8")); } catch { throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Cannot parse ${path}.`, 4); }
	return validate(parsed);
}

export function writeBacklog(workspace: string, backlog: Backlog): void {
	const validated = validate(backlog);
	atomicWriteFile(backlogPath(workspace), stringify(validated, { lineWidth: 0 }));
}

export function dedupKey(title: string): string {
	return title.toLowerCase().replace(/\d+/g, "").replace(/[^a-z]+/g, "-").replace(/^-+|-+$/g, "");
}

export function classifyPriority(title: string): BacklogPriority {
	const lower = title.toLowerCase();
	if (/top error code|no orchestrator events/.test(lower)) return "p1";
	if (/returned/.test(lower)) return "p2";
	return "p3";
}

function higherPriority(a: BacklogPriority, b: BacklogPriority): BacklogPriority {
	return PRIORITY_ORDER.indexOf(a) <= PRIORITY_ORDER.indexOf(b) ? a : b;
}

export interface UpsertInput {
	title: string;
	area: BacklogArea;
	priority?: BacklogPriority;
	evidence: string[];
	source: BacklogSource;
}

export function upsertBacklogItem(workspace: string, input: UpsertInput, now: Date = new Date()): BacklogItem {
	if (typeof input.title !== "string" || !input.title.trim()) throw new CodepatrolError("CHANGE_INVALID", "Backlog item title must be a non-empty string.", 4);
	if (!isArea(input.area)) throw new CodepatrolError("CHANGE_INVALID", `Backlog item area must be one of architecture|workflow|skills, got ${input.area}.`, 4);
	if (input.priority !== undefined && !isPriority(input.priority)) throw new CodepatrolError("CHANGE_INVALID", `Backlog item priority must be one of p0|p1|p2|p3, got ${input.priority}.`, 4);
	if (!Array.isArray(input.evidence)) throw new CodepatrolError("CHANGE_INVALID", "Backlog item evidence must be an array of strings.", 4);
	const source = validateSource(input.source, "(input)");
	const current = readBacklog(workspace);
	const iso = now.toISOString();
	const key = dedupKey(input.title);
	const incomingPriority = input.priority ?? classifyPriority(input.title);
	const existing = current.items.find((entry) => dedupKey(entry.title) === key);
	let item: BacklogItem;
	if (existing) {
		const promoted = higherPriority(existing.priority, incomingPriority);
		item = { ...existing, priority: promoted, count: existing.count + 1, lastSeenAt: iso };
	} else {
		item = { id: key, title: input.title, priority: incomingPriority, area: input.area, status: "candidate", evidence: [...input.evidence], source, workId: null, count: 1, firstSeenAt: iso, lastSeenAt: iso };
	}
	const items = current.items.some((entry) => entry.id === item.id) ? current.items.map((entry) => entry.id === item.id ? item : entry) : [...current.items, item];
	writeBacklog(workspace, { schema_version: 1, items });
	return item;
}

export function linkBacklogItem(workspace: string, itemId: string, workId: string, now: Date = new Date()): BacklogItem {
	if (typeof itemId !== "string" || !itemId.trim()) throw new CodepatrolError("CHANGE_INVALID", "Backlog item id must be a non-empty string.", 4);
	if (typeof workId !== "string" || !workId.trim()) throw new CodepatrolError("CHANGE_INVALID", "Backlog item workId must be a non-empty string.", 4);
	const current = readBacklog(workspace);
	const existing = current.items.find((entry) => entry.id === itemId);
	if (!existing) throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Backlog item not found: ${itemId}.`, 4);
	if (existing.status === "done" || existing.status === "dismissed") throw new CodepatrolError("CHANGE_CONFLICT", `CHANGE_CONFLICT: Backlog item ${itemId} cannot be linked from status ${existing.status}.`, 4);
	const updated: BacklogItem = { ...existing, workId, status: "scheduled", lastSeenAt: now.toISOString() };
	const items = current.items.map((entry) => entry.id === itemId ? updated : entry);
	writeBacklog(workspace, { schema_version: 1, items });
	return updated;
}

export interface ListOptions { status?: BacklogStatus; open?: boolean }

export function listBacklog(workspace: string, options: ListOptions = {}): BacklogItem[] {
	const current = readBacklog(workspace);
	const filtered = current.items.filter((entry) => {
		if (options.status && entry.status !== options.status) return false;
		if (options.open && entry.status !== "candidate" && entry.status !== "scheduled") return false;
		return true;
	});
	return filtered.slice().sort((a, b) => {
		const priorityDelta = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
		if (priorityDelta !== 0) return priorityDelta;
		if (a.count !== b.count) return b.count - a.count;
		return b.lastSeenAt.localeCompare(a.lastSeenAt);
	});
}

export function findBacklogItem(workspace: string, itemId: string): BacklogItem | null {
	const current = readBacklog(workspace);
	return current.items.find((entry) => entry.id === itemId) ?? null;
}
