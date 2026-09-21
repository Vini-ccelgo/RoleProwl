import { PageHeader } from "@/components/ui/page-header";
import {
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
import { autoIngestSourceExplicitResumeFacts } from "@/integrations/candidate/prisma-resume-auto-ingest";
import { databaseClient } from "@/lib/db/client";
import { CandidateProfileOverview } from "@/components/candidate/candidate-profile-overview";
import { logger } from "@/lib/logging/logger";

export default async function ProfilePage() {
  await connection();
  const actor = await requireWorkspacePageActor(currentAuthProvider());
  try {
    await autoIngestSourceExplicitResumeFacts(databaseClient(), {
      userId: actor.id,
    });
  } catch (error) {
    logger.log("warn", "candidate_profile_auto_ingest_failed", {
      errorType: error instanceof Error ? error.name : "unknown",
      fallback: "EXCEPTION_REVIEW_RETAINED",
    });
  }
  const [vault, knowledge] = await Promise.all([
    getCandidateTruthVault(actor.id),
    getCandidateKnowledgeSnapshot(actor.id),
  ]);

  return (
    <div className="app-page profile-page">
      <PageHeader
        title="Career Profile"
        description="RoleProwl uses this information to prepare applications and reduce repeated questions."
      />
      <CandidateProfileOverview snapshot={knowledge} vault={vault} />
      <ProfileSectionNavigation />
      <div className="profile-sections">
        <div className="profile-section-group" id="personal">
          <div className="profile-section-heading">
            <span>Personal</span>
            <h2>Personal and professional details</h2>
          </div>
          <ProfileDetailsSection vault={vault} />
        </div>
        <div className="profile-section-group" id="experience">
          <div className="profile-section-heading">
            <span>Experience</span>
            <h2>Professional history</h2>
          </div>
          <ExperienceSection vault={vault} />
          <VerifiedResumeFactsSection
            vault={vault}
            factTypes={["WORK_EXPERIENCE_TEXT"]}
            title="Imported experience evidence"
          />
        </div>
        <div className="profile-section-group" id="education-skills">
          <div className="profile-section-heading">
            <span>Education & skills</span>
            <h2>Education, skills, languages, and credentials</h2>
          </div>
          <EducationSection vault={vault} />
          <SkillsSection vault={vault} />
          <ProjectsCredentialsSection vault={vault} />
          <VerifiedResumeFactsSection
            vault={vault}
            factTypes={[
              "EDUCATION_TEXT",
              "SKILL_TEXT",
              "LANGUAGE_TEXT",
              "PROJECT_TEXT",
              "CREDENTIAL_TEXT",
            ]}
            title="Imported résumé evidence"
          />
        </div>
        <div className="profile-section-group" id="preferences">
          <div className="profile-section-heading">
            <span>Preferences</span>
            <h2>Work preferences and availability</h2>
          </div>
          <PreferencesSection vault={vault} />
          <CandidateKnowledgeSection snapshot={knowledge} />
        </div>
        <div className="profile-section-group" id="application-defaults">
          <div className="profile-section-heading">
            <span>Application defaults</span>
            <h2>Application behavior and automation</h2>
          </div>
          <ProfessionalHistoryAuthorityControls snapshot={knowledge} />
          <details className="profile-source-disclosure">
            <summary>All imported facts and provenance</summary>
            <VerifiedResumeFactsSection vault={vault} />
          </details>
        </div>
      </div>
    </div>
  );
}
