import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // A non-secret local fallback lets client generation/builds run before accounts
  // are configured. Runtime connections still validate DATABASE_URL in src/lib/env.
  datasource: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://roleprowl:roleprowl@localhost:5432/roleprowl",
  },
});
