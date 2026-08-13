import { NotFoundError } from "@/core/errors/application-errors";

export function requireOwnedMutation(affectedRows: number): void {
  if (affectedRows !== 1) throw new NotFoundError();
}

export function ownedRecordWhere(userId: string, id: string) {
  return { id, userId } as const;
}
