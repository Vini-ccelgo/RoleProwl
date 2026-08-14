import { ValidationError } from "@/core/errors/application-errors";

export function assertMutationRequestIsSameOrigin(request: Request) {
  const site = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (site && site !== "same-origin" && site !== "none") {
    throw new ValidationError(
      "Cross-origin mutation requests are not allowed.",
    );
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new ValidationError(
      "Cross-origin mutation requests are not allowed.",
    );
  }
}

export function assertContentType(request: Request, expected: string) {
  const actual = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!actual.startsWith(expected.toLowerCase())) {
    throw new ValidationError(`Expected a ${expected} request.`);
  }
}

export function assertContentLength(request: Request, maximumBytes: number) {
  const raw = request.headers.get("content-length");
  if (!raw) return;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > maximumBytes) {
    throw new ValidationError("The request body is too large.");
  }
}
