import { describe, expect, it } from "vitest";
import { exactChoiceMatches, exclusiveChoiceValues } from "./choice-taxonomy";

describe("choice taxonomy", () => {
  const options = [
    { label: "NA", value: "na-id" },
    { label: "Ciência da Computação", value: "cs-id" },
  ];

  it("matches only one safely normalized employer option", () => {
    expect(exactChoiceMatches(["Ciencia da Computacao"], options)).toEqual([
      "cs-id",
    ]);
    expect(exactChoiceMatches(["Computer Science"], options)).toEqual([]);
  });

  it("recognizes bounded sentinels but not ambiguous wording", () => {
    expect([...exclusiveChoiceValues(options)]).toEqual(["na-id"]);
    expect([
      ...exclusiveChoiceValues([
        { label: "Other", value: "other" },
        ...options.slice(1),
      ]),
    ]).toEqual([]);
  });
});
