import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type {
  AIProvider,
  StructuredAIRequest,
} from "@/core/contracts/ai-provider";
import type { PersonalStateJob } from "./personal-state";

const localApplicationSchema = z.object({
  tailoredResume: z.array(
    z.object({
      heading: z.string().trim().min(1).max(120),
      text: z.string().trim().min(1).max(700),
      resumeEvidenceQuote: z.string().trim().min(1).max(700),
    }),
  ),
  coverLetter: z.array(
    z.object({
      text: z.string().trim().min(1).max(1_200),
      resumeEvidenceQuotes: z.array(z.string().trim().min(1).max(700)).max(5),
    }),
  ),
  applicationDraft: z.array(
    z.object({
      prompt: z.string().trim().min(1).max(300),
      draft: z.string().trim().min(1).max(1_200),
      resumeEvidenceQuotes: z.array(z.string().trim().min(1).max(700)).max(5),
    }),
  ),
});

function safeMarkdown(value: string) {
  return value.replace(/[\\`*_[\]<>#]/gu, "\\$&").trim();
}

function exactResumeEvidence(resume: string, quote: string) {
  const normalize = (value: string) =>
    value
      .normalize("NFKC")
      .replace(/\s+/gu, " ")
      .trim()
      .toLocaleLowerCase("en-US");
  return normalize(resume).includes(normalize(quote));
}

async function generateLocalArtifacts(input: {
  readonly ai: AIProvider;
  readonly job: PersonalStateJob;
  readonly resume: string;
}) {
  const snapshot = input.job.snapshot;
  const request: StructuredAIRequest<z.infer<typeof localApplicationSchema>> = {
    correlationId: `personal-application-${input.job.id}`,
    rateLimitSubject: "local-personal-mode",
    input: {
      resume: input.resume,
      job: {
        title: snapshot.title,
        company: snapshot.company,
        description: snapshot.description?.slice(0, 12_000) ?? null,
        fitEvidence: {
          strengths: snapshot.strongMatches,
          partialMatches: snapshot.partialMatches,
          gaps: snapshot.importantGaps,
          unknowns: snapshot.unknowns,
        },
      },
    },
    promptVersion: "personal-application-v1",
    schema: localApplicationSchema,
    schemaName: "personal_application_materials",
    system:
      "Prepare truthful application materials. Never invent skills, employers, dates, degrees, certifications, achievements, responsibilities, or numbers. Reorder and rewrite only what the resume directly supports. Every material statement must cite one or more short exact resume quotes. The application draft is a reviewable set of likely free-text prompts, not submitted answers. Return only the requested JSON schema.",
    task: "RESUME_TAILORING",
  };
  const output = (await input.ai.generateStructured(request)).data;
  const validQuote = (quote: string) =>
    exactResumeEvidence(input.resume, quote);
  if (
    output.tailoredResume.some(
      (item) => !validQuote(item.resumeEvidenceQuote),
    ) ||
    output.coverLetter.some((item) =>
      item.resumeEvidenceQuotes.some((quote) => !validQuote(quote)),
    ) ||
    output.applicationDraft.some((item) =>
      item.resumeEvidenceQuotes.some((quote) => !validQuote(quote)),
    )
  )
    throw new Error(
      "Local AI produced an application claim without exact résumé evidence; AI artifacts were blocked.",
    );
  return output;
}

function evidenceMarkdown(job: PersonalStateJob) {
  const snapshot = job.snapshot;
  const sections = [
    ["Supported", snapshot.strongMatches],
    ["Partially supported", snapshot.partialMatches],
    ["Gap", snapshot.importantGaps],
    ["Unknown", snapshot.unknowns],
  ] as const;
  const lines = ["# Application Evidence Pack", ""];
  for (const [status, entries] of sections) {
    lines.push(`## ${status}`, "");
    if (!entries.length) lines.push("- None identified.", "");
    else
      for (const entry of entries)
        lines.push(
          `### Requirement/evidence: ${safeMarkdown(entry.label)}`,
          "",
          `- **Evidence:** ${safeMarkdown(entry.evidence)}`,
          `- **Status:** ${status.toLocaleLowerCase("en-US")}`,
          "",
        );
  }
  return `${lines.join("\n").trim()}\n`;
}

export async function preparePersonalApplication(input: {
  readonly applicationsDirectory: string;
  readonly ai?: AIProvider;
  readonly job: PersonalStateJob;
  readonly resume: string;
}) {
  if (!/^[a-f0-9]{16}$/u.test(input.job.id))
    throw new Error("Invalid personal job ID.");
  const directory = resolve(input.applicationsDirectory, input.job.id);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const job = input.job.snapshot;
  const sources = job.sources
    .map((source) => `- ${source.label}: ${source.sourceUrl}`)
    .join("\n");
  await writeFile(
    resolve(directory, "job.md"),
    `# ${job.title} — ${job.company}\n\n- Job ID: \`${job.id}\`\n- Status: ${input.job.status}\n- Location: ${job.location ?? "Unknown"}\n- Remote: ${job.remoteStatus ?? "Unknown"}\n- Posted: ${job.postedAt ?? "Unknown"}\n- Application: ${job.applicationUrl ?? "Unknown"}\n\n## Sources\n\n${sources}\n\n## Description\n\n${job.description ?? "Description unavailable from the public source."}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  await writeFile(
    resolve(directory, "fit-analysis.md"),
    `# Fit Analysis\n\n- Deterministic fit: ${job.deterministicFitScore}%\n- Final fit: ${job.fitScore}%\n- Confidence: ${Math.round(job.confidence * 100)}%\n\n## Assessment\n\n${job.semanticSummary ?? job.explanation}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  await writeFile(
    resolve(directory, "evidence.md"),
    evidenceMarkdown(input.job),
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
  await writeFile(
    resolve(directory, "application-checklist.md"),
    `# Application Checklist\n\n- [ ] Re-open the official listing and confirm it remains active.\n- [ ] Verify location, work authorization, compensation, and schedule.\n- [ ] Review every gap and unknown in \`evidence.md\`.\n- [ ] Tailor the résumé without adding unsupported claims.\n- [ ] Answer sensitive, legal, consequential, and attestation questions personally.\n- [ ] Submit only through the official application destination.\n- [ ] Mark the job APPLIED after external submission.\n\nApplication URL: ${job.applicationUrl ?? "Unavailable"}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  const generated = [
    "job.md",
    "fit-analysis.md",
    "evidence.md",
    "application-checklist.md",
  ];
  let warning: string | null = null;
  if (input.ai) {
    try {
      const artifacts = await generateLocalArtifacts({
        ai: input.ai,
        job: input.job,
        resume: input.resume,
      });
      await writeFile(
        resolve(directory, "tailored-resume.md"),
        `# Tailored Résumé Draft\n\n> Review required. Every section below cites exact source résumé text.\n\n${artifacts.tailoredResume.map((item) => `## ${safeMarkdown(item.heading)}\n\n${item.text}\n\nSource résumé evidence: “${item.resumeEvidenceQuote}”`).join("\n\n")}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      await writeFile(
        resolve(directory, "cover-letter.md"),
        `# Cover Letter Draft\n\n> Review required. No submission has occurred.\n\n${artifacts.coverLetter.map((item) => `${item.text}\n\nEvidence: ${item.resumeEvidenceQuotes.map((quote) => `“${quote}”`).join("; ")}`).join("\n\n")}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      await writeFile(
        resolve(directory, "application-draft.md"),
        `# Application Free-Text Drafts\n\n> These are reviewable drafts for likely prompts, not answers read from or submitted to an employer form.\n\n${artifacts.applicationDraft.map((item) => `## ${safeMarkdown(item.prompt)}\n\n${item.draft}\n\nEvidence: ${item.resumeEvidenceQuotes.map((quote) => `“${quote}”`).join("; ")}`).join("\n\n")}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      generated.push(
        "tailored-resume.md",
        "cover-letter.md",
        "application-draft.md",
      );
    } catch (error) {
      warning = `Optional local-AI artifacts were not written: ${error instanceof Error ? error.message : "local generation failed"}`;
    }
  }
  return { directory, generated, warning };
}
