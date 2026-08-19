# Example: Sign In With a Stored Vault Credential

User: "用 NexBrowser 窗口 22448 登录 X"

The open window vault already carries the credential — do not ask the user for a username or password.

```text
1. nex_browser_connect(windowId="22448", startIfNeeded=true)
2. nex_browser_accounts(windowId="22448")
   -> accountId 55 — x.com, username oz*********14, Fillable: username, password, 2FA code
3. nex_browser_navigate(url="https://x.com/login")
4. nex_browser_snapshot()
5. nex_browser_fill_account(accountId="55")
6. nex_browser_click(target=<next-ref>)
7. nex_browser_wait_for(text="Enter your password")
8. nex_browser_snapshot()                                  # refs are stale after the step change
9. nex_browser_fill_account(accountId="55")
10. nex_browser_click(target=<login-ref>)
11. nex_browser_wait_for(text="Home")
```

If a 2FA step appears, snapshot again and call `nex_browser_fill_account(accountId="55")`. The
plugin detects the visible step and generates the code at fill time.

## Rules

- Pass only the selected `accountId`; the plugin chooses the visible fields. A multi-step sign-in
  means one `nex_browser_fill_account` call per step, each after navigation and a fresh snapshot.
- `nex_browser_fill_account` never submits. Click the submit control yourself, then verify with
  `nex_browser_wait_for`.
- Omit `accountId` only when `nex_browser_accounts` showed exactly one vault credential; with more
  than one, Desktop rejects the call rather than guessing.
- Never route a credential through `nex_browser_type` or `nex_browser_fill_form`. Those take literal
  text, which would place the password in the conversation. `nex_browser_fill_account` resolves it
  inside Desktop instead.
- `Fillable:` in the `nex_browser_accounts` output is authoritative. Ask the user to fix missing or
  invalid stored material in the NexBrowser app rather than retrying with a masked value.
