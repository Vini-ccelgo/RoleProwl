import { NextResponse } from "next/server";
import { z } from "zod";
import {
  decideFactProposal,
  type JsonObject,
} from "@/core/domain/candidate/fact-verification";
import {
  ApplicationError,
  AuthorizationError,
  ConflictError,
} from "@/core/errors/application-errors";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";
import type { Prisma } from "@/generated/prisma/client";
import {
  assertContentLength,
  assertContentType,
  assertMutationRequestIsSameOrigin,
} from "@/lib/security/request-security";

const reviewRequest = z.object({
  decision: z.enum(["ACCEPT", "EDIT_AND_ACCEPT", "REJECT"]),
  editedValue: z.record(z.string(), z.unknown()).optional(),
});

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
    const body = reviewRequest.parse(await request.json());
    const db = databaseClient();

    const result = await db.$transaction(async (transaction) => {
      const proposal = await transaction.candidateFactProposal.findFirst({
        where: { id: proposalId, userId: actor.id },
        select: {
          id: true,
          userId: true,
          factType: true,
          proposedValue: true,
          status: true,
        },
      });
      const decision = decideFactProposal(
        proposal
          ? { ...proposal, proposedValue: proposal.proposedValue as JsonObject }
          : null,
        actor.id,
        body.decision,
        body.editedValue,
      );

      if (!decision.createCanonicalFact) {
        const updated = await transaction.candidateFactProposal.updateMany({
          where: { id: proposalId, userId: actor.id, status: "PENDING" },
          data: { status: "REJECTED", reviewedAt: new Date() },
        });
        if (updated.count !== 1)
          throw new ConflictError("This proposal has already been reviewed.");
        return { status: "REJECTED", canonicalFactId: null };
      }

      const fact = await transaction.candidateFact.create({
        data: {
          userId: actor.id,
          factType: proposal!.factType,
          value: decision.acceptedValue! as Prisma.InputJsonValue,
          sourceProposalId: proposalId,
        },
        select: { id: true },
      });
      const updated = await transaction.candidateFactProposal.updateMany({
        where: { id: proposalId, userId: actor.id, status: "PENDING" },
        data: {
          status: decision.status,
          acceptedValue: decision.acceptedValue! as Prisma.InputJsonValue,
          canonicalType: "CANDIDATE_FACT",
          canonicalId: fact.id,
          reviewedAt: new Date(),
        },
      });
      if (updated.count !== 1)
        throw new ConflictError("This proposal has already been reviewed.");
      await transaction.auditEvent.create({
        data: {
          actorUserId: actor.id,
          action:
            body.decision === "EDIT_AND_ACCEPT"
              ? "CANDIDATE_FACT_CHANGED"
              : "CANDIDATE_FACT_VERIFIED",
          entityType: "candidateFact",
          entityId: fact.id,
          metadata:
            body.decision === "EDIT_AND_ACCEPT"
              ? {
                  factType: proposal!.factType,
                  changedFields: Object.keys(body.editedValue ?? {}),
                }
              : { factType: proposal!.factType, source: "RESUME_EXTRACTED" },
        },
      });
      return { status: decision.status, canonicalFactId: fact.id };
    });

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
