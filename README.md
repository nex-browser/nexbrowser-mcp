# NexBrowser MCP Server

English | [简体中文](README.zh_CN.md)

Connect MCP clients such as Codex, Claude Code, Claude Desktop, and Cursor to NexBrowser Desktop
for environment management and browser automation.

> NexBrowser Desktop must be running with **NexBrowser OpenAPI** enabled. This package is an MCP
> adapter, not a standalone browser.

## Quick start

### 1. Enable NexBrowser OpenAPI

1. Start [NexBrowser Desktop](https://nexbrowser.net/en/download/).
2. Open **API MCP** and enable **NexBrowser OpenAPI**.
3. Copy the displayed API key. The default address is `http://127.0.0.1:45536`.

Requires Node.js 18 or later; Node.js 20 or later is recommended.

### 2. Add the MCP server

Replace `<your-openapi-token>` with the API key from NexBrowser Desktop.

Codex:

```bash
codex mcp add nexbrowser \
  --env NEX_API_KEY=<your-openapi-token> \
  --env NEX_API_HOST=http://127.0.0.1:45536 \
  -- npx -y @nexbrowser/mcp@latest
```

Claude Code:

```bash
claude mcp add nexbrowser \
  --env NEX_API_KEY=<your-openapi-token> \
  --env NEX_API_HOST=http://127.0.0.1:45536 \
  -- npx -y @nexbrowser/mcp@latest
```

Other MCP clients:

```json
{
  "mcpServers": {
    "nexbrowser": {
      "command": "npx",
      "args": ["-y", "@nexbrowser/mcp@latest"],
      "env": {
        "NEX_API_HOST": "http://127.0.0.1:45536",
        "NEX_API_KEY": "<your-openapi-token>"
      }
    }
  }
}
```

Restart or reload the MCP client after changing its configuration.

### 3. Install the automation Skill (optional)

The Skill teaches compatible agents how to choose tools, use snapshot references, and recover
from common errors.

```bash
npx skills add https://github.com/nex-browser/nexbrowser-mcp --skill nexbrowser-automation
```

## Capabilities

- Manage environments: list, open, close, and inspect NexBrowser environments.
- Automate pages: connect, navigate, click, type, upload files, and manage tabs.
- Inspect pages: snapshots, screenshots, visible text, console messages, and network requests.
- Isolate sessions: each MCP process owns its browser sessions and active-tab state.

Common tools:

```text
nex_browser_list              nex_browser_open
nex_browser_close             nex_browser_connect
nex_browser_tab_list          nex_browser_snapshot
nex_browser_click             nex_browser_fill_form
nex_browser_take_screenshot   nex_browser_network_requests
```

The complete tool catalog is available through MCP `tools/list`. Tool access remains controlled by
NexBrowser Desktop.

## Configuration

| Variable         | Required | Default                  | Description                                   |
| ---------------- | -------- | ------------------------ | --------------------------------------------- |
| `NEX_API_KEY`    | Yes      | —                        | API key issued by NexBrowser OpenAPI.         |
| `NEX_API_HOST`   | No       | `http://127.0.0.1:45536` | NexBrowser OpenAPI base URL.                  |
| `NEX_TIMEOUT`    | No       | `30000`                  | Request timeout in milliseconds.              |
| `NEX_EXPOSE_CDP` | No       | disabled                 | Set to `1` only when raw CDP URLs are needed. |

Equivalent CLI flags are `--api-key`, `--api-host`, `--timeout`, and `--expose-cdp`. Environment
variables are safer for secrets because command-line values may be stored in shell history or
visible to other local processes.

## Troubleshooting

- **Connection failed:** confirm NexBrowser Desktop is running and OpenAPI is enabled.
- **Unauthorized:** copy the current API key again and update `NEX_API_KEY`.
- **Not found:** update NexBrowser Desktop to a release that provides **API MCP** and the unified
  `/automation/*` endpoints.
- **No tools after setup:** restart or reload the MCP client.
- **Custom port:** set `NEX_API_HOST` to the address displayed by NexBrowser Desktop.

See [GitHub Releases](https://github.com/nex-browser/nexbrowser-mcp/releases) for package versions.

## Security

- Keep OpenAPI bound to the loopback interface unless remote access is explicitly required.
- Never commit or publish API keys, MCP configuration files containing keys, screenshots, or logs.
- Resetting the API key immediately invalidates the previous key.
- Snapshots, screenshots, page content, console output, and network logs may contain sensitive data
  and may be sent to the configured model provider.
- Enable page evaluation, code execution, local-file access, or raw CDP URLs only when needed.

NexBrowser Desktop remains responsible for authorization and file-access policy.

## Package usage

Run the MCP server directly:

```bash
npx -y @nexbrowser/mcp@latest
```

Or install the CLI globally:

```bash
npm install --global @nexbrowser/mcp
nexbrowser-mcp
```

Embed it in another MCP host:

```ts
import { NexBrowserMcpServer } from '@nexbrowser/mcp';

const server = new NexBrowserMcpServer({
  apiHost: 'http://127.0.0.1:45536',
  apiKey: process.env.NEX_API_KEY ?? '',
  timeout: 30_000
});

await server.connect(transport);
await server.close();
```

## Development

The repository uses Node.js 24.19.0 and pnpm 11 for development. The published package supports
Node.js 18 or later.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm test:package
pnpm inspect
```

The real Desktop integration test is disabled by default. Run it only with a dedicated test window
and API key:

```bash
NEX_E2E_ENABLED=1 NEX_E2E_WINDOW_ID=your-test-window NEX_API_KEY=your-test-key pnpm test:integration
```
