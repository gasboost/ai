export function serializeToolResult(value: unknown): string {
  if (value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
