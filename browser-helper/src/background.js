(function () {
  "use strict";

  const PACKET_KEY = "roleprowlTransferPacket";
  const AUTHORIZATION_KEY = "roleprowlTransferAuthorization";
  const RESULT_KEY = "roleprowlTransferResult";
  const VERSION = "greenhouse-assisted-v1";
  const ALLOWED_HOSTS = new Set([
    "boards.greenhouse.io",
    "job-boards.greenhouse.io",
  ]);
  const ALLOWED_STATUSES = new Set([
    "VERIFIED",
    "TRANSFERRED",
    "HUMAN_REQUIRED",
    "UNSUPPORTED",
    "FAILED",
  ]);
  const consuming = new Set();

  function greenhouseJob(value) {
    try {
      const url = new URL(value);
      const jobId = url.pathname.match(/\/jobs\/(\d+)/u)?.[1];
      return url.protocol === "https:" &&
        ALLOWED_HOSTS.has(url.hostname) &&
        jobId
        ? { host: url.hostname, jobId }
        : null;
    } catch {
      return null;
    }
  }

  function sameAuthorizedJob(left, right) {
    const expected = greenhouseJob(left);
    const current = greenhouseJob(right);
    return Boolean(
      expected &&
      current &&
      expected.host === current.host &&
      expected.jobId === current.jobId,
    );
  }

  function validPacket(packet) {
    return Boolean(
      packet &&
      packet.version === VERSION &&
      typeof packet.transferId === "string" &&
      packet.transferId.length > 0 &&
      packet.transferId.length <= 200 &&
      typeof packet.destination === "string" &&
      greenhouseJob(packet.destination) &&
      Array.isArray(packet.fields) &&
      Number.isFinite(Date.parse(packet.expiresAt)) &&
      Date.parse(packet.expiresAt) > Date.now(),
    );
  }

  function boundedResult(value, transferId) {
    if (
      !value ||
      value.transferId !== transferId ||
      !Array.isArray(value.fields)
    )
      return null;
    const fields = value.fields.slice(0, 100).flatMap((field) => {
      if (
        !field ||
        typeof field.label !== "string" ||
        !ALLOWED_STATUSES.has(field.status)
      )
        return [];
      return [
        {
          label: field.label.normalize("NFKC").trim().slice(0, 200),
          status: field.status,
        },
      ];
    });
    const count = (status) =>
      fields.filter((field) => field.status === status).length;
    return {
      transferId,
      verified: count("VERIFIED"),
      transferred: count("TRANSFERRED"),
      humanRequired: count("HUMAN_REQUIRED"),
      unsupported: count("UNSUPPORTED"),
      failed: count("FAILED"),
      fields,
    };
  }

  async function handleMessage(message, sender, storage) {
    const senderUrl = sender?.tab?.url;
    if (!senderUrl || !sameAuthorizedJob(message?.currentUrl, senderUrl))
      return { ok: false, reason: "UNAUTHORIZED_SENDER" };

    if (message.type === "REQUEST_TRANSFER_PACKET") {
      const stored = await storage.get(PACKET_KEY);
      const packet = stored[PACKET_KEY];
      if (!validPacket(packet)) {
        if (packet) await storage.remove(PACKET_KEY);
        return { ok: false, reason: "INVALID_OR_EXPIRED_PACKET" };
      }
      if (!sameAuthorizedJob(packet.destination, senderUrl))
        return { ok: false, reason: "DESTINATION_MISMATCH" };
      if (consuming.has(packet.transferId))
        return { ok: false, reason: "PACKET_ALREADY_CONSUMED" };
      consuming.add(packet.transferId);
      try {
        await storage.remove(PACKET_KEY);
        await storage.set({
          [AUTHORIZATION_KEY]: {
            transferId: packet.transferId,
            destination: packet.destination,
            expiresAt: packet.expiresAt,
          },
        });
      } finally {
        consuming.delete(packet.transferId);
      }
      return { ok: true, packet };
    }

    if (message.type === "STORE_TRANSFER_RESULT") {
      const stored = await storage.get(AUTHORIZATION_KEY);
      const authorization = stored[AUTHORIZATION_KEY];
      if (
        !authorization ||
        Date.parse(authorization.expiresAt) <= Date.now() ||
        !sameAuthorizedJob(authorization.destination, senderUrl)
      ) {
        if (authorization) await storage.remove(AUTHORIZATION_KEY);
        return { ok: false, reason: "TRANSFER_NOT_AUTHORIZED" };
      }
      const result = boundedResult(message.result, authorization.transferId);
      if (!result) return { ok: false, reason: "INVALID_TRANSFER_RESULT" };
      await storage.set({ [RESULT_KEY]: result });
      await storage.remove(AUTHORIZATION_KEY);
      return { ok: true, result };
    }

    return { ok: false, reason: "UNKNOWN_MESSAGE" };
  }

  const bridge = {
    boundedResult,
    greenhouseJob,
    handleMessage,
    sameAuthorizedJob,
    validPacket,
  };
  globalThis.RoleProwlTransferBridge = bridge;

  const extension = globalThis.chrome;
  if (!extension?.runtime?.onMessage || !extension?.storage?.session) return;
  extension.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void handleMessage(message, sender, extension.storage.session)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, reason: "BRIDGE_FAILURE" }));
    return true;
  });
})();
