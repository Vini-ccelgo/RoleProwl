import "server-only";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type {
  ResumeDocumentRenderer,
  TailoredResumeContent,
} from "@/features/resumes/tailored-resume";

export class DocxResumeRenderer implements ResumeDocumentRenderer {
  async render(content: TailoredResumeContent) {
    const document = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              heading: HeadingLevel.TITLE,
              children: [new TextRun(content.headline)],
            }),
            new Paragraph({ children: [new TextRun(content.summary)] }),
            ...content.sections.flatMap((section) => [
              new Paragraph({
                heading: HeadingLevel.HEADING_1,
                children: [new TextRun(section.heading)],
              }),
              ...section.bullets.map(
                (bullet) =>
                  new Paragraph({
                    bullet: { level: 0 },
                    children: [new TextRun(bullet)],
                  }),
              ),
            ]),
          ],
        },
      ],
    });
    return new Uint8Array(await Packer.toBuffer(document));
  }
}
