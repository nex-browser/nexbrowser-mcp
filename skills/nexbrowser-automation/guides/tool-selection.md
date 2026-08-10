# Tool Selection Guide

Use this guide when several MCP tools appear applicable.

## Default Loop

1. `nex_browser_connect`
2. `browser_navigate` only for initial or explicitly supplied URLs
3. `browser_snapshot`
4. Interact with fresh `target` refs
5. `browser_wait_for`
6. Re-snapshot and verify

## Common Choices

- Inspect controls and text: `browser_snapshot`; use `browser_take_screenshot` only for visual layout, canvas, video, or image state.
- Follow in-page links, pagination, tabs, or filters: `browser_click` first; only navigate directly if the UI path fails or is impractical.
- Enter text: `browser_type(target="e12", text="...")`; call `browser_press_key(key="Enter")` when Enter is the intended submission.
- Native select: `browser_select_option`; custom listbox: click the visible option.
- Scroll: `browser_scroll(deltaY=600)` and re-snapshot.
- Extract data: `browser_evaluate(expression="...")` after inspecting the page.
- Diagnose runtime errors: `browser_console_messages` and `browser_network_requests`.

## Target Rules

Use the snapshot's bare ref (for example, `e12`) as `target`. Do not carry refs across a page change. A unique CSS selector may be used only when no usable snapshot target exists.

## Tabs

Prefer `browser_tab_list`, `browser_tab_new`, `browser_tab_select`, and `browser_tab_close`. Use stable `pageId` values returned by the list tool.
