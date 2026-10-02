import type {
  CreateOpenAIResponseRequest,
  OpenAIResponse,
  OpenAIResponseFunctionCall,
  OpenAIResponseOutputMessage,
  OpenAIResponseFunctionTool,
} from "@gasboost/openai";
import type { MaterializedToolSet } from "@gasboost/tool";
import { ProviderResponseError } from "./errors";
import { isRecord, serializeToolResult } from "./serialization";
import type {
  AgentAdapter,
  AgentToolCall,
  AgentToolResult,
  AgentTurn,
  OpenAIAgentConfig,
} from "./types";

export class OpenAIAgentAdapter implements AgentAdapter {
  constructor(private readonly config: OpenAIAgentConfig) {}

  public create(input: {
    input: string;
    tools: MaterializedToolSet;
    previousId?: string;
    model?: string;
  }): AgentTurn {
    return this.toTurn(
      this.config.responses.create({
        model: input.model ?? this.config.model,
        input: input.input,
        previous_response_id: input.previousId,
        tools: toOpenAITools(input.tools, this.config.strict),
        instructions: this.config.instructions,
        reasoning: this.config.reasoning,
        text: this.config.text,
        truncation: this.config.truncation,
        temperature: this.config.temperature,
        top_p: this.config.topP,
        max_output_tokens: this.config.maxOutputTokens,
        store: this.config.store,
      } satisfies CreateOpenAIResponseRequest),
    );
  }

  public continue(input: {
    previousId: string;
    tools: MaterializedToolSet;
    results: AgentToolResult[];
    model?: string;
  }): AgentTurn {
    return this.toTurn(
      this.config.responses.create({
        model: input.model ?? this.config.model,
        previous_response_id: input.previousId,
        input: input.results.map((result) => ({
          type: "function_call_output",
          call_id: result.callId,
          output: serializeToolResult(result.result),
        })),
        tools: toOpenAITools(input.tools, this.config.strict),
        instructions: this.config.instructions,
        reasoning: this.config.reasoning,
        text: this.config.text,
        truncation: this.config.truncation,
        temperature: this.config.temperature,
        top_p: this.config.topP,
        max_output_tokens: this.config.maxOutputTokens,
        store: this.config.store,
      } satisfies CreateOpenAIResponseRequest),
    );
  }

  private toTurn(openaiResponse: OpenAIResponse): AgentTurn {
    if (!openaiResponse.id) {
      throw new ProviderResponseError("OpenAI response is missing id.");
    }

    const calls = (openaiResponse.output ?? [])
      .filter(
        (item): item is OpenAIResponseFunctionCall =>
          item.type === "function_call",
      )
      .map((item) => toAgentToolCall(item));

    return {
      id: openaiResponse.id,
      output: calls.length > 0 ? undefined : collectOpenAIOutput(openaiResponse),
      calls,
    };
  }
}

export function toOpenAITools(
  tools: MaterializedToolSet,
  strict?: boolean,
): OpenAIResponseFunctionTool[] {
  return Object.entries(tools).map(([name, tool]) => ({
    type: "function" as const,
    name,
    description: tool.description,
    // Provider DTOs require mutable arrays; serialize the readonly tool schema.
    parameters: JSON.parse(JSON.stringify(tool.parameters)),
    strict,
  }));
}

function toAgentToolCall(item: OpenAIResponseFunctionCall): AgentToolCall {
  let parsed: unknown;

  try {
    parsed = JSON.parse(item.arguments);
  } catch {
    throw new ProviderResponseError(
      `OpenAI function_call "${item.call_id}" has malformed JSON arguments.`,
    );
  }

  if (!isRecord(parsed)) {
    throw new ProviderResponseError(
      `OpenAI function_call "${item.call_id}" arguments must be a JSON object.`,
    );
  }

  return {
    callId: item.call_id,
    name: item.name,
    arguments: parsed,
  };
}

function collectOpenAIOutput(response: OpenAIResponse): string | undefined {
  const text = (response.output ?? [])
    .filter(
      (item): item is OpenAIResponseOutputMessage => item.type === "message",
    )
    .flatMap((message) => message.content)
    .filter((content) => content.type === "output_text")
    .map((content) => content.text)
    .join("");

  return text.length > 0 ? text : undefined;
}
