import path from "node:path";
import { expect, test } from "@playwright/test";

const helper = path.resolve("browser-helper/src/content.js");
const bridge = path.resolve("browser-helper/src/background.js");
const popup = path.resolve("browser-helper/src/popup.js");

test("helper popup distinguishes neutral, captured, pending, and completed states", async ({
  context,
}) => {
  const cases = [
    [{}, "No prepared packet or transfer result"],
    [
      { roleprowlTransferPacket: { transferId: "transfer-1" } },
      "Packet captured. Waiting for the matching Greenhouse form.",
    ],
    [
      { roleprowlTransferAuthorization: { transferId: "transfer-1" } },
      "Greenhouse opened. Waiting for the transfer result.",
    ],
    [
      {
        roleprowlTransferResult: {
          verified: 3,
          transferred: 0,
          humanRequired: 1,
          unsupported: 2,
          failed: 0,
        },
      },
      "Transfer completed.",
    ],
  ] as const;

  for (const [stored, expected] of cases) {
    const candidate = await context.newPage();
    await candidate.setContent(`
      <button id="capture" type="button">Capture</button>
      <p id="status" role="status"></p>
    `);
    await candidate.evaluate((values) => {
      const session = { ...values } as Record<string, unknown>;
      Object.assign(globalThis, {
        chrome: {
          scripting: { executeScript: async () => [{ result: null }] },
          storage: {
            session: {
              async get(keys: string | string[]) {
                return Object.fromEntries(
                  (Array.isArray(keys) ? keys : [keys]).map((key) => [
                    key,
                    session[key],
                  ]),
                );
              },
              async remove() {},
              async set() {},
            },
          },
          tabs: {
            create: async () => undefined,
            query: async () => [],
          },
        },
      });
    }, stored);
    await candidate.addScriptTag({ path: popup });
    await expect(candidate.getByRole("status")).toContainText(expected);
    await candidate.close();
  }
});

