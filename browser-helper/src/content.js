(function () {
  "use strict";

  const ALLOWED_HOSTS = new Set([
    "boards.greenhouse.io",
    "job-boards.greenhouse.io",
  ]);
  const MAX_RESUME_TRANSFER_BYTES = 4 * 1024 * 1024;

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

  function labelCandidates(element) {
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
    return [
      ...new Set(
        labels
          .map((label) =>
            normalize(
              label.replace(/\*+/gu, "").replace(/\(required\)/giu, ""),
            ),
          )
          .filter(Boolean),
      ),
    ];
  }

  function candidateElements(document, field, { includeFiles = false } = {}) {
    const controls = [
      ...document.querySelectorAll("input, select, textarea"),
    ].filter(
      (element) =>
        ![
          "hidden",
          "password",
          "submit",
          "button",
          ...(includeFiles ? [] : ["file"]),
        ].includes(
          element.getAttribute("type")?.toLocaleLowerCase("en-US") ?? "",
        ) && !element.disabled,
    );
    const exactIdentifiers = controls.filter((element) =>
      field.fieldNames.some((fieldName) => {
        const expected = normalize(fieldName);
        if (!expected) return false;
        return [element.getAttribute("name"), element.id].some(
          (identifier) => normalize(identifier) === expected,
        );
      }),
    );
    if (exactIdentifiers.length) return exactIdentifiers;
    const expectedLabel = normalize(field.label.replace(/\(required\)/giu, ""));
    const semanticMatches = controls.filter((element) =>
      labelCandidates(element).includes(expectedLabel),
    );
    return semanticMatches.length === 1 ? semanticMatches : [];
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

  function choiceValues(field) {
    if (Array.isArray(field.value))
      return [...new Set(field.value.map(normalize).filter(Boolean))];
    if (typeof field.value !== "string") return [];
    try {
      const parsed = JSON.parse(field.value);
      if (Array.isArray(parsed))
        return [...new Set(parsed.map(normalize).filter(Boolean))];
    } catch {
      // A scalar choice is the normal packet representation.
    }
    const values = field.value
      .split(/(?:\r?\n|;)/u)
      .map(normalize)
      .filter(Boolean);
    return [...new Set(values)];
  }

  function choiceMatches(element, expected) {
    return (
      normalize(element.value) === expected ||
      labelCandidates(element).includes(expected)
    );
  }

  function fillCheckboxGroup(elements, field, used) {
    const expected = choiceValues(field);
    if (!expected.length) return "UNSUPPORTED";
    const selections = expected.map((value) =>
      elements.filter((element) => choiceMatches(element, value)),
    );
    if (
      selections.some((matches) => matches.length !== 1) ||
      new Set(selections.map(([element]) => element)).size !== selections.length
    )
      return "UNSUPPORTED";
    const selected = new Set(selections.map(([element]) => element));
    for (const element of elements) {
      const expectedChecked = selected.has(element);
      if (element.checked !== expectedChecked) element.click();
    }
    if (!elements.every((element) => element.checked === selected.has(element)))
      return "FAILED";
    for (const element of elements) used.add(element);
    return "VERIFIED";
  }

  function fillChoice(element, field) {
    const view = element.ownerDocument.defaultView;
    if (element instanceof view.HTMLSelectElement) {
      const expected = choiceValues(field);
      if (expected.length !== 1) return "UNSUPPORTED";
      const matches = [...element.options].filter(
        (option) =>
          normalize(option.value) === expected[0] ||
          normalize(option.textContent) === expected[0],
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
      const expected = choiceValues(field);
      if (expected.length !== 1) return "UNSUPPORTED";
      if (element.type === "checkbox") {
        const decision = expected[0];
        const checked = ["yes", "true", "accept", "accepted", "agree"].includes(
          decision,
        );
        const unchecked = ["no", "false", "decline", "declined"].includes(
          decision,
        );
        if (checked || unchecked) {
          const intended = checked;
          if (element.checked !== intended) element.click();
          return element.checked === intended ? "VERIFIED" : "FAILED";
        }
      }
      if (!choiceMatches(element, expected[0])) return "UNSUPPORTED";
      element.click();
      return element.checked ? "VERIFIED" : "FAILED";
    }
    return "UNSUPPORTED";
  }

  function decodeResumeFile(document, resumeFile) {
    if (
      !resumeFile ||
      typeof resumeFile.fileName !== "string" ||
      !resumeFile.fileName.trim() ||
      typeof resumeFile.contentType !== "string" ||
      typeof resumeFile.base64 !== "string" ||
      resumeFile.base64.length >
        Math.ceil((MAX_RESUME_TRANSFER_BYTES * 4) / 3) + 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/u.test(resumeFile.base64)
    )
      return null;
    try {
      const binary = atob(resumeFile.base64);
      if (binary.length > MAX_RESUME_TRANSFER_BYTES) return null;
      const bytes = Uint8Array.from(binary, (character) =>
        character.charCodeAt(0),
      );
      return new document.defaultView.File([bytes], resumeFile.fileName, {
        type: resumeFile.contentType,
      });
    } catch {
      return null;
    }
  }

  function attachResume(document, field, packet, used) {
    const file = decodeResumeFile(document, packet.resumeFile);
    if (!file) return "CANDIDATE_ACTION_REQUIRED";
    const matches = candidateElements(document, field, {
      includeFiles: true,
    }).filter(
      (element) =>
        !used.has(element) &&
        element instanceof document.defaultView.HTMLInputElement &&
        element.type === "file",
    );
    if (matches.length !== 1) return "UNSUPPORTED";
    const element = matches[0];
    used.add(element);
    try {
      const transfer = new document.defaultView.DataTransfer();
      transfer.items.add(file);
      element.files = transfer.files;
      element.dispatchEvent(
        new document.defaultView.Event("input", { bubbles: true }),
      );
      element.dispatchEvent(
        new document.defaultView.Event("change", { bubbles: true }),
      );
      const attached = element.files?.[0];
      return attached &&
        attached.name === file.name &&
        attached.type === file.type &&
        attached.size === file.size
        ? "VERIFIED"
        : "FAILED";
    } catch {
      return "FAILED";
    }
  }

  function fillField(document, field, used, packet) {
    if (field.kind === "HUMAN_REQUIRED") return "HUMAN_REQUIRED";
    if (field.kind === "DOCUMENT")
      return attachResume(document, field, packet, used);
    const matches = candidateElements(document, field).filter(
      (element) => !used.has(element),
    );
    const view = document.defaultView;
    const checkboxGroup =
      matches.length > 1 &&
      matches.every(
        (element) =>
          element instanceof view.HTMLInputElement &&
          element.type === "checkbox",
      );
    if (checkboxGroup) return fillCheckboxGroup(matches, field, used);
    const expectedChoices = choiceValues(field);
    const radioMatch =
      matches.length > 1 &&
      matches.every(
        (element) =>
          element instanceof view.HTMLInputElement && element.type === "radio",
      )
        ? matches.filter(
            (element) =>
              expectedChoices.length === 1 &&
              choiceMatches(element, expectedChoices[0]),
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

  function readinessControls(document) {
    return [
      ...document.querySelectorAll(
        "input, select, textarea, candidate-location",
      ),
    ].filter((element) => {
      if (element.disabled) return false;
      const type = element.getAttribute("type")?.toLocaleLowerCase("en-US");
      if (["hidden", "password", "submit", "button"].includes(type ?? ""))
        return false;
      const identity = [
        element.id,
        element.getAttribute("name"),
        element.getAttribute("aria-label"),
        element.localName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("en-US");
      return /(?:^|[^a-z])(?:first[_ -]?name|last[_ -]?name|email|phone|candidate[_ -]?location|question[_ -]?\d+)(?:$|[^a-z])/u.test(
        identity,
      );
    });
  }

  function readinessSnapshot(document) {
    const controls = readinessControls(document);
    const identityCount = controls.filter((element) =>
      /(?:first[_ -]?name|last[_ -]?name|email|phone)/u.test(
        [
          element.id,
          element.getAttribute("name"),
          element.getAttribute("aria-label"),
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("en-US"),
      ),
    ).length;
    if (controls.length < 3 || identityCount < 2) return null;
    return controls
      .map((element) =>
        [
          element.localName,
          element.getAttribute("type"),
          element.id,
          element.getAttribute("name"),
          element.getAttribute("aria-label"),
        ]
          .filter(Boolean)
          .join(":"),
      )
      .sort()
      .join("|");
  }

  function waitForFormReadiness(
    document,
    { timeoutMs = 15_000, stableMs = 750 } = {},
  ) {
    return new Promise((resolve) => {
      const view = document.defaultView;
      let stableTimer;
      let signature = null;
      let finished = false;
      const observer = new view.MutationObserver(check);
      const timeout = view.setTimeout(
        () => finish({ ready: false, reason: "FORM_READINESS_TIMEOUT" }),
        timeoutMs,
      );

      function finish(result) {
        if (finished) return;
        finished = true;
        observer.disconnect();
        view.clearTimeout(timeout);
        if (stableTimer) view.clearTimeout(stableTimer);
        resolve(result);
      }

      function check() {
        const current = readinessSnapshot(document);
        if (!current) {
          signature = null;
          if (stableTimer) view.clearTimeout(stableTimer);
          stableTimer = undefined;
          return;
        }
        if (current === signature && stableTimer) return;
        signature = current;
        if (stableTimer) view.clearTimeout(stableTimer);
        stableTimer = view.setTimeout(() => {
          const stable = readinessSnapshot(document);
          if (stable && stable === signature)
            finish({
              ready: true,
              controls: readinessControls(document).length,
            });
          else check();
        }, stableMs);
      }

      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["aria-label", "disabled", "id", "name", "type"],
        childList: true,
        subtree: true,
      });
      check();
    });
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
    const fields = packet.fields.map((field) => {
      const status = fillField(document, field, used, packet);
      return {
        id: field.id,
        label: field.label,
        status,
        reason:
          status === "FAILED"
            ? "TRANSFER_OR_VERIFICATION_FAILED"
            : status === "UNSUPPORTED"
              ? "CONTROL_NOT_FOUND_OR_AMBIGUOUS"
              : status === "CANDIDATE_ACTION_REQUIRED"
                ? "PREPARED_VALUE_UNAVAILABLE_TO_HELPER"
                : status === "HUMAN_REQUIRED"
                  ? "INTENTIONALLY_MANUAL_CONTROL"
                  : "TRANSFER_COMPLETED",
      };
    });
    if (
      packet.resumeFileName &&
      !packet.fields.some((field) => field.kind === "DOCUMENT")
    )
      fields.push({
        id: "document:resume",
        label: `Attach ${packet.resumeFileName}`,
        status: "CANDIDATE_ACTION_REQUIRED",
        reason: "RESUME_CONTROL_NOT_REPRESENTED",
      });
    if (detectsHumanVerification(document))
      fields.push({
        id: "human:verification",
        label: "Complete employer human verification",
        status: "HUMAN_REQUIRED",
        reason: "HUMAN_VERIFICATION",
      });
    return { authorized: true, fields };
  }

  function activeRequiredControls(document) {
    const controls = [...document.querySelectorAll("input, select, textarea")];
    return controls.filter((element) => {
      const type =
        element.getAttribute("type")?.toLocaleLowerCase("en-US") ?? "";
      if (
        element.disabled ||
        element.hidden ||
        ["hidden", "password", "submit", "button", "file"].includes(type) ||
        element.closest('[hidden], [aria-hidden="true"]') ||
        /captcha/iu.test(
          `${element.id} ${element.getAttribute("name") ?? ""}`,
        ) ||
        !(element.required || element.getAttribute("aria-required") === "true")
      )
        return false;
      if (element instanceof document.defaultView.HTMLInputElement) {
        if (element.type === "radio") {
          const name = element.getAttribute("name");
          return !controls.some(
            (candidate) =>
              candidate instanceof document.defaultView.HTMLInputElement &&
              candidate.type === "radio" &&
              candidate.getAttribute("name") === name &&
              candidate.checked,
          );
        }
        if (element.type === "checkbox") return !element.checked;
      }
      return !String(element.value ?? "").trim();
    });
  }

  function controlIdentity(element, index) {
    return (
      element.getAttribute("name") ||
      element.id ||
      `required-control-${index + 1}`
    )
      .normalize("NFKC")
      .trim()
      .slice(0, 160);
  }

  function remainingRequiredResults(document, transferredFields) {
    const reported = new Set();
    return activeRequiredControls(document).flatMap((element, index) => {
      const identity = controlIdentity(element, index);
      if (reported.has(identity)) return [];
      reported.add(identity);
      const represented = transferredFields.some(
        (field) =>
          field.id.endsWith(`:${identity}`) ||
          normalize(field.label) === labelCandidates(element)[0],
      );
      return represented
        ? []
        : [
            {
              id: `live:${identity}`,
              label: labelCandidates(element)[0] || "Required employer control",
              status: "CANDIDATE_ACTION_REQUIRED",
              reason: "MISSING_CANDIDATE_DATA_AFTER_DYNAMIC_UPDATE",
            },
          ];
    });
  }

  function waitForDynamicUpdates(
    document,
    { timeoutMs = 1_500, stableMs = 250 } = {},
  ) {
    return new Promise((resolve) => {
      const view = document.defaultView;
      let stableTimer;
      let finished = false;
      const observer = new view.MutationObserver(scheduleStable);
      const timeout = view.setTimeout(() => finish(), timeoutMs);

      function finish() {
        if (finished) return;
        finished = true;
        observer.disconnect();
        view.clearTimeout(timeout);
        if (stableTimer) view.clearTimeout(stableTimer);
        resolve();
      }

      function scheduleStable() {
        if (stableTimer) view.clearTimeout(stableTimer);
        stableTimer = view.setTimeout(finish, stableMs);
      }

      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: [
          "aria-hidden",
          "aria-required",
          "disabled",
          "hidden",
          "required",
        ],
        childList: true,
        subtree: true,
      });
      scheduleStable();
    });
  }

  async function transferInPhases(document, packet, currentUrl, options) {
    const phaseOne = transfer(document, packet, currentUrl);
    if (!phaseOne.authorized) return phaseOne;
    await waitForDynamicUpdates(document, options);
    const phaseTwo = transfer(document, packet, currentUrl);
    if (!phaseTwo.authorized) return phaseTwo;
    const remaining = remainingRequiredResults(document, phaseTwo.fields);
    return {
      authorized: true,
      phases: 2,
      fields: [...phaseTwo.fields, ...remaining],
    };
  }

  function summary(result) {
    const count = (status) =>
      result.fields.filter((field) => field.status === status).length;
    return {
      transferId: result.transferId,
      verified: count("VERIFIED"),
      transferred: count("TRANSFERRED"),
      candidateActionRequired: count("CANDIDATE_ACTION_REQUIRED"),
      humanRequired: count("HUMAN_REQUIRED"),
      unsupported: count("UNSUPPORTED"),
      failed: count("FAILED"),
      fields: result.fields,
      phases: result.phases ?? 1,
    };
  }

  function showResult(document, result) {
    const banner = document.createElement("aside");
    banner.setAttribute("role", "status");
    banner.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:360px;padding:14px;border:2px solid #006b59;border-radius:8px;background:white;color:#15211e;font:14px system-ui,sans-serif;box-shadow:0 8px 28px #0003";
    banner.textContent = `RoleProwl transfer: ${result.verified} verified, ${result.transferred} transferred, ${result.candidateActionRequired} need your action, ${result.humanRequired} human required, ${result.unsupported} unsupported, ${result.failed} failed. Review every value. RoleProwl will not click Submit.`;
    document.body.append(banner);
  }

  function showReadinessTimeout(document) {
    const banner = document.createElement("aside");
    banner.setAttribute("role", "status");
    banner.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:360px;padding:14px;border:2px solid #b98516;border-radius:8px;background:white;color:#15211e;font:14px system-ui,sans-serif;box-shadow:0 8px 28px #0003";
    banner.textContent =
      "RoleProwl Helper did not find a ready Greenhouse application form. The prepared packet was not consumed. Reload this job page to retry, or prepare another packet if needed.";
    document.body.append(banner);
  }

  const engine = {
    destinationMatches,
    normalize,
    readinessControls,
    readinessSnapshot,
    summary,
    transfer,
    transferInPhases,
    waitForDynamicUpdates,
    waitForFormReadiness,
  };
  globalThis.RoleProwlGreenhouseTransfer = engine;

  const extension = globalThis.chrome;
  if (!extension?.runtime?.sendMessage || !globalThis.document) return;
  const readinessOptions =
    globalThis.RoleProwlGreenhouseReadinessTestOptions ?? undefined;
  void waitForFormReadiness(globalThis.document, readinessOptions).then(
    async (readiness) => {
      if (!readiness.ready) {
        showReadinessTimeout(globalThis.document);
        return;
      }
      const response = await extension.runtime.sendMessage({
        type: "REQUEST_TRANSFER_PACKET",
        currentUrl: globalThis.location.href,
      });
      if (!response?.ok || !response.packet) return;
      const packet = response.packet;
      const result = await transferInPhases(
        globalThis.document,
        packet,
        globalThis.location.href,
        globalThis.RoleProwlGreenhouseDynamicTestOptions ?? undefined,
      );
      if (!result.authorized) return;
      const bounded = summary({ ...result, transferId: packet.transferId });
      await extension.runtime.sendMessage({
        type: "STORE_TRANSFER_RESULT",
        currentUrl: globalThis.location.href,
        result: bounded,
      });
      showResult(globalThis.document, bounded);
    },
  );
})();
