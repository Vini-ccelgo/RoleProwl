import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { IdentityManager } from "@/core/contracts/identity-manager";

export class ClerkIdentityManager implements IdentityManager {
  async deleteIdentity(externalId: string) {
    const client = await clerkClient();
    await client.users.deleteUser(externalId);
  }
}
