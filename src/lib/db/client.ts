import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { databaseEnv } from "@/lib/env/server";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
function createClient() {
  const adapter = new PrismaPg({
    connectionString: databaseEnv().DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}
export function databaseClient(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}
