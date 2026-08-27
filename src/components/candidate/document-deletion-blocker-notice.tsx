import Link from "next/link";
import type {
  DocumentDeletionBlockerCode,
  DocumentDeletionBlockingApplication,
} from "@/features/candidate/document-deletion-protocol";

export function DocumentDeletionBlockerNotice({
  applications,
  code,
  fileName,
}: {
  readonly applications: readonly DocumentDeletionBlockingApplication[];
  readonly code: DocumentDeletionBlockerCode;
  readonly fileName: string;
}) {
  const submitted = code === "SUBMITTED_APPLICATION_REFERENCES";

  return (
    <section className="document-deletion-blocker" role="alert">
      <p className="m-0 text-sm font-semibold">
        {submitted
          ? "Deletion is unavailable because this résumé belongs to submitted application history."
          : "Deletion is blocked until each pending application uses another résumé."}
      </p>
      <p className="safe-filename mt-1 mb-0 text-xs">Résumé: {fileName}</p>
      <ul className="m-0 grid list-none gap-2 p-0">
        {applications.map((application) => (
          <li
            className="document-deletion-blocker-item flex min-w-0 flex-wrap items-center justify-between gap-2"
            key={application.applicationId}
          >
            <span className="safe-user-text min-w-0 text-sm">
              {application.jobTitle} at {application.company}
            </span>
            <Link
              className="button button-secondary document-deletion-blocker-link"
              href={`/applications/${application.applicationId}`}
            >
              Open application
            </Link>
          </li>
        ))}
      </ul>
      <p className="m-0 text-xs">
        {submitted
          ? "Submitted application records are immutable, so their retained résumé cannot be removed."
          : "Open each application and explicitly choose a different résumé. RoleProwl will not switch it automatically."}
      </p>
    </section>
  );
}
