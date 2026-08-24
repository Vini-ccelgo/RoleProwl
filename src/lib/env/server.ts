import "server-only";
import { z } from "zod";
import {
  resolveDeploymentEnvironment,
  ROLEPROWL_DEPLOYMENT_ENVIRONMENTS,
} from "./deployment";

export {
  documentStorageEnv,
  resolveDeploymentEnvironment,
  ROLEPROWL_DEPLOYMENT_ENVIRONMENTS,
} from "./deployment";
export type { RoleProwlDeploymentEnvironment } from "./deployment";

const optionalSecret = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().trim().min(1).optional(),
);

const optionalBoolean = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "") return undefined;
  return value;
}, z.boolean().optional());

const optionalPositiveInteger = z.coerce
  .number()
  .int()
  .min(1)
  .max(1_000_000)
  .optional();

const PRIVATE_BETA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export const serverEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    DATABASE_URL: z.url().optional(),
    DATABASE_URL_UNPOOLED: z.url().optional(),
    CLERK_SECRET_KEY: optionalSecret,
    CLERK_WEBHOOK_SIGNING_SECRET: optionalSecret,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: optionalSecret,
    AI_PROVIDER: z.enum(["gemini", "openai", "deterministic"]).optional(),
    GEMINI_API_KEY: optionalSecret,
    OPENAI_API_KEY: optionalSecret,
    INNGEST_EVENT_KEY: optionalSecret,
    INNGEST_SIGNING_KEY: optionalSecret,
    GREENHOUSE_BOARDS_JSON: z.string().trim().optional(),
    ROLEPROWL_AI_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(120_000)
      .optional(),
    ROLEPROWL_AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).optional(),
    ROLEPROWL_GEMINI_MODEL_LITE: z.string().trim().min(1).optional(),
    ROLEPROWL_GEMINI_MODEL_FLASH: z.string().trim().min(1).optional(),
    ROLEPROWL_GEMINI_LITE_RPM_LIMIT: optionalPositiveInteger,
    ROLEPROWL_GEMINI_LITE_RPD_LIMIT: optionalPositiveInteger,
    ROLEPROWL_GEMINI_FLASH_RPM_LIMIT: optionalPositiveInteger,
    ROLEPROWL_GEMINI_FLASH_RPD_LIMIT: optionalPositiveInteger,
    ROLEPROWL_GEMINI_SYNTHETIC_ONLY: optionalBoolean,
    ROLEPROWL_ALLOW_SYNTHETIC_AI_PREVIEW: optionalBoolean,
    ROLEPROWL_ALLOW_SYNTHETIC_AI_PRODUCTION: optionalBoolean,
    ROLEPROWL_PRIVATE_BETA_REAL_DATA_AI_ENABLED: optionalBoolean,
    ROLEPROWL_PRIVATE_BETA_ENABLED: optionalBoolean,
    ROLEPROWL_PRIVATE_BETA_ALLOWED_EMAILS: z.string().trim().optional(),
    ROLEPROWL_DEPLOYMENT_ENVIRONMENT: z
      .enum(ROLEPROWL_DEPLOYMENT_ENVIRONMENTS)
      .optional(),
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
    ROLEPROWL_STORAGE_PROVIDER: z.enum(["filesystem", "s3"]).optional(),
    ROLEPROWL_STORAGE_BUCKET: optionalSecret,
    AWS_ACCESS_KEY_ID: optionalSecret,
    AWS_SECRET_ACCESS_KEY: optionalSecret,
    AWS_ENDPOINT_URL_S3: z.url().optional(),
    AWS_REGION: optionalSecret,
    ROLEPROWL_LOCAL_STORAGE_PATH: z.string().trim().min(1).optional(),
  })
  .superRefine((environment, context) => {
    const deployment = resolveDeploymentEnvironment(environment);
    if (
      environment.ROLEPROWL_PRIVATE_BETA_ENABLED &&
      !environment.ROLEPROWL_PRIVATE_BETA_ALLOWED_EMAILS
    )
      context.addIssue({
        code: "custom",
        message:
          "ROLEPROWL_PRIVATE_BETA_ALLOWED_EMAILS is required when private-beta admission is enabled.",
        path: ["ROLEPROWL_PRIVATE_BETA_ALLOWED_EMAILS"],
      });
    if (
      environment.ROLEPROWL_PRIVATE_BETA_ALLOWED_EMAILS?.split(",")
        .map((email) => email.trim())
        .filter(Boolean)
        .some((email) => !PRIVATE_BETA_EMAIL.test(email))
    )
      context.addIssue({
        code: "custom",
        message:
          "ROLEPROWL_PRIVATE_BETA_ALLOWED_EMAILS contains an invalid email identifier.",
        path: ["ROLEPROWL_PRIVATE_BETA_ALLOWED_EMAILS"],
      });
    if (
      environment.ROLEPROWL_PRIVATE_BETA_REAL_DATA_AI_ENABLED &&
      deployment !== "preview"
    )
      context.addIssue({
        code: "custom",
        message:
          "Real-data private-beta AI may be enabled only in a Preview deployment.",
        path: ["ROLEPROWL_PRIVATE_BETA_REAL_DATA_AI_ENABLED"],
      });
    const clerkConfigured = Boolean(
      environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      environment.CLERK_SECRET_KEY,
    );
    if (
      clerkConfigured &&
      !(
        environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
        environment.CLERK_SECRET_KEY
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Clerk publishable and secret keys must be configured together.",
        path: ["CLERK_SECRET_KEY"],
      });
    }
    if (
      Boolean(environment.INNGEST_EVENT_KEY) !==
      Boolean(environment.INNGEST_SIGNING_KEY)
    ) {
      context.addIssue({
        code: "custom",
        message: "Inngest event and signing keys must be configured together.",
        path: ["INNGEST_SIGNING_KEY"],
      });
    }
    if (environment.AI_PROVIDER === "gemini" && !environment.GEMINI_API_KEY) {
      context.addIssue({
        code: "custom",
        message: "GEMINI_API_KEY is required when AI_PROVIDER=gemini.",
        path: ["GEMINI_API_KEY"],
      });
    }
    if (environment.AI_PROVIDER === "openai" && !environment.OPENAI_API_KEY) {
      context.addIssue({
        code: "custom",
        message: "OPENAI_API_KEY is required when AI_PROVIDER=openai.",
        path: ["OPENAI_API_KEY"],
      });
    }
    const hosted = deployment === "preview" || deployment === "production";
    if (hosted && environment.ROLEPROWL_STORAGE_PROVIDER !== "s3") {
      context.addIssue({
        code: "custom",
        message:
          "Hosted preview and production deployments require ROLEPROWL_STORAGE_PROVIDER=s3; filesystem storage is forbidden.",
        path: ["ROLEPROWL_STORAGE_PROVIDER"],
      });
    }
    if (environment.ROLEPROWL_STORAGE_PROVIDER === "s3") {
      for (const key of [
        "ROLEPROWL_STORAGE_BUCKET",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_ENDPOINT_URL_S3",
        "AWS_REGION",
      ] as const)
        if (!environment[key])
          context.addIssue({
            code: "custom",
            message: `${key} is required when ROLEPROWL_STORAGE_PROVIDER=s3.`,
            path: [key],
          });
      if (
        hosted &&
        environment.AWS_ENDPOINT_URL_S3 &&
        new URL(environment.AWS_ENDPOINT_URL_S3).protocol !== "https:"
      )
        context.addIssue({
          code: "custom",
          message: "Hosted S3-compatible storage requires an HTTPS endpoint.",
          path: ["AWS_ENDPOINT_URL_S3"],
        });
    }
  });

