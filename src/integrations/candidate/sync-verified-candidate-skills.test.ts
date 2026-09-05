import { describe, expect, it, vi } from "vitest";
import { matchCandidateToJob } from "@/core/domain/matching/match-job";
import {
  buildCandidateMatchSnapshot,
  buildJobMatchSnapshot,
} from "@/features/jobs/build-match-snapshots";
import {
  CANDIDATE_FACT_SKILL_EVIDENCE_TYPE,
  ensureCurrentCandidateSkills,
  synchronizeVerifiedCandidateSkills,
} from "./sync-verified-candidate-skills";

function synchronizationFixture() {
  const facts = [
    {
      createdAt: new Date("2026-09-01"),
      factType: "SKILL_TEXT",
      id: "fact-list-1",
      source: "RESUME_EXTRACTED",
      status: "ACTIVE",
      userId: "user-1",
      value: { text: "Languages / Query: Python, Bash, SQL, KQL" },
      verificationState: "VERIFIED",
    },
    {
      createdAt: new Date("2026-09-01"),
      factType: "WORK_EXPERIENCE_TEXT",
      id: "fact-work",
      source: "RESUME_EXTRACTED",
      status: "ACTIVE",
      userId: "user-1",
      value: { text: "Created reusable Python scripts for IOC normalization." },
      verificationState: "VERIFIED",
    },
    {
      createdAt: new Date("2026-09-01"),
      factType: "PROJECT_TEXT",
      id: "fact-project",
      source: "RESUME_EXTRACTED",
      status: "ACTIVE",
      userId: "user-1",
      value: { text: "Python detection project" },
      verificationState: "VERIFIED",
    },
    {
      createdAt: new Date("2026-09-01"),
      factType: "SKILL_TEXT",
      id: "foreign-fact",
      source: "RESUME_EXTRACTED",
      status: "ACTIVE",
      userId: "user-2",
      value: { text: "Skills: Python, Rust" },
      verificationState: "VERIFIED",
    },
  ];
  const skills: Array<{
    canonicalName: string;
    id: string;
    normalizedName: string;
    source: string;
    userId: string;
  }> = [];
  const evidence: Array<{
    description: string | null;
    evidenceId: string;
    evidenceType: string;
    id: string;
    skillId: string;
    source: string;
    userId: string;
    verificationState: string;
  }> = [];
  let nextSkillId = 1;
  let nextEvidenceId = 1;
  const matchDeleteMany = vi.fn(async () => ({ count: 1 }));
  const transaction = {
    candidateFact: {
      findMany: vi.fn(async ({ where }: { where: Record<string, string> }) =>
        facts.filter((fact) =>
          Object.entries(where).every(
            ([field, expected]) =>
              fact[field as keyof typeof fact] === expected,
          ),
        ),
      ),
    },
    skill: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        skills
          .filter((skill) => skill.userId === where.userId)
          .map((skill) => ({
            ...skill,
            evidence: evidence
              .filter(
                (item) =>
                  item.skillId === skill.id &&
                  item.verificationState === "VERIFIED",
              )
              .map(({ evidenceType }) => ({ evidenceType })),
          })),
      ),
      upsert: vi.fn(async ({ create }: { create: (typeof skills)[number] }) => {
        const current = skills.find(
          (skill) =>
            skill.userId === create.userId &&
            skill.normalizedName === create.normalizedName,
        );
        if (current) return current;
        const skill = { ...create, id: `skill-${nextSkillId++}` };
        skills.push(skill);
        return skill;
      }),
      deleteMany: vi.fn(
        async ({
          where,
        }: {
          where: { id: { in: string[] }; source: string; userId: string };
        }) => {
          const removed = skills.filter(
            (skill) =>
              skill.userId === where.userId &&
              skill.source === where.source &&
              where.id.in.includes(skill.id),
          );
          for (const skill of removed)
            skills.splice(
              skills.findIndex((item) => item.id === skill.id),
              1,
            );
          return { count: removed.length };
        },
      ),
    },
    candidateSkillEvidence: {
      findMany: vi.fn(async ({ where }: { where: Record<string, string> }) =>
        evidence
          .filter((item) =>
            Object.entries(where).every(
              ([field, expected]) =>
                item[field as keyof typeof item] === expected,
            ),
          )
          .map((item) => ({
            ...item,
            skill: {
              normalizedName: skills.find((skill) => skill.id === item.skillId)!
                .normalizedName,
            },
          })),
      ),
      upsert: vi.fn(
        async ({
          create,
          update,
        }: {
          create: Omit<(typeof evidence)[number], "id">;
          update: Partial<(typeof evidence)[number]>;
        }) => {
          const current = evidence.find(
            (item) =>
              item.skillId === create.skillId &&
              item.evidenceType === create.evidenceType &&
              item.evidenceId === create.evidenceId,
          );
          if (current) {
            Object.assign(current, update);
            return current;
          }
          const item = { ...create, id: `evidence-${nextEvidenceId++}` };
          evidence.push(item);
          return item;
        },
      ),
      updateMany: vi.fn(
        async ({
          data,
          where,
        }: {
          data: Partial<(typeof evidence)[number]>;
          where: { id: string; userId: string };
        }) => {
          const current = evidence.find(
            (item) => item.id === where.id && item.userId === where.userId,
          );
          if (current) Object.assign(current, data);
          return { count: current ? 1 : 0 };
        },
      ),
      deleteMany: vi.fn(
        async ({
          where,
        }: {
          where: { id: { in: string[] }; userId: string };
        }) => {
          const removed = evidence.filter(
            (item) =>
              item.userId === where.userId && where.id.in.includes(item.id),
          );
          for (const item of removed)
            evidence.splice(
              evidence.findIndex((current) => current.id === item.id),
              1,
            );
          return { count: removed.length };
        },
      ),
    },
    jobMatchAnalysis: { deleteMany: matchDeleteMany },
  };
  const database = {
    $transaction: vi.fn(async (callback) => callback(transaction)),
  };
  return { database, evidence, facts, matchDeleteMany, skills, transaction };
}

