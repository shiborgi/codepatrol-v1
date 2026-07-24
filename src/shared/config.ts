import { readFileSync } from "node:fs";
import { CodepatrolError } from "./errors.js";
import { resolveInside } from "./workspace.js";

export interface ApplyGate { command: string[]; timeoutMs?: number; }
export interface CodepatrolConfig { applyGate?: ApplyGate; }

export function loadConfig(workspace: string): CodepatrolConfig {
	let raw: string;
	try {
		raw = readFileSync(resolveInside(workspace, ".codepatrol/config.json"), "utf8");
	} catch (e: any) {
		if (e && e.code === "ENOENT") return {};
		throw new CodepatrolError("CHANGE_INVALID", `Could not read config.json: ${e.message}`, 4);
	}
	
	let parsed: any;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new CodepatrolError("CHANGE_INVALID", "config.json is not valid JSON.", 4);
	}

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new CodepatrolError("CHANGE_INVALID", "config.json must be an object.", 4);
	
	for (const key of Object.keys(parsed)) {
		if (key !== "applyGate") throw new CodepatrolError("CHANGE_INVALID", `Unknown config key: ${key}`, 4);
	}

	if (parsed.applyGate === undefined) return {};
	
	const gate = parsed.applyGate;
	if (!gate || typeof gate !== "object" || Array.isArray(gate)) throw new CodepatrolError("CHANGE_INVALID", "applyGate must be an object.", 4);
	
	for (const key of Object.keys(gate)) {
		if (key !== "command" && key !== "timeoutMs") throw new CodepatrolError("CHANGE_INVALID", `Unknown applyGate key: ${key}`, 4);
	}
	
	if (!Array.isArray(gate.command) || gate.command.length === 0 || !gate.command.every((s: any) => typeof s === "string" && s.trim() !== "")) {
		throw new CodepatrolError("CHANGE_INVALID", "applyGate.command must be a non-empty array of non-empty strings.", 4);
	}
	
	if (gate.timeoutMs !== undefined) {
		if (typeof gate.timeoutMs !== "number" || !Number.isSafeInteger(gate.timeoutMs) || gate.timeoutMs <= 0) {
			throw new CodepatrolError("CHANGE_INVALID", "applyGate.timeoutMs must be a positive safe integer.", 4);
		}
	}

	return { applyGate: { command: gate.command, timeoutMs: gate.timeoutMs } };
}
