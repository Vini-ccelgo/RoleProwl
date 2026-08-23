import { Trash2 } from "lucide-react";
import {
  deleteCandidateEntity,
  editCandidateFact,
  removeCandidateFact,
  saveCandidatePreferences,
  saveCandidateProfile,
  saveCredential,
  saveEducation,
  saveProject,
  saveSkill,
  saveSkillEvidence,
  saveWorkAuthorization,
  saveWorkExperience,
} from "@/app/(app)/profile/actions";
import type { CandidateTruthVault } from "@/integrations/candidate/prisma-truth-vault";
import { getProposalDestination } from "@/core/domain/candidate/proposal-destinations";
import { VaultForm } from "./vault-form";
import {
  dateInput,
  SelectField,
  TextAreaField,
  TextField,
} from "./vault-fields";
import { ConfirmFactRemovalButton } from "./confirm-fact-removal-button";

const yesNo = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;
type Experience = CandidateTruthVault["experiences"][number];
type Education = CandidateTruthVault["education"][number];
type Skill = CandidateTruthVault["skills"][number];
type Project = CandidateTruthVault["projects"][number];
type Credential = CandidateTruthVault["credentials"][number];
type VerifiedResumeFact = CandidateTruthVault["verifiedResumeFacts"][number];

function factText(value: unknown) {
  if (value && typeof value === "object" && "text" in value) {
    const text = (value as { text?: unknown }).text;
    if (typeof text === "string") return text;
  }
  return JSON.stringify(value);
}

function sourceRegionText(value: unknown) {
  if (value && typeof value === "object" && "text" in value) {
    const text = (value as { text?: unknown }).text;
    if (typeof text === "string") return text;
  }
  return "Extracted document region";
}

function VerifiedResumeFactRecord({ item }: { item: VerifiedResumeFact }) {
  const destination = getProposalDestination(item.factType);
  const removeAction = removeCandidateFact.bind(null, item.id);
  return (
    <article className="vault-record">
      <div className="vault-record-heading verified-fact-heading">
        <div>
          <strong>{destination?.label ?? item.factType}</strong>
          <small>{factText(item.value)}</small>
        </div>
        <span className="badge verified-fact-badge">Verified from résumé</span>
      </div>
      <details>
        <summary>View provenance</summary>
        <div className="grid gap-2 pt-3 text-sm">
          <p className="m-0">
            Source document: {item.sourceProposal.document.originalFileName}
          </p>
          <p className="m-0">
            Source region: {sourceRegionText(item.sourceProposal.sourceRegion)}
          </p>
          <p className="m-0">
            Review decision: {item.sourceProposal.status.replaceAll("_", " ")}
          </p>
        </div>
      </details>
      <details className="verified-fact-edit">
        <summary>Edit active value</summary>
        <VaultForm action={editCandidateFact} submitLabel="Save correction">
          <input name="id" type="hidden" value={item.id} />
          <TextAreaField
            name="factValue"
            label="Active verified value"
            defaultValue={factText(item.value)}
            wide
          />
        </VaultForm>
      </details>
      <form action={removeAction} className="verified-fact-remove">
        <ConfirmFactRemovalButton />
      </form>
    </article>
  );
}

export function VerifiedResumeFactsSection({
  vault,
}: {
  vault: CandidateTruthVault;
}) {
  return (
    <VaultSection
      title="Verified résumé facts"
      description="Accepted résumé claims remain linked to their source document and review decision. They do not overwrite structured profile records or your sign-in email."
    >
      {vault.verifiedResumeFacts.length === 0 ? (
        <p className="m-0 text-sm text-foreground-muted">
          No résumé proposals have been accepted yet.
        </p>
      ) : (
        vault.verifiedResumeFacts.map((item) => (
          <VerifiedResumeFactRecord key={item.id} item={item} />
        ))
      )}
    </VaultSection>
  );
}

function DeleteButton({
  kind,
  id,
}: {
  kind:
    | "experience"
    | "education"
    | "skill"
    | "skillEvidence"
    | "project"
    | "credential";
  id: string;
}) {
  const action = deleteCandidateEntity.bind(null, kind, id);
  return (
    <form action={action}>
      <button
        className="record-delete"
        type="submit"
        aria-label={`Delete ${kind === "skillEvidence" ? "skill evidence" : kind}`}
      >
        <Trash2 size={15} />
        Delete
      </button>
    </form>
  );
}

function Record({
  title,
  meta,
  children,
  kind,
  id,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
  kind: "experience" | "education" | "skill" | "project" | "credential";
  id: string;
}) {
  return (
    <article className="vault-record">
      <div className="vault-record-heading">
        <div>
          <strong>{title}</strong>
          {meta && <small>{meta}</small>}
        </div>
        <DeleteButton kind={kind} id={id} />
      </div>
      <details>
        <summary>Edit details</summary>
        {children}
      </details>
    </article>
  );
}