function candidateSnapshot(fixture: ReturnType<typeof synchronizationFixture>) {
  return buildCandidateMatchSnapshot({
    authorization: null,
    educationRecords: [],
    preferences: null,
    projects: [],
    skills: fixture.skills.map((skill) => ({
      canonicalName: skill.canonicalName,
      evidence: fixture.evidence
        .filter((item) => item.skillId === skill.id)
        .map((item) => ({
          evidenceId: item.evidenceId,
          evidenceType: item.evidenceType,
          id: item.id,
          source: item.source,
        })),
      experienceMonths: null,
      proficiency: null,
    })),
    workExperiences: [],
  });
}

function pythonJob(minimumExperienceMonths: number | null = null) {
  return buildJobMatchSnapshot({
    educationRequirements: null,
    experienceRequirements: null,
    locations: null,
    preferredRequirements: null,
    remoteType: null,
    requirements: [
      {
        kind: "SKILL",
        minimumExperienceMonths,
        origin: "SOURCE_TEXT_EXPLICIT",
        skillName: "Python",
        sourceField: "description.requirements",
        statement:
          minimumExperienceMonths == null
            ? "Python required"
            : "3+ years of Python",
      },
    ],
    salaryMax: null,
    seniority: null,
    skills: null,
    sponsorship: null,
    workAuthorization: null,
  });
}

