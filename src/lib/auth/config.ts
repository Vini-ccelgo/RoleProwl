type ClerkEnvironment = Readonly<{
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
  CLERK_SECRET_KEY?: string;
}>;

export function isClerkConfigured(
  environment: ClerkEnvironment = process.env as ClerkEnvironment,
): boolean {
  return Boolean(
    environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
    environment.CLERK_SECRET_KEY?.trim(),
  );
}

export const protectedApplicationPaths = [
  "/dashboard",
  "/onboarding",
  "/profile",
  "/jobs",
  "/queue",
  "/applications",
  "/notifications",
  "/settings",
] as const;

export function isProtectedApplicationPath(pathname: string): boolean {
  return protectedApplicationPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function safeInternalRedirect(
  requested: string | null | undefined,
  fallback: string,
): string {
  if (!requested?.startsWith("/") || requested.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(requested, "https://roleprowl.invalid");
    return parsed.origin === "https://roleprowl.invalid"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
