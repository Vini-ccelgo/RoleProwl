"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  candidatePreferencesSchema,
  candidateProfileSchema,
  credentialSchema,
  educationSchema,
  normalizeSkillAliases,
  normalizeSkillName,
  projectSchema,
  skillSchema,
  splitList,
  workAuthorizationSchema,
  workExperienceSchema,
} from "@/core/domain/candidate/truth-vault";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import type { CandidateFormState } from "@/features/candidate/form-state";
import {
  ownedRecordWhere,
  requireOwnedMutation,
} from "@/features/candidate/ownership";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";
import { invalidateReadyApplicationPackets } from "@/integrations/applications/invalidate-application-packets";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function optionalNumber(formData: FormData, key: string): number | undefined {
  const raw = value(formData, key).trim();
  return raw ? Number(raw) : undefined;
}

function formError(error: unknown): CandidateFormState {
  if (error instanceof z.ZodError) {
    return {
      status: "error",
      message: error.issues[0]?.message ?? "Invalid input",
    };
  }
  if (error instanceof Error && error.name === "NotFoundError") {
    return {
      status: "error",
      message: "The record was not found or is not accessible.",
    };
  }
  return {
    status: "error",
    message: "The change could not be saved. Review the values and retry.",
  };
}

async function success(
  message: string,
  userId: string,
): Promise<CandidateFormState> {
  await invalidateReadyApplicationPackets(databaseClient(), userId);
  revalidatePath("/profile");
  revalidatePath("/applications");
  revalidatePath("/dashboard");
  return { status: "success", message };
}

export async function saveCandidateProfile(
  _state: CandidateFormState,
  formData: FormData,
): Promise<CandidateFormState> {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    const data = candidateProfileSchema.parse({
      firstName: value(formData, "firstName"),
      lastName: value(formData, "lastName"),
      applicationEmail: value(formData, "applicationEmail"),
      professionalTitle: value(formData, "professionalTitle"),
      summary: value(formData, "summary"),
      phone: value(formData, "phone"),
      location: value(formData, "location"),
      countryCode: value(formData, "countryCode"),
      websiteUrl: value(formData, "websiteUrl"),
      linkedInUrl: value(formData, "linkedInUrl"),
    });
    await databaseClient().candidateProfile.upsert({
      where: { userId: actor.id },
      create: { userId: actor.id, ...data },
      update: {
        ...data,
        verificationState: "UNVERIFIED",
        source: "USER_ENTERED",
      },
    });
    return success("Professional details saved.", actor.id);
  } catch (error) {
    return formError(error);
  }
}

export async function saveWorkExperience(
  _state: CandidateFormState,
  formData: FormData,
): Promise<CandidateFormState> {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    const parsed = workExperienceSchema.parse({
      id: value(formData, "id"),
      employer: value(formData, "employer"),
      title: value(formData, "title"),
      employmentType: value(formData, "employmentType"),
      startDate: value(formData, "startDate"),
      endDate: value(formData, "endDate"),
      isCurrent: formData.get("isCurrent") === "on",
      location: value(formData, "location"),
      description: value(formData, "description"),
      responsibilities: splitList(value(formData, "responsibilities")),
      achievements: splitList(value(formData, "achievements")),
    });
    const { id, ...data } = parsed;
    if (id) {
      const result = await databaseClient().workExperience.updateMany({
        where: ownedRecordWhere(actor.id, id),
        data: {
          ...data,
          endDate: data.isCurrent ? null : data.endDate,
          verificationState: "UNVERIFIED",
          source: "USER_ENTERED",
        },
      });
      requireOwnedMutation(result.count);
    } else {
      await databaseClient().workExperience.create({
        data: {
          userId: actor.id,
          ...data,
          endDate: data.isCurrent ? null : data.endDate,
        },
      });
    }
    return success(id ? "Experience updated." : "Experience added.", actor.id);
  } catch (error) {
    return formError(error);
  }
}

export async function saveEducation(
  _state: CandidateFormState,
  formData: FormData,
): Promise<CandidateFormState> {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    const parsed = educationSchema.parse({
      id: value(formData, "id"),
      institution: value(formData, "institution"),
      program: value(formData, "program"),
      credential: value(formData, "credential"),
      startDate: value(formData, "startDate"),
      endDate: value(formData, "endDate"),
      status: value(formData, "status"),
      coursework: splitList(value(formData, "coursework")),
    });
    const { id, ...data } = parsed;
    if (id) {
      const result = await databaseClient().education.updateMany({
        where: ownedRecordWhere(actor.id, id),
        data: {
          ...data,
          verificationState: "UNVERIFIED",
          source: "USER_ENTERED",
        },
      });
      requireOwnedMutation(result.count);
    } else
      await databaseClient().education.create({
        data: { userId: actor.id, ...data },
      });
    return success(id ? "Education updated." : "Education added.", actor.id);
  } catch (error) {
    return formError(error);
  }
}

