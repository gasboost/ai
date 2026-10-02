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

type CreateOpenAIResponseRequest = {
  model: string;
  input: string | OpenAIResponseInputItem[];
  previous_response_id?: string;
  tools?: ReturnType<typeof toOpenAITools>;
  instructions?: string;
  reasoning?: Record<string, unknown>;
  text?: Record<string, unknown>;
  truncation?: "auto" | "disabled";
  temperature?: number;
  top_p?: number;
  max_output_tokens?: number;
  store?: boolean;
};

type OpenAIResponseInputItem = {
  type: "function_call_output";
  call_id: string;
  output: string;
};

type OpenAIResponse = {
  id: string;
  output?: OpenAIResponseOutputItem[];
};

type OpenAIResponseOutputItem =
  | OpenAIResponseOutputMessage
  | OpenAIResponseFunctionCall
  | {
      type: string;
      [key: string]: unknown;
    };

type OpenAIResponseFunctionCall = {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
};

type OpenAIResponseOutputMessage = {
  type: "message";
  content: OpenAIResponseOutputContent[];
};

type OpenAIResponseOutputContent =
  | {
      type: "output_text";
      text: string;
    }
  | {
      type: string;
      [key: string]: unknown;
    };

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

  private toTurn(response: unknown): AgentTurn {
    const openaiResponse = response as OpenAIResponse;

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

export function toOpenAITools(tools: MaterializedToolSet, strict?: boolean) {
  return Object.entries(tools).map(([name, tool]) => ({
    type: "function" as const,
    name,
    description: tool.description,
    parameters: tool.parameters,
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
