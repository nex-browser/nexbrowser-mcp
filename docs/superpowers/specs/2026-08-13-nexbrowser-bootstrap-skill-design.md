# NexBrowser Bootstrap Skill Design

## Goal

Add a separately installable `nexbrowser` Skill so a user can give an Agent one Skills CLI command, then ask it to finish NexBrowser setup.

## User entry point

```bash
npx skills add https://github.com/nex-browser/nexbrowser-mcp --skill nexbrowser
```

## Design

The repository will publish two distinct Skills:

- `nexbrowser`: a small bootstrap and setup workflow.
- `nexbrowser-automation`: the existing operational browser-automation guidance.

When the `nexbrowser` Skill is active, the Agent must inspect prerequisites, register the published MCP server directly with the target Agent CLI, install `nexbrowser-automation`, verify both installations, and tell the user when an Agent restart is required. It must not duplicate the automation tool catalog.

The bootstrap Skill must never print or repeat an API key in chat or logs. Existing MCP configuration must not be replaced unless the user explicitly authorizes its removal.

## Validation

- Repository tests verify the new Skill is packaged and its local references resolve.
- The Skills CLI must discover both `nexbrowser` and `nexbrowser-automation` from the repository.
- Existing type, unit, build, and package smoke checks must remain green.