export function ProfileDetailsSection({
  vault,
}: {
  vault: CandidateTruthVault;
}) {
  const item = vault.profile;
  return (
    <VaultSection
      title="Professional details"
      description="Core identity and professional information. User-entered changes remain unverified until explicitly confirmed."
    >
      <VaultForm action={saveCandidateProfile} submitLabel="Save details">
        <TextField
          name="firstName"
          label="First name"
          defaultValue={item?.firstName}
          required
        />
        <TextField
          name="lastName"
          label="Last name"
          defaultValue={item?.lastName}
          required
        />
        <TextField
          name="professionalTitle"
          label="Professional title"
          defaultValue={item?.professionalTitle}
        />
        <TextField
          name="location"
          label="Location"
          defaultValue={item?.location}
        />
        <TextField
          name="phone"
          label="Phone"
          type="tel"
          defaultValue={item?.phone}
        />
        <TextField
          name="websiteUrl"
          label="Website"
          type="url"
          defaultValue={item?.websiteUrl}
        />
        <TextField
          name="linkedInUrl"
          label="LinkedIn URL"
          type="url"
          defaultValue={item?.linkedInUrl}
        />
        <TextAreaField
          name="summary"
          label="Professional summary"
          defaultValue={item?.summary}
          wide
        />
      </VaultForm>
    </VaultSection>
  );
}

function ExperienceForm({ item }: { item?: Experience }) {
  return (
    <VaultForm
      action={saveWorkExperience}
      resetOnSuccess={!item}
      submitLabel={item ? "Update experience" : "Add experience"}
    >
      {item && <input type="hidden" name="id" value={item.id} />}
      <TextField
        name="employer"
        label="Employer"
        defaultValue={item?.employer}
        required
      />
      <TextField
        name="title"
        label="Title"
        defaultValue={item?.title}
        required
      />
      <TextField
        name="employmentType"
        label="Employment type"
        defaultValue={item?.employmentType}
      />
      <TextField
        name="location"
        label="Location"
        defaultValue={item?.location}
      />
      <TextField
        name="startDate"
        label="Start date"
        type="date"
        defaultValue={dateInput(item?.startDate)}
        required
      />
      <TextField
        name="endDate"
        label="End date"
        type="date"
        defaultValue={dateInput(item?.endDate)}
      />
      <label className="field checkbox-field">
        <input
          name="isCurrent"
          type="checkbox"
          defaultChecked={item?.isCurrent}
        />
        <span>Current employment</span>
      </label>
      <TextAreaField
        name="description"
        label="Description"
        defaultValue={item?.description}
        wide
      />
      <TextAreaField
        name="responsibilities"
        label="Responsibilities"
        defaultValue={item?.responsibilities}
        list
      />
      <TextAreaField
        name="achievements"
        label="Achievements"
        defaultValue={item?.achievements}
        list
      />
    </VaultForm>
  );
}

export function ExperienceSection({ vault }: { vault: CandidateTruthVault }) {
  return (
    <VaultSection
      title="Experience"
      description="Employment history, responsibilities, and evidence-bearing achievements."
    >
      {vault.experiences.map((item) => (
        <Record
          key={item.id}
          id={item.id}
          kind="experience"
          title={`${item.title} · ${item.employer}`}
          meta={`${dateInput(item.startDate)} — ${item.isCurrent ? "Present" : dateInput(item.endDate)}`}
        >
          <ExperienceForm item={item} />
        </Record>
      ))}
      <details className="add-record" open={vault.experiences.length === 0}>
        <summary>+ Add another experience</summary>
        <ExperienceForm />
      </details>
    </VaultSection>
  );
}

function EducationForm({ item }: { item?: Education }) {
  return (
    <VaultForm
      action={saveEducation}
      resetOnSuccess={!item}
      submitLabel={item ? "Update education" : "Add education"}
    >
      {item && <input type="hidden" name="id" value={item.id} />}
      <TextField
        name="institution"
        label="Institution"
        defaultValue={item?.institution}
        required
      />
      <TextField name="program" label="Program" defaultValue={item?.program} />
      <TextField
        name="credential"
        label="Credential"
        defaultValue={item?.credential}
      />
      <TextField name="status" label="Status" defaultValue={item?.status} />
      <TextField
        name="startDate"
        label="Start date"
        type="date"
        defaultValue={dateInput(item?.startDate)}
      />
      <TextField
        name="endDate"
        label="End date"
        type="date"
        defaultValue={dateInput(item?.endDate)}
      />
      <TextAreaField
        name="coursework"
        label="Relevant coursework"
        defaultValue={item?.coursework}
        list
        wide
      />
    </VaultForm>
  );
}

