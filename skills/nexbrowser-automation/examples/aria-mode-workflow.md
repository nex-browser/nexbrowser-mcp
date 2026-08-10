# Example: Search with Snapshot Refs

User: "Search for antidetect browser on Bing"

```text
1. nex_browser_connect(windowId="WINDOW_ID")
2. browser_navigate(url="https://www.bing.com")
3. browser_snapshot()
   → textbox "Search" [ref=e48]
4. browser_type(target="e48", text="antidetect browser")
5. browser_press_key(key="Enter")
6. browser_wait_for(time=1000)   # milliseconds; prefer a text wait when the result text is predictable
7. browser_snapshot()
8. browser_click(target="e120")
```

`e48` and `e120` are temporary refs from the current snapshot. Obtain new refs after search results or navigation change the page.
