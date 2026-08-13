export const SOURCE_CAPABILITIES = [
  "READ_JOBS",
  "READ_APPLICATION_SCHEMA",
  "SUBMIT_APPLICATION",
  "READ_APPLICATION_STATUS",
  "REQUIRES_PARTNER_AUTH",
  "REQUIRES_USER_INTERACTION",
] as const;
export type SourceCapability = (typeof SOURCE_CAPABILITIES)[number];
export type SourceCapabilitySet = ReadonlySet<SourceCapability>;
export function hasCapabilities(
  available: SourceCapabilitySet,
  required: readonly SourceCapability[],
): boolean {
  return required.every((capability) => available.has(capability));
}
