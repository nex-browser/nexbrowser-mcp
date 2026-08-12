# Error Handling Guide

## Browser Is Not Connected

- Call `nex_browser_connect` first.
- Pass the managed `windowId`. The active NexBrowser team is used automatically when `teamId` is omitted.
- Use `startIfNeeded: true` only when starting a stopped window is intended.
- If the browser restarted, reconnect through the managed window identity.

## Target Is Invalid or Not Found

- Call `nex_browser_snapshot` again.
- Verify that the expected tab is active with `nex_browser_tab_list` and select its stable `pageId` when needed.
- Use the new snapshot ref as `target`; do not retry a stale target repeatedly.

## Modal States Block Actions

- For a file input, call `nex_browser_file_upload` with its target and allowed absolute `files`.
- For alert, confirm, or prompt dialogs, call `nex_browser_handle_dialog` before any other page action.

## Page Does Not Reach Its Expected State

- Use `nex_browser_wait_for` with the expected content or loading text.
- Inspect the current UI with `nex_browser_snapshot`.
- Check `nex_browser_console_messages` for page errors and `nex_browser_network_requests` for failed requests.
- Inspect an individual request with `nex_browser_network_request(index=N)` when needed.

## Typing or Selection Fails

- `nex_browser_type` is only for editable controls. Click an option in custom listboxes instead.
- Use `nex_browser_select_option` only for native select controls.
- Re-snapshot first, then verify that the target represents the intended control.
