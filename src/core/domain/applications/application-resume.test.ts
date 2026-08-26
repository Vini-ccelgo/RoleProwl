import { describe, expect, it } from "vitest";
import {
  applicationResumeDownloadAvailable,
  applicationResumeSnapshot,
  selectedApplicationResume,
  selectApplicationResume,
} from "./application-resume";

describe("canonical Application résumé snapshot", () => {
  it("prefers a tailored résumé and emits the download-authority shape", () => {
    expect(
      selectApplicationResume({
        tailoredResume: {
          id: "resume-version-1",
          renderedFileName: "tailored.docx",
          renderedContentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          renderedStorageKey: "resume-versions/tailored",
        },
        candidateDocument: {
          originalFileName: "uploaded.pdf",
          mimeType: "application/pdf",
          storageKey: "candidate-documents/uploaded",
        },
      }),
    ).toEqual({
      document: {
        kind: "RESUME",
        fileName: "tailored.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        storageKey: "resume-versions/tailored",
      },
      resumeVersionId: "resume-version-1",
      packetSource: {
        fileName: "tailored.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        storageKey: "resume-versions/tailored",
        tailored: true,
      },
    });
  });

  it("uses a CandidateDocument when creation has no tailored résumé", () => {
    expect(
      selectApplicationResume({
        tailoredResume: null,
        candidateDocument: {
          originalFileName: "uploaded.pdf",
          mimeType: "application/pdf",
          storageKey: "candidate-documents/uploaded",
        },
      }),
    ).toMatchObject({
      document: {
        kind: "RESUME",
        fileName: "uploaded.pdf",
        contentType: "application/pdf",
        storageKey: "candidate-documents/uploaded",
      },
      resumeVersionId: null,
      packetSource: { tailored: false },
    });
  });

  it("reconstructs packet input from the stable Application snapshot", () => {
    expect(
      selectedApplicationResume({
        documentsSnapshot: [
          {
            kind: "RESUME",
            fileName: "Calder.pdf",
            contentType: "application/pdf",
            storageKey: "candidate-documents/calder",
          },
        ],
        resumeVersionId: null,
      }),
    ).toMatchObject({
      document: { fileName: "Calder.pdf" },
      resumeVersionId: null,
      packetSource: {
        fileName: "Calder.pdf",
        storageKey: "candidate-documents/calder",
        tailored: false,
      },
    });
  });

  it("selects no résumé when neither approved source exists", () => {
    expect(
      selectApplicationResume({
        tailoredResume: null,
        candidateDocument: null,
      }),
    ).toBeNull();
  });

  it("rejects missing-kind and malformed legacy snapshots safely", () => {
    expect(
      applicationResumeSnapshot([
        {
          fileName: "legacy.pdf",
          contentType: "application/pdf",
          storageKey: "candidate-documents/legacy",
        },
      ]),
    ).toBeNull();
    expect(
      applicationResumeSnapshot([
        {
          kind: "RESUME",
          fileName: "legacy.pdf",
          contentType: "application/pdf",
          storageKey: null,
        },
      ]),
    ).toBeNull();
    expect(applicationResumeSnapshot({ kind: "RESUME" })).toBeNull();
  });

  it("offers download only when the packet and canonical snapshot agree", () => {
    const resume = {
      kind: "RESUME",
      fileName: "resume.pdf",
      contentType: "application/pdf",
      storageKey: "candidate-documents/current",
    };
    expect(applicationResumeDownloadAvailable([resume], [resume])).toBe(true);
    expect(
      applicationResumeDownloadAvailable(
        [resume],
        [{ ...resume, storageKey: "candidate-documents/stale-packet" }],
      ),
    ).toBe(false);
    expect(applicationResumeDownloadAvailable([], [resume])).toBe(false);
  });
});
