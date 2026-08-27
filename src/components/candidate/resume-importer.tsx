"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, LoaderCircle, Trash2, Upload } from "lucide-react";
import { DocumentDeletionBlockerNotice } from "@/components/candidate/document-deletion-blocker-notice";
import { InspectableFileName } from "@/components/documents/inspectable-file-name";
import {
  type DocumentDeletionBlockerCode,
  type DocumentDeletionBlockingApplication,
  requestCandidateDocumentDeletion,
} from "@/features/candidate/document-deletion-protocol";

interface CandidateDocumentSummary {
  readonly createdAt: string;
  readonly format: "PDF" | "DOCX";
  readonly id: string;
  readonly interpretationStatus?: "NORMAL_REVIEW" | "INCOMPLETE";
  readonly originalFileName: string;
  readonly proposalCount: number;
  readonly sizeBytes: number;
  readonly status: string;
}

export const RESUME_FACT_DELETION_WARNING =
  "Deleting this résumé will also remove verified facts sourced from it. This may affect application readiness.";

export function confirmResumeFactDeletion(
  fileName: string,
  factCount: number,
  confirmOperator: (message: string) => boolean = (message) =>
    window.confirm(message),
) {
  return confirmOperator(
    `${RESUME_FACT_DELETION_WARNING}\n\n${factCount} accepted ${factCount === 1 ? "fact" : "facts"} will be removed.\n\nRésumé: ${fileName}\n\nContinue?`,
  );
}

export function confirmResumeDeletion(
  fileName: string,
  confirmOperator: (message: string) => boolean = (message) =>
    window.confirm(message),
) {
  return confirmOperator(
    `Delete this résumé?\n\nRésumé: ${fileName}\n\nRoleProwl will check for application and accepted-fact dependencies before deleting it.`,
  );
}

