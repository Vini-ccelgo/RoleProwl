import { describe, expect, it } from "vitest";
import { ALL_NAV_ROUTES, MARKETING_NAV_ROUTES, routeForPath } from "./routes";

describe("route configuration", () => {
  it("keeps every navigation path unique and absolute", () => {
    const paths = ALL_NAV_ROUTES.map(({ href }) => href);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every((path) => path.startsWith("/"))).toBe(true);
  });

  it("resolves a configured route without guessing unknown paths", () => {
    expect(routeForPath("/applications")?.label).toBe("Applications");
    expect(routeForPath("/unknown")).toBeUndefined();
  });

  it("keeps one authenticated Dashboard action in the marketing header", () => {
    expect(ALL_NAV_ROUTES.some((route) => route.href === "/dashboard")).toBe(
      true,
    );
    expect(
      MARKETING_NAV_ROUTES.some((route) => route.href === "/dashboard"),
    ).toBe(false);
  });
});
