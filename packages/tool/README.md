# @gasboost/tool

Provider-neutral executable tool definitions for Gasboost.

Use `toolDefine()` to register descriptions and handlers. Before agent execution,
`@gasboost/vite` `agent()` materializes each handler's input JSON Schema as `parameters`.

See the [repository documentation](https://github.com/gasboost/ai#authoring-tools)
for usage and runtime requirements.