test("helper popup reports capture immediately before a transfer result exists", async ({
  page,
}) => {
  await page.setContent(`
    <button id="capture" type="button">Capture</button>
    <p id="status" role="status"></p>
  `);
  await page.evaluate(() => {
    const session: Record<string, unknown> = {};
    const packet = {
      version: "greenhouse-assisted-v1",
      transferId: "transfer-popup-1",
      destination: "https://job-boards.greenhouse.io/acme/jobs/42",
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      fields: [],
    };
    Object.assign(globalThis, {
      chrome: {
        scripting: {
          executeScript: async () => [{ result: JSON.stringify(packet) }],
        },
        storage: {
          session: {
            async get(keys: string | string[]) {
              return Object.fromEntries(
                (Array.isArray(keys) ? keys : [keys]).map((key) => [
                  key,
                  session[key],
                ]),
              );
            },
            async remove(keys: string | string[]) {
              for (const key of Array.isArray(keys) ? keys : [keys])
                delete session[key];
            },
            async set(values: Record<string, unknown>) {
              Object.assign(session, values);
            },
          },
        },
        tabs: {
          create: async () => undefined,
          query: async () => [{ id: 1 }],
        },
      },
      roleprowlPopupSession: session,
    });
  });
  await page.addScriptTag({ path: popup });
  await page.getByRole("button", { name: "Capture" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Packet captured. Greenhouse opened. Waiting for the transfer result.",
  );
  const stored = await page.evaluate(
    () =>
      (
        globalThis as unknown as {
          roleprowlPopupSession: Record<string, unknown>;
        }
      ).roleprowlPopupSession,
  );
  expect(stored.roleprowlTransferPacket).toEqual(
    expect.objectContaining({ transferId: "transfer-popup-1" }),
  );
  expect(stored.roleprowlTransferResult).toBeUndefined();
});

test("popup packet reaches the Greenhouse content script through the trusted bridge", async ({
  page,
}) => {
  const destination = "https://job-boards.greenhouse.io/acme/jobs/42";
  await page.route(`${destination}**`, async (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `
        <form>
          <label for="first_name">First name</label><input id="first_name" name="first_name">
          <label for="last_name">Last name</label><input id="last_name" name="last_name">
          <label for="email">Email</label><input id="email" name="email">
          <label>Unsupported <input name="unrelated"></label>
          <input name="resume" type="file">
          <button id="submit" type="submit">Submit application</button>
        </form>
        <script>window.submitClicks = 0; document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); window.submitClicks += 1; });</script>
      `,
    }),
  );
  await page.addInitScript(() => {
    const session: Record<string, unknown> = {};
    const listeners: Array<
      (
        message: unknown,
        sender: { tab: { url: string } },
        sendResponse: (response: unknown) => void,
      ) => boolean | void
    > = [];
    const storage = {
      async get(key: string | string[]) {
        return Object.fromEntries(
          (Array.isArray(key) ? key : [key]).map((candidate) => [
            candidate,
            session[candidate],
          ]),
        );
      },
      async remove(key: string | string[]) {
        for (const candidate of Array.isArray(key) ? key : [key])
          delete session[candidate];
      },
      async set(values: Record<string, unknown>) {
        Object.assign(session, values);
      },
    };
    const runtime = {
      onMessage: {
        addListener(listener: (typeof listeners)[number]) {
          listeners.push(listener);
        },
      },
      async sendMessage(message: unknown) {
        return new Promise((resolve) => {
          const listener = listeners[0];
          if (!listener) return resolve(undefined);
          listener(message, { tab: { url: location.href } }, resolve);
        });
      },
    };
    Object.assign(globalThis, {
      chrome: { runtime, storage: { session: storage } },
      roleprowlTestSession: session,
    });
  });
  await page.goto(destination);
  await page.addScriptTag({ path: bridge });
  await page.evaluate(async (authorizedDestination) => {
    const extension = globalThis as unknown as {
      chrome: {
        storage: {
          session: { set(value: Record<string, unknown>): Promise<void> };
        };
      };
    };
    await extension.chrome.storage.session.set({
      roleprowlTransferPacket: {
        version: "greenhouse-assisted-v1",
        transferId: "transfer-runtime-1",
        destination: authorizedDestination,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        resumeFileName: "resume.pdf",
        fields: [
          {
            id: "first",
            label: "First name",
            value: "Avery",
            fieldNames: ["first_name"],
            fieldTypes: ["input_text"],
            options: [],
            kind: "TEXT",
          },
          {
            id: "last",
            label: "Last name",
            value: "Quill",
            fieldNames: ["last_name"],
            fieldTypes: ["input_text"],
            options: [],
            kind: "TEXT",
          },
          {
            id: "email",
            label: "Email",
            value: "avery@example.test",
            fieldNames: ["email"],
            fieldTypes: ["input_text"],
            options: [],
            kind: "TEXT",
          },
          {
            id: "unsupported",
            label: "Portfolio",
            value: "private candidate value",
            fieldNames: ["missing_portfolio"],
            fieldTypes: ["input_text"],
            options: [],
            kind: "TEXT",
          },
        ],
      },
    });
  }, destination);
  await page.addScriptTag({ path: helper });

  await expect(page.locator("#first_name")).toHaveValue("Avery");
  await expect(page.locator("#last_name")).toHaveValue("Quill");
  await expect(page.locator("#email")).toHaveValue("avery@example.test");
  await expect(page.locator('[name="unrelated"]')).toHaveValue("");
  await expect(page.getByRole("status")).toContainText(
    "RoleProwl transfer: 3 verified",
  );
  const state = await page.evaluate(async () => {
    const runtime = globalThis as unknown as {
      chrome: { runtime: { sendMessage(value: unknown): Promise<unknown> } };
      roleprowlTestSession: Record<string, unknown>;
      submitClicks: number;
    };
    const repeated = await runtime.chrome.runtime.sendMessage({
      type: "REQUEST_TRANSFER_PACKET",
      currentUrl: location.href,
    });
    return {
      repeated,
      session: runtime.roleprowlTestSession,
      submitClicks: runtime.submitClicks,
    };
  });
  expect(state.submitClicks).toBe(0);
  expect(state.repeated).toEqual(expect.objectContaining({ ok: false }));
  expect(state.session.roleprowlTransferPacket).toBeUndefined();
  expect(state.session.roleprowlTransferResult).toEqual(
    expect.objectContaining({ verified: 3, unsupported: 1, humanRequired: 1 }),
  );
  expect(JSON.stringify(state.session.roleprowlTransferResult)).not.toContain(
    "avery@example.test",
  );
  expect(JSON.stringify(state.session.roleprowlTransferResult)).not.toContain(
    "private candidate value",
  );
});

