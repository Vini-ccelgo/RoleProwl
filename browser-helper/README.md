# RoleProwl Greenhouse Helper

This Manifest V3 Chromium helper performs one candidate-authorized, Greenhouse-only assisted transfer in two bounded phases. It does not submit applications, access passwords, handle CAPTCHA, or retain the Application Packet beyond the browser session.

## Build and install

1. Run `pnpm browser-helper:build` from the RoleProwl repository.
2. Open `chrome://extensions` in a Chromium-compatible browser.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select `browser-helper/dist`.

## Use

1. Complete and review a Greenhouse Application Packet until RoleProwl marks it ready.
2. Choose **Continue with RoleProwl Helper** on the Application page.
3. Open the RoleProwl Helper browser action and choose **Capture packet and open Greenhouse**.
4. Let the helper transfer the approved scalar decisions and, when safely included, attach the exact selected résumé. If attachment is reported as unavailable, attach the downloaded résumé manually.
5. Review every populated value, complete any reported candidate/human steps, and submit manually.
6. Return to RoleProwl and explicitly confirm submission only after it actually occurred.

The helper has persistent host permission only for the two official Greenhouse job-board domains. It reads the RoleProwl page solely through Chromium's one-time `activeTab` permission after the candidate clicks the extension action. Prepared packets expire after five minutes. Résumé bytes are limited to the application's existing 4 MiB upload boundary, remain in session-only extension storage until the exact job consumes the packet once, and are never copied into a transfer result.

## Pre-live distribution requirement

The current unpacked Developer Mode installation is for alpha operator testing only. Before public launch, RoleProwl Helper must use a signed/published ordinary browser-extension distribution path that requires no repository access, package tooling, Developer Mode, or Load unpacked step.