export function EducationSection({ vault }: { vault: CandidateTruthVault }) {
  return (
    <VaultSection
      title="Education"
      description="Institutions, programs, credentials, status, and relevant coursework."
    >
      {vault.education.map((item) => (
        <Record
          key={item.id}
          id={item.id}
          kind="education"
          title={item.institution}
          meta={[item.credential, item.program].filter(Boolean).join(" · ")}
        >
          <EducationForm item={item} />
        </Record>
      ))}
      <details className="add-record" open={vault.education.length === 0}>
        <summary>+ Add another education</summary>
        <EducationForm />
      </details>
    </VaultSection>
  );
}

function SkillForm({ item }: { item?: Skill }) {
  return (
    <VaultForm
      action={saveSkill}
      resetOnSuccess={!item}
      submitLabel={item ? "Update skill" : "Add skill"}
    >
      {item && <input type="hidden" name="id" value={item.id} />}
      <TextField
        name="canonicalName"
        label="Canonical name"
        defaultValue={item?.canonicalName}
        required
      />
      <TextField
        name="category"
        label="Category"
        defaultValue={item?.category}
      />
      <TextField
        name="proficiency"
        label="Proficiency"
        defaultValue={item?.proficiency}
      />
      <TextField
        name="experienceMonths"
        label="Experience (months)"
        type="number"
        min={0}
        max={1200}
        defaultValue={item?.experienceMonths}
      />
      <TextAreaField
        name="aliases"
        label="Aliases"
        defaultValue={item?.aliases}
        list
        wide
      />
    </VaultForm>
  );
}

function SkillEvidenceForms({ item }: { item: Skill }) {
  return (
    <div className="skill-evidence">
      <h4>Evidence links</h4>
      {item.evidence.map((evidence) => (
        <div className="evidence-row" key={evidence.id}>
          <span>
            <strong>{evidence.evidenceType}</strong>
            <small>{evidence.evidenceId}</small>
          </span>
          <DeleteButton kind="skillEvidence" id={evidence.id} />
        </div>
      ))}
      <VaultForm
        action={saveSkillEvidence}
        resetOnSuccess
        submitLabel="Link evidence"
      >
        <input type="hidden" name="skillId" value={item.id} />
        <TextField
          name="evidenceType"
          label="Evidence type"
          placeholder="WORK_EXPERIENCE, EDUCATION, PROJECT, CREDENTIAL"
          required
        />
        <TextField
          name="evidenceId"
          label="Evidence record ID"
          placeholder="Owned record identifier"
          required
        />
        <TextAreaField name="description" label="Evidence note" wide />
      </VaultForm>
    </div>
  );
}

export function SkillsSection({ vault }: { vault: CandidateTruthVault }) {
  return (
    <VaultSection
      title="Skills"
      description="Canonical skills and aliases. Similar-looking technologies remain distinct records."
    >
      {vault.skills.map((item) => (
        <Record
          key={item.id}
          id={item.id}
          kind="skill"
          title={item.canonicalName}
          meta={[item.category, item.proficiency].filter(Boolean).join(" · ")}
        >
          <SkillForm item={item} />
          <SkillEvidenceForms item={item} />
        </Record>
      ))}
      <details className="add-record" open={vault.skills.length === 0}>
        <summary>+ Add another skill</summary>
        <SkillForm />
      </details>
    </VaultSection>
  );
}

function ProjectForm({ item }: { item?: Project }) {
  return (
    <VaultForm
      action={saveProject}
      resetOnSuccess={!item}
      submitLabel={item ? "Update project" : "Add project"}
    >
      {item && <input type="hidden" name="id" value={item.id} />}
      <TextField
        name="name"
        label="Project name"
        defaultValue={item?.name}
        required
      />
      <TextField name="role" label="Your role" defaultValue={item?.role} />
      <TextField
        name="url"
        label="Project URL"
        type="url"
        defaultValue={item?.url}
      />
      <TextField
        name="startDate"
        label="Start date"
        type="date"
        defaultValue={dateInput(item?.startDate)}
      />
      <TextField
        name="endDate"
        label="End date"
        type="date"
        defaultValue={dateInput(item?.endDate)}
      />
      <TextAreaField
        name="description"
        label="Description"
        defaultValue={item?.description}
        wide
      />
      <TextAreaField
        name="skills"
        label="Skills used"
        defaultValue={item?.skills}
        list
      />
      <TextAreaField
        name="outcomes"
        label="Outcomes"
        defaultValue={item?.outcomes}
        list
      />
    </VaultForm>
  );
}

