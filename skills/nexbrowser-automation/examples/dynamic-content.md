# Example: Handle Dynamic Content

User: "Click Load More and wait for new items"

```text
1. browser_snapshot()
2. browser_click(target=<load-more-ref>)
3. browser_wait_for(text="New Item")  # wait for text the new content is expected to show
4. browser_snapshot()
```

If the expected item does not appear, inspect the fresh snapshot, console errors, and failed network requests instead of repeatedly clicking the old target.
