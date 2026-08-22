import { connection } from "next/server";
import { ResumeImporter } from "@/components/candidate/resume-importer";
import { FactProposalReview } from "@/components/candidate/fact-proposal-review";
import { PageHeader } from "@/components/ui/page-header";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";
import { isSupportedProposalDestination } from "@/core/domain/candidate/proposal-destinations";

export default async function OnboardingPage() {
  await connection();
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const database = databaseClient();
  const [documents, proposals] = await Promise.all([
    database.candidateDocument.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        originalFileName: true,
        format: true,
        status: true,
        sizeBytes: true,
        createdAt: true,
        _count: { select: { proposals: true } },
      },
    }),
    database.candidateFactProposal.findMany({
      where: { userId: actor.id, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        factType: true,
        proposedValue: true,
        sourceRegion: true,
        targetPath: true,
        confidence: true,
      },
    }),
  ]);

  return (
    <div className="grid gap-7">
      <PageHeader
        title="Start with facts you control"
        description="Import a résumé to create reviewable suggestions, then decide what belongs in your Truth Vault."
      />
      <ResumeImporter
        documents={documents.map(({ _count, createdAt, ...document }) => ({
          ...document,
          createdAt: createdAt.toISOString(),
          proposalCount: _count.proposals,
        }))}
      />
      <FactProposalReview
        proposals={proposals.map((proposal) => {
          const value = proposal.proposedValue as { text?: unknown };
          const source = proposal.sourceRegion as { text?: unknown };
          return {
            id: proposal.id,
            factType: proposal.factType,
            supported: isSupportedProposalDestination(
              proposal.factType,
              proposal.targetPath,
            ),
            confidence: proposal.confidence,
            value:
              typeof value.text === "string"
                ? value.text
                : JSON.stringify(value),
            sourceText:
              typeof source.text === "string"
                ? source.text
                : "Extracted document region",
          };
        })}
      />
    </div>
  );
}
