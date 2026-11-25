# Hexorcist power

Lets an agent in Kiro run Hexorcist checks on ATmega328P HEX files through an MCP server (`check` and `capabilities`).

## Set HEXORCIST_ROOT once

Kiro starts this server from its own folder, so the power needs to know where your Hexorcist repo is. Set the environment variable `HEXORCIST_ROOT` to the repo folder, once. The repo needs `npm ci` run in it already. If the variable is not set, the power uses its working folder as the repo folder.

Relative paths you give to `check` resolve against the Hexorcist repo folder, whatever folder Kiro started in. Use full paths for files that live elsewhere.

PowerShell (stored for your user account):

```powershell
[Environment]::SetEnvironmentVariable("HEXORCIST_ROOT", "C:\path\to\Hexorcist", "User")
```

POSIX shell (add this line to your shell profile):

```sh
export HEXORCIST_ROOT="$HOME/path/to/Hexorcist"
```

Restart Kiro after setting it.

## If the server does not start

The launcher writes the cause to `hexorcist-launcher.log` in your operating system's temp folder. It prints nothing on stdout, so the log is the place to look. Typical causes: `HEXORCIST_ROOT` points at the wrong folder, or `npm ci` has not been run there.

## Result field: reasonTruncated

`reasonTruncated`: true when the reason reached the 200-character limit, so it may have been cut

## Skill

`skills/check-firmware/SKILL.md` tells the agent to call `capabilities` before any other tool, write rules in the five sentence forms, then call `check`.
