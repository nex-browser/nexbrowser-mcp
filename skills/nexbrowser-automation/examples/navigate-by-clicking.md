# Example: Navigate by Clicking Links

User: "Go to the site, open Pricing, and read the plans"

```text
1. nex_browser_connect(windowId="WINDOW_ID")
2. browser_navigate(url="https://example.com")
3. browser_wait_for(text="Home")
4. browser_snapshot()
5. browser_click(target=<pricing-link-ref>)
6. browser_wait_for(text="Plans")
7. browser_snapshot()
```

If the link does not navigate after verifying the unchanged state, extract its `href` with `browser_evaluate` and use `browser_navigate` as a fallback. Clicking remains the default because it preserves the application's normal transition behavior.
