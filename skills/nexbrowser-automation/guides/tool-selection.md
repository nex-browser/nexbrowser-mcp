# Tool Selection Guide

Use this guide when several MCP tools appear applicable.

## Default Loop

1. `nex_browser_connect`
2. `nex_browser_navigate` only for initial or explicitly supplied URLs
3. `nex_browser_snapshot`
4. Interact with fresh `target` refs
5. `nex_browser_wait_for`
6. Re-snapshot and verify

## Common Choices

- Inspect controls and text: `nex_browser_snapshot`; use `nex_browser_take_screenshot` only for visual layout, canvas, video, or image state.
- Follow in-page links, pagination, tabs, or filters: `nex_browser_click` first; only navigate directly if the UI path fails or is impractical.
- Enter text: `nex_browser_type(target="e12", text="...")`; call `nex_browser_press_key(key="Enter")` when Enter is the intended submission.
- Native select: `nex_browser_select_option`; custom listbox: click the visible option.
- Scroll: `nex_browser_scroll(deltaY=600)` and re-snapshot.
- Extract data: `nex_browser_evaluate(expression="...")` after inspecting the page.
- Diagnose runtime errors: `nex_browser_console_messages` and `nex_browser_network_requests`.

## Target Rules

Use the snapshot's bare ref (for example, `e12`) as `target`. Do not carry refs across a page change. A unique CSS selector may be used only when no usable snapshot target exists.

## Tabs

Prefer `nex_browser_tab_list`, `nex_browser_tab_new`, `nex_browser_tab_select`, and `nex_browser_tab_close`. Use stable `pageId` values returned by the list tool.
