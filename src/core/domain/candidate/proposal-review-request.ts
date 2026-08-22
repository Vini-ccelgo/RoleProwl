import { z } from "zod";

const editedValue = z.object({ text: z.string().max(10_000) }).strict();

export const proposalReviewRequestSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("ACCEPT") }).strict(),
  z
    .object({
      decision: z.literal("EDIT_AND_ACCEPT"),
      editedValue,
    })
    .strict(),
  z.object({ decision: z.literal("REJECT") }).strict(),
]);
