import type { ExternalIdentity } from "@/core/contracts";

interface ClerkEmailData {
  readonly id: string;
  readonly primary_email_address_id?: string | null;
  readonly email_addresses?: readonly {
    readonly id: string;
    readonly email_address: string;
  }[];
}

export function identityFromClerkUser(user: ClerkEmailData): ExternalIdentity {
  const primary = user.email_addresses?.find(
    (email) => email.id === user.primary_email_address_id,
  );

  return {
    provider: "CLERK",
    externalId: user.id,
    email:
      primary?.email_address ??
      user.email_addresses?.[0]?.email_address ??
      null,
  };
}
