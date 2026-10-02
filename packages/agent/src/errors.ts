export class AgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentError";
  }
}

export class UnknownToolError extends AgentError {
  constructor(toolName: string) {
    super(`Provider requested unknown tool "${toolName}".`);
    this.name = "UnknownToolError";
  }
}

export class HandlerExecutionError extends AgentError {
  constructor(
    public readonly toolName: string,
    public readonly cause: unknown,
  ) {
    super(`Tool "${toolName}" failed during execution.`);
    this.name = "HandlerExecutionError";
  }
}

export class MaxStepsExceededError extends AgentError {
  constructor(maxSteps: number) {
    super(`Agent exceeded maxSteps (${maxSteps}) before producing output.`);
    this.name = "MaxStepsExceededError";
  }
}

export class ProviderResponseError extends AgentError {
  constructor(message: string) {
    super(message);
    this.name = "ProviderResponseError";
  }
}
