# Example: Verify a Site With a Cloud Phone Number

User: "Open window 1001, go to https://example.com/signup, buy a US number for this site, and enter the SMS code"

```text
1. nex_browser_connect(windowId="1001", startIfNeeded=true)        # keep the returned sessionId
2. nex_browser_navigate(sessionId=S, url="https://example.com/signup")
3. nex_sms_country_list()                                          # pick the countryId
4. nex_sms_project_list(countryId=C)                               # pick projectId, read unit price and stock
5. Quote project, quantity, and total price to the user and wait for an explicit yes.
6. nex_sms_buy(countryId=C, projectId=P, quantity=1, maxTotalPrice=<agreed total>)   # may return null; reconcile records and billing before selecting tel
7. nex_browser_snapshot(sessionId=S)
8. nex_browser_type(sessionId=S, target=<phone-ref>, text=<tel in the site's format>)
9. nex_browser_click(sessionId=S, target=<send-code-ref>)
10. nex_browser_snapshot(sessionId=S)                              # get the code input ref
11. nex_sms_code_fill(sessionId=S, tel=<tel>, target=<code-ref>, waitSeconds=90)
12. nex_browser_click(sessionId=S, target=<verify-ref>)           # or submit=true in step 11
13. nex_browser_wait_for(sessionId=S, text="expected success text")
```

Notes:

- A null purchase response is successful but gives no newly allocated number ID. Recent matching candidates can include old purchases; do not automatically select one or repeat the purchase. Check records and billing first. A release response also does not establish a new refund; refresh records and billing to confirm.

- `nex_sms_buy` charges the account balance. Never call it without the user's explicit confirmation of the quoted total, and pass that total as `maxTotalPrice`.
- `nex_sms_code_fill` types the code directly into the page; the code does not need to appear in the conversation. Use `nex_sms_code_get` only when the user wants to see the code.
- Many sites expect the national number without the country code, or a separate country selector. Check the field's placeholder in the snapshot before typing `tel`.
- If the site rejects the number, release it with `nex_sms_release(tel, reason="rejected")` (or `already_registered`) before buying another.
- If no code arrives, click the site's resend control and call `nex_sms_code_fill` again with `onlyNew=true`. If it still times out, release with `reason="no_code"` for a refund.
- On CAPTCHA, first follow the [NexCaptcha page workflow](../guides/captcha.md): check support and quote the fee, then submit only after explicit confirmation. Hand over with a specific blocker if it cannot proceed. Stop on human confirmation or device approval.
