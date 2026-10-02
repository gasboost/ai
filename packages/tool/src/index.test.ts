import { describe, expect, expectTypeOf, it } from "vitest";
import {
  assertMaterializedTools,
  MissingToolParametersError,
  toolDefine,
  type InferToolInput,
  type InferToolResult,
  type JsonSchema,
} from "./index";

describe("toolDefine", () => {
  it("preserves record keys as tool names and handler inference", () => {
    const findUser = (input: { name: string; active?: boolean }) => ({
      id: input.name,
    });

    const tools = toolDefine({
      findUser: {
        description: "Finds a user",
        handler: findUser,
      },
    });

    expect(Object.keys(tools)).toEqual(["findUser"]);
    expect(tools.findUser.handler({ name: "Ada" })).toEqual({ id: "Ada" });
    expectTypeOf(tools.findUser.handler).toEqualTypeOf<typeof findUser>();
  });

  it("infers input and awaited result types from the handler", async () => {
    const handler = async (input: { customerId: string }) => ({
      paid: input.customerId === "1",
    });

    type Input = InferToolInput<typeof handler>;
    type Result = InferToolResult<typeof handler>;

    expectTypeOf<Input>().toEqualTypeOf<{ customerId: string }>();
    expectTypeOf<Result>().toEqualTypeOf<{ paid: boolean }>();
    await expect(handler({ customerId: "1" })).resolves.toEqual({
      paid: true,
    });
  });

  it("uses a provider-neutral schema type and materialization guard", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
      anyOf: [{ $ref: "#/$defs/input" }],
      $defs: {
        input: {
          type: "object",
        },
      },
    };

    const tools = toolDefine({
      read: {
        description: "Read",
        handler: (input: { id: string }) => input.id,
        parameters: schema,
      },
    });

    expect(() => assertMaterializedTools(tools)).not.toThrow();
  });

  it("fails clearly when build-time schema materialization is missing", () => {
    const tools = toolDefine({
      read: {
        description: "Read",
        handler: (input: { id: string }) => input.id,
      },
    });

    expect(() => assertMaterializedTools(tools)).toThrow(
      MissingToolParametersError,
    );
  });
});
