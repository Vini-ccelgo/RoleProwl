import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { resolveUserAccount } from "@/features/accounts/resolve-user-account";
import { identityFromClerkUser } from "@/integrations/auth/clerk-webhook";
import { PrismaUserAccountRepository } from "@/integrations/auth/prisma-user-account-repository";
import { logger } from "@/lib/logging/logger";
import {
  assertContentLength,
  assertContentType,
} from "@/lib/security/request-security";

export async function POST(request: NextRequest) {
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) {
    return Response.json(
      { error: "Webhook is not configured" },
      { status: 503 },
    );
  }

  try {
    assertContentType(request, "application/json");
    assertContentLength(request, 512 * 1024);
    const event = await verifyWebhook(request);
    const repository = new PrismaUserAccountRepository();

    if (event.type === "user.created" || event.type === "user.updated") {
      await resolveUserAccount(identityFromClerkUser(event.data), repository);
    } else if (event.type === "user.deleted" && event.data.id) {
      await repository.deactivateIdentity("CLERK", event.data.id);
    }

    logger.log("info", "Clerk identity webhook processed", {
      eventType: event.type,
    });
    return Response.json({ received: true });
  } catch (error) {
    logger.log("warn", "Clerk webhook verification failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json({ error: "Invalid webhook" }, { status: 400 });
  }
}
