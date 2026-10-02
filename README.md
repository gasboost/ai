# gasboost/ai

Provider-neutral tools and an Apps Script-friendly agent runtime for Gasboost.

This repository contains two packages:

- `@gasboost/tool`: reusable executable tool definitions with provider-neutral JSON Schema.
- `@gasboost/agent`: `AppsScriptAgent` orchestration for Gemini Interactions and OpenAI Responses.

`@gasboost/tool` does not import Gemini, OpenAI, Vite, or Apps Script APIs. It stores a description, a handler, and a runtime JSON Schema once build tooling has materialized it.

## Authoring Tools

```ts
import { toolDefine } from "@gasboost/tool";

const tools = toolDefine({
  findUser: {
    description: "ユーザーを検索する",
    handler: findUser,
  },
  createMeeting: {
    description: "商談を登録する",
    handler: createMeeting,
  },
});
```

The normal TypeScript authoring path does not duplicate input schemas. The handler signature is the source of truth.

For agent execution, each tool must have runtime `parameters`. In normal Gasboost apps, `@gasboost/vite` `agent()` is required to materialize handler input schemas at build time. If a tool reaches `AppsScriptAgent` without `parameters`, the run fails with a clear materialization error.

Agent-compatible handlers are either zero-argument functions or functions with exactly one structured input object.

## Gemini

```ts
import { AppsScriptAgent } from "@gasboost/agent";
import { Gemini } from "@gasboost/gemini";
import { toolDefine } from "@gasboost/tool";

const tools = toolDefine({
  findUser: {
    description: "ユーザーを検索する",
    handler: findUser,
  },
  createMeeting: {
    description: "商談を登録する",
    handler: createMeeting,
  },
});

const gemini = new Gemini({ apiKey });

const agent = new AppsScriptAgent({
  tools,
  llm: {
    provider: "gemini",
    interactions: gemini.interactions,
    model: "gemini-3.8-flash",
  },
});

const result = await agent.run("田中さんの最近の商談状況を確認して要約して", {
  model: selectedModel,
});
```

The constructor model is the default model. UI code may keep a selected model in presentation state and pass it through `run(..., { model })` for a single run.

Continuation uses the normalized `continuationId` returned by the agent:

```ts
const next = await agent.run("じゃあ来月分も確認して", {
  previousId: result.continuationId,
  model: selectedModel,
});
```

## OpenAI

```ts
import { AppsScriptAgent } from "@gasboost/agent";
import { OpenAI } from "@gasboost/openai";

const openai = new OpenAI({ apiKey });

const agent = new AppsScriptAgent({
  tools,
  llm: {
    provider: "openai",
    responses: openai.responses,
    model: "gpt-5",
  },
  maxSteps: 10,
  onCall: (call) => {
    console.log(call.name, call.status);
  },
});

const result = await agent.run("田中さんの今月の支払い状況を確認して");
```

Changing providers requires a separately configured `AppsScriptAgent` instance. Per-run model override stays within the provider selected by the constructor.

## Runtime Behavior

`AppsScriptAgent` delegates all provider HTTP work to the existing Gasboost API clients:

- Gemini uses `GeminiInteractionApi.create()`.
- OpenAI uses `OpenAIResponseApi.create()`.

The agent loop:

1. Verifies that every tool has materialized JSON Schema parameters.
2. Calls the configured provider adapter with the user input, tools, continuation ID, and resolved model.
3. Executes only explicitly registered tools requested by the provider.
4. Sends tool results back to the same provider interaction or response.
5. Repeats until final text output or `maxSteps`.

Provider-specific response IDs are returned as opaque `continuationId` values. The agent does not create a session database.

## Development And Publishing

The repository installs independently with `pnpm install --frozen-lockfile`.
Provider development dependencies come from npm; no sibling repositories are required.
Run `pnpm typecheck`, `pnpm test`, and `pnpm pack:smoke` before publishing.
The smoke check builds and packs both packages, installs the tarballs into an isolated
consumer, executes a tool-call round trip, and checks both provider clients against
the published declaration files without workspace path aliases.

CI runs those checks for pull requests and pushes to `main`. After successful `main`
push CI, Publish checks npm versions and publishes missing versions in dependency
order (`tool`, then `agent`) using npm Trusted Publishing.
Publish both initial `0.1.0` releases locally in that same order, then configure each
npm package's GitHub Trusted Publisher for `gasboost/ai` and `publish.yml`.
Subsequent releases require updating the package versions in a pull request.
