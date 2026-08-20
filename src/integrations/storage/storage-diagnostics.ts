import type { SafeLogContext } from "@/lib/logging/logger";

type Environment = Readonly<Record<string, string | undefined>>;
type ProviderMetadata = Readonly<{
  attempts?: unknown;
  extendedRequestId?: unknown;
  httpStatusCode?: unknown;
  requestId?: unknown;
  totalRetryDelay?: unknown;
}>;

function safeToken(value: unknown, maximumLength = 160) {
  return typeof value === "string" &&
    value.length <= maximumLength &&
    /^[A-Za-z0-9_.:/-]+$/u.test(value)
    ? value
    : undefined;
}

function structure(value: string | undefined) {
  return {
    present: Boolean(value),
    length: value?.length ?? 0,
    trimmedLength: value?.trim().length ?? 0,
    boundaryWhitespace: Boolean(value && value !== value.trim()),
    outerQuotes: Boolean(
      value &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))),
    ),
    newline: Boolean(value && /[\r\n]/u.test(value)),
  };
}

function endpointHost(value: string | undefined) {
  try {
    return value ? new URL(value.trim()).host : undefined;
  } catch {
    return undefined;
  }
}

export function storageFailureLogContext(
  error: unknown,
  operation: "put" | "get" | "delete",
  request: SafeLogContext = {},
  environment: Environment = process.env,
): SafeLogContext {
  const integrationCause =
    typeof error === "object" && error !== null && "cause" in error
      ? (error as { cause?: unknown }).cause
      : undefined;
  const providerError = integrationCause ?? error;
  const provider =
    typeof providerError === "object" && providerError !== null
      ? (providerError as Record<string, unknown>)
      : {};
  const metadata =
    typeof provider.$metadata === "object" && provider.$metadata !== null
      ? (provider.$metadata as ProviderMetadata)
      : {};
  const endpoint = environment.AWS_ENDPOINT_URL_S3;
  const configuredRegion = environment.AWS_REGION;
  const authId = environment.AWS_ACCESS_KEY_ID;
  const authMaterial = environment.AWS_SECRET_ACCESS_KEY;
  const authIdStructure = structure(authId);
  const authMaterialStructure = structure(authMaterial);

  return {
    storageOperation: operation,
    providerErrorName: safeToken(provider.name),
    providerErrorCode:
      safeToken(provider.Code) ??
      safeToken(provider.code) ??
      safeToken(provider.name),
    providerHttpStatus:
      typeof metadata.httpStatusCode === "number"
        ? metadata.httpStatusCode
        : undefined,
    providerRequestId: safeToken(metadata.requestId),
    providerExtendedRequestId: safeToken(metadata.extendedRequestId),
    providerFault: safeToken(provider.$fault),
    retryCount:
      typeof metadata.attempts === "number"
        ? Math.max(0, metadata.attempts - 1)
        : undefined,
    providerRetryDelayMs:
      typeof metadata.totalRetryDelay === "number"
        ? metadata.totalRetryDelay
        : undefined,
    storageProvider: safeToken(environment.ROLEPROWL_STORAGE_PROVIDER),
    storageBucketLength: environment.ROLEPROWL_STORAGE_BUCKET?.trim().length,
    storageEndpointHost: endpointHost(endpoint),
    storageConfiguredRegion: safeToken(configuredRegion),
    storageAuthIdPresent: authIdStructure.present,
    storageAuthIdLength: authIdStructure.length,
    storageAuthIdTrimmedLength: authIdStructure.trimmedLength,
    storageAuthIdBoundaryWhitespace: authIdStructure.boundaryWhitespace,
    storageAuthIdOuterQuotes: authIdStructure.outerQuotes,
    storageAuthIdNewline: authIdStructure.newline,
    storageAuthMaterialPresent: authMaterialStructure.present,
    storageAuthMaterialLength: authMaterialStructure.length,
    storageAuthMaterialTrimmedLength: authMaterialStructure.trimmedLength,
    storageAuthMaterialBoundaryWhitespace:
      authMaterialStructure.boundaryWhitespace,
    storageAuthMaterialOuterQuotes: authMaterialStructure.outerQuotes,
    storageAuthMaterialNewline: authMaterialStructure.newline,
    runtimeEnvironment: safeToken(
      environment.AWS_EXECUTION_ENV ??
        (environment.VERCEL === "1" ? "vercel-node" : "node"),
    ),
    runtimeNodeVersion: process.version,
    runtimeVercelRegion: safeToken(environment.VERCEL_REGION),
    runtimeDeploymentId: safeToken(environment.VERCEL_DEPLOYMENT_ID),
    runtimeGitCommitSha: safeToken(environment.VERCEL_GIT_COMMIT_SHA),
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    ...request,
  };
}
