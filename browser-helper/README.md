# RoleProwl Greenhouse Helper

This Manifest V3 Chromium helper performs one candidate-authorized, Greenhouse-only assisted transfer. It does not submit applications, access passwords, handle CAPTCHA, or retain the Application Packet beyond the browser session.

## Build and install

1. Run `pnpm browser-helper:build` from the RoleProwl repository.
2. Open `chrome://extensions` in a Chromium-compatible browser.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select `browser-helper/dist`.

## Use

1. Complete and review a Greenhouse Application Packet until RoleProwl marks it ready.
2. Choose **Prepare assisted transfer** on the Application page.
3. Open the RoleProwl Helper browser action and choose **Capture packet and open Greenhouse**.
4. Review every populated value, attach the downloaded résumé, complete human verification, and submit manually.
5. Return to RoleProwl and explicitly confirm submission only after it actually occurred.

The helper has persistent host permission only for the two official Greenhouse job-board domains. It reads the RoleProwl page solely through Chromium's one-time `activeTab` permission after the candidate clicks the extension action.
