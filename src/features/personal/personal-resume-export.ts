import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parsePersonalResume } from "./personal-prowl";
import type { PersonalStateJob } from "./personal-state";

function escapeHtml(value: string) {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

const headingLabels: Readonly<Record<string, string>> = {
  general: "Résumé",
  summary: "Summary",
  profile: "Profile",
  skill: "Skills",
  skills: "Skills",
  experience: "Experience",
  employment: "Employment",
  project: "Projects",
  projects: "Projects",
  education: "Education",
  certification: "Certifications",
  certifications: "Certifications",
  credential: "Credentials",
  credentials: "Credentials",
  language: "Languages",
  languages: "Languages",
  location: "Location",
  "work authorization": "Work Authorization",
};

const sectionOrder = [
  "general",
  "summary",
  "profile",
  "skills",
  "skill",
  "experience",
  "employment",
  "projects",
  "project",
  "education",
  "certifications",
  "certification",
  "credentials",
  "credential",
  "languages",
  "language",
  "location",
  "work authorization",
] as const;

export function renderPersonalResumeHtml(input: {
  readonly job: PersonalStateJob;
  readonly resume: string;
}) {
  const parsed = parsePersonalResume(input.resume);
  const ordered = [
    ...sectionOrder.filter((heading) => parsed.sections[heading]?.length),
    ...Object.keys(parsed.sections)
      .filter(
        (heading) =>
          !sectionOrder.includes(heading as (typeof sectionOrder)[number]) &&
          parsed.sections[heading]?.length,
      )
      .sort(),
  ];
  const sections = ordered
    .map((heading, index) => {
      const lines = parsed.sections[heading] ?? [];
      const label = headingLabels[heading] ?? heading;
      const content = lines
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join("\n");
      return index === 0 && heading === "general"
        ? `<header>${content}</header>`
        : `<section><h2>${escapeHtml(label)}</h2>\n${content}</section>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="roleprowl-target-company" content="${escapeHtml(input.job.snapshot.company)}">
  <meta name="roleprowl-target-role" content="${escapeHtml(input.job.snapshot.title)}">
  <title>Résumé</title>
  <style>
    body { color: #111; font: 11pt/1.4 Arial, sans-serif; margin: 0 auto; max-width: 760px; padding: 32px; }
    h2 { border-bottom: 1px solid #555; font-size: 13pt; margin: 20px 0 8px; padding-bottom: 3px; }
    p { margin: 0 0 6px; white-space: pre-wrap; }
    header p:first-child { font-size: 18pt; font-weight: 700; }
    @media print { body { max-width: none; padding: 0; } }
  </style>
</head>
<body>
${sections}
</body>
</html>
`;
}

export async function exportPersonalResumeHtml(input: {
  readonly applicationsDirectory: string;
  readonly job: PersonalStateJob;
  readonly resume: string;
}) {
  if (!/^[a-f0-9]{16}$/u.test(input.job.id))
    throw new Error("Invalid personal job ID.");
  const directory = resolve(input.applicationsDirectory, input.job.id);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = resolve(directory, "tailored-resume.html");
  await writeFile(path, renderPersonalResumeHtml(input), {
    encoding: "utf8",
    mode: 0o600,
  });
  return path;
}
