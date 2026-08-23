"use client";

import { useState } from "react";
import type { GreenhouseTransferDraft } from "@/core/domain/applications/greenhouse-transfer";

export function GreenhouseAssistedApply({
  draft,
  resumeDownloadUrl,
}: {
  readonly draft: GreenhouseTransferDraft;
  readonly resumeDownloadUrl: string | null;
}) {
  const [payload, setPayload] = useState<string>();
  return (
    <section className="card grid gap-3 border-brand p-5">
      <h2 className="text-base font-semibold">Greenhouse assisted apply</h2>
      <p className="m-0 text-sm">
        The RoleProwl Chromium helper can transfer supported packet values into
        this exact Greenhouse form. It never clicks Submit. Review every value,
        attach the résumé, and complete any human verification yourself.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className="button button-primary"
          type="button"
          onClick={() => {
            const now = Date.now();
            setPayload(
              JSON.stringify({
                ...draft,
                transferId: crypto.randomUUID(),
                issuedAt: new Date(now).toISOString(),
                expiresAt: new Date(now + 5 * 60_000).toISOString(),
              }),
            );
          }}
        >
          Prepare assisted transfer
        </button>
        {resumeDownloadUrl ? (
          <a className="button button-secondary" href={resumeDownloadUrl}>
            Download application résumé
          </a>
        ) : null}
      </div>
      {payload ? (
        <div className="grid gap-2" role="status">
          <p className="m-0 text-sm font-semibold">
            Packet authorized for five minutes. Open the RoleProwl Helper icon
            in Chromium to capture it and open the employer form.
          </p>
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
    </section>
  );
}
