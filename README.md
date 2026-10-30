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

Restart or reload the MCP client after changing its configuration, then continue with step 3.

### 3. Install the automation Skill (recommended)

The MCP server provides the tools; the Skill teaches Skill-capable agents such as Claude Code,
Codex and Cursor how to use them well: pick and connect the right environment, act on snapshot
references instead of guessed selectors, recover from common errors, complete necessary CAPTCHA
steps directly, and reconcile uncertain purchases. The MCP server still works without it, but
agents are more likely to choose the wrong tool or take detours in CAPTCHA and billing workflows.

```bash
npx skills add https://github.com/nex-browser/nexbrowser-mcp --skill nexbrowser-automation
```

The same command works for both the `latest` and `beta` packages. Desktop's API MCP page shows it
under the copied configuration. See the [Skill guide](skills/nexbrowser-automation/README.md).

## Capabilities

- Manage environments: list, open, close, and inspect NexBrowser environments.
- Organize windows: list groups with their window counts, create, rename, and delete groups, and move windows in or out of a group.
- Manage workspace proxies and platform accounts: list, create, update, delete, and detect proxies; list and edit platform-account catalog entries; bind accounts to closed windows. Secrets are never returned.
- Automate pages: connect, navigate, click, type, upload files, and manage tabs.
- Inspect pages: snapshots, screenshots, visible text, console messages, and network requests.
- Isolate sessions: each MCP process owns its browser sessions and active-tab state.
- Buy and renew NexIP proxies, buy short-term quotas, and extract proxies with `nex_ip_*`.
- Buy NexMail mailboxes and read email with `nex_mail_*`; create and query NexCaptcha solving tasks with `nex_captcha_*`.
- Reconcile charges and refunds with `nex_billing_trade_list`.

Keep the agent's existing browser session for CAPTCHA work. Product integration follows the live catalog/schema, not a fixed bridge whitelist. Read `nex_captcha_product_schema`, obtain actual inputs and confirm permitted result-application tools, then call free `nex_captcha_detect({url, productCode, adapter, workflow, canApply: true})` for TEXT, CLICK or any other enabled documented product. Explicit integration requires neither HTML nor a sitekey; ordinary fill/click tools need no JavaScript permission. HTML detection remains a shortcut for reCAPTCHA v2/enterprise and Turnstile. `canApply` defaults to false and never grants execution permission. Missing fixed capture returns `agentIntegration` guidance; missing inputs, contract conflicts or unavailable execution still block payment. See [workflow selection and capability boundaries](skills/nexbrowser-automation/guides/captcha.md#choose-the-integration-workflow).

All paid recognition stays in NexCaptcha: use the exact enabled product, current online schema and real challenge inputs, then call `nex_captcha_buy` once and poll the returned local id with `nex_captcha_query`. Agent-driven token tasks use `workflow: "BROWSER_RESULT"`; the online workflow and complete adapter schema are checked before charging. Free `nex_captcha_apply_result({id, url, websiteKey, selector?})` queries a supported token task bought in the current MCP process and returns `apply.javascript` for the agent to execute in its original page/frame. It does not create another task, execute code or override browser permissions. After restart, query/reconcile the existing task and use an explicit supported integration rather than buying again. Prices, team permissions, records and refunds remain managed by our service.

The optional fixed Desktop route remains `nex_browser_captcha_prepare` → `nex_browser_captcha_submit` → `nex_browser_captcha_complete` for captured widgets and supported Grid interactions, without arbitrary evaluation permission. HTML detection/generated application initially cover only reCAPTCHA v2/enterprise and Turnstile tokens; other products need the online contract plus an explicit agent integration or fixed adapter. Do not drop required challenge values, infer undeclared provider fields, or switch to GRID because of a parameter error. Standalone tasks use the same product/schema/buy/query tools without requiring a browser. Recognition success, website verification and business completion need separate evidence. See the [NexCaptcha workflow](skills/nexbrowser-automation/guides/captcha.md).

Service tools require a Desktop version exposing `/ip`, `/mail`, `/captcha`, and `/billing` OpenAPI routes, an active login, and the existing server permissions. Prices come from the backend. Needed purchases, renewals and quota extraction execute directly at the current server price without a quotation stage or separate payment confirmation. Honor user restrictions; a price, availability or plan inquiry alone never places an order. Interactive tasks can replace failed resources without another confirmation: SMS waits 120 seconds, verification email waits 180 seconds, and each resource recovery allows at most 3 attempts including the first. Confirm failure, preserve user constraints, reconcile records/billing and show progress. Purchase/application timeouts block new charges until their outcome is established; insufficient balance stops paid actions. Mailbox purchases have no refund/renewal API; CAPTCHA failures/expiry are refunded by the server, not by the MCP. See the [service recovery guide](skills/nexbrowser-automation/guides/services.md).

Language defaults to the current Desktop setting; direct OpenAPI callers may pass `Accept-Language` (`zh-CN` or `en-US`). See the bundled [service workflow guide](skills/nexbrowser-automation/guides/services.md) for IDs, polling, and uncertain results.

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
