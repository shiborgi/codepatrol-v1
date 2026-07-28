import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { parse, stringify } from "yaml";
import { atomicWriteFile } from "../shared/atomic-store.js";
import { CodepatrolError, assertExactKeys } from "../shared/errors.js";
import { withWorkspaceLock } from "../shared/lock.js";
import { resolveInside } from "../shared/workspace.js";
import { workRelativePath } from "../shared/state.js";
import type { ChangeView } from "./types.js";

export type WorkPriority = "p0" | "p1" | "p2" | "p3";
export type WorkStatus = "open" | "done" | "dismissed";
export interface WorkIssueRef { number: number; url: string }
export interface WorkItem {
	workId: string;
	priority: WorkPriority;
	description: string;
	status: WorkStatus;
	issue?: WorkIssueRef;
	createdAt: string;
	updatedAt: string;
}
export interface AddWorkInput { workId: string; priority: WorkPriority; description: string }

export const PRIORITY_ORDER: WorkPriority[] = ["p0", "p1", "p2", "p3"];
const VALID_PRIORITIES = new Set<WorkPriority>(PRIORITY_ORDER);
const VALID_STATUSES = new Set<WorkStatus>(["open", "done", "dismissed"]);

const ALLOWED_WORK_KEYS = new Set(["schema_version", "work_id", "priority", "description", "status", "issue", "created_at", "updated_at"]);
const ALLOWED_ISSUE_KEYS = new Set(["number", "url"]);

const LEGACY_RELATIVE_PATH = ".codepatrol/backlog/items.yaml";
const MAX_WORK_ID_LENGTH = 96;

function invalid(message: string): never { throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: ${message}`, 4); }

export function assertWorkId(workId: unknown): asserts workId is string {
	if (typeof workId !== "string" || !/^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/.test(workId)) invalid(`work_id must use YYYY-MM-DD-slug, got ${JSON.stringify(workId)}.`);
}

export function workPath(workspace: string, workId: string): string {
	assertWorkId(workId);
	return resolveInside(workspace, workRelativePath(workId));
}

function legacyPath(workspace: string): string {
	return resolveInside(workspace, LEGACY_RELATIVE_PATH);
}

function assertMigrated(workspace: string): void {
	if (existsSync(legacyPath(workspace))) {
		throw new CodepatrolError("MIGRATION_REQUIRED", `MIGRATION_REQUIRED: legacy backlog ${LEGACY_RELATIVE_PATH} still exists; run \`codepatrol backlog migrate\` before using Work records.`, 4);
	}
}

function iso(value: unknown, label: string): string {
	if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) invalid(`${label} must be an ISO timestamp.`);
	return value;
}

function validateIssue(raw: unknown, workId: string): WorkIssueRef | undefined {
	if (raw === undefined) return undefined;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid(`Work ${workId} issue must be an object.`);
	assertExactKeys(raw as Record<string, unknown>, ALLOWED_ISSUE_KEYS, `CHANGE_INVALID: Work ${workId} issue`);
	const issue = raw as Record<string, unknown>;
	if (!Number.isSafeInteger(issue.number) || (issue.number as number) < 1) invalid(`Work ${workId} issue.number must be a positive integer.`);
	if (typeof issue.url !== "string" || !issue.url.trim()) invalid(`Work ${workId} issue.url must be a non-empty string.`);
	return { number: issue.number as number, url: issue.url };
}

function validateWork(raw: unknown, expectedWorkId?: string): WorkItem {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid("Work record must be an object.");
	assertExactKeys(raw as Record<string, unknown>, ALLOWED_WORK_KEYS, "CHANGE_INVALID: Work record");
	const work = raw as Record<string, unknown>;
	if (work.schema_version !== 1) invalid(`Work schema_version must be 1, got ${JSON.stringify(work.schema_version)}.`);
	assertWorkId(work.work_id);
	if (expectedWorkId !== undefined && work.work_id !== expectedWorkId) invalid(`Work filename ${expectedWorkId} does not match payload work_id ${work.work_id}.`);
	if (!VALID_PRIORITIES.has(work.priority as WorkPriority)) invalid(`Work ${work.work_id} priority must be one of p0|p1|p2|p3.`);
	if (typeof work.description !== "string" || !work.description.trim()) invalid(`Work ${work.work_id} description must be a non-empty string.`);
	if (!VALID_STATUSES.has(work.status as WorkStatus)) invalid(`Work ${work.work_id} status must be one of open|done|dismissed.`);
	const issue = validateIssue(work.issue, work.work_id);
	const createdAt = iso(work.created_at, `Work ${work.work_id} created_at`);
	const updatedAt = iso(work.updated_at, `Work ${work.work_id} updated_at`);
	return { workId: work.work_id, priority: work.priority as WorkPriority, description: work.description, status: work.status as WorkStatus, ...(issue ? { issue } : {}), createdAt, updatedAt };
}

