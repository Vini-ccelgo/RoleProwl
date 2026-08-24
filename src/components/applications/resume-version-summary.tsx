type ResumeVersionSummaryValue = {
  readonly id: string;
  readonly renderedFileName: string;
  readonly templateVersion: string;
  readonly promptVersion: string;
};

function meaningful(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export function ResumeVersionSummary({
  resumeVersion,
}: {
  readonly resumeVersion: ResumeVersionSummaryValue | null;
}) {
  if (
    !resumeVersion ||
    ![
      resumeVersion.renderedFileName,
      resumeVersion.templateVersion,
      resumeVersion.promptVersion,
    ].some(meaningful)
  ) {
    return null;
  }

  return (
    <section className="card p-5">
      <h2 className="text-base font-semibold">Résumé version</h2>
      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="font-semibold">Version ID</dt>
          <dd className="m-0 break-all">{resumeVersion.id}</dd>
        </div>
        {meaningful(resumeVersion.renderedFileName) && (
          <div>
            <dt className="font-semibold">File</dt>
            <dd className="m-0">{resumeVersion.renderedFileName}</dd>
          </div>
        )}
        {meaningful(resumeVersion.templateVersion) && (
          <div>
            <dt className="font-semibold">Template</dt>
            <dd className="m-0">{resumeVersion.templateVersion}</dd>
          </div>
        )}
        {meaningful(resumeVersion.promptVersion) && (
          <div>
            <dt className="font-semibold">Prompt</dt>
            <dd className="m-0">{resumeVersion.promptVersion}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
