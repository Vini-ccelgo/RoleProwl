import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { proposalReviewRequestSchema } from "@/core/domain/candidate/proposal-review-request";
import {
  ApplicationError,
  AuthorizationError,
} from "@/core/errors/application-errors";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { persistFactProposalDecision } from "@/integrations/candidate/prisma-fact-proposal-review";
import { databaseClient } from "@/lib/db/client";
import {
  assertContentLength,
  assertContentType,
  assertMutationRequestIsSameOrigin,
} from "@/lib/security/request-security";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ proposalId: string }> },
) {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    assertMutationRequestIsSameOrigin(request);
    assertContentType(request, "application/json");
    assertContentLength(request, 16 * 1024);
    const { proposalId } = await context.params;
    const body = proposalReviewRequestSchema.parse(await request.json());
    const db = databaseClient();

    const result = await db.$transaction((transaction) =>
      persistFactProposalDecision(transaction, {
        decision: body.decision,
        editedValue: "editedValue" in body ? body.editedValue : undefined,
        proposalId,
        userId: actor.id,
      }),
    );

    revalidatePath("/onboarding");
    revalidatePath("/profile");

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ApplicationError) {
      const status =
        error.code === "NOT_FOUND"
          ? 404
          : error.code === "CONFLICT"
            ? 409
            : 400;
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status },
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Choose a valid proposal decision." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "The proposal could not be reviewed." },
      { status: 500 },
    );
  }
}
