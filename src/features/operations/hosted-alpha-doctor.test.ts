import { describe, expect, it } from "vitest";
import { inspectHostedAlpha } from "./hosted-alpha-doctor";

const previewEnvironment = {
  NODE_ENV: "production",
  ROLEPROWL_DEPLOYMENT_ENVIRONMENT: "preview",
  DATABASE_URL: "postgresql://runtime.example.test/roleprowl",
  DATABASE_URL_UNPOOLED: "postgresql://migration.example.test/roleprowl",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_fixture",
  CLERK_SECRET_KEY: "sk_test_fixture",
  CLERK_WEBHOOK_SIGNING_SECRET: "whsec_fixture",
  ROLEPROWL_STORAGE_PROVIDER: "s3",
  ROLEPROWL_STORAGE_BUCKET: "roleprowl",
  AWS_ACCESS_KEY_ID: "storage-access-fixture",
  AWS_SECRET_ACCESS_KEY: "storage-secret-fixture",
  AWS_ENDPOINT_URL_S3: "https://storage.example.test",
  AWS_REGION: "us-east-2",
  AI_PROVIDER: "gemini",
  GEMINI_API_KEY: "gemini-fixture",
  ROLEPROWL_GEMINI_SYNTHETIC_ONLY: "true",
  ROLEPROWL_ALLOW_SYNTHETIC_AI_PREVIEW: "true",
  ROLEPROWL_ALLOW_SYNTHETIC_AI_PRODUCTION: "false",
  INNGEST_EVENT_KEY: "event-fixture",
  INNGEST_SIGNING_KEY: "signing-fixture",
} as const;

describe("hosted alpha doctor", () => {
  it("accepts a complete synthetic-only Preview configuration without returning secrets", () => {
    const result = inspectHostedAlpha({
      environment: previewEnvironment,
      nodeVersion: "v24.1.0",
      prismaSchemaPresent: true,
      migrationsPresent: true,
    });
    expect(result.ready).toBe(true);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Storage", status: "CONFIGURED" }),
        expect.objectContaining({
          label: "Synthetic-only AI",
          status: "ENFORCED",
        }),
        expect.objectContaining({
          label: "Production filesystem storage",
          status: "BLOCKED",
        }),
      ]),
    );
    const output = JSON.stringify(result);
    expect(output).not.toContain("storage-secret-fixture");
    expect(output).not.toContain("gemini-fixture");
    expect(output).not.toContain("sk_test_fixture");
  });

  it("fails for missing hosted services or weakened synthetic controls", () => {
    const result = inspectHostedAlpha({
      environment: {
        ...previewEnvironment,
        CLERK_WEBHOOK_SIGNING_SECRET: undefined,
        ROLEPROWL_STORAGE_PROVIDER: "filesystem",
        ROLEPROWL_GEMINI_SYNTHETIC_ONLY: "false",
      },
      nodeVersion: "v24.1.0",
      prismaSchemaPresent: true,
      migrationsPresent: true,
    });
    expect(result.ready).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Storage", status: "ERROR" }),
        expect.objectContaining({
          label: "Clerk webhook",
          status: "ERROR",
        }),
        expect.objectContaining({
          label: "Synthetic-only AI",
          status: "ERROR",
        }),
      ]),
    );
  });
});
