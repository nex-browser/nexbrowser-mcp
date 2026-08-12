# Waiting and Timing

Wait after navigation and every action that can change page state.

## Recommended Pattern

```text
state-changing action
→ nex_browser_wait_for(text="expected content") or nex_browser_wait_for(target="e12")
→ nex_browser_snapshot
```

Use `time` only as a small fallback buffer when no stable observable text is available. It is measured in milliseconds (for example `time=2000` for two seconds) and capped at 120000.

## Humanized Pacing

Use normal interactive tools rather than scripted DOM shortcuts. Do not add long blind waits to simulate humanity—wait for the actual page outcome.

## Common Mistakes

- Acting immediately after navigation without checking fresh page state.
- Reusing an old target after a DOM update.
- Polling or retrying a failed action without inspecting the snapshot or diagnostics.