function CredentialForm({ item }: { item?: Credential }) {
  return (
    <VaultForm
      action={saveCredential}
      resetOnSuccess={!item}
      submitLabel={item ? "Update credential" : "Add credential"}
    >
      {item && <input type="hidden" name="id" value={item.id} />}
      <TextField
        name="name"
        label="Credential name"
        defaultValue={item?.name}
        required
      />
      <TextField name="issuer" label="Issuer" defaultValue={item?.issuer} />
      <TextField
        name="issuedAt"
        label="Issued"
        type="date"
        defaultValue={dateInput(item?.issuedAt)}
      />
      <TextField
        name="expiresAt"
        label="Expires"
        type="date"
        defaultValue={dateInput(item?.expiresAt)}
      />
      <TextField
        name="credentialId"
        label="Credential ID"
        defaultValue={item?.credentialId}
      />
      <TextField
        name="credentialUrl"
        label="Credential URL"
        type="url"
        defaultValue={item?.credentialUrl}
      />
    </VaultForm>
  );
}

export function ProjectsCredentialsSection({
  vault,
}: {
  vault: CandidateTruthVault;
}) {
  return (
    <VaultSection
      title="Projects and credentials"
      description="Project evidence and certifications or licenses remain separate factual records."
    >
      {vault.projects.map((item) => (
        <Record
          key={item.id}
          id={item.id}
          kind="project"
          title={item.name}
          meta={item.role ?? undefined}
        >
          <ProjectForm item={item} />
        </Record>
      ))}
      <details className="add-record">
        <summary>+ Add another project</summary>
        <ProjectForm />
      </details>
      {vault.credentials.map((item) => (
        <Record
          key={item.id}
          id={item.id}
          kind="credential"
          title={item.name}
          meta={item.issuer ?? undefined}
        >
          <CredentialForm item={item} />
        </Record>
      ))}
      <details className="add-record">
        <summary>+ Add another credential</summary>
        <CredentialForm />
      </details>
    </VaultSection>
  );
}

export function AuthorizationSection({
  vault,
}: {
  vault: CandidateTruthVault;
}) {
  const item = vault.authorization;
  return (
    <VaultSection
      title="Work authorization"
      description="Consequential authorization and sponsorship answers are explicit and are never inferred."
    >
      <VaultForm
        action={saveWorkAuthorization}
        submitLabel="Save authorization"
      >
        <TextField
          name="countryCode"
          label="Country code"
          defaultValue={item?.countryCode}
          required
        />
        <TextField
          name="authorizationStatus"
          label="Authorization status"
          defaultValue={item?.authorizationStatus}
          required
        />
        <SelectField
          name="requiresSponsorship"
          label="Requires current or future sponsorship"
          options={yesNo}
          defaultValue={item ? (item.requiresSponsorship ? "yes" : "no") : ""}
          required
        />
        <TextAreaField
          name="notes"
          label="Notes"
          defaultValue={item?.notes}
          wide
        />
      </VaultForm>
    </VaultSection>
  );
}

export function PreferencesSection({ vault }: { vault: CandidateTruthVault }) {
  const item = vault.preferences;
  return (
    <VaultSection
      title="Job preferences"
      description="Qualification and preference are stored separately; these values express what you want."
    >
      <VaultForm
        action={saveCandidatePreferences}
        submitLabel="Save preferences"
      >
        <TextAreaField
          name="roleFamilies"
          label="Role families"
          defaultValue={item?.roleFamilies}
          list
        />
        <TextAreaField
          name="industries"
          label="Industries"
          defaultValue={item?.industries}
          list
        />
        <TextField
          name="remotePreference"
          label="Remote preference"
          defaultValue={item?.remotePreference}
        />
        <TextAreaField
          name="locationPreferences"
          label="Locations"
          defaultValue={item?.locationPreferences}
          list
        />
        <TextField
          name="salaryMinimum"
          label="Minimum salary"
          type="number"
          min={1}
          defaultValue={item?.salaryMinimum}
        />
        <TextField
          name="salaryCurrency"
          label="Currency"
          defaultValue={item?.salaryCurrency}
        />
        <TextAreaField
          name="employmentTypes"
          label="Employment types"
          defaultValue={item?.employmentTypes}
          list
        />
        <TextAreaField
          name="seniorities"
          label="Seniorities"
          defaultValue={item?.seniorities}
          list
        />
        <TextField
          name="maximumTravelPercent"
          label="Maximum travel (%)"
          type="number"
          min={0}
          max={100}
          defaultValue={item?.maximumTravelPercent}
        />
        <SelectField
          name="willingToRelocate"
          label="Willing to relocate"
          options={yesNo}
          defaultValue={
            item?.willingToRelocate == null
              ? ""
              : item.willingToRelocate
                ? "yes"
                : "no"
          }
        />
        <TextAreaField
          name="exclusions"
          label="Exclusions"
          defaultValue={item?.exclusions}
          list
          wide
        />
      </VaultForm>
    </VaultSection>
  );
}

function VaultSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="vault-section">
      <header>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="vault-section-body">{children}</div>
    </section>
  );
}
