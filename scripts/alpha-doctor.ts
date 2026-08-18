import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { inspectHostedAlpha } from "@/features/operations/hosted-alpha-doctor";

loadDotenv({ path: [".env.local", ".env"], quiet: true });

const result = inspectHostedAlpha({
  environment: process.env,
  nodeVersion: process.version,
  prismaSchemaPresent: existsSync("prisma/schema.prisma"),
  migrationsPresent: existsSync("prisma/migrations/migration_lock.toml"),
});

console.log("RoleProwl Hosted Alpha Doctor\n");
for (const check of result.checks)
  console.log(
    `${check.label}: ${check.status}${check.detail ? ` — ${check.detail}` : ""}`,
  );
console.log(
  result.ready
    ? "\nREADY FOR PREVIEW DEPLOYMENT"
    : "\nNOT READY. Fix the ERROR checks above.",
);
if (!result.ready) process.exitCode = 1;
