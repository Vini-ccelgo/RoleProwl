import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatLocalDateTime, LocalDateTime } from "./local-date-time";

describe("browser-local date and time", () => {
  const instant = "2026-09-15T12:00:00.000Z";

  it("formats the same instant in different browser timezones", () => {
    const saoPaulo = formatLocalDateTime(instant, {
      locale: "en-US",
      timeZone: "America/Sao_Paulo",
    });
    const tokyo = formatLocalDateTime(instant, {
      locale: "en-US",
      timeZone: "Asia/Tokyo",
    });

    expect(saoPaulo).toContain("9:00:00 AM");
    expect(tokyo).toContain("9:00:00 PM");
    expect(saoPaulo).not.toBe(tokyo);
    expect(new Date(instant).toISOString()).toBe(instant);
  });

  it("server-renders the absolute ISO instant before browser formatting", () => {
    const markup = renderToStaticMarkup(
      createElement(LocalDateTime, { value: instant }),
    );

    expect(markup).toBe(`<time dateTime="${instant}">${instant}</time>`);
  });
});
