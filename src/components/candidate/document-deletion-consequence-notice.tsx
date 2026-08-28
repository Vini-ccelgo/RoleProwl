import type { DocumentDeletionConsequences } from "@/features/candidate/document-deletion-protocol";

export function DocumentDeletionConsequenceNotice({
  consequences,
  documentId,
  disabled,
  onCancel,
  onConfirm,
}: {
  readonly consequences: DocumentDeletionConsequences;
  readonly documentId: string;
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <section
      aria-labelledby={`delete-consequences-${documentId}`}
      className="document-deletion-consequences"
      role="alertdialog"
    >
      <h4
        className="safe-filename m-0 text-sm font-semibold"
        id={`delete-consequences-${documentId}`}
      >
        Delete {consequences.fileName}?
      </h4>
      <p className="m-0 text-sm">This will also permanently remove:</p>
      <ul className="m-0 grid gap-1 pl-5 text-sm">
        <li>
          {consequences.preSubmissionApplicationCount} pre-submission{" "}
          {consequences.preSubmissionApplicationCount === 1
            ? "application"
            : "applications"}{" "}
          that depend on this résumé
        </li>
        <li>
          {consequences.acceptedFactCount} accepted{" "}
          {consequences.acceptedFactCount === 1 ? "fact" : "facts"} sourced from
          this résumé
        </li>
      </ul>
      <p className="m-0 text-xs">
        Its proposal and extraction data will also be removed.
      </p>
      <p className="m-0 text-sm">
        {consequences.retainedHistoricalApplicationCount} submitted or
        historical{" "}
        {consequences.retainedHistoricalApplicationCount === 1
          ? "application used"
          : "applications used"}{" "}
        this résumé. Their immutable submitted résumé artifacts will remain in
        application history.
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
