import { resolveInside } from "./workspace.js";

export const STATE_VERSION = 1;

const CHANGES_DIR = ".codepatrol/changes";
const BACKLOG_DIR = ".codepatrol/backlog";
const RUNTIME_DIR = ".codepatrol/runtime";

export function stateRoot(workspace: string): string {
	return resolveInside(workspace, RUNTIME_DIR);
}

export function graphStatePath(workspace: string): string {
	return resolveInside(workspace, `${RUNTIME_DIR}/graph/graph.json`);
}

export function lockPath(workspace: string, name: string): string {
	return resolveInside(workspace, `${RUNTIME_DIR}/locks/${name}.lock`);
}

export function stageSessionPath(workspace: string, workId: string, stage: string, attempt: number): string {
	return resolveInside(workspace, `${RUNTIME_DIR}/sessions/${workId}/${stage}/${attempt}.json`);
}

export function runtimeRelativePrefix(): string {
	return `${RUNTIME_DIR}/`;
}

export function changesRootRelativePath(): string {
	return CHANGES_DIR;
}

export function changeDirectoryRelativePath(workId: string): string {
	return `${CHANGES_DIR}/${workId}`;
}

export function changeRecordRelativePath(workId: string): string {
	return `${CHANGES_DIR}/${workId}/change.yaml`;
}

export function changeStageRelativePrefix(workId: string, stage: string): string {
	return `${CHANGES_DIR}/${workId}/${stage}/`;
}

export function backlogRelativePrefix(): string {
	return `${BACKLOG_DIR}/`;
}

export function backlogRelativePath(): string {
	return `${BACKLOG_DIR}/items.yaml`;
}
