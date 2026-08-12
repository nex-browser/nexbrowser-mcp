# Human-Like Interaction

Operate the visible page controls the way a user would by default. This preserves client-side routing, referrers, consent flows, and page state that direct URL or DOM manipulation can skip.

## Prefer UI Controls First

- Click an existing link instead of extracting its `href` and navigating directly.
- Click filter, pagination, tab, checkbox, and submit controls rather than editing query parameters or JavaScript state.
- Type into fields and click submit instead of posting directly to an API.
- Use `nex_browser_file_upload` with the page's file input as `target` instead of scripting the file selection.

## Sensitive Operations

For login, account, checkout, upload, and other consequential operations, interact through visible controls, verify each result, and preserve any required confirmation step.

## Legitimate Fallbacks

Use `nex_browser_navigate` for a user-provided URL or if a clicked control fails to navigate. Use `nex_browser_evaluate` to inspect data, and only use it to change state after the normal UI is unavailable or has demonstrably failed. Re-snapshot after each fallback.
