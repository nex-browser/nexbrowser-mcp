---
name: nexbrowser-automation
description: Guides live web automation through the unified NexBrowser MCP tools. Use for connecting to a managed window, navigation, clicking, typing, uploading, scraping, screenshots, tab management, or browser-automation debugging.
---

# NexBrowser Automation Skill

Use this skill when the user needs to automate a live NexBrowser session with the unified browser MCP tools.

## When to Use

- The user wants to control a browser: navigate, click, type, scroll, upload, or scrape.
- The task needs element targets from an accessibility snapshot.
- The task needs help diagnosing a browser-automation failure.

## Quick Decision Matrix

| User intent            | Tool                                                     | Notes                                                             |
| ---------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| Connect to NexBrowser  | `nex_browser_connect`                                    | Requires a managed window ID; the active team is used by default. |
| Navigate to a URL      | `browser_navigate`                                       | Use for an initial or explicitly supplied URL.                    |
| Inspect elements       | `browser_snapshot`                                       | Preferred over a screenshot for interaction.                      |
| Click, type, or select | `browser_click`, `browser_type`, `browser_select_option` | Use snapshot `target` values.                                     |
| Wait for a page change | `browser_wait_for`                                       | Prefer `text` with `timeout` over fixed `time`.                   |
| Read structured data   | `browser_evaluate`                                       | Prefer UI tools for state-changing actions.                       |
| Inspect visual state   | `browser_take_screenshot`                                | Use when layout or rendered media matters.                        |
| Debug failures         | `browser_console_messages`, `browser_network_requests`   | Inspect after reproducing the issue.                              |

## Critical Rules

- Connect with `nex_browser_connect` before using browser tools. Pass `windowId` and optional `startIfNeeded`; pass `teamId` only when it is already known. Never pass a raw CDP endpoint.
- Call `browser_snapshot` before the first target-based interaction and use its ref, such as `target: "e48"`; a unique CSS selector is a fallback. Multiple actions may reuse the same snapshot only while the page structure remains stable.
- Snapshot refs are temporary. Re-snapshot after navigation, an action that changes the DOM, a substantial asynchronous update, or any stale-reference error.
- Prefer visible controls: click links, buttons, filters, and pagination before using direct navigation or JavaScript.
- For sensitive flows such as login, upload, checkout, or account changes, slow down: operate visible controls step by step, verify each result, and preserve confirmation steps (see `guides/human-like-interaction.md`).
- Wait and verify after every state-changing action. Prefer observable text waits over fixed delays.
- Treat `browser_evaluate` as an inspection and extraction tool; use it to change page state only when the normal UI cannot be operated. `browser_evaluate` and `browser_run_code` are permission-gated by the NexBrowser Desktop app.

## Starter Workflow

```text
1. nex_browser_connect(windowId="WINDOW_ID", startIfNeeded=true)
2. browser_navigate(url="https://example.com")
3. browser_wait_for(text="expected content")   # or time=2000 (milliseconds) as a fallback
4. browser_snapshot()
```

## Out of Scope

Do not invent tools for the following — they are outside this skill's scope; route the user instead:

- Creating, deleting, or editing browser environments/profiles, fingerprints, or assigning a proxy to a window — not available through this MCP server; direct the user to the NexBrowser app.
- Raw CDP or WebSocket connections — never pass a CDP endpoint to an automation tool; `nex_browser_connect` with a `windowId` is the only automation entry point. Environment-management tools redact CDP endpoints by default; the operator-only `NEX_EXPOSE_CDP=1` mode is outside this skill workflow.
- Cookie export, UA queries, or profile sharing — not part of this tool set.
- Environment lifecycle (`nex_list_browsers`, `nex_open_browsers`, `nex_close_browsers`, `nex_get_connection_info`) manages windows only; it cannot automate pages. Page automation always requires `nex_browser_connect` first.
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

Discover the target `windowId` with `nex_list_browsers` (part of this same MCP server), then connect with `nex_browser_connect` and use this skill for live automation. The NexBrowser Desktop app validates ownership and resolves the browser connection internally.

`teamId` scopes browser discovery and lifecycle operations to a NexBrowser Team. When it is omitted
from tools that allow omission, Desktop uses the currently selected Team. This MCP does not list or
modify Teams or Projects, so never invent a `teamId`; use an ID already supplied by the user or
Desktop context.