export function validateServerEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return serverEnvironmentSchema.parse(environment);
}

const databaseEnvironment = z.object({ DATABASE_URL: z.url() });
export function databaseEnv() {
  return databaseEnvironment.parse(process.env);
}

const aiEnvironment = z.object({ OPENAI_API_KEY: z.string().trim().min(1) });
export function aiEnv() {
  return aiEnvironment.parse(process.env);
}

const selectedAIProviderEnvironment = z.object({
  AI_PROVIDER: z.enum(["gemini", "openai", "deterministic"]).default("gemini"),
});

export function selectedAIProviderEnv(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return selectedAIProviderEnvironment.parse(environment).AI_PROVIDER;
}

const geminiEnvironment = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  GEMINI_API_KEY: z.string().trim().min(1),
  ROLEPROWL_AI_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(30_000),
  ROLEPROWL_AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(1),
  ROLEPROWL_GEMINI_MODEL_LITE: z
    .string()
    .trim()
    .min(1)
    .default("gemini-3.5-flash-lite"),
  ROLEPROWL_GEMINI_MODEL_FLASH: z
    .string()
    .trim()
    .min(1)
    .default("gemini-3.5-flash"),
  ROLEPROWL_GEMINI_LITE_RPM_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .max(1_000_000)
    .default(12),
  ROLEPROWL_GEMINI_LITE_RPD_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .max(1_000_000)
    .default(450),
  ROLEPROWL_GEMINI_FLASH_RPM_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .max(1_000_000)
    .default(4),
  ROLEPROWL_GEMINI_FLASH_RPD_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .max(1_000_000)
    .default(15),
  ROLEPROWL_GEMINI_SYNTHETIC_ONLY: z.preprocess((value) => {
    if (value === "true" || value === undefined) return true;
    if (value === "false") return false;
    return value;
  }, z.boolean()),
  ROLEPROWL_ALLOW_SYNTHETIC_AI_PREVIEW: z.preprocess(
    (value) => value === "true",
    z.boolean(),
  ),
  ROLEPROWL_ALLOW_SYNTHETIC_AI_PRODUCTION: z.preprocess(
    (value) => value === "true",
    z.boolean(),
  ),
  ROLEPROWL_DEPLOYMENT_ENVIRONMENT: z
    .enum(ROLEPROWL_DEPLOYMENT_ENVIRONMENTS)
    .optional(),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
});

export function geminiEnv(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const parsed = geminiEnvironment.parse(environment);
  const deployment = resolveDeploymentEnvironment(parsed);
  if (
    parsed.ROLEPROWL_GEMINI_SYNTHETIC_ONLY &&
    deployment === "preview" &&
    !parsed.ROLEPROWL_ALLOW_SYNTHETIC_AI_PREVIEW
  )
    throw new Error(
      "Synthetic-only Gemini requires an explicit preview deployment override.",
    );
  if (
    parsed.ROLEPROWL_GEMINI_SYNTHETIC_ONLY &&
    deployment === "production" &&
    !parsed.ROLEPROWL_ALLOW_SYNTHETIC_AI_PRODUCTION
  )
    throw new Error(
      "Synthetic-only Gemini is blocked in production without an explicit override.",
    );
  return { ...parsed, deployment };
}

export function syntheticGeminiTestingEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return (
    environment.AI_PROVIDER === "gemini" &&
    environment.ROLEPROWL_GEMINI_SYNTHETIC_ONLY === "true"
  );
}
