import Link from "next/link";
import type { DocumentDeletionBlockingApplication } from "@/features/candidate/document-deletion-protocol";

export function DocumentDeletionBlockerNotice({
  applications,
  fileName,
}: {
  readonly applications: readonly DocumentDeletionBlockingApplication[];
  readonly fileName: string;
}) {
  return (
    <section className="document-deletion-blocker" role="alert">
      <p className="m-0 text-sm font-semibold">
        Deletion is unavailable because an active or historical submission
        depends on this résumé.
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
        Submitted application records are immutable. RoleProwl will never
        automatically delete or switch their retained résumé history.
      </p>
    </section>
  );
}
