# Example: Sign In With User-Supplied Literal Credentials

Use this only when the user explicitly supplies the literal credentials or explicitly asks you to use them. Prefer `nex_browser_fill_account` when a bound account is available.

```text
1. nex_browser_connect(windowId="22448", startIfNeeded=true) -> SESSION
2. nex_browser_navigate(sessionId=SESSION, url=<login-url>)
3. nex_browser_snapshot(sessionId=SESSION)
4. nex_browser_fill_credentials(sessionId=SESSION, usernameTarget=<ref>, username=<username>)
5. nex_browser_click(sessionId=SESSION, target=<next-ref>)
6. nex_browser_wait_for(sessionId=SESSION, text=<password-step-text>)
7. nex_browser_snapshot(sessionId=SESSION)
8. nex_browser_fill_credentials(sessionId=SESSION, passwordTarget=<ref>, password=<password>)
9. nex_browser_click(sessionId=SESSION, target=<login-ref>)
10. If 2FA is requested, retain LOGIN_PAGE_ID and call nex_browser_tab_new(sessionId=SESSION, url=<retrieval-url>).
11. Inspect the retrieval page and interact only as required by its visible state.
12. If one code is unambiguous, retain it; otherwise stop and report the blocker.
13. nex_browser_tab_close(sessionId=SESSION, pageId=<retrieval-page-id>)
14. nex_browser_tab_select(sessionId=SESSION, pageId=LOGIN_PAGE_ID)
15. nex_browser_snapshot(sessionId=SESSION)
16. nex_browser_fill_credentials(sessionId=SESSION, totpTarget=<ref>, totpCode=<retrieved-code>)
17. nex_browser_click(sessionId=SESSION, target=<verify-ref>)
18. Verify the authenticated page with nex_browser_wait_for or nex_browser_snapshot.
```

## Rules

- Do not put credential values or retrieved codes into prose, logs, URLs, or tool results. A user-supplied retrieval URL is the only allowed URL exception.
- `nex_browser_fill_credentials` fills only the current visible targets and never submits. Snapshot again when a sign-in step changes, then click the visible control yourself.
- Treat every literal value as present in MCP and model context. Never store it or repeat it in a response.
- Stop and report the blocker if a retrieval code is ambiguous, or if the retrieval site requires a CAPTCHA, human confirmation, device approval, or SMS challenge.
