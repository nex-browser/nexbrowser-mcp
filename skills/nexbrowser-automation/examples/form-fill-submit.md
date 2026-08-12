# Example: Fill and Submit a Form

User: "Fill out the login form with username test and password pass123"

```text
1. nex_browser_snapshot()
2. nex_browser_type(target=<username-ref>, text="test")
3. nex_browser_type(target=<password-ref>, text="pass123")
4. nex_browser_click(target=<submit-ref>)
5. nex_browser_wait_for(text="Welcome")  # or another observable success state
6. nex_browser_snapshot()
```

Use fresh refs from the initial snapshot and take a new snapshot if the form validation changes the page. To fill several fields in one call, use `nex_browser_fill_form(fields=[{target, value}, ...])`.

For a platform login the window is already bound to, do not use these tools — they take literal text
and would place the password in the conversation. Use `nex_browser_fill_account` instead; see
[Sign in with a bound account](sign-in-with-bound-account.md).
