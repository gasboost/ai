import type { MaterializedToolSet } from "@gasboost/tool";
import { ProviderResponseError } from "./errors";
import { serializeToolResult } from "./serialization";
import type {
  AgentAdapter,
  AgentToolCall,
  AgentToolResult,
  AgentTurn,
  GeminiAgentConfig,
} from "./types";

type CreateGeminiInteractionRequest = {
  model?: string;
  input: string | GeminiInteractionStep[];
  previous_interaction_id?: string;
  tools?: ReturnType<typeof toGeminiTools>;
  system_instruction?: string;
  generation_config?: Record<string, unknown>;
  store?: boolean;
};

type GeminiInteraction = {
  id: string;
  steps?: GeminiInteractionStep[];
};

type GeminiInteractionStep =
  | GeminiInteractionFunctionCallStep
  | GeminiInteractionModelOutputStep
  | {
      type: string;
      [key: string]: unknown;
    };

type GeminiInteractionFunctionCallStep = {
  type: "function_call";
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
};

type GeminiInteractionModelOutputStep = {
  type: "model_output";
  content?: GeminiInteractionContent[];
};

type GeminiInteractionContent =
  | {
      type: "text";
      text: string;
    }
  | {
      type: string;
      [key: string]: unknown;
    };

export class GeminiAgentAdapter implements AgentAdapter {
  constructor(private readonly config: GeminiAgentConfig) {}

  public create(input: {
    input: string;
    tools: MaterializedToolSet;
    previousId?: string;
    model?: string;
  }): AgentTurn {
    return this.toTurn(
      this.config.interactions.create({
        model: input.model ?? this.config.model,
        input: input.input,
        previous_interaction_id: input.previousId,
        tools: toGeminiTools(input.tools),
        system_instruction: this.config.systemInstruction,
        generation_config: this.config.generationConfig,
        store: this.config.store,
      } satisfies CreateGeminiInteractionRequest),
    );
  }

  public continue(input: {
    previousId: string;
    tools: MaterializedToolSet;
    results: AgentToolResult[];
    model?: string;
  }): AgentTurn {
    return this.toTurn(
      this.config.interactions.create({
        model: input.model ?? this.config.model,
        previous_interaction_id: input.previousId,
        input: input.results.map((result) => ({
          type: "function_result",
          call_id: result.callId,
          name: result.name,
          result: serializeToolResult(result.result),
        })),
        tools: toGeminiTools(input.tools),
        system_instruction: this.config.systemInstruction,
        generation_config: this.config.generationConfig,
        store: this.config.store,
      } satisfies CreateGeminiInteractionRequest),
    );
  }

  private toTurn(response: unknown): AgentTurn {
    const interaction = response as GeminiInteraction;

    if (!interaction.id) {
      throw new ProviderResponseError("Gemini interaction is missing id.");
    }

    const calls = (interaction.steps ?? [])
      .filter(
        (step): step is GeminiInteractionFunctionCallStep =>
          step.type === "function_call",
      )
      .map((step) => toAgentToolCall(step));

    return {
      id: interaction.id,
      output: calls.length > 0 ? undefined : collectGeminiOutput(interaction),
      calls,
    };
  }
}

export function toGeminiTools(tools: MaterializedToolSet) {
  return Object.entries(tools).map(([name, tool]) => ({
    type: "function" as const,
    name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

function toAgentToolCall(step: GeminiInteractionFunctionCallStep): AgentToolCall {
  if (!step.id) {
    throw new ProviderResponseError("Gemini function_call is missing id.");
  }

  if (!step.name) {
    throw new ProviderResponseError("Gemini function_call is missing name.");
  }

  return {
    callId: step.id,
    name: step.name,
    arguments: step.arguments ?? {},
  };
}

function collectGeminiOutput(interaction: GeminiInteraction): string | undefined {
  const text = (interaction.steps ?? [])
    .filter(
      (step): step is GeminiInteractionModelOutputStep =>
        step.type === "model_output",
    )
    .flatMap((step) => step.content ?? [])
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("");

  return text.length > 0 ? text : undefined;
}
