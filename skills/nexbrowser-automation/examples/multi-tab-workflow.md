# Example: Compare Data Across Tabs

User: "Open product links in new tabs and compare prices"

```text
1. nex_browser_snapshot()  # collect the product URLs or visible links
2. nex_browser_tab_new(url=<product-url>)
3. nex_browser_wait_for(time=1000)  # milliseconds
4. nex_browser_evaluate(expression="document.querySelector('.price')?.textContent")
5. nex_browser_tab_list()
6. nex_browser_tab_select(pageId=<next-page-id>)
7. Repeat for the remaining products, compare, and report.
```

Use `nex_browser_tab_close(pageId="page-N")` only for tabs the task has opened or the user has asked to close.
