import { describe, expect, it } from "vitest";
import {
  documentStorageEnv,
  geminiEnv,
  selectedAIProviderEnv,
  syntheticGeminiTestingEnabled,
  validateServerEnvironment,
} from "./server";

describe("server environment validation", () => {
  it("accepts optional integrations when omitted or fully configured", () => {
    expect(validateServerEnvironment({ NODE_ENV: "test" })).toMatchObject({
      NODE_ENV: "test",
    });
    expect(
      validateServerEnvironment({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_value",
        CLERK_SECRET_KEY: "sk_test_value",
        INNGEST_EVENT_KEY: "event-key",
        INNGEST_SIGNING_KEY: "signing-key",
      }),
    ).toMatchObject({ CLERK_SECRET_KEY: "sk_test_value" });
  });

  it("rejects partial provider configuration and unreasonable AI controls", () => {
    expect(() =>
      validateServerEnvironment({ CLERK_SECRET_KEY: "only-one-key" }),
    ).toThrow("configured together");
    expect(() =>
      validateServerEnvironment({ INNGEST_EVENT_KEY: "only-one-key" }),
    ).toThrow("configured together");
    expect(() =>
      validateServerEnvironment({ ROLEPROWL_AI_TIMEOUT_MS: "999999" }),
    ).toThrow();
    expect(() =>
      validateServerEnvironment({ ROLEPROWL_AI_MAX_RETRIES: "99" }),
    ).toThrow();
    expect(() => validateServerEnvironment({ AI_PROVIDER: "gemini" })).toThrow(
      "GEMINI_API_KEY",
    );
    expect(() => validateServerEnvironment({ AI_PROVIDER: "openai" })).toThrow(
      "OPENAI_API_KEY",
    );
  });

  it("uses Gemini as the temporary default with conservative limits", () => {
    expect(selectedAIProviderEnv({})).toBe("gemini");
    expect(geminiEnv({ GEMINI_API_KEY: "fixture-key" })).toMatchObject({
      ROLEPROWL_GEMINI_MODEL_LITE: "gemini-3.5-flash-lite",
      ROLEPROWL_GEMINI_MODEL_FLASH: "gemini-3.5-flash",
      ROLEPROWL_GEMINI_LITE_RPM_LIMIT: 12,
      ROLEPROWL_GEMINI_LITE_RPD_LIMIT: 450,
      ROLEPROWL_GEMINI_FLASH_RPM_LIMIT: 4,
      ROLEPROWL_GEMINI_FLASH_RPD_LIMIT: 15,
      ROLEPROWL_GEMINI_SYNTHETIC_ONLY: true,
      deployment: "local",
    });
  });

  it("guards preview and production synthetic-only initialization", () => {
    expect(() =>
      geminiEnv({
        GEMINI_API_KEY: "fixture-key",
        ROLEPROWL_GEMINI_SYNTHETIC_ONLY: "true",
        ROLEPROWL_DEPLOYMENT_ENVIRONMENT: "preview",
      }),
    ).toThrow("preview deployment override");
    expect(() =>
      geminiEnv({
        GEMINI_API_KEY: "fixture-key",
        ROLEPROWL_GEMINI_SYNTHETIC_ONLY: "true",
        ROLEPROWL_DEPLOYMENT_ENVIRONMENT: "production",
      }),
    ).toThrow("blocked in production");
    expect(
      geminiEnv({
        GEMINI_API_KEY: "fixture-key",
        ROLEPROWL_GEMINI_SYNTHETIC_ONLY: "true",
        ROLEPROWL_DEPLOYMENT_ENVIRONMENT: "preview",
        ROLEPROWL_ALLOW_SYNTHETIC_AI_PREVIEW: "true",
      }).deployment,
    ).toBe("preview");
  });

  it("exposes only the safe synthetic-mode boolean to the server UI", () => {
    expect(
      syntheticGeminiTestingEnabled({
        AI_PROVIDER: "gemini",
        GEMINI_API_KEY: "must-not-be-read-by-the-ui-helper",
        ROLEPROWL_GEMINI_SYNTHETIC_ONLY: "true",
      }),
    ).toBe(true);
    expect(
      syntheticGeminiTestingEnabled({
        AI_PROVIDER: "openai",
        ROLEPROWL_GEMINI_SYNTHETIC_ONLY: "true",
      }),
    ).toBe(false);
  });

  it("requires complete private S3 configuration for hosted deployments", () => {
    expect(() =>
      validateServerEnvironment({
        NODE_ENV: "production",
        ROLEPROWL_DEPLOYMENT_ENVIRONMENT: "preview",
        ROLEPROWL_STORAGE_PROVIDER: "filesystem",
      }),
    ).toThrow("filesystem storage is forbidden");
    const environment = {
      NODE_ENV: "production",
      ROLEPROWL_DEPLOYMENT_ENVIRONMENT: "preview",
      ROLEPROWL_STORAGE_PROVIDER: "s3",
      ROLEPROWL_STORAGE_BUCKET: "roleprowl",
      AWS_ACCESS_KEY_ID: "fixture-access-key",
      AWS_SECRET_ACCESS_KEY: "fixture-secret-key",
      AWS_ENDPOINT_URL_S3: "https://storage.example.test",
      AWS_REGION: "us-east-2",
    } as const;
    expect(validateServerEnvironment(environment)).toMatchObject({
      ROLEPROWL_STORAGE_PROVIDER: "s3",
      ROLEPROWL_STORAGE_BUCKET: "roleprowl",
    });
    expect(documentStorageEnv(environment)).toMatchObject({
      deployment: "preview",
      provider: "s3",
      bucket: "roleprowl",
    });
  });
});
