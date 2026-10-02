import type { GeminiInteraction } from "@gasboost/gemini";
import { toolDefine, type MaterializedToolSet } from "@gasboost/tool";
import { describe, expect, it, vi } from "vitest";
import { GeminiAgentAdapter, toGeminiTools } from "./GeminiAgentAdapter";
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

function interaction(
  id: string,
  steps: GeminiInteraction["steps"],
): GeminiInteraction {
  return {
    id,
    object: "interaction",
    status: "completed",
    created: "2026-10-01T00:00:00Z",
    updated: "2026-10-01T00:00:01Z",
    steps,
  };
}

describe("GeminiAgentAdapter", () => {
  it("maps ToolSet to Gemini function declarations", () => {
    expect(toGeminiTools(tools)).toEqual([
      {
        type: "function",
        name: "findUser",
        description: "Finds a user",
        parameters: tools.findUser.parameters,
      },
    ]);
  });

  it("normalizes structured Gemini calls and preserves IDs", () => {
    const interactions = {
      create: vi.fn(() =>
        interaction("interaction_1", [
          {
            type: "function_call",
            id: "call_1",
            name: "findUser",
            arguments: {
              name: "Ada",
            },
          },
          {
            type: "function_call",
            id: "call_2",
            name: "findUser",
            arguments: {
              name: "Grace",
            },
          },
        ]),
      ),
    };
    const adapter = new GeminiAgentAdapter({
      provider: "gemini",
      interactions,
      model: "gemini-3.8-flash",
    });

    const turn = adapter.create({
      input: "Find users",
      tools,
      model: "gemini-3.5-flash-lite",
    });

    expect(turn).toEqual({
      id: "interaction_1",
      calls: [
        {
          callId: "call_1",
          name: "findUser",
          arguments: { name: "Ada" },
        },
        {
          callId: "call_2",
          name: "findUser",
          arguments: { name: "Grace" },
        },
      ],
      output: undefined,
    });
    expect(interactions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-3.5-flash-lite",
        input: "Find users",
        tools: toGeminiTools(tools),
      }),
    );
  });

  it("continues with function_result items and previous interaction ID", () => {
    const interactions = {
      create: vi.fn(() =>
        interaction("interaction_2", [
          {
            type: "model_output",
            content: [{ type: "text", text: "Done" }],
          },
        ]),
      ),
    };
    const adapter = new GeminiAgentAdapter({
      provider: "gemini",
      interactions,
      model: "gemini-3.8-flash",
    });

    const turn = adapter.continue({
      previousId: "interaction_1",
      tools,
      results: [
        {
          callId: "call_1",
          name: "findUser",
          result: { id: "Ada" },
        },
      ],
    });

    expect(turn.output).toBe("Done");
    expect(interactions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        previous_interaction_id: "interaction_1",
        input: [
          {
            type: "function_result",
            call_id: "call_1",
            name: "findUser",
            result: "{\"id\":\"Ada\"}",
          },
        ],
      }),
    );
  });

  it("fails when Gemini omits a call ID or name", () => {
    const interactions = {
      create: vi.fn(() =>
        interaction("interaction_1", [
          {
            type: "function_call",
            name: "findUser",
            arguments: {},
          },
        ]),
      ),
    };
    const adapter = new GeminiAgentAdapter({
      provider: "gemini",
      interactions,
      model: "gemini-3.8-flash",
    });

    expect(() =>
      adapter.create({
        input: "Find",
        tools,
      }),
    ).toThrow(ProviderResponseError);
  });
});
