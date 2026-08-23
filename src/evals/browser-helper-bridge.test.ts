import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";

type Bridge = {
  handleMessage(
    message: Record<string, unknown>,
    sender: { tab?: { url?: string } },
    storage: SessionStorage,
  ): Promise<Record<string, unknown>>;
};

type SessionStorage = ReturnType<typeof sessionStorage>;

function sessionStorage(initial: Record<string, unknown> = {}) {
  const data = { ...initial };
  return {
    data,
    async get(key: string) {
      return { [key]: data[key] };
    },
    async remove(key: string | string[]) {
      for (const candidate of Array.isArray(key) ? key : [key])
        delete data[candidate];
    },
    async set(values: Record<string, unknown>) {
      Object.assign(data, values);
    },
  };
}

function packet(overrides: Record<string, unknown> = {}) {
  return {
    version: "greenhouse-assisted-v1",
    transferId: "transfer-1",
    destination: "https://job-boards.greenhouse.io/acme/jobs/42",
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    fields: [],
    ...overrides,
  };
}

describe("RoleProwl trusted transfer bridge", () => {
  let bridge: Bridge;

  beforeAll(async () => {
    const source = await readFile(
      path.resolve("browser-helper/src/background.js"),
      "utf8",
    );
    const context = vm.createContext({ Date, Set, URL });
    vm.runInContext(source, context);
    bridge = (context as unknown as { RoleProwlTransferBridge: Bridge })
      .RoleProwlTransferBridge;
  });

  it("returns a valid packet once to the exact sender tab", async () => {
    const storage = sessionStorage({ roleprowlTransferPacket: packet() });
    const message = {
      type: "REQUEST_TRANSFER_PACKET",
      currentUrl: "https://job-boards.greenhouse.io/acme/jobs/42?source=helper",
    };
    const sender = {
      tab: {
        url: "https://job-boards.greenhouse.io/acme/jobs/42?source=tab",
      },
    };
    await expect(
      bridge.handleMessage(message, sender, storage),
    ).resolves.toEqual(
      expect.objectContaining({ ok: true, packet: expect.any(Object) }),
    );
    expect(storage.data.roleprowlTransferPacket).toBeUndefined();
    expect(storage.data.roleprowlTransferAuthorization).toEqual(
      expect.objectContaining({ transferId: "transfer-1" }),
    );
    await expect(
      bridge.handleMessage(message, sender, storage),
    ).resolves.toEqual(expect.objectContaining({ ok: false }));
  });

  it.each([
    ["wrong host", "https://example.com/acme/jobs/42", packet()],
    ["wrong job", "https://job-boards.greenhouse.io/acme/jobs/99", packet()],
    [
      "expired packet",
      "https://job-boards.greenhouse.io/acme/jobs/42",
      packet({ expiresAt: new Date(Date.now() - 1).toISOString() }),
    ],
    [
      "wrong version",
      "https://job-boards.greenhouse.io/acme/jobs/42",
      packet({ version: "unexpected-version" }),
    ],
  ])("denies %s", async (_label, senderUrl, candidate) => {
    const storage = sessionStorage({ roleprowlTransferPacket: candidate });
    const response = await bridge.handleMessage(
      { type: "REQUEST_TRANSFER_PACKET", currentUrl: senderUrl },
      { tab: { url: senderUrl } },
      storage,
    );
    expect(response.ok).toBe(false);
  });

  it("stores only a bounded result after an authorized transfer", async () => {
    const destination = "https://boards.greenhouse.io/acme/jobs/42";
    const storage = sessionStorage({
      roleprowlTransferAuthorization: {
        transferId: "transfer-1",
        destination,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    const response = await bridge.handleMessage(
      {
        type: "STORE_TRANSFER_RESULT",
        currentUrl: destination,
        result: {
          transferId: "transfer-1",
          rawHtml: "<main>private employer page</main>",
          fields: [
            {
              id: "email",
              label: "Email",
              status: "VERIFIED",
              value: "candidate@example.test",
            },
            { label: "Résumé", status: "HUMAN_REQUIRED" },
          ],
        },
      },
      { tab: { url: destination } },
      storage,
    );
    expect(response.ok).toBe(true);
    expect(storage.data.roleprowlTransferResult).toEqual({
      transferId: "transfer-1",
      verified: 1,
      transferred: 0,
      humanRequired: 1,
      unsupported: 0,
      failed: 0,
      fields: [
        { label: "Email", status: "VERIFIED" },
        { label: "Résumé", status: "HUMAN_REQUIRED" },
      ],
    });
    expect(JSON.stringify(storage.data.roleprowlTransferResult)).not.toContain(
      "candidate@example.test",
    );
    expect(storage.data.roleprowlTransferAuthorization).toBeUndefined();
  });
});
