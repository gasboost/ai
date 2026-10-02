export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

export type JsonObject = {
  [key: string]: JsonValue;
};

export type JsonSchema = {
  type?: string | string[];
  description?: string;
  properties?: Readonly<Record<string, JsonSchema>>;
  required?: readonly string[];
  items?: JsonSchema | JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
  enum?: readonly JsonValue[];
  const?: JsonValue;
  anyOf?: readonly JsonSchema[];
  oneOf?: readonly JsonSchema[];
  allOf?: readonly JsonSchema[];
  $ref?: string;
  $defs?: Readonly<Record<string, JsonSchema>>;
};

export type ToolHandler = (...args: any[]) => unknown;

export type ToolDefinition<THandler extends ToolHandler = ToolHandler> = {
  description: string;
  handler: THandler;

  /**
   * Injected at build time by @gasboost/vite agent().
   * Consumers normally do not author this manually.
   */
  parameters?: JsonSchema;
};

export type ToolSet = Record<string, ToolDefinition>;

export type MaterializedToolDefinition<
  THandler extends ToolHandler = ToolHandler,
> = ToolDefinition<THandler> & {
  parameters: JsonSchema;
};

export type MaterializedToolSet = Record<string, MaterializedToolDefinition>;

export type InferToolInput<T extends ToolHandler> = Parameters<T>[0];

export type InferToolResult<T extends ToolHandler> = Awaited<ReturnType<T>>;

export function toolDefine<const T extends ToolSet>(tools: T): T {
  return tools;
}

export class MissingToolParametersError extends Error {
  constructor(toolName: string) {
    super(
      `Tool "${toolName}" is missing runtime parameters. Use @gasboost/vite agent() to materialize handler input JSON Schema before running an agent.`,
    );
    this.name = "MissingToolParametersError";
  }
}

export function assertMaterializedTools(
  tools: ToolSet,
): asserts tools is MaterializedToolSet {
  for (const [name, tool] of Object.entries(tools)) {
    if (!tool.parameters) {
      throw new MissingToolParametersError(name);
    }
  }
}
