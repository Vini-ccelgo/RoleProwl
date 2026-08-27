import type { DocumentDeletionConsequences } from "@/features/candidate/document-deletion-protocol";

export function DocumentDeletionConsequenceNotice({
  consequences,
  disabled,
  onCancel,
  onConfirm,
}: {
  readonly consequences: DocumentDeletionConsequences;
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <section
      aria-labelledby={`delete-consequences-${consequences.documentId}`}
      className="document-deletion-consequences"
      role="alertdialog"
    >
      <h4
        className="safe-filename m-0 text-sm font-semibold"
        id={`delete-consequences-${consequences.documentId}`}
      >
        Delete {consequences.fileName}?
      </h4>
      <p className="m-0 text-sm">This will also permanently remove:</p>
      <ul className="m-0 grid gap-1 pl-5 text-sm">
        <li>
          {consequences.applicationCount} pre-submission{" "}
          {consequences.applicationCount === 1 ? "application" : "applications"}{" "}
          using this résumé
        </li>
        <li>
          {consequences.acceptedFactCount} accepted{" "}
          {consequences.acceptedFactCount === 1 ? "fact" : "facts"} sourced from
          this résumé
        </li>
      </ul>
      <p className="m-0 text-xs">
        Its proposal and extraction data will also be removed. Submitted
        application history is never automatically deleted.
      </p>
      <div className="document-deletion-consequence-actions flex flex-wrap gap-2">
        <button
          className="button button-ghost"
          disabled={disabled}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="button button-secondary"
          disabled={disabled}
          onClick={onConfirm}
          type="button"
        >
          Delete résumé and dependent data
        </button>
      </div>
    </section>
  );
}