export function ResumeImporter({
  documents,
}: {
  documents: CandidateDocumentSummary[];
}) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [selectedFile, setSelectedFile] = useState<File>();
  const [deletionBlockers, setDeletionBlockers] = useState<
    Record<
      string,
      {
        applications: readonly DocumentDeletionBlockingApplication[];
        code: DocumentDeletionBlockerCode;
      }
    >
  >({});

  async function upload() {
    const file = selectedFile;
    if (!file) {
      setMessage("Choose a PDF or DOCX résumé first.");
      return;
    }
    setBusy(true);
    setMessage(undefined);
    const body = new FormData();
    body.set("resume", file);
    try {
      const response = await fetch("/api/candidate/documents", {
        method: "POST",
        body,
      });
      const result = (await response.json()) as {
        error?: string;
        interpretationStatus?: "NORMAL_REVIEW" | "INCOMPLETE";
        proposalCount?: number;
      };
      if (!response.ok) throw new Error(result.error ?? "Upload failed.");
      setMessage(
        result.interpretationStatus === "INCOMPLETE"
          ? "RoleProwl extracted machine-readable text from this résumé, but could not reliably identify much structured résumé information. Review any proposals below or try a DOCX or text-selectable PDF export."
          : `${result.proposalCount ?? 0} possible profile facts are ready for review. Nothing was added automatically.`,
      );
      if (input.current) input.current.value = "";
      setSelectedFile(undefined);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(document: CandidateDocumentSummary) {
    if (!confirmResumeDeletion(document.originalFileName)) {
      setMessage(
        "Deletion cancelled. No résumé or verified facts were removed.",
      );
      return;
    }
    setBusy(true);
    try {
      let result = await requestCandidateDocumentDeletion({
        confirmAcceptedFacts: false,
        documentId: document.id,
      });
      if (result.kind === "APPLICATION_BLOCKER") {
        const applications = result.applications;
        const code = result.code;
        setDeletionBlockers((current) => ({
          ...current,
          [document.id]: {
            applications,
            code,
          },
        }));
        setMessage(result.message);
        return;
      }
      if (result.kind === "ACCEPTED_FACTS_CONFIRMATION") {
        if (
          !confirmResumeFactDeletion(
            document.originalFileName,
            result.factCount,
          )
        ) {
          setMessage(
            "Deletion cancelled. No résumé or verified facts were removed.",
          );
          return;
        }
        result = await requestCandidateDocumentDeletion({
          confirmAcceptedFacts: true,
          documentId: document.id,
        });
        if (result.kind === "APPLICATION_BLOCKER") {
          const applications = result.applications;
          const code = result.code;
          setDeletionBlockers((current) => ({
            ...current,
            [document.id]: {
              applications,
              code,
            },
          }));
          setMessage(result.message);
          return;
        }
      }
      setMessage(
        result.kind === "DELETED"
          ? `Deleted résumé: ${document.originalFileName}`
          : result.message,
      );
      if (result.kind === "DELETED") {
        setDeletionBlockers((current) => {
          const next = { ...current };
          delete next[document.id];
          return next;
        });
        router.refresh();
      }
    } catch {
      setMessage("The document could not be deleted. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mobile-contained-grid grid gap-6">
      <section className="card mobile-contained-grid grid gap-4 p-6">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-brand-soft p-2 text-brand">
            <Upload aria-hidden="true" size={22} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Import a résumé</h2>
            <p className="mt-1 text-sm">
              PDF with selectable text or DOCX, up to 5 MB. OCR is not included.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="resume-file-input"
            ref={input}
            type="file"
            name="resume"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            aria-describedby="resume-file-name resume-import-message"
            className="sr-only"
            disabled={busy}
            onChange={(event) => setSelectedFile(event.target.files?.[0])}
          />
          <button
            type="button"
            className="button button-secondary"
            aria-controls="resume-file-input"
            onClick={() => input.current?.click()}
            disabled={busy}
          >
            Choose File
          </button>
          <span
            id="resume-file-name"
            className="safe-filename min-w-0 text-sm text-foreground-muted"
          >
            {selectedFile?.name ?? "No file selected"}
          </span>
        </div>
        <button
          type="button"
          className="button button-primary w-fit"
          onClick={upload}
          disabled={busy}
        >
          {busy ? (
            <LoaderCircle
              aria-hidden="true"
              className="animate-spin"
              size={18}
            />
          ) : (
            <Upload aria-hidden="true" size={18} />
          )}
          Upload and extract
        </button>
        <p id="resume-import-message" role="status" className="m-0 text-sm">
          {message ??
            "Extracted values remain proposals until you accept or edit them."}
        </p>
      </section>

      <section
        className="mobile-contained-grid grid gap-3"
        aria-labelledby="uploaded-resumes-title"
      >
        <h2 id="uploaded-resumes-title" className="text-lg font-semibold">
          Uploaded résumés
        </h2>
        {documents.length === 0 ? (
          <div className="card p-6 text-sm text-foreground-muted">
            No résumé has been uploaded.
          </div>
        ) : (
          documents.map((document) => {
            const blocker = deletionBlockers[document.id];
            return (
              <article
                className="card document-management-row grid gap-4 p-4"
                key={document.id}
              >
                <div className="document-management-details">
                  <FileText aria-hidden="true" className="text-brand" />
                  <div className="min-w-0">
                    <h3 className="sr-only">{document.originalFileName}</h3>
                    <InspectableFileName
                      className="font-medium"
                      fileName={document.originalFileName}
                    />
                    <p className="safe-user-text m-0 text-xs">
                      {document.format} ·{" "}
                      {(document.sizeBytes / 1024).toFixed(1)} KB ·{" "}
                      {document.status.replaceAll("_", " ").toLowerCase()} ·{" "}
                      {document.proposalCount} proposals
                    </p>
                    {document.interpretationStatus === "INCOMPLETE" && (
                      <p className="safe-user-text mt-2 mb-0 text-xs text-foreground-muted">
                        Machine-readable text was extracted, but RoleProwl could
                        not reliably identify much structured résumé
                        information. Review any proposals or try a DOCX or
                        text-selectable PDF export.
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => remove(document)}
                  disabled={busy}
                  aria-label={`Delete ${document.originalFileName}`}
                >
                  <Trash2 aria-hidden="true" size={17} /> Delete
                </button>
                {blocker ? (
                  <DocumentDeletionBlockerNotice
                    applications={blocker.applications}
                    code={blocker.code}
                    fileName={document.originalFileName}
                  />
                ) : null}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
