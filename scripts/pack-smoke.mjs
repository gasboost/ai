import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "gasboost-ai-pack-"));

function run(command, args, cwd = scratch) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

try {
  const tarballs = ["tool", "agent"].map((name) => {
    const manifest = JSON.parse(readFileSync(join(root, "packages", name, "package.json"), "utf8"));
    run("pnpm", ["pack", "--pack-destination", scratch], join(root, "packages", name));
    const tarball = join(scratch, `gasboost-${name}-${manifest.version}.tgz`);
    const files = run("tar", ["-tzf", tarball]).trim().split("\n");
    assert(files.includes("package/dist/index.js"));
    assert(files.includes("package/dist/index.d.ts"));
    assert(files.every((file) => !file.includes("/src/") && !file.includes("node_modules")));
    const packed = JSON.parse(run("tar", ["-xOf", tarball, "package/package.json"]));
    assert(!JSON.stringify(packed).match(/workspace:|file:/));
    return tarball;
  });
  // The first tool release is not on npm yet; resolve the agent's dependency to its packed artifact.
  writeFileSync(join(scratch, "package.json"), JSON.stringify({
    private: true,
    pnpm: { overrides: { "@gasboost/tool": `file:${tarballs[0]}` } },
  }));
  run("pnpm", ["add", ...tarballs, "@gasboost/gemini@0.1.0", "@gasboost/openai@0.1.0", "@types/google-apps-script@2.0.13"]);
  run("node", ["-e", `
    const assert = require("node:assert/strict");
    const tool = require("@gasboost/tool");
    const { AppsScriptAgent } = require("@gasboost/agent");
    const tools = tool.toolDefine({ echo: { description: "Echo", handler: ({ value }) => value, parameters: { type: "object", properties: { value: { type: "string" } }, required: ["value"] } } });
    let requests = 0;
    const agent = new AppsScriptAgent({ tools, llm: { provider: "openai", model: "gpt-5", responses: { create(request) {
      if (++requests === 1) return { id: "r1", output: [{ type: "function_call", call_id: "c1", name: "echo", arguments: '{"value":"ok"}' }] };
      assert.equal(request.previous_response_id, "r1");
      assert.equal(request.input[0].output, "ok");
      return { id: "r2", output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }] };
    } } } });
    agent.run("Echo").then(result => { assert.equal(result.output, "ok"); assert.equal(result.calls[0].status, "success"); }).catch(error => { console.error(error); process.exitCode = 1; });
  `]);
  writeFileSync(join(scratch, "consumer.ts"), `
import { AppsScriptAgent } from "@gasboost/agent";
import { toolDefine } from "@gasboost/tool";
import { Gemini } from "@gasboost/gemini";
import { OpenAI } from "@gasboost/openai";
const tools = toolDefine({ echo: { description: "Echo", handler: (input: { value: string }) => input.value, parameters: { type: "object", required: ["value"], properties: { value: { type: "string" } } } } });
new AppsScriptAgent({ tools, llm: { provider: "gemini", model: "gemini-3.8-flash", interactions: new Gemini({ apiKey: "test" }).interactions } });
new AppsScriptAgent({ tools, llm: { provider: "openai", model: "gpt-5", responses: new OpenAI({ apiKey: "test" }).responses } });
`);
  run(join(root, "node_modules", ".bin", "tsc"), ["--noEmit", "--strict", "--target", "ES2022", "--lib", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--types", "google-apps-script", "consumer.ts"]);
  console.log("Both packed packages passed runtime and consumer type checks.");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