test("Greenhouse helper fills exact fields, reports boundaries, and never submits", async ({
  page,
}) => {
  await page.setContent(`
    <form>
      <label for="first_name">First name</label><input id="first_name" name="first_name">
      <label for="last_name">Last name</label><input id="last_name" name="last_name">
      <label for="email">Email</label><input id="email" name="email" type="email">
      <label for="phone">Phone</label><input id="phone" name="phone" type="tel">
      <label for="city">City / location</label><input id="city" name="city">
      <label for="question_42">Preferred shift</label>
      <select id="question_42" name="question_42"><option></option><option>Day</option><option>Night</option></select>
      <fieldset><legend>Sponsorship</legend><label><input type="radio" name="sponsorship" value="Yes">Yes</label><label><input type="radio" name="sponsorship" value="No">No</label></fieldset>
      <label>Portfolio <input name="ambiguous_a"></label>
      <label>Portfolio <input name="ambiguous_b"></label>
      <input name="resume" type="file">
      <div class="g-recaptcha" data-sitekey="synthetic"></div>
      <button id="submit" type="submit">Submit application</button>
    </form>
    <script>window.submitClicks = 0; document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); window.submitClicks += 1; });</script>
  `);
  await page.addScriptTag({ path: helper });
  const result = await page.evaluate(() => {
    const packet = {
      version: "greenhouse-assisted-v1",
      destination: "https://job-boards.greenhouse.io/acme/jobs/42",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      resumeFileName: "avery-resume.pdf",
      fields: [
        ["first", "First name", "Avery", ["first_name"], "TEXT"],
        ["last", "Last name", "Quill", ["last_name"], "TEXT"],
        ["email", "Email", "avery@example.test", ["email"], "TEXT"],
        ["phone", "Phone", "+1 555 0100", ["phone"], "TEXT"],
        ["location", "City / location", "Boston", ["city"], "TEXT"],
        ["shift", "Preferred shift", "Day", ["question_42"], "CHOICE"],
        ["sponsorship", "Sponsorship", "No", ["sponsorship"], "CHOICE"],
        ["portfolio", "Portfolio", "https://example.test", [], "TEXT"],
        ["resume", "Résumé", "avery-resume.pdf", ["resume"], "DOCUMENT"],
      ].map(([id, label, value, fieldNames, kind]) => ({
        id,
        label,
        value,
        fieldNames,
        fieldTypes: [],
        options: [],
        kind,
      })),
    };
    const engine = (
      globalThis as unknown as {
        RoleProwlGreenhouseTransfer: {
          transfer: (
            document: Document,
            packet: unknown,
            url: string,
          ) => {
            authorized: boolean;
            fields: { id: string; status: string }[];
          };
        };
      }
    ).RoleProwlGreenhouseTransfer;
    return {
      transfer: engine.transfer(
        document,
        packet,
        "https://job-boards.greenhouse.io/acme/jobs/42",
      ),
      submitClicks: (globalThis as unknown as { submitClicks: number })
        .submitClicks,
    };
  });
  await expect(page.locator("#first_name")).toHaveValue("Avery");
  await expect(page.locator("#last_name")).toHaveValue("Quill");
  await expect(page.locator("#email")).toHaveValue("avery@example.test");
  await expect(page.locator("#phone")).toHaveValue("+1 555 0100");
  await expect(page.locator("#city")).toHaveValue("Boston");
  await expect(page.locator("#question_42")).toHaveValue("Day");
  await expect(page.locator('[name="sponsorship"][value="No"]')).toBeChecked();
  await expect(page.locator("[name=ambiguous_a]")).toHaveValue("");
  await expect(page.locator("[name=ambiguous_b]")).toHaveValue("");
  expect(result.transfer.authorized).toBe(true);
  expect(result.transfer.fields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "first", status: "VERIFIED" }),
      expect.objectContaining({ id: "shift", status: "VERIFIED" }),
      expect.objectContaining({ id: "sponsorship", status: "VERIFIED" }),
      expect.objectContaining({ id: "portfolio", status: "UNSUPPORTED" }),
      expect.objectContaining({ id: "resume", status: "HUMAN_REQUIRED" }),
      expect.objectContaining({
        id: "human:verification",
        status: "HUMAN_REQUIRED",
      }),
    ]),
  );
  expect(result.submitClicks).toBe(0);
});

