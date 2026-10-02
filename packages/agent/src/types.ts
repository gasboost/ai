import type {
  CreateGeminiInteractionRequest,
  GeminiInteractionApi,
  GeminiInteractionModel,
} from "@gasboost/gemini";
import type {
  CreateOpenAIResponseRequest,
  OpenAIResponseApi,
  OpenAIResponseModel,
} from "@gasboost/openai";
import type { MaterializedToolSet, ToolSet } from "@gasboost/tool";

export type AgentProvider = "gemini" | "openai";

export type GeminiAgentModel = GeminiInteractionModel;

export type OpenAIAgentModel = OpenAIResponseModel;

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
  interactions: Pick<GeminiInteractionApi, "create">;
  model: GeminiAgentModel;
  systemInstruction?: string;
  generationConfig?: CreateGeminiInteractionRequest["generation_config"];
  store?: boolean;
};

export type OpenAIAgentConfig = {
  provider: "openai";
  responses: Pick<OpenAIResponseApi, "create">;
  model: OpenAIAgentModel;
  instructions?: string;
  reasoning?: CreateOpenAIResponseRequest["reasoning"];
  text?: CreateOpenAIResponseRequest["text"];
  truncation?: CreateOpenAIResponseRequest["truncation"];
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
