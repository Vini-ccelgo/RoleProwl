"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, LoaderCircle, Trash2, Upload } from "lucide-react";

interface CandidateDocumentSummary {
  readonly createdAt: string;
  readonly format: "PDF" | "DOCX";
  readonly id: string;
  readonly originalFileName: string;
  readonly proposalCount: number;
  readonly sizeBytes: number;
  readonly status: string;
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
        proposalCount?: number;
      };
      if (!response.ok) throw new Error(result.error ?? "Upload failed.");
      setMessage(
        `${result.proposalCount ?? 0} possible profile facts are ready for review. Nothing was added automatically.`,
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

  async function remove(documentId: string) {
    setBusy(true);
    const response = await fetch(`/api/candidate/documents/${documentId}`, {
      method: "DELETE",
    });
    setMessage(
      response.ok ? "Document deleted." : "The document could not be deleted.",
    );
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <section className="card grid gap-4 p-6">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-brand-soft p-2 text-brand">
            <Upload aria-hidden="true" size={22} />
          </span>
          <div>
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
          <span id="resume-file-name" className="text-sm text-foreground-muted">
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

      <section className="grid gap-3" aria-labelledby="uploaded-resumes-title">
        <h2 id="uploaded-resumes-title" className="text-lg font-semibold">
          Uploaded résumés
        </h2>
        {documents.length === 0 ? (
          <div className="card p-6 text-sm text-foreground-muted">
            No résumé has been uploaded.
          </div>
        ) : (
          documents.map((document) => (
            <article
              className="card flex flex-wrap items-center gap-4 p-4"
              key={document.id}
            >
              <FileText aria-hidden="true" className="text-brand" />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-medium">
                  {document.originalFileName}
                </h3>
                <p className="m-0 text-xs">
                  {document.format} · {(document.sizeBytes / 1024).toFixed(1)}{" "}
                  KB · {document.status.replaceAll("_", " ").toLowerCase()} ·{" "}
                  {document.proposalCount} proposals
                </p>
              </div>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => remove(document.id)}
                disabled={busy}
                aria-label={`Delete ${document.originalFileName}`}
              >
                <Trash2 aria-hidden="true" size={17} /> Delete
              </button>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
