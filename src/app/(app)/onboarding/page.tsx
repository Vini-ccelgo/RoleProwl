import { connection } from "next/server";
import { ResumeImporter } from "@/components/candidate/resume-importer";
import { FactProposalReview } from "@/components/candidate/fact-proposal-review";
import { PageHeader } from "@/components/ui/page-header";
import { requireWorkspacePageActor } from "@/features/accounts/require-workspace-page-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";
import {
  pendingProposalReviewQuery,
  proposalReviewSummary,
} from "@/features/candidate/proposal-review-summary";

export default async function OnboardingPage() {
  await connection();
  const actor = await requireWorkspacePageActor(currentAuthProvider());
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
    database.candidateFactProposal.findMany(
      pendingProposalReviewQuery(actor.id),
    ),
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
      <FactProposalReview proposals={proposals.map(proposalReviewSummary)} />
    </div>
  );
}
