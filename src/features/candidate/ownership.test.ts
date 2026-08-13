import { describe, expect, it } from "vitest";
import { NotFoundError } from "@/core/errors/application-errors";
import { ownedRecordWhere, requireOwnedMutation } from "./ownership";

describe("candidate record ownership", () => {
  it("always scopes private entity access to actor and identifier", () => {
    expect(ownedRecordWhere("user-a", "experience-1")).toEqual({
      id: "experience-1",
      userId: "user-a",
    });
  });

  it("accepts one owned mutation and conceals foreign or missing records", () => {
    expect(() => requireOwnedMutation(1)).not.toThrow();
    expect(() => requireOwnedMutation(0)).toThrow(NotFoundError);
  });
});
