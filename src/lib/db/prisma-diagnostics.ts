import type { SafeLogContext } from "@/lib/logging/logger";

const PRISMA_CODE = /^P\d{4}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]{0,79}$/u;
const SAFE_VERSION = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u;
const RESUME_MODELS = new Set([
  "CandidateDocument",
  "DocumentExtraction",
  "CandidateFactProposal",
]);

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function safeIdentifier(value: unknown) {
  return typeof value === "string" && SAFE_IDENTIFIER.test(value)
    ? value
    : undefined;
}

function safeTarget(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  const identifiers = values.map(safeIdentifier).filter(Boolean);
  return identifiers.length === values.length && identifiers.length > 0
    ? identifiers.join(",")
    : undefined;
}

function timing(message: string) {
  const match = message.match(
    /timeout for this transaction was (\d+) ms, however (\d+) ms passed/iu,
  );
  return {
    transactionTimeoutMs: match ? Number(match[1]) : undefined,
    transactionElapsedMs: match ? Number(match[2]) : undefined,
  };
}

export function prismaFailureLogContext(
  error: unknown,
  databaseOperation: string,
  transactionSubstage: string | null,
): SafeLogContext {
  const value = record(error);
  const meta = record(value.meta);
  const code =
    typeof value.code === "string" && PRISMA_CODE.test(value.code)
      ? value.code
      : undefined;
  const model =
    typeof meta.modelName === "string" && RESUME_MODELS.has(meta.modelName)
      ? meta.modelName
      : undefined;
  const transactionDetail = typeof meta.error === "string" ? meta.error : "";
  const message = typeof value.message === "string" ? value.message : "";
  const classifiedMessage = `${transactionDetail}\n${message}`;

  return {
    databaseOperation,
    transactionSubstage,
    prismaCode: code,
    prismaModel: model,
    prismaTarget: safeTarget(meta.target),
    prismaConstraint: safeIdentifier(meta.constraint),
    prismaField: safeIdentifier(meta.field_name),
    prismaClientVersion:
      typeof value.clientVersion === "string" &&
      SAFE_VERSION.test(value.clientVersion)
        ? value.clientVersion
        : undefined,
    transactionExpired:
      code === "P2028" &&
      /(?:expired transaction|transaction.*timed out|transaction already closed)/iu.test(
        classifiedMessage,
      ),
    ...timing(classifiedMessage),
  };
}
