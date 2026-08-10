# Example: Compare Data Across Tabs

User: "Open product links in new tabs and compare prices"

```text
1. browser_snapshot()  # collect the product URLs or visible links
2. browser_tab_new(url=<product-url>)
3. browser_wait_for(time=1000)  # milliseconds
4. browser_evaluate(expression="document.querySelector('.price')?.textContent")
5. browser_tab_list()
6. browser_tab_select(pageId=<next-page-id>)
7. Repeat for the remaining products, compare, and report.
```

Use `browser_tab_close(pageId="page-N")` only for tabs the task has opened or the user has asked to close.
