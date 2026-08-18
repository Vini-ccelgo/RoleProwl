import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { IntegrationError } from "@/core/errors/application-errors";
import { documentStorage } from "./document-storage";

const live = process.env.ROLEPROWL_STORAGE_LIVE_TEST === "true";

describe.skipIf(!live)("live private S3-compatible storage", () => {
  it("round-trips and deletes synthetic bytes", async () => {
    const storage = documentStorage();
    const key = `roleprowl-live-smoke/${randomUUID()}`;
    const bytes = new TextEncoder().encode("RoleProwl synthetic storage smoke");
    let written = false;
    try {
      try {
        const stored = await storage.put(key, bytes, "text/plain");
        written = true;
        expect(stored).toEqual({ key, contentType: "text/plain", size: 33 });
        await expect(storage.get(key)).resolves.toEqual(bytes);
        await storage.delete(key);
        written = false;
        await expect(storage.get(key)).resolves.toBeNull();
      } catch (error) {
        if (error instanceof IntegrationError) {
          const providerType =
            error.cause instanceof Error ? error.cause.name : "UnknownError";
          throw new Error(`${error.message} Provider error: ${providerType}`);
        }
        throw error;
      }
    } finally {
      if (written) await storage.delete(key);
    }
  });
});
