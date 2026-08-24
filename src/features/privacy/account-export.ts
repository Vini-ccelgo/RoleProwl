export const ACCOUNT_EXPORT_SCHEMA_VERSION = "roleprowl-account-export-v1";

const INTERNAL_EXPORT_KEYS = new Set([
  "providerRequestId",
  "renderedStorageKey",
  "storageKey",
]);

export function sanitizePortableExportValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizePortableExportValue);
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !INTERNAL_EXPORT_KEYS.has(key))
      .map(([key, candidate]) => [key, sanitizePortableExportValue(candidate)]),
  );
}

export interface AccountExportSections {
  readonly account: unknown;
  readonly answers: unknown;
  readonly applications: unknown;
  readonly auditHistory: unknown;
  readonly candidate: unknown;
  readonly generatedMaterials: unknown;
  readonly notifications: unknown;
  readonly productEvents: unknown;
  readonly policy: unknown;
}

export function buildPortableAccountExport(input: {
  readonly exportedAt: Date;
  readonly sections: AccountExportSections;
}) {
  return {
    schemaVersion: ACCOUNT_EXPORT_SCHEMA_VERSION,
    exportedAt: input.exportedAt.toISOString(),
    scope: "RoleProwl-held data",
    externalDataNotice:
      "This export does not include data retained independently by employers or ATS providers after an external submission.",
    data: input.sections,
  } as const;
}