export async function saveSkill(
  _state: CandidateFormState,
  formData: FormData,
): Promise<CandidateFormState> {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    const parsed = skillSchema.parse({
      id: value(formData, "id"),
      canonicalName: value(formData, "canonicalName"),
      category: value(formData, "category"),
      aliases: splitList(value(formData, "aliases")),
      proficiency: value(formData, "proficiency"),
      experienceMonths: optionalNumber(formData, "experienceMonths"),
    });
    const { id, aliases, ...data } = parsed;
    const skillData = {
      ...data,
      normalizedName: normalizeSkillName(data.canonicalName),
      aliases: normalizeSkillAliases(aliases, data.canonicalName),
    };
    if (id) {
      const result = await databaseClient().skill.updateMany({
        where: ownedRecordWhere(actor.id, id),
        data: {
          ...skillData,
          verificationState: "UNVERIFIED",
          source: "USER_ENTERED",
        },
      });
      requireOwnedMutation(result.count);
    } else
      await databaseClient().skill.create({
        data: { userId: actor.id, ...skillData },
      });
    return success(id ? "Skill updated." : "Skill added.", actor.id);
  } catch (error) {
    return formError(error);
  }
}

export async function saveSkillEvidence(
  _state: CandidateFormState,
  formData: FormData,
): Promise<CandidateFormState> {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    const skillId = value(formData, "skillId");
    const skill = await databaseClient().skill.findFirst({
      where: ownedRecordWhere(actor.id, skillId),
      select: { id: true },
    });
    if (!skill) requireOwnedMutation(0);

    const evidenceType = value(formData, "evidenceType").trim();
    const evidenceId = value(formData, "evidenceId").trim();
    if (!evidenceType || !evidenceId) {
      return {
        status: "error",
        message: "Evidence type and record ID are required.",
      };
    }
    await databaseClient().candidateSkillEvidence.upsert({
      where: {
        skillId_evidenceType_evidenceId: { skillId, evidenceType, evidenceId },
      },
      create: {
        userId: actor.id,
        skillId,
        evidenceType,
        evidenceId,
        description: value(formData, "description").trim() || null,
      },
      update: {
        description: value(formData, "description").trim() || null,
        verificationState: "UNVERIFIED",
        source: "USER_ENTERED",
      },
    });
    return success("Skill evidence linked.", actor.id);
  } catch (error) {
    return formError(error);
  }
}

export async function saveProject(
  _state: CandidateFormState,
  formData: FormData,
): Promise<CandidateFormState> {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    const parsed = projectSchema.parse({
      id: value(formData, "id"),
      name: value(formData, "name"),
      role: value(formData, "role"),
      description: value(formData, "description"),
      startDate: value(formData, "startDate"),
      endDate: value(formData, "endDate"),
      url: value(formData, "url"),
      skills: splitList(value(formData, "skills")),
      outcomes: splitList(value(formData, "outcomes")),
    });
    const { id, ...data } = parsed;
    if (id) {
      const result = await databaseClient().project.updateMany({
        where: ownedRecordWhere(actor.id, id),
        data: {
          ...data,
          verificationState: "UNVERIFIED",
          source: "USER_ENTERED",
        },
      });
      requireOwnedMutation(result.count);
    } else
      await databaseClient().project.create({
        data: { userId: actor.id, ...data },
      });
    return success(id ? "Project updated." : "Project added.", actor.id);
  } catch (error) {
    return formError(error);
  }
}

export async function saveCredential(
  _state: CandidateFormState,
  formData: FormData,
): Promise<CandidateFormState> {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    const parsed = credentialSchema.parse({
      id: value(formData, "id"),
      name: value(formData, "name"),
      issuer: value(formData, "issuer"),
      issuedAt: value(formData, "issuedAt"),
      expiresAt: value(formData, "expiresAt"),
      credentialId: value(formData, "credentialId"),
      credentialUrl: value(formData, "credentialUrl"),
    });
    const { id, ...data } = parsed;
    if (id) {
      const result = await databaseClient().credential.updateMany({
        where: ownedRecordWhere(actor.id, id),
        data: {
          ...data,
          verificationState: "UNVERIFIED",
          source: "USER_ENTERED",
        },
      });
      requireOwnedMutation(result.count);
    } else
      await databaseClient().credential.create({
        data: { userId: actor.id, ...data },
      });
    return success(id ? "Credential updated." : "Credential added.", actor.id);
  } catch (error) {
    return formError(error);
  }
}

