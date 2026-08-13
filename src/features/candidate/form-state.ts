export interface CandidateFormState {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
}

export const initialCandidateFormState: CandidateFormState = {
  status: "idle",
  message: "",
};
