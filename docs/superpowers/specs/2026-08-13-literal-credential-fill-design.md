# Literal Credential Fill Design

## Goal

Allow an MCP caller to provide a username, password, or already-retrieved 2FA code directly to NexBrowser and fill the corresponding fields in the active automation session. The agent remains responsible for navigating login flows, obtaining a 2FA code from an arbitrary website, submitting forms, and verifying outcomes.

This feature intentionally permits secrets to cross the MCP request boundary. It must minimize additional exposure by never storing or echoing supplied values.

## Scope

### Included

- Add a `nex_browser_fill_credentials` MCP tool.
- Accept literal username, password, and 2FA-code values paired with current-page targets.
- Fill one or more visible fields in a deterministic order.
- Document an agent-driven workflow for obtaining a 2FA code from an arbitrary website in a temporary tab.
- Update public tool catalogs, snapshots, safety guidance, and tests.

### Excluded

- Persisting credentials in NexBrowser Desktop or binding them to windows.
- Generating TOTP codes locally from a secret.
- Building site-specific integrations for 2FA retrieval websites.
- Automatically submitting login forms.
- Automatically solving CAPTCHAs, device approvals, SMS challenges, or ambiguous verification steps.
- Replacing the existing bound-account tool, `nex_browser_fill_account`.

## MCP Tool Interface

The new tool is named `nex_browser_fill_credentials` and uses the standard automation-session fields, including optional `pageId`, plus these optional pairs:

- `usernameTarget` and `username`
- `passwordTarget` and `password`
- `totpTarget` and `totpCode`

At least one complete pair is required. For each credential kind, providing only the target or only the value is an invalid request. Empty strings are accepted as literal values only if the existing fill action accepts them; they are not treated as missing arguments.

The tool fills complete pairs in this fixed order:

1. Username
2. Password
3. 2FA code

It uses the existing session action endpoint and the existing `fill` browser action. No new NexBrowser Desktop API endpoint is required.

The tool never submits the form. A successful result names only the credential kinds that were filled. It never includes supplied values in text or structured output.

## Agent-Driven 2FA Retrieval

The retrieval source is an arbitrary user-provided URL, not a site-specific integration. The agent performs the workflow with existing tab, navigation, snapshot, inspection, and interaction tools:

1. Record the login page and its tab identifier.
2. Open a temporary tab in the same NexBrowser window.
3. Navigate to the supplied retrieval URL.
4. Inspect the rendered page.
5. If necessary, interact with visible controls or enter a user-supplied key according to the page.
6. Select a verification code only when the page context makes the choice unambiguous.
7. Close the temporary tab when retrieval succeeds, return to the login tab, and fill the code with `nex_browser_fill_credentials`.
8. Submit and verify the login through separate, explicit browser actions.

A 6-to-8-digit number is a common candidate, not a universal guarantee. Page labels and context are authoritative. The agent must not guess when multiple values plausibly represent the code.

## Error Handling

- Reject requests with no complete credential pair.
- Reject any credential kind for which exactly one of target and value is present.
- Fill fields sequentially and stop on the first failed browser action.
- Report the credential kind that failed without returning its value.
- Preserve the existing action error details only when they do not contain supplied credential values.
- Do not roll back fields filled before a later field fails.
- Do not submit the form after success or failure.

For 2FA retrieval, the agent stops and reports the condition when it encounters an ambiguous code, CAPTCHA, human confirmation, device approval, SMS challenge, inaccessible page, or other flow it cannot safely resolve. On retrieval failure, it may preserve the temporary tab so the user can inspect the state. On success, it should close the temporary tab when practical.

## Security and Privacy

Literal credentials necessarily enter the model/tool-call context and cross the MCP transport. They may also be visible to transport-level auditing outside this package. Documentation must state this clearly and continue recommending `nex_browser_fill_account` when a stored, bound account is available.

Within this package:

- Do not log supplied credential values.
- Do not include supplied values in success or error results.
- Do not place credentials in URLs unless the user supplied a retrieval URL that already contains them.
- Do not persist credentials in module state, session state, files, or Desktop account storage.
- Do not add credential values to structured output.

The existing generic `nex_browser_type` and `nex_browser_fill_form` tools remain available. The new tool provides explicit credential semantics, deterministic ordering, validation, and redacted results.

## Documentation Changes

- Add the tool to the generated tool catalog and registration snapshots.
- Update the NexBrowser automation skill to distinguish bound-account login from literal-credential login.
- Add an example covering a multi-step login with an arbitrary 2FA retrieval URL.
- State that retrieval-page interactions are agent-decided and must stop at ambiguous or human-only challenges.

## Test Strategy

Unit tests will verify:

- At least one complete pair is required.
- A value without its target is rejected.
- A target without its value is rejected.
- Username, password, and 2FA code are filled in deterministic order.
- A failure stops subsequent fills.
- The tool never invokes a submit or click action.
- Supplied credential values never appear in text or structured results.
- Existing bound-account behavior and safety tests remain intact.
- Tool registration and preview snapshots include the new schema and description.

The full test suite, type checking, and package build must pass before completion.
