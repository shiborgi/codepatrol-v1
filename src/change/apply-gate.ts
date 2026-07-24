import { execFile } from "node:child_process";
import { CodepatrolError } from "../shared/errors.js";
import type { ApplyGate } from "../shared/config.js";

export interface GateRunResult { exitCode: number; output: string; elapsedMs: number; }
export type GateRunner = (gate: ApplyGate, workspace: string, signal?: AbortSignal) => Promise<GateRunResult>;

export const defaultGateRunner: GateRunner = async (gate, workspace, signal) => {
	const timeout = gate.timeoutMs ?? 600000;
	const start = Date.now();
	return new Promise((resolve, reject) => {
		execFile(gate.command[0], gate.command.slice(1), {
			cwd: workspace,
			timeout,
			maxBuffer: 8 * 1024 * 1024,
			signal,
			encoding: "utf8"
		}, (error, stdout, stderr) => {
			const elapsedMs = Date.now() - start;
			if (error && error.name === "AbortError") {
				reject(new CodepatrolError("CANCELLED", "Operation cancelled.", 130, true));
				return;
			}
			const output = (stdout || "") + (stderr || "");
			if (error) {
				const exitCode = (error as any).code ?? 1;
				resolve({ exitCode: typeof exitCode === "number" ? exitCode : 1, output, elapsedMs });
			} else {
				resolve({ exitCode: 0, output, elapsedMs });
			}
		});
	});
};

export function gateOutputTail(output: string, limit = 2000): string {
	if (output.length <= limit) return output;
	return "... (truncated) ...\n" + output.slice(-limit);
}
