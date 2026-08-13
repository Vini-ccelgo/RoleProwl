import { expect, test } from "@playwright/test";
import { APP_ROUTES, LEGAL_ROUTES } from "../src/config/routes";

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
  for (const route of APP_ROUTES)
    await expect(
      primary.getByRole("link", { name: route.label }),
    ).toHaveAttribute("href", route.href);
});

for (const route of APP_ROUTES)
  test(`${route.href} renders in the application shell`, async ({ page }) => {
    await page.goto(route.href);
    await expect(
      page.getByRole("heading", { name: route.label, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Application navigation" }),
    ).toBeVisible();
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
test("mobile homepage has no horizontal overflow and exposes menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
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
