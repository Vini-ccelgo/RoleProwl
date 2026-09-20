import { PageHeader } from "@/components/ui/page-header";
import {
  AuthorizationSection,
  EducationSection,
  ExperienceSection,
  PreferencesSection,
  ProfileDetailsSection,
  ProjectsCredentialsSection,
  SkillsSection,
  VerifiedResumeFactsSection,
} from "@/components/candidate/truth-vault-sections";
import { requireWorkspacePageActor } from "@/features/accounts/require-workspace-page-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { getCandidateTruthVault } from "@/integrations/candidate/prisma-truth-vault";
import { connection } from "next/server";
import { ProfileSectionNavigation } from "@/components/candidate/profile-section-navigation";
import {
  CandidateKnowledgeSection,
  ProfessionalHistoryAuthorityControls,
} from "@/components/candidate/candidate-knowledge-section";
import { getCandidateKnowledgeSnapshot } from "@/integrations/candidate/prisma-candidate-knowledge";

export default async function ProfilePage() {
  await connection();
  const actor = await requireWorkspacePageActor(currentAuthProvider());
  const [vault, knowledge] = await Promise.all([
    getCandidateTruthVault(actor.id),
    getCandidateKnowledgeSnapshot(actor.id),
  ]);

  return (
    <div className="app-page profile-page">
      <PageHeader
        title="Career Profile"
        description="Your canonical factual profile. AI interpretations and generated claims remain outside this record until you explicitly verify them."
      />
      <ProfileSectionNavigation />
      <div className="vault-sections">
        <div id="recurring-details">
          <CandidateKnowledgeSection snapshot={knowledge} />
        </div>
        <div id="details">
          <ProfileDetailsSection vault={vault} />
        </div>
        <div id="resume-facts">
          <VerifiedResumeFactsSection vault={vault} />
        </div>
        <div id="experience">
          <ProfessionalHistoryAuthorityControls snapshot={knowledge} />
          <ExperienceSection vault={vault} />
        </div>
        <div id="education">
          <EducationSection vault={vault} />
        </div>
        <div id="skills">
          <SkillsSection vault={vault} />
        </div>
        <div id="projects">
          <ProjectsCredentialsSection vault={vault} />
        </div>
        <div id="authorization">
          <AuthorizationSection vault={vault} />
        </div>
        <div id="preferences">
          <PreferencesSection vault={vault} />
        </div>
      </div>
    </div>
  );
}
