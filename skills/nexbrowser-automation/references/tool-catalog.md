# NexBrowser Unified MCP Tool Catalog

<!-- AUTO-GENERATED from this package's live tool specs.
     Regenerate: pnpm gen:catalog
     Do not edit by hand - a drift test pins this file to the specs. -->

Start automation with `nex_browser_snapshot` to obtain current page targets. A target is normally a bare snapshot ref such as `e12`; unique CSS selectors are a fallback.

Most automation tools also accept optional `sessionId` (defaults to this client's active session) and `pageId` (defaults to the session's active page); they are omitted from the per-tool input lists below.

## Environment Management

Stateless `nex_*` tools that manage NexBrowser environments; no automation session required.

- `nex_browser_list` — Preferred NexBrowser OpenAPI tool for requests such as 'use NexBrowser to show or count my windows'. Lists managed NexBrowser environments/profiles. Never reports Chrome, Edge, the Codex in-app browser, operating-system application windows, or browser tabs. Read-only. Inputs: `teamId`, `page`, `size`, `keyword`, `groupId`.
- `nex_proxy_list` — List proxy resources available in the active NexBrowser workspace so a proxyId can be selected for window creation or binding. Credentials are never returned. Read-only. Inputs: `page`, `size`, `keyword`, `source`, `state`.
- `nex_proxy_import` — Import custom proxy resources from Desktop-compatible text lines the user supplied in the current request. Supported protocols are HTTP, HTTPS, and SOCKS5. Credentials are never returned. Inputs: `text`, `lines`.
- `nex_proxy_create` — Create one custom proxy resource from protocol, host, and port, or pass items to create several. Prefer nex_proxy_import when the user pasted Desktop-compatible lines. Credentials are never returned. Inputs: `protocol`, `host`, `port`, `ipVersion`, `username`, `password`, `remark`, `items`.
- `nex_proxy_batch_create` — Create multiple custom proxy resources from an items array. Each item needs host and port. Credentials are never returned. Inputs: `items` (required).
- `nex_proxy_modify` — Update one existing custom proxy resource. Pass only the fields that must change. Credentials are never returned. Inputs: `proxyId`, `id`, `protocol`, `host`, `port`, `ipVersion`, `username`, `password`, `remark`.
- `nex_proxy_delete` — Delete one or more custom proxy resources. Bought channel proxies may be rejected by Desktop. Credentials are never returned. Inputs: `proxyId`, `proxyIds`, `items`, `id`.
- `nex_proxy_detect` — Probe a proxy resource or an unsaved host:port for exit IP, location, and timezone. Credentials are never returned. Inputs: `proxyId`, `id`, `protocol`, `host`, `port`, `username`, `password`.
- `nex_browser_create` — Create NexBrowser environments in the desktop app's active workspace. Every unset field falls back to the desktop create-window defaults (fingerprint, preferences, layout, startup page), and each created window gets its own generated fingerprint, so pass only the fields that must differ. Inputs: `name`, `count`, `groupId`, `remark`, `proxyId`, `accountIds`, `pluginIds`, `startupUrl`, `screen`, `preference`, `fingerprint`.
- `nex_browser_bind_proxy` — Bind one proxy resource to one or more closed NexBrowser windows. Pass proxyId=0 to remove the binding. Running windows are rejected and must be closed first. Inputs: `windowId`, `windowIds`, `proxyId` (required).
- `nex_browser_bind_account` — Bind one or more workspace catalog platform accounts to one or more closed NexBrowser windows. This replaces the existing window binding. Pass accountIds=[] to remove it. Running windows are rejected and must be closed first. After opening, use nex_browser_accounts to fill. Inputs: `windowId`, `windowIds`, `accountIds` (required).
- `nex_browser_group_list` — List the window groups of the active NexBrowser workspace with the window count of each, so a groupId can be selected for window creation, moving, or deletion. The first row is always the ungrouped bucket with groupId 0. Read-only.
- `nex_browser_group_create` — Create one window group in the active NexBrowser workspace. Group names must be unique inside the team; a duplicate name is rejected. Use nex_browser_group_modify to rename it, or nex_browser_move_to_group to put windows into the new group. Inputs: `name` (required), `seq`.
- `nex_browser_group_modify` — Rename or reorder one custom window group in the active NexBrowser workspace. Group names must stay unique inside the team. The ungrouped bucket (groupId 0) cannot be changed. Inputs: `groupId`, `id`, `name`, `seq`.
- `nex_browser_group_delete` — Delete one custom window group from the active NexBrowser workspace. The windows inside it are not deleted; they become ungrouped. The ungrouped bucket (groupId 0) cannot be deleted. Inputs: `groupId`, `id`.
- `nex_browser_move_to_group` — Move one or more NexBrowser windows into a window group. Pass groupId=0 to move them out of any group. Groups are window metadata, so running windows can be moved without closing them first. Inputs: `windowId`, `windowIds`, `groupId` (required).
- `nex_browser_open` — Start NexBrowser environments and return per-window status. For multi-window tasks, pass every window ID in one windowId array so Desktop can batch-start and tile them before creating automation sessions. Inputs: `teamId` (required), `windowId`, `ids`.
- `nex_browser_connection_info` — Inspect the status of running NexBrowser environments. Omit windowId to list every running window. Read-only. Inputs: `teamId`, `windowId`, `ids`.
- `nex_browser_close` — Close one or more NexBrowser environments. Inputs: `teamId`, `windowId`, `ids`.
- `nex_browser_accounts` — List autofill-capable credentials in the vault plugin of open NexBrowser environments, including bound platform accounts and user-saved passwords. Usernames are masked and secrets are never returned; call nex_browser_fill_account with an accountId from this result. Read-only. Inputs: `windowId`, `windowIds`.
- `nex_account_list` — List platform accounts in the workspace catalog so an accountId can be selected for window creation or later vault fill. This is not the open-window vault; use nex_browser_accounts after a window is running. Secrets are never returned. Read-only. Inputs: `teamId`, `page`, `size`, `keyword`.
- `nex_account_create` — Create one platform account in the workspace catalog, or pass items to create several. Pass platformUrl; username, password, and 2FA secret are optional and write-only. This does not fill a login form. Inputs: `teamId`, `platformUrl` (required), `platformName`, `username`, `password`, `key2fa`, `remark`, `items`.
- `nex_account_batch_create` — Create multiple platform accounts from an items array. Each item needs platformUrl. Secrets are write-only and never returned. Inputs: `items` (required).
- `nex_account_modify` — Update one platform account in the workspace catalog. Pass only the fields that must change. Password and 2FA secret are write-only and never returned. Inputs: `accountId`, `id`, `teamId`, `platformUrl`, `platformName`, `username`, `password`, `key2fa`, `remark`.
- `nex_account_delete` — Delete one or more platform accounts from the workspace catalog. This does not close windows or remove vault copies already stored in an open window. Inputs: `accountId`, `accountIds`, `items`, `id`.

## Connection

- `nex_browser_connect` — Connect to one NexBrowser window using the active team by default and create an isolated automation session. For multiple windows, first call nex_browser_open once with all window IDs, then connect each window with startIfNeeded=false. Inputs: `teamId`, `windowId` (required), `startIfNeeded`.
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
- `nex_browser_fill_account` — Ask the NexBrowser vault plugin to autofill the current login page with a stored credential. Call nex_browser_accounts first and pass only an accountId returned for this open window; the plugin chooses the visible fields and keeps passwords and 2FA secrets outside MCP. Call again after each navigation in a multi-step sign-in. This tool never submits the form. Inputs: `accountId`.
- `nex_browser_fill_credentials` — Fill literal login credentials that the user explicitly supplied in the current request into visible fields. Prefer nex_browser_fill_account when a stored vault credential is available, because literal values cross the model and MCP request boundary. Never store or repeat these values. This tool never submits the form. Inputs: `usernameTarget`, `username`, `passwordTarget`, `password`, `totpTarget`, `totpCode`.
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
