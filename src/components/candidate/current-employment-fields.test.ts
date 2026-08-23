import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { currentEmploymentDateState } from "@/features/candidate/current-employment";
import { CurrentEmploymentFields } from "./current-employment-fields";

describe("current employment fields", () => {
  it("disables and clears an existing end date when employment is current", () => {
    expect(currentEmploymentDateState(true, "2025-01-01")).toEqual({
      disabled: true,
      endDate: "",
      isCurrent: true,
    });
    const markup = renderToStaticMarkup(
      createElement(CurrentEmploymentFields, {
        defaultCurrent: true,
        defaultEndDate: "2025-01-01",
      }),
    );
    expect(markup).toContain('name="endDate"');
    expect(markup).toContain("disabled");
    expect(markup).not.toContain("2025-01-01");
  });

  it("re-enables an empty end date without inventing one", () => {
    expect(currentEmploymentDateState(false, "")).toEqual({
      disabled: false,
      endDate: "",
      isCurrent: false,
    });
  });
});
