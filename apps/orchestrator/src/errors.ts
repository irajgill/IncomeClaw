// Typed error classes for the orchestrator. Per IncomeClaw-Roadmap.md §13
// working agreement #9 — no `throw new Error('...')` in shipped code.

export class OrchestratorError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** /brief input failed Zod validation. */
export class BriefValidationError extends OrchestratorError {
  readonly issues: unknown;
  constructor(issues: unknown) {
    super('brief input failed validation');
    this.issues = issues;
  }
}

/** Thrown when ENABLE_MESH=1 but the worker can't construct (e.g. missing keys). */
export class MeshUnavailableError extends OrchestratorError {}

/** Thrown when a mesh.dispatch call from the worker fails. Original cause attached. */
export class MeshDispatchError extends OrchestratorError {
  readonly taskId: string;
  constructor(taskId: string, cause: unknown) {
    super(`mesh dispatch failed for task ${taskId}`, { cause });
    this.taskId = taskId;
  }
}
