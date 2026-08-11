# NexBrowser Unified MCP Tool Catalog

<!-- AUTO-GENERATED from this package's live tool specs.
     Regenerate: pnpm gen:catalog
     Do not edit by hand - a drift test pins this file to the specs. -->

Start automation with `nex_browser_snapshot` to obtain current page targets. A target is normally a bare snapshot ref such as `e12`; unique CSS selectors are a fallback.

Most automation tools also accept optional `sessionId` (defaults to this client's active session) and `pageId` (defaults to the session's active page); they are omitted from the per-tool input lists below.

## Environment Management

Stateless `nex_*` tools that manage NexBrowser environments; no automation session required.

- `nex_browser_list` — Preferred NexBrowser LocalAPI tool for requests such as 'use NexBrowser to show or count my windows'. Lists managed NexBrowser environments/profiles. Never reports Chrome, Edge, the Codex in-app browser, operating-system application windows, or browser tabs. Read-only. Inputs: `teamId`, `page`, `size`, `keyword`.
- `nex_browser_open` — Start one or more NexBrowser environments and return their status. Inputs: `teamId` (required), `windowId` (required).
- `nex_browser_connection_info` — Inspect the status of running NexBrowser environments. Read-only. Inputs: `teamId` (required), `windowId` (required).
- `nex_browser_close` — Close one or more NexBrowser environments. Inputs: `teamId`, `windowId` (required).

## Connection

- `nex_browser_connect` — Connect to a NexBrowser window using the active team by default and create an isolated automation session. Inputs: `teamId`, `windowId` (required), `startIfNeeded`.
- `nex_browser_disconnect` — Disconnect an automation session without closing the NexBrowser environment.

## Tabs

- `nex_browser_tab_list` — List tabs and the active stable page ID for an automation session. Read-only.
- `nex_browser_tab_new` — Open a new tab and optionally navigate it. Inputs: `url`.
- `nex_browser_tab_select` — Select a tab by stable page ID. Inputs: `pageId` (required).
- `nex_browser_tab_close` — Close a tab by stable page ID. Inputs: `pageId` (required).

## Interaction

- `nex_browser_navigate` — Navigate the selected page and return its refreshed accessibility snapshot. Inputs: `url` (required).
- `nex_browser_reload` — Page reloaded.
- `nex_browser_go_back` — Navigated back.
- `nex_browser_go_forward` — Navigated forward.
- `nex_browser_click` — Click or double-click an element from the latest snapshot or a CSS selector. Inputs: `target` (required), `doubleClick`, `button`.
- `nex_browser_hover` — Hover over an element. Inputs: `target` (required).
- `nex_browser_type` — Type text into an element using sequential key events. Inputs: `target` (required), `text` (required), `delay`.
- `nex_browser_fill_form` — Fill one or more form controls in order. Inputs: `fields` (required).
- `nex_browser_select_option` — Select one or more values in a select control. Inputs: `target` (required), `values` (required).
- `nex_browser_check` — Check a checkbox or radio control. Inputs: `target` (required).
- `nex_browser_uncheck` — Uncheck a checkbox or radio control. Inputs: `target` (required).
- `nex_browser_press_key` — Press a key on the selected page or focused element. Inputs: `target`, `key` (required).
- `nex_browser_key_down` — Hold a keyboard key down until nex_browser_key_up is called. Inputs: `key` (required).
- `nex_browser_key_up` — Release a keyboard key held by nex_browser_key_down. Inputs: `key` (required).
- `nex_browser_drag` — Drag one snapshot ref or selector to another. Inputs: `startTarget` (required), `endTarget` (required).
- `nex_browser_scroll` — Scroll the page, optionally bringing a target into view first. Inputs: `target`, `deltaX`, `deltaY`.
- `nex_browser_wait_for` — Wait for a target, text, or a bounded duration. Inputs: `target`, `text`, `time`, `timeout`.
- `nex_browser_resize` — Resize the active page viewport. Inputs: `width` (required), `height` (required).

## Inspection and Diagnostics

- `nex_browser_snapshot` — Capture an accessibility/ARIA snapshot with short-lived actionable refs. Read-only. Inputs: `target`, `depth`, `boxes`.
- `nex_browser_page_title` — Page title. Read-only.
- `nex_browser_page_url` — Page URL. Read-only.
- `nex_browser_get_text` — Read visible text from the page or one target. Read-only. Inputs: `target`.
- `nex_browser_console_messages` — Read console messages buffered by this automation session. Inputs: `clear`.
- `nex_browser_network_requests` — Read network requests buffered by this automation session. Inputs: `clear`.
- `nex_browser_network_request` — Read one buffered network request by its 1-based index. Read-only. Inputs: `index` (required).
- `nex_browser_handle_dialog` — List pending dialogs or accept/dismiss one dialog. Inputs: `id`, `accept`, `dismiss`, `promptText`.
- `nex_browser_evaluate` — Evaluate JavaScript when the dedicated evaluate permission is enabled. Inputs: `expression` (required).
- `nex_browser_run_code` — Run page JavaScript when the separate runCode permission is enabled. Inputs: `code` (required).

## Artifacts

- `nex_browser_take_screenshot` — Capture a screenshot and return MCP image content when it is small enough. Inputs: `filename`, `type`, `fullPage`, `quality`.
- `nex_browser_file_upload` — Upload approved local files through a file input target. Inputs: `target` (required), `files` (required).
- `nex_browser_drop` — Drop approved files or MIME-typed text data onto a target. Inputs: `target` (required), `paths`, `data`.

## Safety

Tools marked read-only only inspect state. Navigation, clicks, typing, uploads, tab closing, and JavaScript that changes page state are consequential: use them only for the user's intended outcome.
