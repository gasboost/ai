import type { MaterializedToolSet, ToolSet } from "@gasboost/tool";

export type AgentProvider = "gemini" | "openai";

export type GeminiAgentModel =
  | (string & {})
  | "gemini-3.8-flash"
  | "gemini-3.5-flash-lite"
  | "gemini-3-flash-preview"
  | "gemini-3-pro-preview"
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-lite"
  | "gemini-2.5-pro";

export type OpenAIAgentModel =
  | (string & {})
  | "gpt-5"
  | "gpt-5-mini"
  | "gpt-5-nano"
  | "gpt-4.1"
  | "gpt-4.1-mini"
  | "gpt-4.1-nano"
  | "gpt-4o"
  | "gpt-4o-mini";

export type AgentToolCall = {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type AgentToolResult = {
  callId: string;
  name: string;
  result: unknown;
};

export type AgentTurn = {
  id: string;
  output?: string;
  calls: AgentToolCall[];
};

export type AgentCallStatus = "pending" | "running" | "success" | "error";

export type AgentCall = {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  status: AgentCallStatus;
  result?: unknown;
  error?: Error;
};

export type AgentRunResult = {
  output: string;
  continuationId: string;
  calls: AgentCall[];
};

export type AgentAdapter = {
  create(input: {
    input: string;
    tools: MaterializedToolSet;
    previousId?: string;
    model?: string;
  }): AgentTurn;

  continue(input: {
    previousId: string;
    tools: MaterializedToolSet;
    results: AgentToolResult[];
    model?: string;
  }): AgentTurn;
};

export type GeminiAgentConfig = {
  provider: "gemini";
  interactions: {
    create(request: unknown): unknown;
  };
  model: GeminiAgentModel;
  systemInstruction?: string;
  generationConfig?: Record<string, unknown>;
  store?: boolean;
};

export type OpenAIAgentConfig = {
  provider: "openai";
  responses: {
    create(request: unknown): unknown;
  };
  model: OpenAIAgentModel;
  instructions?: string;
  reasoning?: Record<string, unknown>;
  text?: Record<string, unknown>;
  truncation?: "auto" | "disabled";
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  store?: boolean;
  strict?: boolean;
};

export type AgentLlmConfig = GeminiAgentConfig | OpenAIAgentConfig;

export type AppsScriptAgentOptions = {
  tools: ToolSet;
  llm: AgentLlmConfig;
  maxSteps?: number;
  onCall?: (call: AgentCall) => void;
};

export type AgentRunOptions = {
  previousId?: string;
  model?: string;
};
