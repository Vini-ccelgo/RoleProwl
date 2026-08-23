import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchControl } from "./search-control";

describe("Search now control", () => {
  it("explains the boundary and exposes an explicit manual action", () => {
    const markup = renderToStaticMarkup(
      createElement(SearchControl, { lastRun: null }),
    );
    expect(markup).toContain("Search now");
    expect(markup).toContain("never submits an application");
  });

  it("disables duplicate invocation while a persisted run is active", () => {
    const markup = renderToStaticMarkup(
      createElement(SearchControl, {
        active: true,
        lastRun: {
          status: "RUNNING",
          startedAt: "2026-08-22T12:00:00.000Z",
          completedAt: null,
          discoveredCount: 0,
          newCount: 0,
          failureMessage: null,
        },
      }),
    );
    expect(markup).toContain("disabled");
    expect(markup).toContain("Search running");
    expect(markup).toContain("A search is currently running");
  });
});
