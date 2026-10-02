import { toolDefine } from "@gasboost/tool";
import { describe, expect, it, vi } from "vitest";
import { AppsScriptAgent } from "./AppsScriptAgent";
import {
  HandlerExecutionError,
  MaxStepsExceededError,
  UnknownToolError,
} from "./errors";

type FakeResponses = {
  create: ReturnType<typeof vi.fn<(request: Record<string, unknown>) => unknown>>;
};

const parameters = {
  type: "object",
  properties: {
    name: { type: "string" },
  },
  required: ["name"],
  additionalProperties: false,
} as const;

function createOpenAIResponse(id: string, output: unknown[]) {
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

describe("AppsScriptAgent", () => {
  it("returns a direct OpenAI answer with no tool calls", async () => {
    const responses: FakeResponses = {
      create: vi.fn(() =>
        createOpenAIResponse("resp_1", [
          {
            id: "msg_1",
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: "Hello",
                annotations: [],
              },
            ],
          },
        ]),
      ),
    };

    const agent = new AppsScriptAgent({
      tools: toolDefine({}),
      llm: {
        provider: "openai",
        responses,
        model: "gpt-5",
      },
    });

    await expect(agent.run("Hi")).resolves.toEqual({
      output: "Hello",
      continuationId: "resp_1",
      calls: [],
    });
  });

  it("executes one tool call and continues to final output", async () => {
    const responses: FakeResponses = {
      create: vi
        .fn()
        .mockReturnValueOnce(
          createOpenAIResponse("resp_1", [
            {
              type: "function_call",
              call_id: "call_1",
              name: "findUser",
              arguments: "{\"name\":\"Ada\"}",
            },
          ]),
        )
        .mockReturnValueOnce(
          createOpenAIResponse("resp_2", [
            {
              id: "msg_1",
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: "Ada found",
                  annotations: [],
                },
              ],
            },
          ]),
        ),
    };

    const tools = toolDefine({
      findUser: {
        description: "Finds a user",
        handler: (input: { name: string }) => ({ id: input.name }),
        parameters,
      },
    });

    const agent = new AppsScriptAgent({
      tools,
      llm: {
        provider: "openai",
        responses,
        model: "gpt-5",
      },
    });

    const result = await agent.run("Find Ada");

    expect(result.output).toBe("Ada found");
    expect(result.continuationId).toBe("resp_2");
    expect(result.calls).toMatchObject([
      {
        callId: "call_1",
        name: "findUser",
        arguments: { name: "Ada" },
        status: "success",
        result: { id: "Ada" },
      },
    ]);
    expect(responses.create.mock.calls[1]?.[0]).toMatchObject({
      previous_response_id: "resp_1",
      input: [
        {
          type: "function_call_output",
          call_id: "call_1",
          output: "{\"id\":\"Ada\"}",
        },
      ],
    });
  });

  it("executes multiple calls from one turn and preserves call IDs", async () => {
    const responses: FakeResponses = {
      create: vi
        .fn()
        .mockReturnValueOnce(
          createOpenAIResponse("resp_1", [
            {
              type: "function_call",
              call_id: "call_a",
              name: "findUser",
              arguments: "{\"name\":\"Ada\"}",
            },
            {
              type: "function_call",
              call_id: "call_g",
              name: "findUser",
              arguments: "{\"name\":\"Grace\"}",
            },
          ]),
        )
        .mockReturnValueOnce(
          createOpenAIResponse("resp_2", [
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
    const tools = toolDefine({
      findUser: {
        description: "Finds a user",
        handler: (input: { name: string }) => input.name.toUpperCase(),
        parameters,
      },
    });

    const agent = new AppsScriptAgent({
      tools,
      llm: {
        provider: "openai",
        responses,
        model: "gpt-5",
      },
    });

    await agent.run("Find users");

    expect(responses.create.mock.calls[1]?.[0].input).toEqual([
      {
        type: "function_call_output",
        call_id: "call_a",
        output: "ADA",
      },
      {
        type: "function_call_output",
        call_id: "call_g",
        output: "GRACE",
      },
    ]);
  });

  it("supports multiple sequential tool-call turns", async () => {
    const responses: FakeResponses = {
      create: vi
        .fn()
        .mockReturnValueOnce(
          createOpenAIResponse("resp_1", [
            {
              type: "function_call",
              call_id: "call_1",
              name: "findUser",
              arguments: "{\"name\":\"Ada\"}",
            },
          ]),
        )
        .mockReturnValueOnce(
          createOpenAIResponse("resp_2", [
            {
              type: "function_call",
              call_id: "call_2",
              name: "findUser",
              arguments: "{\"name\":\"Grace\"}",
            },
          ]),
        )
        .mockReturnValueOnce(
          createOpenAIResponse("resp_3", [
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
    const tools = toolDefine({
      findUser: {
        description: "Finds a user",
        handler: (input: { name: string }) => input.name,
        parameters,
      },
    });

    const agent = new AppsScriptAgent({
      tools,
      llm: {
        provider: "openai",
        responses,
        model: "gpt-5",
      },
    });

    const result = await agent.run("Find users");

    expect(result.calls).toHaveLength(2);
    expect(responses.create).toHaveBeenCalledTimes(3);
    expect(responses.create.mock.calls[2]?.[0].previous_response_id).toBe(
      "resp_2",
    );
  });

  it("supports zero-argument and Promise-returning handlers", async () => {
    const responses: FakeResponses = {
      create: vi
        .fn()
        .mockReturnValueOnce(
          createOpenAIResponse("resp_1", [
            {
              type: "function_call",
              call_id: "call_1",
              name: "ping",
              arguments: "{}",
            },
          ]),
        )
        .mockReturnValueOnce(
          createOpenAIResponse("resp_2", [
            {
              id: "msg_1",
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: "pong",
                  annotations: [],
                },
              ],
            },
          ]),
        ),
    };
    const tools = toolDefine({
      ping: {
        description: "Ping",
        handler: async () => "pong",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    });

    const agent = new AppsScriptAgent({
      tools,
      llm: {
        provider: "openai",
        responses,
        model: "gpt-5",
      },
    });

    await agent.run("Ping");

    const continueRequest = responses.create.mock.calls[1]?.[0] as {
      input: Record<string, unknown>[];
    };

    expect(continueRequest.input[0]).toMatchObject({
      output: "pong",
    });
  });

  it("passes constructor default model, per-run model override, and continuation", async () => {
    const responses: FakeResponses = {
      create: vi.fn(() =>
        createOpenAIResponse("resp_1", [
          {
            id: "msg_1",
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: "ok",
                annotations: [],
              },
            ],
          },
        ]),
      ),
    };
    const agent = new AppsScriptAgent({
      tools: toolDefine({}),
      llm: {
        provider: "openai",
        responses,
        model: "gpt-5",
      },
    });

    await agent.run("Hi");
    await agent.run("Again", {
      previousId: "resp_previous",
      model: "gpt-5-mini",
    });

    expect(responses.create.mock.calls[0]?.[0]).toMatchObject({
      model: "gpt-5",
    });
    expect(responses.create.mock.calls[1]?.[0]).toMatchObject({
      model: "gpt-5-mini",
      previous_response_id: "resp_previous",
    });
  });

  it("fails on unknown tool names", async () => {
    const responses: FakeResponses = {
      create: vi.fn(() =>
        createOpenAIResponse("resp_1", [
          {
            type: "function_call",
            call_id: "call_1",
            name: "missingTool",
            arguments: "{}",
          },
        ]),
      ),
    };
    const agent = new AppsScriptAgent({
      tools: toolDefine({}),
      llm: {
        provider: "openai",
        responses,
        model: "gpt-5",
      },
    });

    await expect(agent.run("Call missing")).rejects.toThrow(UnknownToolError);
  });

  it("marks handler exceptions as observable errors and fails by default", async () => {
    const responses: FakeResponses = {
      create: vi.fn(() =>
        createOpenAIResponse("resp_1", [
          {
            type: "function_call",
            call_id: "call_1",
            name: "explode",
            arguments: "{}",
          },
        ]),
      ),
    };
    const observed: string[] = [];
    const agent = new AppsScriptAgent({
      tools: toolDefine({
        explode: {
          description: "Explodes",
          handler: () => {
            throw new Error("boom");
          },
          parameters: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
        },
      }),
      llm: {
        provider: "openai",
        responses,
        model: "gpt-5",
      },
      onCall: (call) => observed.push(call.status),
    });

    await expect(agent.run("Explode")).rejects.toThrow(HandlerExecutionError);
    expect(observed).toEqual(["pending", "running", "error"]);
  });

  it("emits pending, running, and success call states", async () => {
    const responses: FakeResponses = {
      create: vi
        .fn()
        .mockReturnValueOnce(
          createOpenAIResponse("resp_1", [
            {
              type: "function_call",
              call_id: "call_1",
              name: "findUser",
              arguments: "{\"name\":\"Ada\"}",
            },
          ]),
        )
        .mockReturnValueOnce(
          createOpenAIResponse("resp_2", [
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
    const observed: string[] = [];
    const agent = new AppsScriptAgent({
      tools: toolDefine({
        findUser: {
          description: "Finds a user",
          handler: (input: { name: string }) => input.name,
          parameters,
        },
      }),
      llm: {
        provider: "openai",
        responses,
        model: "gpt-5",
      },
      onCall: (call) => observed.push(call.status),
    });

    await agent.run("Find Ada");

    expect(observed).toEqual(["pending", "running", "success"]);
  });

  it("fails when materialized parameters are missing", async () => {
    const agent = new AppsScriptAgent({
      tools: toolDefine({
        findUser: {
          description: "Finds a user",
          handler: (input: { name: string }) => input.name,
        },
      }),
      llm: {
        provider: "openai",
        responses: {
          create: vi.fn(),
        },
        model: "gpt-5",
      },
    });

    await expect(agent.run("Find Ada")).rejects.toThrow(
      "missing runtime parameters",
    );
  });

  it("protects the execution loop with maxSteps", async () => {
    const responses: FakeResponses = {
      create: vi.fn(() =>
        createOpenAIResponse("resp_loop", [
          {
            type: "function_call",
            call_id: "call_loop",
            name: "findUser",
            arguments: "{\"name\":\"Ada\"}",
          },
        ]),
      ),
    };
    const agent = new AppsScriptAgent({
      tools: toolDefine({
        findUser: {
          description: "Finds a user",
          handler: (input: { name: string }) => input.name,
          parameters,
        },
      }),
      llm: {
        provider: "openai",
        responses,
        model: "gpt-5",
      },
      maxSteps: 2,
    });

    await expect(agent.run("Loop")).rejects.toThrow(MaxStepsExceededError);
  });
});
