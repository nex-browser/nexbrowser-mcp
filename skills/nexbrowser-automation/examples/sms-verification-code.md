# Example: Verify a Site With a Cloud Phone Number

User: "Open window 1001, go to https://example.com/signup, buy a US number for this site, and enter the SMS code"

```text
1. nex_browser_connect(windowId="1001", startIfNeeded=true)        # keep the returned sessionId
2. nex_browser_navigate(sessionId=S, url="https://example.com/signup")
3. nex_sms_country_list()                                          # pick the countryId
4. nex_sms_project_list(countryId=C)                               # pick projectId, read unit price and stock
5. nex_sms_buy(countryId=C, projectId=P, quantity=1)   # may return null; reconcile records and billing before selecting tel
6. nex_browser_snapshot(sessionId=S)
7. nex_browser_type(sessionId=S, target=<phone-ref>, text=<tel in the site's format>)
8. nex_browser_click(sessionId=S, target=<send-code-ref>)          # retain this send request's ISO timestamp with timezone
9. nex_browser_snapshot(sessionId=S)                              # get the code input ref
10. nex_sms_code_fill(sessionId=S, tel=<tel>, target=<code-ref>, waitSeconds=120, receivedAfter=<send request ISO timestamp>)
11. nex_browser_click(sessionId=S, target=<verify-ref>)           # or submit=true in step 10
12. nex_browser_wait_for(sessionId=S, text="expected success text")
```

Notes:

- A null purchase response is successful but gives no newly allocated number ID. Recent matching candidates can include old purchases; do not automatically select one or repeat the purchase. Check records and billing first. A release response also does not establish a new refund; refresh records and billing to confirm.

- `nex_sms_buy` charges the account balance directly for the requested task at the current server price. No separate quotation or payment confirmation is needed. A price inquiry alone never places an order.
- `nex_sms_code_fill` types the code directly into the page; the code does not need to appear in the conversation. Use `nex_sms_code_get` only when the user wants to see the code. Both accept receivedAfter (ISO timestamp with timezone) to ignore earlier SMS locally, without forwarding it to Desktop. Set it to the current send request time and normally keep onlyNew=false so a new code already present on the first pull is accepted. Missing/invalid receipt times cannot establish freshness and are never filled by a time-filtered wait.
- Many sites expect the national number without the country code, or a separate country selector. Check the field's placeholder in the snapshot before typing `tel`.
- If the site rejects a task-owned number, release it with `nex_sms_release(tel, reason="rejected")` (or `already_registered`), reconcile, then choose a compatible replacement without asking again.
- If no code arrives within 120 seconds, release an eligible task-owned number with `reason="no_code"`, verify the record/billing and replace it within 3 number attempts including the first. Track the failed country/project; choose another compatible catalog candidate while preserving any fixed country and target app. Changing the country/project does not reset the limit. Refill the number and trigger a new send. For a resend retain the new send timestamp and prefer receivedAfter with onlyNew=false; use onlyNew=true only when deliberately excluding everything present on the first pull.
- On CAPTCHA, first follow the [NexCaptcha page workflow](../guides/captcha.md): check support, then submit directly when needed for the requested task. Hand over with a specific blocker if it cannot proceed. Stop on human confirmation or device approval.
