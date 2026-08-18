import { describe, expect, it } from "vitest";
import { DevelopmentFilesystemStorage } from "./development-filesystem-storage";
import { documentStorage } from "./document-storage";
import { S3ObjectStorageProvider } from "./s3-object-storage";

const hostedStorageEnvironment = {
  NODE_ENV: "production",
  ROLEPROWL_DEPLOYMENT_ENVIRONMENT: "preview",
  ROLEPROWL_STORAGE_PROVIDER: "s3",
  ROLEPROWL_STORAGE_BUCKET: "roleprowl",
  AWS_ACCESS_KEY_ID: "fixture-access-key",
  AWS_SECRET_ACCESS_KEY: "fixture-secret-key",
  AWS_ENDPOINT_URL_S3: "https://s3.us-east-005.backblazeb2.com",
  AWS_REGION: "us-east-005",
} as const;

describe("document storage resolution", () => {
  it("keeps filesystem storage available for tests", () => {
    expect(
      documentStorage({
        NODE_ENV: "test",
        ROLEPROWL_DEPLOYMENT_ENVIRONMENT: "test",
      }),
    ).toBeInstanceOf(DevelopmentFilesystemStorage);
  });

  it("resolves configured hosted storage to the generic S3 adapter", () => {
    expect(documentStorage(hostedStorageEnvironment)).toBeInstanceOf(
      S3ObjectStorageProvider,
    );
  });

  it("fails closed for hosted filesystem or incomplete S3 configuration", () => {
    expect(() =>
      documentStorage({
        NODE_ENV: "production",
        ROLEPROWL_DEPLOYMENT_ENVIRONMENT: "preview",
        ROLEPROWL_STORAGE_PROVIDER: "filesystem",
      }),
    ).toThrow("Filesystem document storage is forbidden");
    expect(() =>
      documentStorage({
        NODE_ENV: "production",
        ROLEPROWL_DEPLOYMENT_ENVIRONMENT: "preview",
        ROLEPROWL_STORAGE_PROVIDER: "s3",
      }),
    ).toThrow();
    expect(() =>
      documentStorage({
        ...hostedStorageEnvironment,
        AWS_ENDPOINT_URL_S3: "http://storage.example.test",
      }),
    ).toThrow("requires an HTTPS endpoint");
  });
});
