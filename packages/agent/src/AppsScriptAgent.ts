import {
  assertMaterializedTools,
  type MaterializedToolSet,
  type ToolDefinition,
  type ToolSet,
} from "@gasboost/tool";
import {
  HandlerExecutionError,
  MaxStepsExceededError,
  ProviderResponseError,
  UnknownToolError,
} from "./errors";
import { GeminiAgentAdapter } from "./GeminiAgentAdapter";
import { OpenAIAgentAdapter } from "./OpenAIAgentAdapter";
import type {
  AgentAdapter,
  AgentCall,
  AgentRunOptions,
  AgentRunResult,
  AgentToolCall,
  AgentToolResult,
  AppsScriptAgentOptions,
} from "./types";

export class AppsScriptAgent {
  private readonly tools: ToolSet;
  private readonly adapter: AgentAdapter;
  private readonly defaultModel: string;
  private readonly maxSteps: number;
  private readonly onCall?: (call: AgentCall) => void;

  constructor(options: AppsScriptAgentOptions) {
    this.tools = options.tools;
    this.adapter =
      options.llm.provider === "gemini"
        ? new GeminiAgentAdapter(options.llm)
        : new OpenAIAgentAdapter(options.llm);
    this.defaultModel = options.llm.model;
    this.maxSteps = options.maxSteps ?? 10;
    this.onCall = options.onCall;
  }

  public async run(
    input: string,
    options: AgentRunOptions = {},
  ): Promise<AgentRunResult> {
    assertMaterializedTools(this.tools);

    const tools = this.tools;
    const model = options.model ?? this.defaultModel;
    const calls: AgentCall[] = [];
    let turn = this.adapter.create({
      input,
      tools,
      previousId: options.previousId,
      model,
    });

    for (let step = 0; step < this.maxSteps; step += 1) {
      if (turn.calls.length === 0) {
        if (turn.output === undefined) {
          throw new ProviderResponseError(
            "Provider returned no tool calls and no textual output.",
          );
        }

        return {
          output: turn.output,
          continuationId: turn.id,
          calls,
        };
      }

      const results = await this.executeCalls(tools, turn.calls, calls);
      turn = this.adapter.continue({
        previousId: turn.id,
        tools,
        results,
        model,
      });
    }

    throw new MaxStepsExceededError(this.maxSteps);
  }

  private async executeCalls(
    tools: MaterializedToolSet,
    toolCalls: AgentToolCall[],
    allCalls: AgentCall[],
  ): Promise<AgentToolResult[]> {
    const results: AgentToolResult[] = [];

    for (const toolCall of toolCalls) {
      const tool = tools[toolCall.name];

      if (!tool) {
        throw new UnknownToolError(toolCall.name);
      }

      const call: AgentCall = {
        callId: toolCall.callId,
        name: toolCall.name,
        arguments: toolCall.arguments,
        status: "pending",
      };
      allCalls.push(call);
      this.emit(call);

      call.status = "running";
      this.emit(call);

      try {
        const result = await invokeTool(tool, toolCall.arguments);
        call.status = "success";
        call.result = result;
        this.emit(call);
        results.push({
          callId: toolCall.callId,
          name: toolCall.name,
          result,
        });
      } catch (error) {
        call.status = "error";
        call.error = normalizeError(error);
        this.emit(call);
        throw new HandlerExecutionError(toolCall.name, error);
      }
    }

    return results;
  }

  private emit(call: AgentCall): void {
    this.onCall?.({ ...call });
  }
}

function invokeTool(
  tool: ToolDefinition,
  input: Record<string, unknown>,
): unknown {
  if (tool.handler.length === 0) {
    return tool.handler();
  }

  return tool.handler(input);
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
