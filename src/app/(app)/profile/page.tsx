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
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { getCandidateTruthVault } from "@/integrations/candidate/prisma-truth-vault";
import { connection } from "next/server";

export default async function ProfilePage() {
  await connection();
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const vault = await getCandidateTruthVault(actor.id);

  return (
    <div className="app-page profile-page">
      <PageHeader
        title="Candidate Truth Vault"
        description="Your canonical factual profile. AI interpretations and generated claims remain outside this record until you explicitly verify them."
      />
      <nav className="vault-jump-nav" aria-label="Profile sections">
        <a href="#details">Details</a>
        <a href="#resume-facts">Résumé facts</a>
        <a href="#experience">Experience</a>
        <a href="#education">Education</a>
        <a href="#skills">Skills</a>
        <a href="#projects">Projects</a>
        <a href="#authorization">Authorization</a>
        <a href="#preferences">Preferences</a>
      </nav>
      <div className="vault-sections">
        <div id="details">
          <ProfileDetailsSection vault={vault} />
        </div>
        <div id="resume-facts">
          <VerifiedResumeFactsSection vault={vault} />
        </div>
        <div id="experience">
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