export async function saveCandidatePreferences(
  _state: CandidateFormState,
  formData: FormData,
): Promise<CandidateFormState> {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    const data = candidatePreferencesSchema.parse({
      roleFamilies: splitList(value(formData, "roleFamilies")),
      industries: splitList(value(formData, "industries")),
      remotePreference: value(formData, "remotePreference"),
      locationPreferences: splitList(value(formData, "locationPreferences")),
      salaryMinimum: optionalNumber(formData, "salaryMinimum"),
      salaryCurrency: value(formData, "salaryCurrency"),
      employmentTypes: splitList(value(formData, "employmentTypes")),
      seniorities: splitList(value(formData, "seniorities")),
      maximumTravelPercent: optionalNumber(formData, "maximumTravelPercent"),
      willingToRelocate: value(formData, "willingToRelocate")
        ? value(formData, "willingToRelocate") === "yes"
        : undefined,
      exclusions: splitList(value(formData, "exclusions")),
    });
    await databaseClient().candidatePreferences.upsert({
      where: { userId: actor.id },
      create: { userId: actor.id, ...data },
      update: data,
    });
    return success("Search preferences saved.", actor.id);
  } catch (error) {
    return formError(error);
  }
}

export async function saveWorkAuthorization(
  _state: CandidateFormState,
  formData: FormData,
): Promise<CandidateFormState> {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    const sponsorship = value(formData, "requiresSponsorship");
    const data = workAuthorizationSchema.parse({
      countryCode: value(formData, "countryCode"),
      authorizationStatus: value(formData, "authorizationStatus"),
      requiresSponsorship:
        sponsorship === "yes" ? true : sponsorship === "no" ? false : undefined,
      notes: value(formData, "notes"),
    });
    await databaseClient().workAuthorizationProfile.upsert({
      where: { userId: actor.id },
      create: { userId: actor.id, ...data },
      update: {
        ...data,
        verificationState: "UNVERIFIED",
        source: "USER_ENTERED",
      },
    });
    return success("Work authorization saved.", actor.id);
  } catch (error) {
    return formError(error);
  }
}

type CandidateEntityKind =
  | "experience"
  | "education"
  | "skill"
  | "skillEvidence"
  | "project"
  | "credential";
export async function deleteCandidateEntity(
  kind: CandidateEntityKind,
  id: string,
): Promise<void> {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const where = ownedRecordWhere(actor.id, id);
  const database = databaseClient();
  const result =
    kind === "experience"
      ? await database.workExperience.deleteMany({ where })
      : kind === "education"
        ? await database.education.deleteMany({ where })
        : kind === "skill"
          ? await database.skill.deleteMany({ where })
          : kind === "skillEvidence"
            ? await database.candidateSkillEvidence.deleteMany({ where })
            : kind === "project"
              ? await database.project.deleteMany({ where })
              : await database.credential.deleteMany({ where });
  requireOwnedMutation(result.count);
  await invalidateReadyApplicationPackets(database, actor.id);
  revalidatePath("/profile");
  revalidatePath("/applications");
  revalidatePath("/dashboard");
}

export async function editCandidateFact(
  _state: CandidateFormState,
  formData: FormData,
): Promise<CandidateFormState> {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    const id = value(formData, "id");
    const factValue = z
      .string()
      .trim()
      .min(1)
      .max(10_000)
      .parse(value(formData, "factValue"));
    await databaseClient().$transaction(async (transaction) => {
      const current = await transaction.candidateFact.findFirst({
        where: { id, userId: actor.id, status: "ACTIVE" },
        select: { factType: true },
      });
      if (!current) requireOwnedMutation(0);
      const updated = await transaction.candidateFact.updateMany({
        where: { id, userId: actor.id, status: "ACTIVE" },
        data: { value: { text: factValue } },
      });
      requireOwnedMutation(updated.count);
      await transaction.auditEvent.create({
        data: {
          actorUserId: actor.id,
          action: "CANDIDATE_FACT_CHANGED",
          entityType: "candidateFact",
          entityId: id,
          metadata: { factType: current!.factType, changedFields: ["value"] },
        },
      });
    });
    return success(
      "Verified résumé fact corrected. Its source remains preserved.",
      actor.id,
    );
  } catch (error) {
    return formError(error);
  }
}

export async function removeCandidateFact(id: string): Promise<void> {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const database = databaseClient();
  await database.$transaction(async (transaction) => {
    const current = await transaction.candidateFact.findFirst({
      where: { id, userId: actor.id, status: "ACTIVE" },
      select: { factType: true },
    });
    if (!current) requireOwnedMutation(0);
    const removed = await transaction.candidateFact.updateMany({
      where: { id, userId: actor.id, status: "ACTIVE" },
      data: { status: "REMOVED", removedAt: new Date() },
    });
    requireOwnedMutation(removed.count);
    await transaction.auditEvent.create({
      data: {
        actorUserId: actor.id,
        action: "CANDIDATE_FACT_REMOVED",
        entityType: "candidateFact",
        entityId: id,
        metadata: { factType: current!.factType, reason: "USER_REVOCATION" },
      },
    });
  });
  await invalidateReadyApplicationPackets(database, actor.id);
  revalidatePath("/profile");
  revalidatePath("/applications");
  revalidatePath("/dashboard");
}
