import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

const document = new Document({
  sections: [
    {
      children: [
        new Paragraph({
          heading: HeadingLevel.TITLE,
          children: [new TextRun("Avery Quill — Synthetic Candidate")],
        }),
        new Paragraph(
          "FICTIONAL TEST DATA — not a real person or résumé. Platform Software Engineer | Portland, Oregon | avery.quill@example.test | +1 202-555-0147",
        ),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          text: "Summary",
        }),
        new Paragraph(
          "Fictional platform engineer specializing in TypeScript services, PostgreSQL reliability, cloud infrastructure, and developer tooling.",
        ),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          text: "Experience",
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          text: "Senior Platform Engineer — Nimbus Forge Labs (fictional) | March 2022–Present",
        }),
        ...[
          "Built TypeScript and Node.js services backed by PostgreSQL.",
          "Maintained Terraform modules and AWS deployment workflows.",
          "Reduced a synthetic fixture pipeline's median deployment time from 28 to 16 minutes after profiling its bottlenecks.",
          "Created onboarding documentation for a fictional eight-person engineering group.",
        ].map((text) => new Paragraph({ text, bullet: { level: 0 } })),
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          text: "Software Engineer — Cedar Circuit Cooperative (fictional) | June 2019–February 2022",
        }),
        ...[
          "Developed React interfaces and Node.js APIs.",
          "Added PostgreSQL migration and integration-test coverage.",
          "Implemented a fictional audit-event export used in internal acceptance testing.",
        ].map((text) => new Paragraph({ text, bullet: { level: 0 } })),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          text: "Education",
        }),
        new Paragraph(
          "Bachelor of Science in Computer Science — North Cascadia Institute of Technology (fictional), 2019",
        ),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          text: "Skills",
        }),
        new Paragraph(
          "TypeScript, Node.js, PostgreSQL, React, AWS, Terraform, Python",
        ),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          text: "Project and credential",
        }),
        new Paragraph(
          "Lantern Queue Simulator (fictional): synthetic workload simulator for idempotency, retry, and queue-observability testing.",
        ),
        new Paragraph(
          "Cloud Architecture Practice Certificate — Synthetic Systems Guild (fictional), ID SYNTH-CLOUD-2048.",
        ),
      ],
    },
  ],
});

const target = fileURLToPath(
  new URL(
    "../fixtures/synthetic/avery-quill-synthetic-resume.docx",
    import.meta.url,
  ),
);
await writeFile(target, await Packer.toBuffer(document));
console.log(`Generated fictional fixture: ${target}`);
