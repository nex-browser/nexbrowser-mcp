# Example: Sign In With User-Supplied Literal Credentials

Use this only when the user explicitly supplies the literal credentials in the current request or explicitly asks you to use them. Prefer `nex_browser_fill_account` when a stored vault credential is available.

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
10. If 2FA is requested, call nex_browser_tab_list(sessionId=SESSION), identify the current login page, and retain its stable page ID as LOGIN_PAGE_ID.
11. nex_browser_tab_new(sessionId=SESSION, url=<retrieval-url>)
12. Call nex_browser_tab_list(sessionId=SESSION) again, identify the newly opened retrieval page, and retain its stable page ID as RETRIEVAL_PAGE_ID.
13. nex_browser_snapshot(sessionId=SESSION, pageId=RETRIEVAL_PAGE_ID)
14. Inspect the retrieval page and interact only as required by its visible state.
15. If the retrieval site requires a user-supplied secret or key, snapshot the currently visible field and call nex_browser_fill_credentials(sessionId=SESSION, pageId=RETRIEVAL_PAGE_ID, passwordTarget=<ref>, password=<site-secret>).
16. If one code is unambiguous, retain it; otherwise stop and report the blocker.
17. nex_browser_tab_close(sessionId=SESSION, pageId=RETRIEVAL_PAGE_ID)
18. nex_browser_tab_select(sessionId=SESSION, pageId=LOGIN_PAGE_ID)
19. nex_browser_snapshot(sessionId=SESSION, pageId=LOGIN_PAGE_ID)
20. nex_browser_fill_credentials(sessionId=SESSION, pageId=LOGIN_PAGE_ID, totpTarget=<ref>, totpCode=<retrieved-code>)
21. nex_browser_click(sessionId=SESSION, pageId=LOGIN_PAGE_ID, target=<verify-ref>)
22. Verify the authenticated page with nex_browser_wait_for or nex_browser_snapshot.
```

If the site sends a recovery-email code instead, retain `LOGIN_PAGE_ID`, open the explicitly
supplied email login URL in a temporary tab, snapshot each login step, and use
`nex_browser_fill_credentials` for the explicitly supplied email address and password. Read only a
single message/code clearly tied to the current sign-in, close the email tab, reselect
`LOGIN_PAGE_ID`, snapshot it again, and fill that code with `totpTarget` and `totpCode`.

## Rules

- Do not put credential values or retrieved codes into prose, logs, URLs, or tool results. A user-supplied retrieval URL is the only allowed URL exception.
- `nex_browser_fill_credentials` fills only the current visible targets and never submits. Snapshot again when a sign-in step changes, then click the visible control yourself.
- Never use `nex_browser_type` or `nex_browser_fill_form` for a secret or key. Their generic action result may echo page data. Map a user-supplied retrieval-site secret to the currently visible field with `nex_browser_fill_credentials`, using `passwordTarget` and `password`.
- Treat every literal value as present in MCP and model context. Never store it or repeat it in a response.
- Treat the main login, retrieval URL, and recovery-email login supplied together as one ephemeral bundle. Do not persist it or guess which bundle belongs to which browser window.
- Stop and report the blocker if the retrieval page is inaccessible, a retrieval code is ambiguous, the retrieval site requires a CAPTCHA, human confirmation, device approval, or SMS challenge, or the agent cannot safely resolve any part of the flow.
