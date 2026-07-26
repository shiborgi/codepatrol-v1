export type ErrorCode =
	| "INVALID_ARGUMENT"
	| "INVALID_WORKSPACE"
	| "GRAPH_NOT_FOUND"
	| "STATE_INCOMPATIBLE"
	| "WIKI_INVALID"
	| "ARTIFACT_INVALID"
	| "CHANGE_INVALID"
	| "CHANGE_DRIFT"
	| "CHANGE_CONFLICT"
	| "CHANGE_NOT_FOUND"
	| "TARGET_ADVANCED"
	| "WORKFLOW_NOT_FOUND"
	| "WORKFLOW_INVALID"
	| "WORKFLOW_CONFLICT"
	| "PUSH_FAILED"
	| "CONSOLIDATION_AFTER_SUBEVENTS"
	| "APPLY_GATE_FAILED"
	| "LOCK_TIMEOUT"
	| "OPERATION_FAILED"
	| "CANCELLED";

export class CodepatrolError extends Error {
	constructor(
		readonly code: ErrorCode,
		message: string,
		readonly exitCode: 2 | 3 | 4 | 5 | 130,
		readonly retryable = false,
		readonly details?: unknown,
	) {
		super(message);
		this.name = "CodepatrolError";
	}
}

export function assertExactKeys(value: object, allowed: readonly string[] | ReadonlySet<string>, label: string, code: ErrorCode = "CHANGE_INVALID", exitCode: 2 | 4 = 4): void {
	const isAllowed = (key: string) => Array.isArray(allowed) ? allowed.includes(key) : (allowed as ReadonlySet<string>).has(key);
	for (const key of Object.keys(value)) if (!isAllowed(key)) throw new CodepatrolError(code, `${label} contains unknown field ${key}.`, exitCode);
}

export function operationalError(error: unknown): CodepatrolError {
	if (error instanceof CodepatrolError) return error;
	if (error instanceof Error && error.name === "AbortError") {
		return new CodepatrolError("CANCELLED", "Operation cancelled.", 130, true);
	}
	const message = error instanceof Error ? error.message : String(error);
	return new CodepatrolError("OPERATION_FAILED", message, 5, true);
}
