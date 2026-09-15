"use client";

import { useState } from "react";
import type { GreenhouseTransferDraft } from "@/core/domain/applications/greenhouse-transfer";

export const GREENHOUSE_TRANSFER_TTL_MS = 5 * 60_000;
export const MAX_RESUME_TRANSFER_BYTES = 4 * 1024 * 1024;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  return btoa(binary);
}

export async function prepareGreenhouseTransferPayload(input: {
  readonly draft: GreenhouseTransferDraft;
  readonly fetcher?: typeof fetch;
  readonly now?: number;
  readonly resumeDownloadUrl: string | null;
  readonly transferId?: string;
}) {
  const now = input.now ?? Date.now();
  let resumeFile:
    | {
        readonly base64: string;
        readonly contentType: string;
        readonly fileName: string;
      }
    | undefined;
  let resumeStatus:
    "INCLUDED" | "NOT_SELECTED" | "DOWNLOAD_UNAVAILABLE" | "TOO_LARGE" = input
    .draft.resumeFileName
    ? "DOWNLOAD_UNAVAILABLE"
    : "NOT_SELECTED";
  if (input.draft.resumeFileName && input.resumeDownloadUrl) {
    try {
      const response = await (input.fetcher ?? fetch)(input.resumeDownloadUrl, {
        credentials: "same-origin",
      });
      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength <= MAX_RESUME_TRANSFER_BYTES) {
          resumeFile = {
            base64: bytesToBase64(bytes),
            contentType:
              input.draft.resumeContentType ||
              response.headers.get("content-type") ||
              "application/octet-stream",
            fileName: input.draft.resumeFileName,
          };
          resumeStatus = "INCLUDED";
        } else resumeStatus = "TOO_LARGE";
      }
    } catch {
      // The scalar handoff remains available; the résumé stays a manual step.
    }
  }
  return {
    payload: JSON.stringify({
      ...input.draft,
      transferId: input.transferId ?? crypto.randomUUID(),
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + GREENHOUSE_TRANSFER_TTL_MS).toISOString(),
      ...(resumeFile ? { resumeFile } : {}),
    }),
    resumeStatus,
  };
}

export function AssistedTransferPreparedState() {
  return (
    <div className="grid gap-2" role="status">
      <p className="m-0 text-sm font-semibold">Assisted transfer prepared</p>
      <p className="m-0 text-sm">
        Your reviewed application packet is ready for RoleProwl Helper. Keep
        this tab open, open Chromium&apos;s Extensions menu, and select
        RoleProwl Helper. The helper will capture this packet and open the
        matching Greenhouse form. Review every transferred field before
        submitting.
      </p>
      <p className="m-0 text-sm text-foreground-muted">
        This temporary packet expires automatically for security. You can
        prepare another at any time.
      </p>
    </div>
  );
}

