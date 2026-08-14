import type {
  ProductEventInput,
  ProductEventProperty,
  ProductEventType,
} from "@/core/contracts/analytics-provider";
import { ValidationError } from "@/core/errors/application-errors";

const PROPERTY_ALLOWLIST: Record<ProductEventType, ReadonlySet<string>> = {
  JOB_DISCOVERED: new Set(["source", "newCanonical"]),
  JOB_VIEWED: new Set(["surface"]),
  JOB_SHORTLISTED: new Set(["surface"]),
  JOB_REJECTED: new Set(["surface", "reasonCode"]),
  APPLICATION_PREPARED: new Set(["mechanism"]),
  REVIEW_REQUESTED: new Set(["reasonCodes"]),
  APPLICATION_SUBMITTED: new Set(["mechanism"]),
  RESPONSE_RECEIVED: new Set(["source"]),
  INTERVIEW: new Set(["source"]),
  OFFER: new Set(["source"]),
};

function boundedProperty(value: ProductEventProperty): ProductEventProperty {
  if (typeof value === "string") return value.slice(0, 100);
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => item.slice(0, 100));
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}

export function prepareProductEvent(input: ProductEventInput) {
  if (!/^[a-zA-Z0-9:_-]{1,200}$/u.test(input.dedupeKey))
    throw new ValidationError("The product-event dedupe key is invalid.");
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/u.test(input.entityType))
    throw new ValidationError("The product-event entity type is invalid.");
  if (input.entityId !== null && input.entityId.length > 128)
    throw new ValidationError(
      "The product-event entity identifier is invalid.",
    );
  if (Number.isNaN(input.occurredAt.getTime()))
    throw new ValidationError("The product-event time is invalid.");

  const allowed = PROPERTY_ALLOWLIST[input.eventType];
  const properties = Object.fromEntries(
    Object.entries(input.properties ?? {})
      .filter(([key]) => allowed.has(key))
      .map(([key, value]) => [key, boundedProperty(value)]),
  );
  return { ...input, properties };
}
