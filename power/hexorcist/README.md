# Hexorcist power for Kiro

Install: Kiro → **Powers** panel → **Add Custom Power** → **Import power from a folder** → choose this
`power/hexorcist/` folder (the one with `plugin.json` directly inside).

It adds the `check-firmware` skill and the local `hexorcist` MCP server (stdio, no network) with the tools
`check` and `capabilities`. It is the same server as `npm run mcp`.

The server lives in this repository, and Kiro may start a power's server outside it. A small inline
launcher in `mcp.json` looks for the repository in `HEXORCIST_ROOT`, then the current folder, and starts
`mcp/bin.ts` from there. On Windows, set it once and restart Kiro:

```powershell
setx HEXORCIST_ROOT "C:\path\to\Hexorcist"
```

Each start is logged to `hexorcist-mcp.log` in the system temp folder (`$env:TEMP` on Windows): the
folder Kiro started it in, the repository it found, and how the server exited.
