import type { SubmissionMode } from "@/core/integrations/capability-registry";
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
  readonly answers: Readonly<Record<string, unknown>>;
  readonly destinationUrl: string | null;
  readonly documents: readonly {
    readonly contentType: string;
    readonly fileName: string;
    readonly storageKey: string;
  }[];
  readonly generatedText: Readonly<Record<string, string>>;
  readonly idempotencyKey: string;
  readonly reference: JobReference;
  readonly resumeVersionId: string | null;
}

export interface SubmissionReceipt {
  readonly externalId: string;
  readonly submittedAt: Date;
}

interface BaseApplicationAdapter {
  readonly mode: SubmissionMode;
  readonly source: string;
  getCapabilities(): SourceCapabilitySet;
}

export interface AuthorizedApplicationAdapter extends BaseApplicationAdapter {
  readonly mode: "AUTHORIZED_API";
  inspect(reference: JobReference): Promise<ApplicationInspection>;
  submit(application: PreparedApplication): Promise<SubmissionReceipt>;
  verifySubmission(receipt: SubmissionReceipt): Promise<boolean>;
}

export interface ExternalApplicationAdapter extends BaseApplicationAdapter {
  readonly mode: "EXTERNAL_APPLICATION" | "MANUAL_EXTERNAL";
  resolveDestination(reference: JobReference): Promise<string | null>;
}

export interface UnsupportedApplicationAdapter extends BaseApplicationAdapter {
  readonly mode: "UNSUPPORTED";
}

export type ApplicationAdapter =
  | AuthorizedApplicationAdapter
  | ExternalApplicationAdapter
  | UnsupportedApplicationAdapter;
