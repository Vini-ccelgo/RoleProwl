import { expect, test } from "@playwright/test";
import {
  APP_ROUTES,
  LEGAL_ROUTES,
  MARKETING_NAV_ROUTES,
} from "../src/config/routes";

test("homepage exposes its brand, CTA, and desktop navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "RoleProwl home" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Start Your Search" }).first(),
  ).toBeVisible();
  const primary = page.getByRole("navigation", { name: "Primary navigation" });
  for (const route of MARKETING_NAV_ROUTES)
    await expect(
      primary.getByRole("link", { name: route.label }),
    ).toHaveAttribute("href", route.href);
});

for (const route of APP_ROUTES)
  test(`${route.href} rejects an unauthenticated browser`, async ({ page }) => {
    await page.goto(route.href);
    await expect(page).toHaveURL(/\/sign-in\?redirect_url=/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

test("a dynamic job detail rejects an unauthenticated browser", async ({
  page,
}) => {
  await page.goto("/jobs/synthetic-job");
  await expect(page).toHaveURL(/\/sign-in\?redirect_url=/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("public sign-in entry point loads without credentials", async ({
  page,
}) => {
  await page.goto("/sign-in", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("public sign-up entry point loads without credentials", async ({
  page,
}) => {
  await page.goto("/sign-up", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
});

test("an invalid session cookie does not unlock application routes", async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      name: "__session",
      value: "invalid-session-fixture",
      url: "http://127.0.0.1:3100",
    },
  ]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in\?redirect_url=/);
});
for (const route of LEGAL_ROUTES)
  test(`${route.href} identifies placeholder content`, async ({ page }) => {
    await page.goto(route.href);
    await expect(
      page.getByRole("heading", { name: route.label, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText(/development placeholder/i).first(),
    ).toBeVisible();
  });

test("health endpoint returns only healthy public status", async ({
  request,
}) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toEqual({ status: "ok" });
});
test("responses include the configured browser security headers", async ({
  request,
}) => {
  const response = await request.get("/");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["referrer-policy"]).toBe(
    "strict-origin-when-cross-origin",
  );
  expect(response.headers()["permissions-policy"]).toContain("camera=()");
  expect(response.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
});
test("mobile homepage has no horizontal overflow and exposes menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/", { waitUntil: "networkidle" });
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toBeVisible();
});
