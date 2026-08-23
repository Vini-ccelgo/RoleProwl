import path from "node:path";
import { expect, test } from "@playwright/test";

const helper = path.resolve("browser-helper/src/content.js");

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
