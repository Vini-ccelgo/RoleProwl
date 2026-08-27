import type { CanonicalApplicationResumeSnapshot } from "@/core/domain/applications/application-resume";
import { InspectableFileName } from "@/components/documents/inspectable-file-name";

interface AvailableResume {
  readonly id: string;
  readonly originalFileName: string;
}

export function ApplicationDocuments({
  alternatives,
  applicationId,
  mutable,
  selectedResume,
  selectResumeAction,
}: {
  readonly alternatives: readonly AvailableResume[];
  readonly applicationId: string;
  readonly mutable: boolean;
  readonly selectedResume: CanonicalApplicationResumeSnapshot | null;
  readonly selectResumeAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <section className="card grid gap-4 p-5">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold">Application documents</h2>
        <p className="m-0 text-sm text-foreground-muted">
          {mutable
            ? "The selected résumé is stable for this application until you explicitly replace it."
            : "This is the historical résumé retained for the submitted application."}
        </p>
      </div>

      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">Selected for this application</h3>
        {selectedResume ? (
          <InspectableFileName
            className="text-sm"
            fileName={selectedResume.fileName}
          />
        ) : (
          <p className="m-0 text-sm text-foreground-muted">
            Résumé selection needs attention. Choose an available résumé before
            reviewing this application.
          </p>
        )}
      </div>

      {mutable && alternatives.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">Other available résumés</h3>
          <ul className="m-0 grid list-none gap-2 p-0">
            {alternatives.map((resume) => (
              <li
                className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                key={resume.id}
              >
                <InspectableFileName
                  className="min-w-0 text-sm"
                  fileName={resume.originalFileName}
                />
                <form action={selectResumeAction}>
                  <input
                    name="applicationId"
                    type="hidden"
                    value={applicationId}
                  />
                  <input
                    name="candidateDocumentId"
                    type="hidden"
                    value={resume.id}
                  />
                  <button className="button button-secondary" type="submit">
                    Use for this application
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
