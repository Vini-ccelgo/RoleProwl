import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const sourceRoot = join(projectRoot, "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.(?:ts|tsx)$/u.test(entry.name)
        ? [path]
        : [];
  });
}

describe("RP-029 static security boundaries", () => {
  const sources = sourceFiles(sourceRoot);

  it("does not use raw HTML injection in application source", () => {
    const violations = sources
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          ["dangerously", "SetInnerHTML"].join(""),
        ),
      )
      .map((path) => relative(projectRoot, path));
    expect(violations).toEqual([]);
  });

  it("keeps server environment access out of Client Components", () => {
    const violations = sources.flatMap((path) => {
      const source = readFileSync(path, "utf8");
      if (!/^\s*["']use client["'];/u.test(source)) return [];
      return /process\.env|CLERK_SECRET_KEY|GEMINI_API_KEY|OPENAI_API_KEY|DATABASE_URL/u.test(
        source,
      )
        ? [relative(projectRoot, path)]
        : [];
    });
    expect(violations).toEqual([]);
  });

  it("keeps credential-shaped environment variables server-only", () => {
    const environment = readFileSync(join(projectRoot, ".env.example"), "utf8");
    const publicCredentialNames = environment
      .split(/\r?\n/u)
      .map((line) => line.match(/^([A-Z0-9_]+)=/u)?.[1])
      .filter((name): name is string =>
        Boolean(
          name?.startsWith("NEXT_PUBLIC_") &&
          name !== "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" &&
          /(?:SECRET|TOKEN|PASSWORD|API_KEY|ACCESS_KEY)/u.test(name),
        ),
      );
    expect(publicCredentialNames).toEqual([]);
  });

  it("configures baseline browser response protections", () => {
    const configuration = readFileSync(
      join(projectRoot, "next.config.ts"),
      "utf8",
    );
    for (const header of [
      "Content-Security-Policy",
      "Permissions-Policy",
      "Referrer-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
    ]) {
      expect(configuration).toContain(header);
    }
    expect(configuration).toContain("poweredByHeader: false");
  });
});
