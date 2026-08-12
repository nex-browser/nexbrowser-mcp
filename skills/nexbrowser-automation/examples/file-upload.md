# Example: File Upload

User: "Upload my resume to the job application form"

```text
1. nex_browser_snapshot()  # locate the visible upload control
2. nex_browser_file_upload(target=<file-input-ref>, files=["C:/absolute/path/resume.pdf"])
3. nex_browser_wait_for(time=1000)  # milliseconds
4. nex_browser_snapshot()  # verify the selected file or completion state
```

Use the allowed absolute local path supplied with the user's attachment metadata directly. Do not re-encode, copy, or read the file through page JavaScript.