export function GreenhouseAssistedApply({
  draft,
  resumeDownloadUrl,
}: {
  readonly draft: GreenhouseTransferDraft;
  readonly resumeDownloadUrl: string | null;
}) {
  const [mode, setMode] = useState<"INTRO" | "SETUP" | "USE">("INTRO");
  const [payload, setPayload] = useState<string>();
  const [preparing, setPreparing] = useState(false);
  const [resumeStatus, setResumeStatus] = useState<
    "INCLUDED" | "NOT_SELECTED" | "DOWNLOAD_UNAVAILABLE" | "TOO_LARGE"
  >();
  return (
    <section className="card grid gap-3 border-brand p-5">
      <h2 className="text-base font-semibold">Greenhouse assisted apply</h2>
      <p className="m-0 text-sm">
        <strong>Why RoleProwl Helper?</strong> Web browsers do not allow the
        RoleProwl website to directly fill a separate employer website. The
        optional RoleProwl Helper can transfer application information you have
        already reviewed into supported employer forms.
      </p>
      <p className="m-0 text-sm">
        It can access this prepared packet and the matching Greenhouse form. It
        does not submit applications, solve human-verification challenges, read
        unrelated websites, or install without your permission. Manual
        application remains available, and nothing is added to your browser
        unless you deliberately choose to set it up.
      </p>
      {mode === "INTRO" ? (
        <div className="flex flex-wrap gap-2">
          <button
            className="button button-primary"
            onClick={() => setMode("SETUP")}
            type="button"
          >
            Set up RoleProwl Helper
          </button>
          <button
            className="button button-secondary"
            onClick={() => setMode("USE")}
            type="button"
          >
            I already have RoleProwl Helper
          </button>
          <a
            className="button button-secondary"
            href={draft.destination}
            rel="noreferrer"
            target="_blank"
          >
            Continue manually
          </a>
        </div>
      ) : null}
      {mode === "SETUP" ? (
        <div className="grid gap-2 text-sm">
          <p className="m-0 font-semibold">Set up RoleProwl Helper</p>
          <ol className="m-0 grid gap-1 pl-5">
            <li>Open Chromium&apos;s Extensions page.</li>
            <li>Enable Developer mode.</li>
            <li>
              Choose Load unpacked and deliberately select the supplied
              RoleProwl Helper folder.
            </li>
          </ol>
          <p className="m-0 text-foreground-muted">
            These instructions do not install or change anything by themselves.
            Chromium will show the permissions before you choose to add it.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="button button-primary"
              onClick={() => setMode("USE")}
              type="button"
            >
              I have installed RoleProwl Helper
            </button>
            <a
              className="button button-secondary"
              href={draft.destination}
              rel="noreferrer"
              target="_blank"
            >
              Continue manually
            </a>
          </div>
        </div>
      ) : null}
      {mode === "USE" ? (
        <div className="grid gap-3">
          <p className="m-0 text-sm font-semibold">Use RoleProwl Helper</p>
          <ol className="m-0 grid gap-1 pl-5 text-sm">
            <li>Prepare this reviewed packet for transfer.</li>
            <li>Keep this RoleProwl tab open.</li>
            <li>Open Chromium&apos;s Extensions menu.</li>
            <li>Select RoleProwl Helper.</li>
            <li>
              The helper will capture only this prepared application packet and
              open the matching supported Greenhouse form.
            </li>
            <li>Review every transferred field before submitting.</li>
          </ol>
          <p className="m-0 text-sm text-foreground-muted">
            You can pin RoleProwl Helper in Chromium for easier access.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="button button-primary"
              disabled={preparing}
              type="button"
              onClick={async () => {
                setPreparing(true);
                const prepared = await prepareGreenhouseTransferPayload({
                  draft,
                  resumeDownloadUrl,
                });
                setPayload(prepared.payload);
                setResumeStatus(prepared.resumeStatus);
                setPreparing(false);
              }}
            >
              {preparing
                ? "Preparing secure handoff…"
                : "Continue with RoleProwl Helper"}
            </button>
            {resumeDownloadUrl ? (
              <a className="button button-secondary" href={resumeDownloadUrl}>
                Download application résumé
              </a>
            ) : null}
          </div>
          {payload ? (
            <div className="grid gap-2" role="status">
              <AssistedTransferPreparedState />
              {resumeStatus === "INCLUDED" ? (
                <p className="m-0 text-sm">
                  The selected résumé is included only in this short-lived,
                  one-use helper packet.
                </p>
              ) : resumeStatus === "DOWNLOAD_UNAVAILABLE" ||
                resumeStatus === "TOO_LARGE" ? (
                <p className="m-0 text-sm">
                  The selected résumé could not be included safely. Download and
                  attach it manually; the remaining prepared fields can still
                  transfer.
                </p>
              ) : null}
              <textarea
                aria-hidden="true"
                className="hidden"
                id="roleprowl-greenhouse-transfer"
                readOnly
                tabIndex={-1}
                value={payload}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
