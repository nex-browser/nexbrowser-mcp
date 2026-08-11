---
name: nexbrowser-automation
description: Use whenever the user explicitly names NexBrowser/nexbrowser or asks to use its LocalAPI, including listing or counting managed windows/environments/profiles (查看有多少窗口、查询环境), connecting to a managed window, navigation, clicking, typing, uploading, scraping, screenshots, tabs, or NexBrowser automation debugging. Route these requests to NexBrowser MCP tools, never generic Browser, Chrome, or computer-use tools.
---

# NexBrowser Automation Skill

Use this skill whenever the user names NexBrowser or needs to manage or automate a live NexBrowser session through the unified NexBrowser MCP tools.

## When to Use

- The user explicitly says NexBrowser/nexbrowser, NexBrowser LocalAPI, “使用 NexBrowser”, “查看有多少窗口”, “查询环境”, or “浏览器环境”.
- The user wants to list or count managed NexBrowser windows/environments/profiles. Call `nex_browser_list`; do not inspect Chrome, Edge, the Codex in-app browser, operating-system windows, processes, or tabs.
- The user wants to control a browser: navigate, click, type, scroll, upload, or scrape.
- The task needs element targets from an accessibility snapshot.
- The task needs help diagnosing a browser-automation failure.

## Quick Decision Matrix

| User intent             | Tool                                                                 | Notes                                                             |
| ----------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| List/count environments | `nex_browser_list`                                                   | NexBrowser managed windows only; never OS windows or tabs.        |
| Connect to NexBrowser   | `nex_browser_connect`                                                | Requires a managed window ID; the active team is used by default. |
| Navigate to a URL       | `nex_browser_navigate`                                               | Use for an initial or explicitly supplied URL.                    |
| Inspect elements        | `nex_browser_snapshot`                                               | Preferred over a screenshot for interaction.                      |
| Click, type, or select  | `nex_browser_click`, `nex_browser_type`, `nex_browser_select_option` | Use snapshot `target` values.                                     |
| Wait for a page change  | `nex_browser_wait_for`                                               | Prefer `text` with `timeout` over fixed `time`.                   |
| Read structured data    | `nex_browser_evaluate`                                               | Prefer UI tools for state-changing actions.                       |
| Inspect visual state    | `nex_browser_take_screenshot`                                        | Use when layout or rendered media matters.                        |
| Debug failures          | `nex_browser_console_messages`, `nex_browser_network_requests`       | Inspect after reproducing the issue.                              |

## Critical Rules

- Treat the NexBrowser product name as an explicit routing request for this MCP server. Never substitute generic Browser/Chrome plugins, computer-use, shell commands, or process enumeration.
- Connect with `nex_browser_connect` before using browser tools. Pass `windowId` and optional `startIfNeeded`; pass `teamId` only when it is already known. Never pass a raw CDP endpoint.
- Call `nex_browser_snapshot` before the first target-based interaction and use its ref, such as `target: "e48"`; a unique CSS selector is a fallback. Multiple actions may reuse the same snapshot only while the page structure remains stable.
- Snapshot refs are temporary. Re-snapshot after navigation, an action that changes the DOM, a substantial asynchronous update, or any stale-reference error.
- Prefer visible controls: click links, buttons, filters, and pagination before using direct navigation or JavaScript.
- For sensitive flows such as login, upload, checkout, or account changes, slow down: operate visible controls step by step, verify each result, and preserve confirmation steps (see `guides/human-like-interaction.md`).
- Wait and verify after every state-changing action. Prefer observable text waits over fixed delays.
- Treat `nex_browser_evaluate` as an inspection and extraction tool; use it to change page state only when the normal UI cannot be operated. `nex_browser_evaluate` and `nex_browser_run_code` are permission-gated by the NexBrowser Desktop app.

## Starter Workflow

```text
1. nex_browser_connect(windowId="WINDOW_ID", startIfNeeded=true)
2. nex_browser_navigate(url="https://example.com")
3. nex_browser_wait_for(text="expected content")   # or time=2000 (milliseconds) as a fallback
4. nex_browser_snapshot()
```

## Out of Scope

Do not invent tools for the following — they are outside this skill's scope; route the user instead:

- Creating, deleting, or editing browser environments/profiles, fingerprints, or assigning a proxy to a window — not available through this MCP server; direct the user to the NexBrowser app.
- Raw CDP or WebSocket connections — never pass a CDP endpoint to an automation tool; `nex_browser_connect` with a `windowId` is the only automation entry point. Environment-management tools redact CDP endpoints by default; the operator-only `NEX_EXPOSE_CDP=1` mode is outside this skill workflow.
- Cookie export, UA queries, or profile sharing — not part of this tool set.
- Environment lifecycle (`nex_browser_list`, `nex_browser_open`, `nex_browser_close`, `nex_browser_connection_info`) manages windows only; it cannot automate pages. Page automation always requires `nex_browser_connect` first.
- Proxy IP catalog lookup, quoting, purchasing, payment confirmation, and order-status checks are not part of this tool set; direct the user to the Proxy IP page in NexBrowser Desktop.

## Progressive Disclosure

| Reference                                                  | When to use                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| [Tool catalog](references/tool-catalog.md)                 | Confirm a tool's exact name, inputs, and read-only status. |
| [Tool selection](guides/tool-selection.md)                 | Unsure which interaction tool fits the intent.             |
| [Snapshot modes](guides/snapshot-modes.md)                 | Targets are stale or snapshots are too large.              |
| [Waiting and timing](guides/waiting-and-timing.md)         | Flaky results after navigation or slow pages.              |
| [Human-like interaction](guides/human-like-interaction.md) | Sensitive flows needing cautious pacing.                   |
| [Error handling](guides/error-handling.md)                 | A tool returned an error and the hint is not enough.       |
| [Examples](examples/connect-and-navigate.md)               | Full workflow templates for common tasks.                  |

## NexBrowser Integration

Discover the target `windowId` with `nex_browser_list`, which is part of this same MCP server, then connect with `nex_browser_connect` and use this skill for live automation. The NexBrowser Desktop app validates ownership and resolves the browser connection internally.

`teamId` scopes browser discovery and lifecycle operations to a NexBrowser Team. When it is omitted
from tools that allow omission, Desktop uses the currently selected Team. This MCP does not list or
modify Teams or Projects, so never invent a `teamId`; use an ID already supplied by the user or
Desktop context.
