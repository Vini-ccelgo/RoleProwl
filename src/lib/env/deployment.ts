import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().trim().min(1).optional(),
);

export const ROLEPROWL_DEPLOYMENT_ENVIRONMENTS = [
  "local",
  "test",
  "preview",
  "production",
] as const;
export type RoleProwlDeploymentEnvironment =
  (typeof ROLEPROWL_DEPLOYMENT_ENVIRONMENTS)[number];

export function resolveDeploymentEnvironment(
  environment: Readonly<{
    ROLEPROWL_DEPLOYMENT_ENVIRONMENT?: string;
    VERCEL_ENV?: string;
    NODE_ENV?: string;
  }> = process.env,
): RoleProwlDeploymentEnvironment {
  const explicit = environment.ROLEPROWL_DEPLOYMENT_ENVIRONMENT;
  if (
    ROLEPROWL_DEPLOYMENT_ENVIRONMENTS.includes(
      explicit as RoleProwlDeploymentEnvironment,
    )
  )
    return explicit as RoleProwlDeploymentEnvironment;
  if (environment.VERCEL_ENV === "production") return "production";
  if (environment.VERCEL_ENV === "preview") return "preview";
  if (environment.NODE_ENV === "test") return "test";
  if (environment.NODE_ENV === "production") return "production";
  return "local";
}

const documentStorageEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
  ROLEPROWL_DEPLOYMENT_ENVIRONMENT: z
    .enum(ROLEPROWL_DEPLOYMENT_ENVIRONMENTS)
    .optional(),
  ROLEPROWL_STORAGE_PROVIDER: z.enum(["filesystem", "s3"]).optional(),
  ROLEPROWL_STORAGE_BUCKET: optionalSecret,
  AWS_ACCESS_KEY_ID: optionalSecret,
  AWS_SECRET_ACCESS_KEY: optionalSecret,
  AWS_ENDPOINT_URL_S3: z.url().optional(),
  AWS_REGION: optionalSecret,
  ROLEPROWL_LOCAL_STORAGE_PATH: z.string().trim().min(1).optional(),
});

export function documentStorageEnv(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const parsed = documentStorageEnvironmentSchema.parse(environment);
  const deployment = resolveDeploymentEnvironment(parsed);
  const hosted = deployment === "preview" || deployment === "production";
  const provider =
    parsed.ROLEPROWL_STORAGE_PROVIDER ?? (hosted ? null : "filesystem");
  if (provider === null)
    throw new Error(
      "Hosted preview and production deployments require ROLEPROWL_STORAGE_PROVIDER=s3; filesystem storage is forbidden.",
    );
  if (provider === "filesystem") {
    if (hosted)
      throw new Error(
        "Filesystem document storage is forbidden in preview and production deployments.",
      );
    return {
      deployment,
      provider,
      root: parsed.ROLEPROWL_LOCAL_STORAGE_PATH,
    } as const;
  }
  const required = z
    .object({
      ROLEPROWL_STORAGE_BUCKET: z.string().trim().min(1),
      AWS_ACCESS_KEY_ID: z.string().trim().min(1),
      AWS_SECRET_ACCESS_KEY: z.string().trim().min(1),
      AWS_ENDPOINT_URL_S3: z.url(),
      AWS_REGION: z.string().trim().min(1),
    })
    .parse(parsed);
  if (hosted && new URL(required.AWS_ENDPOINT_URL_S3).protocol !== "https:")
    throw new Error("Hosted S3-compatible storage requires an HTTPS endpoint.");
  return {
    deployment,
    provider,
    bucket: required.ROLEPROWL_STORAGE_BUCKET,
    endpoint: required.AWS_ENDPOINT_URL_S3,
    region: required.AWS_REGION,
    accessKeyId: required.AWS_ACCESS_KEY_ID,
    secretAccessKey: required.AWS_SECRET_ACCESS_KEY,
  } as const;
}