function serialize(work: WorkItem): string {
	return stringify({
		schema_version: 1,
		work_id: work.workId,
		priority: work.priority,
		description: work.description,
		status: work.status,
		...(work.issue ? { issue: { number: work.issue.number, url: work.issue.url } } : {}),
		created_at: work.createdAt,
		updated_at: work.updatedAt,
	}, { lineWidth: 0 });
}

export function readWork(workspace: string, workId: string): WorkItem | null {
	assertMigrated(workspace);
	const path = workPath(workspace, workId);
	if (!existsSync(path)) return null;
	let parsed: unknown;
	try { parsed = parse(readFileSync(path, "utf8")); } catch { throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Cannot parse ${path}.`, 4); }
	return validateWork(parsed, workId);
}

export interface ListWorkOptions { status?: WorkStatus }

export function listWork(workspace: string, options: ListWorkOptions = {}): WorkItem[] {
	assertMigrated(workspace);
	if (options.status !== undefined && !VALID_STATUSES.has(options.status)) invalid(`Work status filter must be one of open|done|dismissed, got ${options.status}.`);
	const dir = resolveInside(workspace, ".codepatrol/work");
	if (!existsSync(dir)) return [];
	const works = readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
		.map((entry) => entry.name.slice(0, -".yaml".length))
		.sort()
		.map((workId) => {
			let parsed: unknown;
			try { parsed = parse(readFileSync(resolveInside(workspace, workRelativePath(workId)), "utf8")); } catch { throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Cannot parse ${workRelativePath(workId)}.`, 4); }
			return validateWork(parsed, workId);
		});
	return works
		.filter((work) => options.status === undefined || work.status === options.status)
		.sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) || a.createdAt.localeCompare(b.createdAt) || a.workId.localeCompare(b.workId));
}

export function writeWork(workspace: string, work: WorkItem): void {
	const validated = validateWork({
		schema_version: 1,
		work_id: work.workId,
		priority: work.priority,
		description: work.description,
		status: work.status,
		...(work.issue ? { issue: work.issue } : {}),
		created_at: work.createdAt,
		updated_at: work.updatedAt,
	}, work.workId);
	atomicWriteFile(workPath(workspace, work.workId), serialize(validated));
}

export async function addWork(workspace: string, input: AddWorkInput, now: Date = new Date()): Promise<WorkItem> {
	assertWorkId(input.workId);
	if (!VALID_PRIORITIES.has(input.priority)) invalid(`Work priority must be one of p0|p1|p2|p3, got ${JSON.stringify(input.priority)}.`);
	if (typeof input.description !== "string" || !input.description.trim()) invalid("Work description must be a non-empty string.");
	return withWorkspaceLock(workspace, `work-${input.workId}`, "backlog.add", () => {
		const existing = readWork(workspace, input.workId);
		if (existing) {
			if (existing.status !== "open" || existing.priority !== input.priority || existing.description !== input.description) {
				throw new CodepatrolError("CHANGE_CONFLICT", `CHANGE_CONFLICT: Work ${input.workId} already exists with different content or status ${existing.status}.`, 4);
			}
			return existing;
		}
		const at = now.toISOString();
		const work: WorkItem = { workId: input.workId, priority: input.priority, description: input.description, status: "open", createdAt: at, updatedAt: at };
		writeWork(workspace, work);
		return work;
	});
}

