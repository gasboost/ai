import type { OpenAIResponse } from "@gasboost/openai";
import { toolDefine, type MaterializedToolSet } from "@gasboost/tool";
import { describe, expect, it, vi } from "vitest";
import { OpenAIAgentAdapter, toOpenAITools } from "./OpenAIAgentAdapter";
import { ProviderResponseError } from "./errors";

const tools = toolDefine({
  findUser: {
    description: "Finds a user",
    handler: (input: { name: string }) => input.name,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
}) as MaterializedToolSet;

function response(id: string, output: OpenAIResponse["output"]): OpenAIResponse {
  return {
    id,
    object: "response",
    created_at: 1790838000,
    status: "completed",
    error: null,
    model: "gpt-5",
    output,
  };
}

describe("OpenAIAgentAdapter", () => {
  it("maps ToolSet to OpenAI function tools", () => {
    expect(toOpenAITools(tools, true)).toEqual([
      {
        type: "function",
        name: "findUser",
        description: "Finds a user",
        parameters: tools.findUser.parameters,
        strict: true,
      },
    ]);
  });

  it("parses JSON arguments and preserves call IDs", () => {
    const responses = {
      create: vi.fn(() =>
        response("resp_1", [
          {
            type: "function_call",
            call_id: "call_1",
            name: "findUser",
            arguments: "{\"name\":\"Ada\"}",
          },
        ]),
      ),
    };
    const adapter = new OpenAIAgentAdapter({
      provider: "openai",
      responses,
      model: "gpt-5",
    });

    expect(
      adapter.create({
        input: "Find Ada",
        tools,
      }),
    ).toEqual({
      id: "resp_1",
      output: undefined,
      calls: [
        {
          callId: "call_1",
          name: "findUser",
          arguments: { name: "Ada" },
        },
      ],
    });
  });

  it("fails explicitly for malformed or non-object arguments", () => {
    const malformed = new OpenAIAgentAdapter({
      provider: "openai",
      responses: {
        create: vi.fn(() =>
          response("resp_1", [
            {
              type: "function_call",
              call_id: "call_1",
              name: "findUser",
              arguments: "{",
            },
          ]),
        ),
      },
      model: "gpt-5",
    });

    expect(() => malformed.create({ input: "Find", tools })).toThrow(
      ProviderResponseError,
    );

    const nonObject = new OpenAIAgentAdapter({
      provider: "openai",
      responses: {
        create: vi.fn(() =>
          response("resp_1", [
            {
              type: "function_call",
              call_id: "call_1",
              name: "findUser",
              arguments: "\"Ada\"",
            },
          ]),
        ),
      },
      model: "gpt-5",
    });

    expect(() => nonObject.create({ input: "Find", tools })).toThrow(
      ProviderResponseError,
    );
  });

  it("continues with function_call_output and previous response ID", () => {
    const responses = {
      create: vi.fn(() =>
        response("resp_2", [
          {
            id: "msg_1",
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: "Done",
                annotations: [],
              },
            ],
          },
        ]),
      ),
    };
    const adapter = new OpenAIAgentAdapter({
      provider: "openai",
      responses,
      model: "gpt-5",
    });

    const turn = adapter.continue({
      previousId: "resp_1",
      tools,
      results: [
        {
          callId: "call_1",
          name: "findUser",
          result: { id: "Ada" },
        },
      ],
      model: "gpt-5-mini",
    });

    expect(turn.output).toBe("Done");
    expect(responses.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5-mini",
        previous_response_id: "resp_1",
        input: [
          {
            type: "function_call_output",
            call_id: "call_1",
            output: "{\"id\":\"Ada\"}",
          },
        ],
      }),
    );
  });
});
