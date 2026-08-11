# Example: Fill a Login Form

User: "Log in to the website"

```text
1. nex_browser_connect(windowId="WINDOW_ID")
2. nex_browser_navigate(url="https://example.com/login")
3. nex_browser_snapshot()
   → textbox "Email" [ref=e5]
   → textbox "Password" [ref=e6]
   → button "Login" [ref=e7]
4. nex_browser_type(target="e5", text="user@example.com")
5. nex_browser_type(target="e6", text="password")
6. nex_browser_click(target="e7")
7. nex_browser_snapshot()
```

Verify the resulting authenticated UI state; a successful click alone is not sufficient.
