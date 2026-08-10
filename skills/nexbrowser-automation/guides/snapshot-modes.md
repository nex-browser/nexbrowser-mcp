# Snapshot Targets and Freshness

NexBrowser unified MCP uses accessibility snapshots. Interactive nodes contain refs such as `[ref=e48]`.

## Using a Snapshot Ref

Copy the ref exactly and pass it as `target`:

```text
browser_click(target="e50")
browser_type(target="e48", text="hello")
browser_select_option(target="e70", values=["option1"])
```

The MCP also accepts the `aria-ref=e48` form, but bare `e48` is preferred. A unique CSS selector is supported when snapshot targeting is unavailable.

## Freshness Rules

1. Snapshot before interacting.
2. Re-snapshot after navigation, form submission, scrolling that changes content, dialogs, or significant UI updates.
3. If a target is no longer valid, snapshot again and retry once with the newly returned ref.
4. Never guess a ref or reuse one from a previous page state.

## Managing Large Pages

- Use `depth` to limit the returned tree.
- Use `target` to inspect a subtree.
- Add `boxes: true` when geometry matters.
