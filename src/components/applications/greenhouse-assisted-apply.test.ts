import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AssistedTransferPreparedState,
  GREENHOUSE_TRANSFER_TTL_MS,
  GreenhouseAssistedApply,
} from "./greenhouse-assisted-apply";

const draft = {
  version: "greenhouse-assisted-v1" as const,
  destination: "https://job-boards.greenhouse.io/acme/jobs/42",
  fields: [],
  resumeFileName: "resume.pdf",
};

describe("Greenhouse assisted apply consent", () => {
  it("explains the optional helper before any setup action", () => {
    const markup = renderToStaticMarkup(
      createElement(GreenhouseAssistedApply, {
        draft,
        resumeDownloadUrl: null,
      }),
    );
    expect(markup).toContain("Why RoleProwl Helper?");
    expect(markup).toContain("optional RoleProwl Helper");
    expect(markup).toContain("does not submit applications");
    expect(markup).toContain("read unrelated websites");
    expect(markup).toContain("Set up RoleProwl Helper");
    expect(markup).toContain("Continue manually");
    expect(markup).not.toContain("Enable Developer mode");
  });

  it("authorizes prepared transfer packets for thirty minutes", () => {
    expect(GREENHOUSE_TRANSFER_TTL_MS).toBe(30 * 60_000);
  });

  it("shows explicit next steps after a packet is prepared", () => {
    const markup = renderToStaticMarkup(
      createElement(AssistedTransferPreparedState),
    );
    expect(markup).toContain("Assisted transfer prepared");
    expect(markup).toContain("Chromium&#x27;s Extensions menu");
    expect(markup).toContain("select RoleProwl Helper");
    expect(markup).toContain("expires automatically for security");
    expect(markup).not.toMatch(/\b\d{1,2}:\d{2}\b/u);
  });
});
