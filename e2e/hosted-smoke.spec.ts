import { expect, test } from "@playwright/test";

test.skip(
  process.env.ROLEPROWL_HOSTED_TEST !== "true",
  "Hosted smoke tests run only through test:e2e:hosted.",
);

test("hosted homepage and security headers respond without a server error", async ({
  request,
}) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(response.headers()["strict-transport-security"]).toContain(
    "max-age=63072000",
  );
});

test("hosted health endpoint returns only public health status", async ({
  request,
}) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toEqual({ status: "ok" });
});

test("hosted auth entry loads and a protected route remains closed", async ({
  page,
}) => {
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/sign-in/u);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/sign-in(?:\?|\/)/u);
});

test("hosted Inngest serve route is reachable", async ({ request }) => {
  const response = await request.get("/api/inngest");
  expect(response.status()).not.toBe(404);
  expect(response.status()).toBeLessThan(500);
});
