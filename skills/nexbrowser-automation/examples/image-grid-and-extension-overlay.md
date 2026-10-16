# Image Grids and Extension Overlays

Use a screenshot when an image grid, canvas or page-injected extension menu has no actionable accessibility refs. Extension account-fill dropdowns drawn inside the page (including iframe and closed Shadow DOM content) are captured and clicked through the page viewport. Native toolbar popups and browser chrome are outside this API.

## Capture and Click

1. Connect to the intended environment and keep its `sessionId` and `pageId` explicit.
2. Capture an element with `nex_browser_take_screenshot(target="#grid")`, or a viewport area with `clip={x:100,y:200,width:400,height:400}`. A snapshot ref is also a valid target. Do not combine target, clip, or fullPage=true.
3. The default scale is `css`: one image pixel equals one CSS pixel. The result also includes `origin`, `region`, `viewport`, `scroll`, and `pixelsPerCssPixel`.
4. To click image point `(imageX,imageY)`, call `nex_browser_mouse_click_xy` with:

   ```text
   x = origin.x + imageX / pixelsPerCssPixel
   y = origin.y + imageY / pixelsPerCssPixel
   ```

5. Inspect the new page state after clicking. Navigation, scrolling, layout changes or refreshed challenge images invalidate the previous image/coordinate mapping: capture again.

Coordinates address the current viewport in CSS pixels, not the screen or browser window. A crop must fit inside that viewport. Clicks outside it are rejected. Element screenshots may scroll the element into view; use their returned geometry rather than a box recorded before capture.

## Pair with 2Captcha

For a page CAPTCHA, first use the [NexCaptcha page workflow](../guides/captcha.md). Only consider a separately authorized external solver when NexCaptcha cannot support the challenge. Quote and confirm its fee before submitting image data; never create a second task because the first timed out.

The two MCP servers do not call each other. The agent coordinates NexBrowser screenshots, the external solver and subsequent clicks.

- Capture only the challenge grid and read its instruction and row/column counts.
- Read the resulting image bytes and convert them to Base64; `solve_captcha(kind="grid")` expects image data in `params.body`, not a file path. The screenshot image content is Base64 too, but large artifacts may only return a managed file path.
- Follow the installed 2Captcha tool schema for `hintText`, `rows` and `cols`. Apply 1-based row-major tile indices from `solution`, such as `click:2/3/4`.
- For tile index `n`, row count `rows` and column count `cols`, its center in the screenshot is:

  ```text
  column = (n - 1) % cols
  row = floor((n - 1) / cols)
  imageX = (column + 0.5) * imageWidth / cols
  imageY = (row + 0.5) * imageHeight / rows
  ```

  Use the coordinate mapping above to click those centers. The crop must exclude instructions, margins and buttons; unequal tiles require their actual measured bounds.

- Poll any returned job ID rather than creating another solve. Respect the user's solve budget and approval requirements. Verify the challenge passed before submitting the original form.
- Dynamic grids replace selected images. Wait for replacements and solve the current image again; never keep clicking stale tiles.

The same screenshot/coordinate tools can click an extension's visible account-fill dropdown. Prefer `nex_browser_fill_account` for bound vault credentials: it delegates filling to the extension without exposing stored passwords in MCP.
