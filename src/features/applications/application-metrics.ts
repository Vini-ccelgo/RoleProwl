export function preparedApplicationsWhere(userId: string) {
  return { userId, state: "READY" as const };
}

export function submittedApplicationsWhere(userId: string) {
  return { userId, submittedAt: { not: null } };
}
