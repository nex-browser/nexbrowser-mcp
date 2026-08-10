# Example: Debug a Failed Form Submission

User: "The form submission is not working"

```text
1. browser_snapshot()                         # verify the visible validation state
2. browser_console_messages()                 # inspect page exceptions and errors
3. browser_network_requests()                 # locate failed requests
4. browser_network_request(index=<request-index>)  # inspect a relevant request
5. Decide the next action from the evidence and re-snapshot before retrying.
```

Do not assume a click failed because of timing. Check the rendered UI, console, and network result first.
