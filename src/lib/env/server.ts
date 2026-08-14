import "server-only";
import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().trim().min(1).optional(),
);

export const serverEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    DATABASE_URL: z.url().optional(),
    CLERK_SECRET_KEY: optionalSecret,
    CLERK_WEBHOOK_SIGNING_SECRET: optionalSecret,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: optionalSecret,
    OPENAI_API_KEY: optionalSecret,
    INNGEST_EVENT_KEY: optionalSecret,
    INNGEST_SIGNING_KEY: optionalSecret,
    ROLEPROWL_AI_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(120_000)
      .optional(),
    ROLEPROWL_AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).optional(),
    ROLEPROWL_LOCAL_STORAGE_PATH: z.string().trim().min(1).optional(),
  })
  .superRefine((environment, context) => {
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
