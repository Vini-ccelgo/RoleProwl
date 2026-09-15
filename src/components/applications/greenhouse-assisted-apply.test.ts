import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AssistedTransferPreparedState,
  GREENHOUSE_TRANSFER_TTL_MS,
  GreenhouseAssistedApply,
  prepareGreenhouseTransferPayload,
} from "./greenhouse-assisted-apply";

const draft = {
  version: "greenhouse-assisted-v1" as const,
  destination: "https://job-boards.greenhouse.io/acme/jobs/42",
  fields: [],
  resumeContentType: "application/pdf",
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

  it("authorizes prepared transfer packets for five minutes", () => {
    expect(GREENHOUSE_TRANSFER_TTL_MS).toBe(5 * 60_000);
  });

  it("embeds the exact selected résumé only in the short-lived explicit packet", async () => {
    const bytes = Uint8Array.from([37, 80, 68, 70]);
    const fetcher = async () =>
      new Response(bytes, { headers: { "content-type": "application/pdf" } });
    const prepared = await prepareGreenhouseTransferPayload({
      draft,
      fetcher,
      now: Date.UTC(2026, 8, 15),
      resumeDownloadUrl: "/api/applications/application-1/resume",
      transferId: "transfer-1",
    });
    const payload = JSON.parse(prepared.payload) as Record<string, unknown>;
    expect(prepared.resumeStatus).toBe("INCLUDED");
    expect(payload).toMatchObject({
      transferId: "transfer-1",
      issuedAt: "2026-09-15T00:00:00.000Z",
      expiresAt: "2026-09-15T00:05:00.000Z",
      resumeFile: {
        base64: "JVBERg==",
        contentType: "application/pdf",
        fileName: "resume.pdf",
      },
    });
    expect(prepared.payload).not.toContain("candidate-documents/");
  });

  it("keeps scalar handoff available when the résumé download fails", async () => {
    const prepared = await prepareGreenhouseTransferPayload({
      draft,
      fetcher: async () => new Response(null, { status: 503 }),
      resumeDownloadUrl: "/api/applications/application-1/resume",
      transferId: "transfer-2",
    });
    expect(prepared.resumeStatus).toBe("DOWNLOAD_UNAVAILABLE");
    expect(JSON.parse(prepared.payload)).not.toHaveProperty("resumeFile");
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
