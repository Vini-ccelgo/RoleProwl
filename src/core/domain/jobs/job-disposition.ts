import { NotFoundError } from "@/core/errors/application-errors";

export function requireOwnedJobDisposition<T extends { userId: string }>(
  disposition: T | null,
  userId: string,
): T {
  if (!disposition || disposition.userId !== userId) throw new NotFoundError();
  return disposition;
}
