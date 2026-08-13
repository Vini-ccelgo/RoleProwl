import "server-only";
import type { z } from "zod";
import { applicationPolicySchema } from "@/features/applications/application-policy-schema";
import { databaseClient } from "@/lib/db/client";

export type ApplicationPolicyInput = z.infer<typeof applicationPolicySchema>;

export async function getApplicationPolicy(userId: string) {
  return databaseClient().applicationPolicy.findUnique({ where: { userId } });
}

export async function upsertApplicationPolicy(
  userId: string,
  untrusted: unknown,
) {
  const value = applicationPolicySchema.parse(untrusted);
  return databaseClient().applicationPolicy.upsert({
    where: { userId },
    create: { userId, ...value },
    update: value,
  });
}
