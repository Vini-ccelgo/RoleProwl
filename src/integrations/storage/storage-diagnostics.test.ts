import { describe, expect, it } from "vitest";
import { IntegrationError } from "@/core/errors/application-errors";
import { storageFailureLogContext } from "./storage-diagnostics";

describe("storage failure diagnostics", () => {
  it("reports provider and runtime structure without returning auth values", () => {
    const providerError = Object.assign(new Error("must not be logged"), {
      name: "AuthorizationHeaderMalformed",
      Code: "AuthorizationHeaderMalformed",
      $fault: "client",
      $metadata: {
        httpStatusCode: 400,
        requestId: "safe-request-id",
        extendedRequestId: "safe-extended-id",
        attempts: 2,
        totalRetryDelay: 25,
      },
    });
    const context = storageFailureLogContext(
      new IntegrationError("safe application error", providerError),
      "put",
      { bodyType: "Uint8Array", bodyBytes: 128 },
      {
        ROLEPROWL_STORAGE_PROVIDER: "s3",
        ROLEPROWL_STORAGE_BUCKET: "roleprowl",
        AWS_ENDPOINT_URL_S3: "https://s3.us-east-005.backblazeb2.com",
        AWS_REGION: "us-east-005",
        AWS_ACCESS_KEY_ID: "storage-id-fixture",
        AWS_SECRET_ACCESS_KEY: "storage-material-fixture",
        AWS_EXECUTION_ENV: "AWS_Lambda_nodejs24.x",
        VERCEL_REGION: "iad1",
        VERCEL_DEPLOYMENT_ID: "dpl_fixture",
        VERCEL_GIT_COMMIT_SHA: "f15f72c",
      },
    );

    expect(context).toMatchObject({
      storageOperation: "put",
      providerErrorName: "AuthorizationHeaderMalformed",
      providerHttpStatus: 400,
      retryCount: 1,
      storageEndpointHost: "s3.us-east-005.backblazeb2.com",
      storageConfiguredRegion: "us-east-005",
      storageAuthIdPresent: true,
      storageAuthMaterialPresent: true,
      runtimeDeploymentId: "dpl_fixture",
      runtimeGitCommitSha: "f15f72c",
      bodyType: "Uint8Array",
      bodyBytes: 128,
    });
    const output = JSON.stringify(context);
    expect(output).not.toContain("storage-id-fixture");
    expect(output).not.toContain("storage-material-fixture");
    expect(output).not.toContain("must not be logged");
  });

  it("reports malformed credential structure without exposing values", () => {
    const context = storageFailureLogContext(
      new Error("failure"),
      "get",
      {},
      {
        ROLEPROWL_STORAGE_PROVIDER: "s3",
        AWS_ACCESS_KEY_ID: " legacy-id ",
        AWS_SECRET_ACCESS_KEY: '"legacy-material"',
        AWS_ENDPOINT_URL_S3: "https://storage.example.test",
        AWS_REGION: "us-east-2",
      },
    );

    expect(context).toMatchObject({
      storageAuthIdBoundaryWhitespace: true,
      storageAuthMaterialOuterQuotes: true,
    });
    expect(JSON.stringify(context)).not.toContain("legacy-id");
    expect(JSON.stringify(context)).not.toContain("legacy-material");
  });
});
