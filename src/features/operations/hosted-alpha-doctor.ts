import {
  documentStorageEnv,
  resolveDeploymentEnvironment,
} from "@/lib/env/deployment";

export type HostedAlphaCheckStatus =
  "OK" | "CONFIGURED" | "ENFORCED" | "BLOCKED" | "OPTIONAL" | "ERROR";

export interface HostedAlphaCheck {
  readonly label: string;
  readonly status: HostedAlphaCheckStatus;
  readonly detail?: string;
  readonly fatal: boolean;
}

type HostedAlphaEnvironment = Readonly<Record<string, string | undefined>>;

function present(environment: HostedAlphaEnvironment, key: string) {
  return Boolean(environment[key]?.trim());
}

function validUrl(value: string | undefined) {
  if (!value?.trim()) return false;
  try {
    return (
      new URL(value).protocol === "postgresql:" ||
      new URL(value).protocol === "postgres:"
    );
  } catch {
    return false;
  }
}

export function inspectHostedAlpha(input: {
  readonly environment: HostedAlphaEnvironment;
  readonly nodeVersion?: string;
  readonly prismaSchemaPresent: boolean;
  readonly migrationsPresent: boolean;
}) {
  const checks: HostedAlphaCheck[] = [];
  const add = (
    label: string,
    ready: boolean,
    readyStatus: HostedAlphaCheckStatus,
    detail?: string,
    fatal = true,
  ) =>
    checks.push({
      label,
      status: ready ? readyStatus : fatal ? "ERROR" : "OPTIONAL",
      detail,
      fatal,
    });

  add(
    "Node 24",
    /^v24\./u.test(input.nodeVersion ?? process.version),
    "OK",
    input.nodeVersion ?? process.version,
  );
  const deployment = resolveDeploymentEnvironment(input.environment);
  add(
    "Environment",
    deployment === "preview",
    "OK",
    deployment === "preview"
      ? "preview"
      : `expected preview, resolved ${deployment}`,
  );
  add(
    "Database",
    validUrl(input.environment.DATABASE_URL) &&
      validUrl(input.environment.DATABASE_URL_UNPOOLED),
    "CONFIGURED",
    "pooled runtime and direct migration URLs",
  );
  add(
    "Prisma",
    input.prismaSchemaPresent && input.migrationsPresent,
    "OK",
    "schema and migration history present",
  );
  add(
    "Clerk",
    present(input.environment, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") &&
      present(input.environment, "CLERK_SECRET_KEY"),
    "CONFIGURED",
  );
  add(
    "Clerk webhook",
    present(input.environment, "CLERK_WEBHOOK_SIGNING_SECRET"),
    "CONFIGURED",
  );

  let storageReady = false;
  try {
    const storage = documentStorageEnv(input.environment);
    storageReady =
      storage.provider === "s3" && storage.deployment === "preview";
  } catch {
    storageReady = false;
  }
  add("Storage", storageReady, "CONFIGURED", "private S3-compatible provider");
  add(
    "Production filesystem storage",
    storageReady,
    "BLOCKED",
    "hosted deployment resolves only to S3",
  );

  add(
    "Gemini",
    input.environment.AI_PROVIDER === "gemini" &&
      present(input.environment, "GEMINI_API_KEY"),
    "CONFIGURED",
  );
  add(
    "Synthetic-only AI",
    input.environment.ROLEPROWL_GEMINI_SYNTHETIC_ONLY === "true" &&
      input.environment.ROLEPROWL_ALLOW_SYNTHETIC_AI_PREVIEW === "true" &&
      input.environment.ROLEPROWL_ALLOW_SYNTHETIC_AI_PRODUCTION !== "true",
    "ENFORCED",
    "preview allowed; production override disabled",
  );
  add(
    "Inngest",
    present(input.environment, "INNGEST_EVENT_KEY") &&
      present(input.environment, "INNGEST_SIGNING_KEY"),
    "CONFIGURED",
  );
  add(
    "Vercel automation bypass",
    present(input.environment, "VERCEL_AUTOMATION_BYPASS_SECRET"),
    "CONFIGURED",
    "optional unless Preview Deployment Protection blocks smoke tests or webhooks",
    false,
  );

  return {
    checks,
    ready: !checks.some((check) => check.fatal && check.status === "ERROR"),
  };
}