describe("verified candidate skill synchronization", () => {
  it("creates provenance-linked atomic skills and is idempotent", async () => {
    const fixture = synchronizationFixture();
    const beforeSynchronization = matchCandidateToJob(
      candidateSnapshot(fixture),
      pythonJob(),
    );
    expect(beforeSynchronization.unknowns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessment: "UNKNOWN",
          code: "REQUIRED_SKILL_python",
        }),
      ]),
    );
    expect(beforeSynchronization.gaps).toHaveLength(0);

    const first = await ensureCurrentCandidateSkills(
      fixture.database as never,
      "user-1",
    );
    expect(first).toMatchObject({
      changed: true,
      createdEvidenceCount: 4,
      createdSkillCount: 4,
    });
    expect(fixture.facts.find(({ id }) => id === "fact-list-1")?.value).toEqual(
      { text: "Languages / Query: Python, Bash, SQL, KQL" },
    );
    expect(fixture.skills.map(({ canonicalName }) => canonicalName)).toEqual([
      "Python",
      "Bash",
      "SQL",
      "KQL",
    ]);
    expect(fixture.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "Languages / Query: Python, Bash, SQL, KQL",
          evidenceId: "fact-list-1",
          evidenceType: CANDIDATE_FACT_SKILL_EVIDENCE_TYPE,
          source: "RESUME_EXTRACTED",
          userId: "user-1",
          verificationState: "VERIFIED",
        }),
      ]),
    );
    expect(
      fixture.evidence.some(({ evidenceId }) => evidenceId === "fact-work"),
    ).toBe(false);
    expect(
      fixture.evidence.some(({ evidenceId }) => evidenceId === "fact-project"),
    ).toBe(false);
    expect(
      fixture.evidence.some(({ evidenceId }) => evidenceId === "foreign-fact"),
    ).toBe(false);

    const match = matchCandidateToJob(candidateSnapshot(fixture), pythonJob());
    expect(match.strengths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessment: "MATCH",
          candidateEvidence: [
            expect.objectContaining({
              evidenceId: "fact-list-1",
              evidenceType: CANDIDATE_FACT_SKILL_EVIDENCE_TYPE,
              field: "candidateFacts.fact-list-1",
              origin: "CANDIDATE_VERIFIED_FACT",
              source: "RESUME_EXTRACTED",
            }),
          ],
          code: "REQUIRED_SKILL_python",
        }),
      ]),
    );
    expect(match.evidenceCoverage).toBeGreaterThan(0);
    expect(fixture.matchDeleteMany).toHaveBeenCalledOnce();
    expect(fixture.matchDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });

    const durationMatch = matchCandidateToJob(
      candidateSnapshot(fixture),
      pythonJob(36),
    );
    expect(durationMatch.unknowns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessment: "UNKNOWN",
          code: "REQUIRED_SKILL_python",
          evidence: "Candidate skill duration is not recorded",
        }),
      ]),
    );
    expect(durationMatch.gaps).toHaveLength(0);

    const second = await ensureCurrentCandidateSkills(
      fixture.database as never,
      "user-1",
    );
    expect(second.changed).toBe(false);
    expect(fixture.matchDeleteMany).toHaveBeenCalledOnce();
    expect(fixture.skills).toHaveLength(4);
    expect(fixture.evidence).toHaveLength(4);
  });

  it("keeps one skill with multiple sources, then removes only unsupported derived skills", async () => {
    const fixture = synchronizationFixture();
    await synchronizeVerifiedCandidateSkills(
      fixture.transaction as never,
      "user-1",
    );
    fixture.facts.push({
      createdAt: new Date("2026-09-02"),
      factType: "SKILL_TEXT",
      id: "fact-list-2",
      source: "RESUME_EXTRACTED",
      status: "ACTIVE",
      userId: "user-1",
      value: { text: "Tools: Python, Git" },
      verificationState: "VERIFIED",
    });
    await synchronizeVerifiedCandidateSkills(
      fixture.transaction as never,
      "user-1",
    );

    const python = fixture.skills.filter(
      ({ normalizedName }) => normalizedName === "python",
    );
    expect(python).toHaveLength(1);
    expect(
      fixture.evidence.filter(({ skillId }) => skillId === python[0]!.id),
    ).toHaveLength(2);

    fixture.facts.find(({ id }) => id === "fact-list-1")!.status = "REMOVED";
    await synchronizeVerifiedCandidateSkills(
      fixture.transaction as never,
      "user-1",
    );
    expect(
      fixture.skills.some(({ normalizedName }) => normalizedName === "python"),
    ).toBe(true);
    expect(
      fixture.skills.some(({ normalizedName }) => normalizedName === "bash"),
    ).toBe(false);

    fixture.facts.find(({ id }) => id === "fact-list-2")!.status = "REMOVED";
    await synchronizeVerifiedCandidateSkills(
      fixture.transaction as never,
      "user-1",
    );
    expect(
      fixture.skills.some(({ normalizedName }) => normalizedName === "python"),
    ).toBe(false);
    expect(fixture.evidence).toHaveLength(0);
  });

  it("preserves an explicitly maintained skill after its final résumé source is removed", async () => {
    const fixture = synchronizationFixture();
    fixture.skills.push({
      canonicalName: "Python",
      id: "manual-python",
      normalizedName: "python",
      source: "USER_ENTERED",
      userId: "user-1",
    });
    await synchronizeVerifiedCandidateSkills(
      fixture.transaction as never,
      "user-1",
    );
    fixture.facts.find(({ id }) => id === "fact-list-1")!.status = "REMOVED";
    await synchronizeVerifiedCandidateSkills(
      fixture.transaction as never,
      "user-1",
    );

    expect(fixture.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "manual-python",
          source: "USER_ENTERED",
        }),
      ]),
    );
    expect(
      fixture.evidence.some(({ skillId }) => skillId === "manual-python"),
    ).toBe(false);
  });
});
