import type { CanonicalJobInput } from "@/core/domain/jobs/job";
import type { PublicApplicationQuestionReference } from "@/core/domain/applications/public-application-question";

export type PersonalSourceName =
  "ADZUNA" | "ASHBY" | "GREENHOUSE" | "JOBICY" | "LEVER" | "REMOTIVE";

export type PersonalTargetedSource =
  | {
      readonly kind: "GREENHOUSE";
      readonly boardToken: string;
      readonly company: string;
    }
  | {
      readonly kind: "LEVER";
      readonly site: string;
      readonly company: string;
      readonly region: "GLOBAL" | "EU";
    }
  | {
      readonly kind: "ASHBY";
      readonly boardName: string;
      readonly company: string;
    };

export interface PersonalDiscoveredJob {
  readonly source: PersonalSourceName;
  readonly sourceLabel: string;
  readonly sourceJobId: string;
  readonly sourceUrl: string;
  readonly questionReference?: PublicApplicationQuestionReference;
  readonly canonical: CanonicalJobInput;
}

export interface PersonalSourceStatus {
  readonly key: string;
  readonly label: string;
  readonly status: "OK" | "WARNING" | "SKIPPED";
  readonly jobs: number;
  readonly message: string | null;
  readonly attributionUrl: string | null;
}
