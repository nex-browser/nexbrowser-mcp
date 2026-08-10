# Example: Connect and Navigate

User: "Connect to my NexBrowser and go to example.com"

```text
1. nex_browser_connect(windowId="WINDOW_ID", startIfNeeded=true)
2. browser_navigate(url="https://example.com")
3. browser_wait_for(text="Example Domain")   # or time=2000 (milliseconds) as a fallback
4. browser_snapshot()
```
