---
name: nexbrowser
description: Use when installing, setting up, configuring, registering, or diagnosing NexBrowser MCP and its Agent Skill, including requests to install NexBrowser for Codex or make nex_browser_* tools available.
---

# NexBrowser Setup

Complete NexBrowser Agent setup. Perform the checks and commands instead of only describing them, except when the user must enter a secret or approve replacement of an existing configuration.

## Setup workflow

1. Confirm Node.js 18 or later, `npx`, and the target Agent CLI are available.
2. Ask the user to start NexBrowser Desktop and enable **API MCP → NexBrowser OpenAPI**. Never ask them to paste the OpenAPI key into chat.
3. Check whether an MCP entry already exists:

   ```bash
   codex mcp get nexbrowser --json
   ```

   If it exists, inspect it and stop. Replace it only after the user explicitly approves `codex mcp remove nexbrowser`.

4. Confirm `NEX_API_KEY` exists in the Agent process environment without printing its value. If it is available, register the MCP server directly, expanding the environment variable only inside the shell:

   ```bash
   codex mcp add nexbrowser --env NEX_API_KEY=<value-from-environment> --env NEX_API_HOST=http://127.0.0.1:45536 --env NEX_TIMEOUT=30000 -- npx -y @nexbrowser/mcp@latest
   ```

   Substitute `<value-from-environment>` through the active shell's environment-variable expansion; never write the resolved key into chat or logs.

   If the variable is unavailable, ask the user to run the registration locally with a hidden prompt. For PowerShell:

   ```powershell
   $nexSecret = Read-Host 'NexBrowser OpenAPI key' -AsSecureString
   $nexKey = [Net.NetworkCredential]::new('', $nexSecret).Password
   codex mcp add nexbrowser --env "NEX_API_KEY=$nexKey" --env NEX_API_HOST=http://127.0.0.1:45536 --env NEX_TIMEOUT=30000 -- npx -y @nexbrowser/mcp@latest
   Remove-Variable nexKey,nexSecret
   ```

5. Install the automation Skill:

   ```bash
   npx -y skills@latest add https://github.com/nex-browser/nexbrowser-mcp --skill nexbrowser-automation --agent codex --global --copy --yes
   ```

6. Verify both installations:

   ```bash
   codex mcp get nexbrowser --json
   npx -y skills@latest list --global --agent codex --json
   ```

   Confirm the MCP entry exists and `nexbrowser-automation` is installed.

7. Tell the user to restart or reload their Agent so it discovers the new MCP server and Skill.

## After setup

Use the separately installed `nexbrowser-automation` Skill for environment management and browser automation. Do not reproduce its tool catalog here.
