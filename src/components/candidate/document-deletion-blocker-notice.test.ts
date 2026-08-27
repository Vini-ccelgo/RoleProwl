import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentDeletionBlockerNotice } from "./document-deletion-blocker-notice";

const application = {
  applicationId: "owner-application-1",
  company: "Northstar Labs",
  jobTitle: "Security Engineer",
};

describe("document deletion blocker notice", () => {
  it("links a pending blocker to its explicit résumé-switching surface", () => {
    const markup = renderToStaticMarkup(
      createElement(DocumentDeletionBlockerNotice, {
        applications: [application],
        code: "PENDING_APPLICATION_REFERENCES",
        fileName: "candidate_resume.pdf",
      }),
    );

    expect(markup).toContain("Security Engineer at Northstar Labs");
    expect(markup).toContain('href="/applications/owner-application-1"');
    expect(markup).toContain("Open application");
    expect(markup).toContain("explicitly choose a different résumé");
    expect(markup).toContain("will not switch it automatically");
  });

  it("explains that a submitted reference is an immutable hard blocker", () => {
    const markup = renderToStaticMarkup(
      createElement(DocumentDeletionBlockerNotice, {
        applications: [application],
        code: "SUBMITTED_APPLICATION_REFERENCES",
        fileName: "historical_resume.pdf",
      }),
    );

    expect(markup).toContain("submitted application history");
    expect(markup).toContain("immutable");
    expect(markup).toContain('href="/applications/owner-application-1"');
  });
});
