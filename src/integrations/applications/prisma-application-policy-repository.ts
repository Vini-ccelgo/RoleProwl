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
  return databaseClient().$transaction(async (transaction) => {
    const previous = await transaction.applicationPolicy.findUnique({
      where: { userId },
    });
    const policy = await transaction.applicationPolicy.upsert({
      where: { userId },
      create: { userId, ...value },
      update: value,
    });
    const changedFields = Object.keys(value).filter(
      (key) =>
        JSON.stringify(previous?.[key as keyof typeof previous]) !==
        JSON.stringify(value[key as keyof typeof value]),
    );
    await transaction.auditEvent.create({
      data: {
        actorUserId: userId,
        action: "POLICY_CHANGED",
        entityType: "applicationPolicy",
        entityId: policy.id,
        metadata: { policyVersion: "application-policy-v1", changedFields },
      },
    });
    return policy;
  });
}
