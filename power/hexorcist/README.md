# Hexorcist power for Kiro

Install: Kiro → **Powers** panel → **Add Custom Power** → **Import power from a folder** → choose this
`power/hexorcist/` folder (or **Import power from GitHub** with the repository URL).

It adds the `check-firmware` skill and the local `hexorcist` MCP server (`node node_modules/tsx/dist/cli.mjs mcp/bin.ts`,
the same server as `npm run mcp`; stdio, no network; `node` rather than `npm` because Windows can't start `npm` without a shell) with the tools `check` and `capabilities`. The server runs from this repository, so open the
repository as the Kiro workspace. Whether Kiro starts power MCP servers in the workspace folder is
UNVERIFIED; if the tools fail to start, check that before anything else.
