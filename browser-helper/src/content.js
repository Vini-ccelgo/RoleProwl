(function () {
  "use strict";

  const ALLOWED_HOSTS = new Set([
    "boards.greenhouse.io",
    "job-boards.greenhouse.io",
  ]);

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .replace(/\s+/gu, " ")
      .trim()
      .toLocaleLowerCase("en-US");
  }

  function destinationMatches(expected, current) {
    try {
      const expectedUrl = new URL(expected);
      const currentUrl = new URL(current);
      if (
        expectedUrl.protocol !== "https:" ||
        !ALLOWED_HOSTS.has(expectedUrl.hostname) ||
        expectedUrl.hostname !== currentUrl.hostname
      )
        return false;
      const expectedJob = expectedUrl.pathname.match(/\/jobs\/(\d+)/u)?.[1];
      const currentJob = currentUrl.pathname.match(/\/jobs\/(\d+)/u)?.[1];
      return Boolean(expectedJob && expectedJob === currentJob);
    } catch {
      return false;
    }
  }

  function labelText(element) {
    const document = element.ownerDocument;
    const labels = [];
    const aria = element.getAttribute("aria-label");
    if (aria) labels.push(aria);
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy)
      labels.push(
        ...labelledBy
          .split(/\s+/u)
          .map((id) => document.getElementById(id)?.textContent ?? ""),
      );
    if (element.id)
      labels.push(
        ...[...document.querySelectorAll("label")]
          .filter((label) => label.htmlFor === element.id)
          .map((label) => label.textContent ?? ""),
      );
    const parent = element.closest("label");
    if (parent) labels.push(parent.textContent ?? "");
    return normalize(labels.join(" ").replace(/\*+/gu, ""));
  }

  function candidateElements(document, field) {
    const controls = [
      ...document.querySelectorAll("input, select, textarea"),
    ].filter(
      (element) =>
        !["hidden", "password", "submit", "button", "file"].includes(
          element.getAttribute("type")?.toLocaleLowerCase("en-US") ?? "",
        ) && !element.disabled,
    );
    const exactNames = controls.filter((element) =>
      field.fieldNames.some(
        (name) => normalize(element.getAttribute("name")) === normalize(name),
      ),
    );
    if (exactNames.length) return exactNames;
    const expectedLabel = normalize(field.label.replace(/\(required\)/giu, ""));
    return controls.filter((element) => labelText(element) === expectedLabel);
  }

  function setNativeValue(element, value) {
    const view = element.ownerDocument.defaultView;
    const prototype =
      element instanceof view.HTMLTextAreaElement
        ? view.HTMLTextAreaElement.prototype
        : view.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) return false;
    setter.call(element, value);
    element.dispatchEvent(new view.Event("input", { bubbles: true }));
    element.dispatchEvent(new view.Event("change", { bubbles: true }));
    return true;
  }

  function fillChoice(element, field) {
    const view = element.ownerDocument.defaultView;
    if (element instanceof view.HTMLSelectElement) {
      const matches = [...element.options].filter(
        (option) =>
          normalize(option.value) === normalize(field.value) ||
          normalize(option.textContent) === normalize(field.value),
      );
      if (matches.length !== 1) return "UNSUPPORTED";
      element.value = matches[0].value;
      element.dispatchEvent(new view.Event("change", { bubbles: true }));
      return normalize(element.value) === normalize(matches[0].value)
        ? "VERIFIED"
        : "FAILED";
    }
    if (
      element instanceof view.HTMLInputElement &&
      ["radio", "checkbox"].includes(element.type)
    ) {
      if (
        normalize(element.value) !== normalize(field.value) &&
        !labelText(element).includes(normalize(field.value))
      )
        return "UNSUPPORTED";
      element.click();
      return element.checked ? "VERIFIED" : "FAILED";
    }
    return "UNSUPPORTED";
  }

  function fillField(document, field, used) {
    if (field.kind === "DOCUMENT") return "HUMAN_REQUIRED";
    const matches = candidateElements(document, field).filter(
      (element) => !used.has(element),
    );
    const view = document.defaultView;
    const radioMatch =
      matches.length > 1 &&
      matches.every(
        (element) =>
          element instanceof view.HTMLInputElement && element.type === "radio",
      )
        ? matches.filter(
            (element) =>
              normalize(element.value) === normalize(field.value) ||
              labelText(element).includes(normalize(field.value)),
          )
        : [];
    const element =
      matches.length === 1
        ? matches[0]
        : radioMatch.length === 1
          ? radioMatch[0]
          : null;
    if (!element) return "UNSUPPORTED";
    used.add(element);
    if (
      element instanceof view.HTMLSelectElement ||
      (element instanceof view.HTMLInputElement &&
        ["radio", "checkbox"].includes(element.type))
    )
      return fillChoice(element, field);
    if (!setNativeValue(element, field.value)) return "FAILED";
    try {
      if (typeof element.value !== "string") return "TRANSFERRED";
      return normalize(element.value) === normalize(field.value)
        ? "VERIFIED"
        : "FAILED";
    } catch {
      return "TRANSFERRED";
    }
  }

  function detectsHumanVerification(document) {
    return Boolean(
      document.querySelector(
        'iframe[src*="captcha" i], iframe[title*="captcha" i], [class*="captcha" i], [id*="captcha" i], [data-sitekey]',
      ),
    );
  }

  function transfer(document, packet, currentUrl) {
    if (
      !packet ||
      packet.version !== "greenhouse-assisted-v1" ||
      Date.parse(packet.expiresAt) <= Date.now() ||
      !destinationMatches(packet.destination, currentUrl)
    )
      return { authorized: false, fields: [] };
    const used = new Set();
    const fields = packet.fields.map((field) => ({
      id: field.id,
      label: field.label,
      status: fillField(document, field, used),
    }));
    if (packet.resumeFileName)
      fields.push({
        id: "document:resume",
        label: `Attach ${packet.resumeFileName}`,
        status: "HUMAN_REQUIRED",
      });
    if (detectsHumanVerification(document))
      fields.push({
        id: "human:verification",
        label: "Complete employer human verification",
        status: "HUMAN_REQUIRED",
      });
    return { authorized: true, fields };
  }

  function summary(result) {
    const count = (status) =>
      result.fields.filter((field) => field.status === status).length;
    return {
      transferId: result.transferId,
      verified: count("VERIFIED"),
      transferred: count("TRANSFERRED"),
      humanRequired: count("HUMAN_REQUIRED"),
      unsupported: count("UNSUPPORTED"),
      failed: count("FAILED"),
      fields: result.fields,
    };
  }

  function showResult(document, result) {
    const banner = document.createElement("aside");
    banner.setAttribute("role", "status");
    banner.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:360px;padding:14px;border:2px solid #006b59;border-radius:8px;background:white;color:#15211e;font:14px system-ui,sans-serif;box-shadow:0 8px 28px #0003";
    banner.textContent = `RoleProwl transfer: ${result.verified} verified, ${result.transferred} transferred, ${result.humanRequired} human required, ${result.unsupported} unsupported, ${result.failed} failed. Review every value. RoleProwl will not click Submit.`;
    document.body.append(banner);
  }

  const engine = { destinationMatches, normalize, summary, transfer };
  globalThis.RoleProwlGreenhouseTransfer = engine;

  const extension = globalThis.chrome;
  if (!extension?.runtime?.sendMessage || !globalThis.document) return;
  void extension.runtime
    .sendMessage({
      type: "REQUEST_TRANSFER_PACKET",
      currentUrl: globalThis.location.href,
    })
    .then(async (response) => {
      if (!response?.ok || !response.packet) return;
      const packet = response.packet;
      const result = transfer(
        globalThis.document,
        packet,
        globalThis.location.href,
      );
      if (!result.authorized) return;
      const bounded = summary({ ...result, transferId: packet.transferId });
      await extension.runtime.sendMessage({
        type: "STORE_TRANSFER_RESULT",
        currentUrl: globalThis.location.href,
        result: bounded,
      });
      showResult(globalThis.document, bounded);
    });
})();
