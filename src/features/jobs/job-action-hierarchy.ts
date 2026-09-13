export type JobCardAction =
  | "ANALYZE_FIT"
  | "CONTINUE_APPLICATION"
  | "NOT_PURSUING"
  | "PREPARE_APPLICATION"
  | "REMOVE_FROM_SHORTLIST"
  | "RECONSIDER"
  | "REVIEW_FIT"
  | "SHORTLIST";

export function jobActionHierarchy(input: {
  readonly analyzed: boolean;
  readonly applicationExists: boolean;
  readonly disposition: "REJECTED" | "SHORTLISTED" | null;
  readonly preparationAvailable: boolean;
}) {
  if (input.applicationExists)
    return {
      primary: ["CONTINUE_APPLICATION"] as readonly JobCardAction[],
      secondary: [] as readonly JobCardAction[],
    };

  const fitAction: JobCardAction = input.analyzed
    ? "REVIEW_FIT"
    : "ANALYZE_FIT";
  const primary: JobCardAction[] = input.preparationAvailable
    ? ["PREPARE_APPLICATION"]
    : [fitAction];
  const dispositionActions: JobCardAction[] =
    input.disposition === "SHORTLISTED"
      ? ["REMOVE_FROM_SHORTLIST"]
      : input.disposition === "REJECTED"
        ? ["RECONSIDER"]
        : ["SHORTLIST", "NOT_PURSUING"];
  const secondary: JobCardAction[] = [
    ...(input.preparationAvailable ? [fitAction] : []),
    ...dispositionActions,
  ];
  return { primary, secondary };
}
