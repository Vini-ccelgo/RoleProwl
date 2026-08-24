import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { AuthorizationError } from "@/core/errors/application-errors";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { exportAccountData } from "@/integrations/privacy/prisma-account-export";
import { PrismaRateLimiter } from "@/integrations/security/prisma-rate-limiter";

const exportRateLimiter = new PrismaRateLimiter();

export async function GET() {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    const rateLimit = await exportRateLimiter.consume(
      "account-export",
      actor.id,
      {
        limit: 5,
        windowMs: 60 * 60 * 1_000,
      },
    );
    if (!rateLimit.allowed)
      return Response.json(
        { error: "Account export limit reached. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    const data = await exportAccountData(actor.id);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="roleprowl-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError)
      return Response.json(
        { error: "Authentication is required" },
        { status: 401 },
      );
    return Response.json({ error: "Account export failed" }, { status: 500 });
  }
}