test("Greenhouse helper rejects expired and wrong-job packets", async ({
  page,
}) => {
  await page.setContent(
    '<label for="email">Email</label><input id="email" name="email">',
  );
  await page.addScriptTag({ path: helper });
  const results = await page.evaluate(() => {
    const engine = (
      globalThis as unknown as {
        RoleProwlGreenhouseTransfer: {
          transfer: (
            document: Document,
            packet: unknown,
            url: string,
          ) => { authorized: boolean };
        };
      }
    ).RoleProwlGreenhouseTransfer;
    const base = {
      version: "greenhouse-assisted-v1",
      destination: "https://boards.greenhouse.io/acme/jobs/42",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      fields: [],
    };
    return {
      wrongJob: engine.transfer(
        document,
        base,
        "https://boards.greenhouse.io/acme/jobs/99",
      ).authorized,
      expired: engine.transfer(
        document,
        { ...base, expiresAt: new Date(Date.now() - 1).toISOString() },
        "https://boards.greenhouse.io/acme/jobs/42",
      ).authorized,
    };
  });
  expect(results).toEqual({ wrongJob: false, expired: false });
  await expect(page.locator("#email")).toHaveValue("");
});

test("Greenhouse helper distinguishes unverifiable and mismatched writes", async ({
  page,
}) => {
  await page.setContent(`
    <label for="unverifiable">Unverifiable</label><input id="unverifiable" name="unverifiable">
    <label for="mismatch">Mismatch</label><input id="mismatch" name="mismatch">
  `);
  await page.addScriptTag({ path: helper });
  const fields = await page.evaluate(() => {
    const unverifiable =
      document.querySelector<HTMLInputElement>("#unverifiable")!;
    const mismatch = document.querySelector<HTMLInputElement>("#mismatch")!;
    Object.defineProperty(unverifiable, "value", {
      configurable: true,
      get() {
        throw new Error("readback unavailable");
      },
    });
    Object.defineProperty(mismatch, "value", {
      configurable: true,
      get: () => "different",
    });
    const engine = (
      globalThis as unknown as {
        RoleProwlGreenhouseTransfer: {
          transfer: (
            document: Document,
            packet: unknown,
            url: string,
          ) => { fields: { id: string; status: string }[] };
        };
      }
    ).RoleProwlGreenhouseTransfer;
    return engine.transfer(
      document,
      {
        version: "greenhouse-assisted-v1",
        destination: "https://boards.greenhouse.io/acme/jobs/42",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        fields: [
          {
            id: "unverifiable",
            label: "Unverifiable",
            value: "value",
            fieldNames: ["unverifiable"],
            kind: "TEXT",
          },
          {
            id: "mismatch",
            label: "Mismatch",
            value: "value",
            fieldNames: ["mismatch"],
            kind: "TEXT",
          },
        ],
      },
      "https://boards.greenhouse.io/acme/jobs/42",
    ).fields;
  });
  expect(fields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "unverifiable", status: "TRANSFERRED" }),
      expect.objectContaining({ id: "mismatch", status: "FAILED" }),
    ]),
  );
});
