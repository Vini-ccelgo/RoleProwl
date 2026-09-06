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
    verificationState?: string;
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
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            normalizedName?: { in: string[] };
            userId: string;
          };
        }) =>
          skills.filter(
            (skill) =>
              skill.userId === where.userId &&
              (!where.normalizedName ||
                where.normalizedName.in.includes(skill.normalizedName)),
          ),
      ),
      createManyAndReturn: vi.fn(
        async ({ data }: { data: Omit<(typeof skills)[number], "id">[] }) => {
          const created = [];
          for (const input of data) {
            const current = skills.find(
              (skill) =>
                skill.userId === input.userId &&
                skill.normalizedName === input.normalizedName,
            );
            if (current) continue;
            const skill = { ...input, id: `skill-${nextSkillId++}` };
            skills.push(skill);
            created.push(skill);
          }
          return created;
        },
      ),
      upsert: vi.fn(() => {
        throw new Error("candidate skill synchronization must not upsert");
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
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        evidence
          .filter(
            (item) =>
              item.userId === where.userId &&
              (item.evidenceType === CANDIDATE_FACT_SKILL_EVIDENCE_TYPE ||
                item.verificationState === "VERIFIED"),
          )
          .map((item) => ({ ...item })),
      ),
      createMany: vi.fn(
        async ({ data }: { data: Omit<(typeof evidence)[number], "id">[] }) => {
          let count = 0;
          for (const input of data) {
            const current = evidence.find(
              (item) =>
                item.skillId === input.skillId &&
                item.evidenceType === input.evidenceType &&
                item.evidenceId === input.evidenceId,
            );
            if (current) continue;
            evidence.push({ ...input, id: `evidence-${nextEvidenceId++}` });
            count += 1;
          }
          return { count };
        },
      ),
      upsert: vi.fn(() => {
        throw new Error(
          "candidate skill evidence synchronization must not upsert",
        );
      }),
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

function synchronizationQueryCount(
  fixture: ReturnType<typeof synchronizationFixture>,
) {
  const { transaction } = fixture;
  return [
    transaction.candidateFact.findMany,
    transaction.skill.findMany,
    transaction.skill.createManyAndReturn,
    transaction.skill.upsert,
    transaction.skill.deleteMany,
    transaction.candidateSkillEvidence.findMany,
    transaction.candidateSkillEvidence.createMany,
    transaction.candidateSkillEvidence.upsert,
    transaction.candidateSkillEvidence.updateMany,
    transaction.candidateSkillEvidence.deleteMany,
    transaction.jobMatchAnalysis.deleteMany,
  ].reduce((count, operation) => count + operation.mock.calls.length, 0);
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
  it("batches the hosted 16-atom fixture into a bounded cold path and a read-only repeat", async () => {
    const fixture = synchronizationFixture();
    fixture.facts.push(
      {
        createdAt: new Date("2026-09-02"),
        factType: "SKILL_TEXT",
        id: "fact-list-2",
        source: "RESUME_EXTRACTED",
        status: "ACTIVE",
        userId: "user-1",
        value: {
          text: "Cloud / Infrastructure: AWS, Azure, Terraform, Docker, Linux, Windows Server",
        },
        verificationState: "VERIFIED",
      },
      {
        createdAt: new Date("2026-09-03"),
        factType: "SKILL_TEXT",
        id: "fact-list-3",
        source: "RESUME_EXTRACTED",
        status: "ACTIVE",
        userId: "user-1",
        value: {
          text: "Tools: Microsoft Sentinel, Defender for Endpoint, Git, Jira, Wireshark, Nmap",
        },
        verificationState: "VERIFIED",
      },
    );
    const expected = [
      "Python",
      "Bash",
      "SQL",
      "KQL",
      "AWS",
      "Azure",
      "Terraform",
      "Docker",
      "Linux",
      "Windows Server",
      "Microsoft Sentinel",
      "Defender for Endpoint",
      "Git",
      "Jira",
      "Wireshark",
      "Nmap",
    ];

    const first = await ensureCurrentCandidateSkills(
      fixture.database as never,
      "user-1",
    );
    expect(first).toMatchObject({
      changed: true,
      createdEvidenceCount: 16,
      createdSkillCount: 16,
    });
    expect(fixture.skills.map(({ canonicalName }) => canonicalName)).toEqual(
      expected,
    );
    expect(fixture.evidence).toHaveLength(16);
    expect(
      new Set(
        fixture.evidence.map(
          ({ evidenceId, skillId }) => `${skillId}:${evidenceId}`,
        ),
      ).size,
    ).toBe(16);
    expect(
      fixture.transaction.skill.createManyAndReturn,
    ).toHaveBeenCalledOnce();
    expect(
      fixture.transaction.skill.createManyAndReturn.mock.calls[0]![0].data,
    ).toHaveLength(16);
    expect(
      fixture.transaction.candidateSkillEvidence.createMany,
    ).toHaveBeenCalledOnce();
    expect(
      fixture.transaction.candidateSkillEvidence.createMany.mock.calls[0]![0]
        .data,
    ).toHaveLength(16);
    expect(fixture.transaction.skill.upsert).not.toHaveBeenCalled();
    expect(
      fixture.transaction.candidateSkillEvidence.upsert,
    ).not.toHaveBeenCalled();
    expect(
      fixture.transaction.candidateSkillEvidence.updateMany,
    ).not.toHaveBeenCalled();

    const coldQueryCount = synchronizationQueryCount(fixture);
    expect(coldQueryCount).toBe(6);
    const oldSequentialQueryCount = 3 + expected.length * 2 + 1;
    const modeledRemoteRoundTripMs = 150;
    expect(oldSequentialQueryCount * modeledRemoteRoundTripMs).toBeGreaterThan(
      5_000,
    );
    expect(coldQueryCount * modeledRemoteRoundTripMs).toBeLessThan(5_000);

    const second = await ensureCurrentCandidateSkills(
      fixture.database as never,
      "user-1",
    );
    expect(second.changed).toBe(false);
    expect(synchronizationQueryCount(fixture) - coldQueryCount).toBe(3);
    expect(
      fixture.transaction.skill.createManyAndReturn,
    ).toHaveBeenCalledOnce();
    expect(
      fixture.transaction.candidateSkillEvidence.createMany,
    ).toHaveBeenCalledOnce();
    expect(fixture.matchDeleteMany).toHaveBeenCalledOnce();
    expect(fixture.skills).toHaveLength(16);
    expect(fixture.evidence).toHaveLength(16);

    const match = matchCandidateToJob(candidateSnapshot(fixture), pythonJob());
    expect(match.strengths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessment: "MATCH",
          code: "REQUIRED_SKILL_python",
        }),
      ]),
    );
    expect(match.evidenceCoverage).toBeGreaterThan(0);
  });

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

  it("resolves concurrent unique skill inserts with one bounded fallback read", async () => {
    const fixture = synchronizationFixture();
    fixture.transaction.skill.createManyAndReturn.mockImplementationOnce(
      async ({ data }) => {
        fixture.skills.push(
          ...data.map((input, index) => ({
            ...input,
            id: `concurrent-skill-${index + 1}`,
          })),
        );
        return [];
      },
    );

    const result = await synchronizeVerifiedCandidateSkills(
      fixture.transaction as never,
      "user-1",
    );

    expect(result).toMatchObject({
      changed: true,
      createdEvidenceCount: 4,
      createdSkillCount: 0,
    });
    expect(fixture.transaction.skill.findMany).toHaveBeenCalledTimes(2);
    expect(fixture.transaction.skill.upsert).not.toHaveBeenCalled();
    expect(fixture.skills).toHaveLength(4);
    expect(fixture.evidence).toHaveLength(4);
    expect(synchronizationQueryCount(fixture)).toBe(6);
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

  it("replaces changed provenance metadata in one batch without duplicating evidence", async () => {
    const fixture = synchronizationFixture();
    await synchronizeVerifiedCandidateSkills(
      fixture.transaction as never,
      "user-1",
    );
    fixture.facts.find(({ id }) => id === "fact-list-1")!.value = {
      text: "Languages / Query:\nPython, Bash, SQL, KQL",
    };

    const result = await synchronizeVerifiedCandidateSkills(
      fixture.transaction as never,
      "user-1",
    );

    expect(result).toMatchObject({
      changed: true,
      createdEvidenceCount: 0,
      createdSkillCount: 0,
      updatedEvidenceCount: 4,
    });
    expect(fixture.evidence).toHaveLength(4);
    expect(
      fixture.evidence.every(
        ({ description }) =>
          description === "Languages / Query:\nPython, Bash, SQL, KQL",
      ),
    ).toBe(true);
    expect(
      fixture.transaction.candidateSkillEvidence.updateMany,
    ).not.toHaveBeenCalled();
    expect(
      fixture.transaction.candidateSkillEvidence.deleteMany,
    ).toHaveBeenCalledOnce();
    expect(
      fixture.transaction.candidateSkillEvidence.createMany,
    ).toHaveBeenCalledTimes(2);
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
