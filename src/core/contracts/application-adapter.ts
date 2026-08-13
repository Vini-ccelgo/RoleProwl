import type { SourceCapabilitySet } from "@/core/types/capabilities";
import type { JobReference } from "./job-source-adapter";
export interface ApplicationInspection {
  readonly fields: readonly {
    readonly id: string;
    readonly label: string;
    readonly required: boolean;
  }[];
}
export interface PreparedApplication {
  readonly reference: JobReference;
  readonly answers: Readonly<Record<string, string>>;
}
export interface SubmissionReceipt {
  readonly externalId: string;
  readonly submittedAt: Date;
}
export interface ApplicationAdapter {
  inspect(reference: JobReference): Promise<ApplicationInspection>;
  prepare(
    reference: JobReference,
    answers: Readonly<Record<string, string>>,
  ): Promise<PreparedApplication>;
  submit(application: PreparedApplication): Promise<SubmissionReceipt>;
  verifySubmission(receipt: SubmissionReceipt): Promise<boolean>;
  getCapabilities(): SourceCapabilitySet;
}
