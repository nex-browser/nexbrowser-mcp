# Example: Scrape Data from a Page

User: "Extract all product prices from this page"

```text
1. nex_browser_snapshot()  # verify the page and locate the price region
2. nex_browser_evaluate(expression="Array.from(document.querySelectorAll('.price')).map((element) => element.textContent?.trim())")
```

Use `nex_browser_evaluate` for structured extraction after verifying the visible page state.
