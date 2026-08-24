import type { AuthenticatedActor } from "@/core/contracts";
import {
  ConfigurationError,
  PrivateBetaAccessError,
} from "@/core/errors/application-errors";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function enabled(value: string | undefined) {
  return value === "true";
}

export function privateBetaAllowedEmails(value: string | undefined) {
  const emails = (value ?? "")
    .split(",")
    .map((email) => email.normalize("NFKC").trim().toLowerCase())
    .filter(Boolean);
  if (emails.some((email) => !EMAIL.test(email)))
    throw new ConfigurationError(
      "Private-beta admission contains an invalid email identifier.",
    );
  return new Set(emails);
}

export function requirePrivateBetaAdmission(
  actor: AuthenticatedActor,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (!enabled(environment.ROLEPROWL_PRIVATE_BETA_ENABLED)) return actor;
  const allowed = privateBetaAllowedEmails(
    environment.ROLEPROWL_PRIVATE_BETA_ALLOWED_EMAILS,
  );
  if (allowed.size === 0)
    throw new ConfigurationError(
      "Private-beta mode requires an explicit admission allowlist.",
    );
  const email = actor.email?.normalize("NFKC").trim().toLowerCase() ?? null;
  if (!email || !allowed.has(email)) throw new PrivateBetaAccessError();
  return actor;
}
