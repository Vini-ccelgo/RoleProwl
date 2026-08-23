(function () {
  "use strict";

  const extension = globalThis.chrome;
  const status = globalThis.document.getElementById("status");
  const capture = globalThis.document.getElementById("capture");

  function message(value) {
    status.textContent = value;
  }

  function validPacket(value) {
    if (!value || value.version !== "greenhouse-assisted-v1") return false;
    if (!Array.isArray(value.fields) || typeof value.destination !== "string")
      return false;
    const expiresAt = Date.parse(value.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
    try {
      const destination = new URL(value.destination);
      return (
        destination.protocol === "https:" &&
        ["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(
          destination.hostname,
        )
      );
    } catch {
      return false;
    }
  }

  async function currentResult() {
    const stored = await extension.storage.session.get(
      "roleprowlTransferResult",
    );
    const result = stored.roleprowlTransferResult;
    if (!result) return;
    message(
      `Last transfer\nVerified: ${result.verified}\nTransferred: ${result.transferred}\nHuman required: ${result.humanRequired}\nUnsupported: ${result.unsupported}\nFailed: ${result.failed}`,
    );
  }

  capture.addEventListener("click", async () => {
    message("Reading the explicitly prepared packet from this tab…");
    const [tab] = await extension.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) {
      message("No active RoleProwl tab is available.");
      return;
    }
    const [{ result }] = await extension.scripting.executeScript({
      target: { tabId: tab.id },
      func: () =>
        globalThis.document.getElementById("roleprowl-greenhouse-transfer")
          ?.value ?? null,
    });
    let packet;
    try {
      packet = typeof result === "string" ? JSON.parse(result) : null;
    } catch {
      packet = null;
    }
    if (!validPacket(packet)) {
      message(
        "No valid prepared packet was found. Return to the RoleProwl Application page and choose Prepare assisted transfer.",
      );
      return;
    }
    await extension.storage.session.set({ roleprowlTransferPacket: packet });
    await extension.tabs.create({ url: packet.destination });
    message(
      "Greenhouse opened. The packet will be consumed once on that exact job form.",
    );
  });

  void currentResult();
})();
