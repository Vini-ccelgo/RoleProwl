import { describe, expect, it } from "vitest";
import { atomizeVerifiedSkillText } from "./skill-text-atomization";

describe("verified résumé skill-text atomization", () => {
  it.each([
    [
      "Languages / Query: Python, Bash, SQL, KQL",
      ["Python", "Bash", "SQL", "KQL"],
    ],
    [
      "Cloud / Infrastructure: AWS, Azure, Terraform, Docker, Linux, Windows Server",
      ["AWS", "Azure", "Terraform", "Docker", "Linux", "Windows Server"],
    ],
    [
      "Tools: Microsoft Sentinel, Defender for Endpoint, Git, Jira, Wireshark, Nmap",
      [
        "Microsoft Sentinel",
        "Defender for Endpoint",
        "Git",
        "Jira",
        "Wireshark",
        "Nmap",
      ],
    ],
    ["Skills: C++, C#, .NET", ["C++", "C#", ".NET"]],
  ])("atomizes an explicitly labelled skill list: %s", (text, expected) => {
    expect(atomizeVerifiedSkillText({ text })).toEqual(
      expected.map((canonicalName) => ({
        canonicalName,
        normalizedName: canonicalName.toLocaleLowerCase("en-US"),
      })),
    );
  });

  it("keeps a standalone one-token SKILL_TEXT fact usable", () => {
    expect(atomizeVerifiedSkillText({ text: "TypeScript" })).toEqual([
      { canonicalName: "TypeScript", normalizedName: "typescript" },
    ]);
  });

  it.each([
    "Created reusable Python scripts for IOC normalization.",
    "Worked with Python",
    "Python and Bash",
    "Project: Python, Bash",
    "Skills: Python, Created reusable Bash scripts",
  ])(
    "does not infer skills from arbitrary prose or unsafe headings: %s",
    (text) => {
      expect(atomizeVerifiedSkillText({ text })).toEqual([]);
    },
  );

  it("deduplicates only by exact deterministic normalized identity", () => {
    expect(
      atomizeVerifiedSkillText({ text: "Tools: Git, git, GitHub" }),
    ).toEqual([
      { canonicalName: "Git", normalizedName: "git" },
      { canonicalName: "GitHub", normalizedName: "github" },
    ]);
  });
});
