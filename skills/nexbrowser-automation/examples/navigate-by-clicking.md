# Example: Navigate by Clicking Links

User: "Go to the site, open Pricing, and read the plans"

```text
1. nex_browser_connect(windowId="WINDOW_ID")
2. nex_browser_navigate(url="https://example.com")
3. nex_browser_wait_for(text="Home")
4. nex_browser_snapshot()
5. nex_browser_click(target=<pricing-link-ref>)
6. nex_browser_wait_for(text="Plans")
7. nex_browser_snapshot()
```

If the link does not navigate after verifying the unchanged state, extract its `href` with `nex_browser_evaluate` and use `nex_browser_navigate` as a fallback. Clicking remains the default because it preserves the application's normal transition behavior.