export async function resolveWork(workspace: string, workId: string, status: "done" | "dismissed", now: Date = new Date()): Promise<WorkItem> {
	assertWorkId(workId);
	return withWorkspaceLock(workspace, `work-${workId}`, "backlog.resolve", () => {
		const existing = readWork(workspace, workId);
		if (!existing) throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Work not found: ${workId}.`, 4);
		if (existing.status !== "open") throw new CodepatrolError("CHANGE_CONFLICT", `CHANGE_CONFLICT: Work ${workId} is already ${existing.status}.`, 4);
		const updated: WorkItem = { ...existing, status, updatedAt: now.toISOString() };
		writeWork(workspace, updated);
		return updated;
	});
}

interface LegacyItem {
	id: string;
	title: string;
	priority: WorkPriority;
	area: string;
	status: "candidate" | "scheduled" | "done" | "dismissed";
	evidence: string[];
	source: { kind: string; workId?: string };
	externalRef?: { number: number; url: string };
	workId: string | null;
	count: number;
	firstSeenAt: string;
	lastSeenAt: string;
}

const ALLOWED_LEGACY_ITEM_KEYS = new Set(["id", "title", "priority", "area", "status", "evidence", "source", "externalRef", "workId", "count", "firstSeenAt", "lastSeenAt"]);
const ALLOWED_LEGACY_SOURCE_KEYS = new Set(["kind", "workId"]);
const ALLOWED_LEGACY_REF_KEYS = new Set(["provider", "number", "url"]);

function validateLegacyItem(raw: unknown, index: number): LegacyItem {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid(`Legacy backlog item at index ${index} must be an object.`);
	assertExactKeys(raw as Record<string, unknown>, ALLOWED_LEGACY_ITEM_KEYS, `CHANGE_INVALID: Legacy backlog item at index ${index}`);
	const item = raw as Record<string, unknown>;
	if (typeof item.id !== "string" || !item.id.trim()) invalid(`Legacy backlog item at index ${index} id must be a non-empty string.`);
	if (typeof item.title !== "string" || !item.title.trim()) invalid(`Legacy backlog item ${item.id} title must be a non-empty string.`);
	if (!VALID_PRIORITIES.has(item.priority as WorkPriority)) invalid(`Legacy backlog item ${item.id} priority is invalid.`);
	if (typeof item.area !== "string" || !item.area.trim()) invalid(`Legacy backlog item ${item.id} area is invalid.`);
	if (!["candidate", "scheduled", "done", "dismissed"].includes(item.status as string)) invalid(`Legacy backlog item ${item.id} status is invalid.`);
	if (!Array.isArray(item.evidence) || item.evidence.some((entry) => typeof entry !== "string")) invalid(`Legacy backlog item ${item.id} evidence must be an array of strings.`);
	if (!item.source || typeof item.source !== "object" || Array.isArray(item.source)) invalid(`Legacy backlog item ${item.id} source must be an object.`);
	assertExactKeys(item.source as Record<string, unknown>, ALLOWED_LEGACY_SOURCE_KEYS, `CHANGE_INVALID: Legacy backlog item ${item.id} source`);
	if (item.externalRef !== undefined) {
		if (!item.externalRef || typeof item.externalRef !== "object" || Array.isArray(item.externalRef)) invalid(`Legacy backlog item ${item.id} externalRef must be an object.`);
		assertExactKeys(item.externalRef as Record<string, unknown>, ALLOWED_LEGACY_REF_KEYS, `CHANGE_INVALID: Legacy backlog item ${item.id} externalRef`);
		const ref = item.externalRef as Record<string, unknown>;
		if (ref.provider !== "github" || !Number.isSafeInteger(ref.number) || typeof ref.url !== "string") invalid(`Legacy backlog item ${item.id} externalRef is invalid.`);
	}
	if (item.workId !== null && typeof item.workId !== "string") invalid(`Legacy backlog item ${item.id} workId must be a string or null.`);
	if (!Number.isSafeInteger(item.count) || (item.count as number) < 1) invalid(`Legacy backlog item ${item.id} count must be a positive integer.`);
	iso(item.firstSeenAt, `Legacy backlog item ${item.id} firstSeenAt`);
	iso(item.lastSeenAt, `Legacy backlog item ${item.id} lastSeenAt`);
	return item as unknown as LegacyItem;
}

function readLegacy(workspace: string): LegacyItem[] {
	const path = legacyPath(workspace);
	let parsed: unknown;
	try { parsed = parse(readFileSync(path, "utf8")); } catch { throw new CodepatrolError("CHANGE_INVALID", `CHANGE_INVALID: Cannot parse ${path}.`, 4); }
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) invalid("Legacy backlog root must be an object.");
	assertExactKeys(parsed as Record<string, unknown>, new Set(["schema_version", "items"]), "CHANGE_INVALID: Legacy backlog root");
	const root = parsed as Record<string, unknown>;
	if (root.schema_version !== 1) invalid(`Legacy backlog schema_version must be 1, got ${JSON.stringify(root.schema_version)}.`);
	if (!Array.isArray(root.items)) invalid("Legacy backlog items must be an array.");
	return root.items.map((entry: unknown, index: number) => validateLegacyItem(entry, index));
}

function isValidWorkId(value: string): boolean {
	return /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/.test(value);
}

function normalizeSlug(value: string): string {
	const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	return slug || "item";
}

function hashSuffix(seed: string): string {
	return createHash("sha256").update(seed).digest("hex").slice(0, 8);
}

function capWorkId(derived: string): string {
	if (derived.length <= MAX_WORK_ID_LENGTH) return derived;
	const suffix = hashSuffix(derived);
	const base = derived.slice(0, MAX_WORK_ID_LENGTH - suffix.length - 1).replace(/-+$/g, "");
	return `${base}-${suffix}`;
}

function legacyDescription(item: LegacyItem): string {
	const lines = [
		item.title,
		"",
		`- Area: ${item.area}`,
		`- Source: ${item.source.kind}${item.source.workId ? ` (${item.source.workId})` : ""}`,
		`- Occurrences: ${item.count}`,
		`- Legacy id: ${item.id}`,
		"",
		"## Evidence",
		"",
		...(item.evidence.length ? item.evidence.map((entry) => `- ${entry}`) : ["- (none)"]),
	];
	return lines.join("\n");
}

export interface MigrationResult { created: string[]; removedLegacy: boolean; dryRun: boolean }

export async function migrateLegacyBacklog(workspace: string, changes: ChangeView[], options: { dryRun?: boolean; signal?: AbortSignal } = {}): Promise<MigrationResult> {
	const dryRun = options.dryRun ?? false;
	return withWorkspaceLock(workspace, "work-migration", "backlog.migrate", () => {
		if (!existsSync(legacyPath(workspace))) return { created: [], removedLegacy: false, dryRun };
		const items = readLegacy(workspace);
		const byWorkId = new Map<string, ChangeView>();
		for (const change of changes) byWorkId.set(change.identity.work_id, change);
		const outputs = new Map<string, WorkItem>();
		for (const item of items) {
			const reused = item.workId !== null && isValidWorkId(item.workId) ? item.workId : null;
			let workId: string;
			if (reused && !outputs.has(reused)) {
				workId = reused;
			} else if (reused) {
				throw new CodepatrolError("CHANGE_CONFLICT", `CHANGE_CONFLICT: two legacy items reuse work id ${reused}.`, 4);
			} else {
				const derived = `${item.firstSeenAt.slice(0, 10)}-${normalizeSlug(item.id)}`;
				workId = capWorkId(derived);
				if (outputs.has(workId)) workId = capWorkId(`${derived}-${hashSuffix(workId)}`);
				if (outputs.has(workId)) throw new CodepatrolError("CHANGE_CONFLICT", `CHANGE_CONFLICT: migration cannot derive a unique work id for legacy item ${item.id}.`, 4);
			}
			const change = byWorkId.get(workId);
			const status: WorkStatus = change?.outcome === "committed" ? "done" : change?.outcome === "rolled-back" ? "dismissed" : (item.status === "candidate" || item.status === "scheduled" ? "open" : item.status);
			outputs.set(workId, {
				workId,
				priority: item.priority,
				description: legacyDescription(item),
				status,
				...(item.externalRef ? { issue: { number: item.externalRef.number, url: item.externalRef.url } } : {}),
				createdAt: item.firstSeenAt,
				updatedAt: item.lastSeenAt,
			});
		}
		for (const change of changes) {
			if (outputs.has(change.identity.work_id)) continue;
			outputs.set(change.identity.work_id, {
				workId: change.identity.work_id,
				priority: "p2",
				description: change.identity.title,
				status: change.outcome === "committed" ? "done" : change.outcome === "rolled-back" ? "dismissed" : "open",
				createdAt: change.identity.created_at,
				updatedAt: change.identity.created_at,
			});
		}
		const ordered = [...outputs.values()].sort((a, b) => a.workId.localeCompare(b.workId));
		const rendered = ordered.map((work) => ({ work, relative: workRelativePath(work.workId), content: serialize(work) }));
		const paths = new Set<string>();
		for (const entry of rendered) {
			if (paths.has(entry.relative)) throw new CodepatrolError("CHANGE_CONFLICT", `CHANGE_CONFLICT: migration produced duplicate path ${entry.relative}.`, 4);
			paths.add(entry.relative);
		}
		if (dryRun) {
			const created = rendered.filter((entry) => {
				const absolute = resolveInside(workspace, entry.relative);
				return !existsSync(absolute) || readFileSync(absolute, "utf8") !== entry.content;
			}).map((entry) => entry.relative);
			return { created, removedLegacy: false, dryRun };
		}
		const created: string[] = [];
		for (const entry of rendered) {
			const absolute = resolveInside(workspace, entry.relative);
			if (existsSync(absolute)) {
				const current = readFileSync(absolute, "utf8");
				if (current === entry.content) continue;
				throw new CodepatrolError("CHANGE_CONFLICT", `CHANGE_CONFLICT: migration output ${entry.relative} already exists with different content; refusing to overwrite.`, 4);
			}
		}
		for (const entry of rendered) {
			const absolute = resolveInside(workspace, entry.relative);
			if (existsSync(absolute)) continue;
			atomicWriteFile(absolute, entry.content);
			created.push(entry.relative);
		}
		for (const entry of rendered) validateWork(parse(readFileSync(resolveInside(workspace, entry.relative), "utf8")), entry.work.workId);
		rmSync(legacyPath(workspace), { force: true });
		return { created, removedLegacy: true, dryRun };
	}, { signal: options.signal });
}
