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
  it("explains that a submitted reference is an immutable hard blocker", () => {
    const markup = renderToStaticMarkup(
      createElement(DocumentDeletionBlockerNotice, {
        applications: [application],
        fileName: "historical_resume.pdf",
      }),
    );

    expect(markup).toContain("active or historical submission");
    expect(markup).toContain("immutable");
    expect(markup).toContain('href="/applications/owner-application-1"');
  });

  it("renders every protected blocker with its own direct application link", () => {
    const markup = renderToStaticMarkup(
      createElement(DocumentDeletionBlockerNotice, {
        applications: [
          application,
          {
            applicationId: "owner-application-2",
            company: "Atlas Systems",
            jobTitle: "Platform Engineer",
          },
        ],
        fileName: "candidate_resume.pdf",
      }),
    );

    expect(markup).toContain('href="/applications/owner-application-1"');
    expect(markup).toContain('href="/applications/owner-application-2"');
    expect(markup.match(/Open application/gu)).toHaveLength(2);
  });
});
