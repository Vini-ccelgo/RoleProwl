import type { Prisma } from "@/generated/prisma/client";

function record(
  value: Prisma.JsonValue,
): Record<string, Prisma.JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : null;
}

function scalar(value: Prisma.JsonValue | undefined) {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return null;
}

function title(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

export function ApplicationPreparationSummary({
  answers,
  documents,
  fit,
  generatedText,
  policy,
}: {
  readonly answers: Prisma.JsonValue;
  readonly documents: Prisma.JsonValue;
  readonly fit: Prisma.JsonValue;
  readonly generatedText: Prisma.JsonValue;
  readonly policy: Prisma.JsonValue;
}) {
  const fitRecord = record(fit);
  const policyRecord = record(policy);
  const textRecord = record(generatedText);
  const answerRecord = record(answers);
  const documentList = Array.isArray(documents) ? documents : [];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card grid gap-3 p-5">
        <h2 className="text-base font-semibold">Fit at preparation time</h2>
        {fitRecord?.overallFit != null ? (
          <dl className="m-0 grid gap-2 text-sm">
            <div>
              <dt className="font-semibold">Estimated fit</dt>
              <dd className="m-0">{scalar(fitRecord.overallFit)}%</dd>
            </div>
            <div>
              <dt className="font-semibold">Evidence coverage</dt>
              <dd className="m-0">
                {typeof fitRecord.confidence === "number"
                  ? `${Math.round(fitRecord.confidence * 100)}%`
                  : "Unknown"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="m-0 text-sm text-foreground-muted">
            No fit analysis was available when preparation started.
          </p>
        )}
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="text-base font-semibold">Policy and review</h2>
        <p className="m-0 text-sm">
          {scalar(policyRecord?.status) ?? "No policy result was recorded."}
        </p>
        {Array.isArray(policyRecord?.reasonCodes) &&
          policyRecord.reasonCodes.length > 0 && (
            <ul className="m-0 grid gap-1 pl-5 text-sm text-foreground-muted">
              {policyRecord.reasonCodes.map((reason, index) => (
                <li key={`${String(reason)}-${index}`}>{String(reason)}</li>
              ))}
            </ul>
          )}
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="text-base font-semibold">Prepared writing</h2>
        {textRecord && Object.keys(textRecord).length > 0 ? (
          Object.entries(textRecord).map(([kind, content]) => (
            <div className="grid gap-1" key={kind}>
              <h3 className="text-sm font-semibold capitalize">
                {title(kind)}
              </h3>
              <p className="m-0 text-sm whitespace-pre-wrap">
                {scalar(content) ?? "Structured content requires review."}
              </p>
            </div>
          ))
        ) : (
          <p className="m-0 text-sm text-foreground-muted">
            No generated writing is attached. RoleProwl has not fabricated any
            application text.
          </p>
        )}
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="text-base font-semibold">Prepared answers</h2>
        {answerRecord && Object.keys(answerRecord).length > 0 ? (
          <dl className="m-0 grid gap-2 text-sm">
            {Object.entries(answerRecord).map(([question, answer]) => (
              <div key={question}>
                <dt className="font-semibold">{question}</dt>
                <dd className="m-0">
                  {scalar(answer) ?? "Structured answer requires review."}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="m-0 text-sm text-foreground-muted">
            No application answers are attached. Unknown answers remain
            unresolved.
          </p>
        )}
      </section>

      <section className="card grid gap-3 p-5 lg:col-span-2">
        <h2 className="text-base font-semibold">Application documents</h2>
        {documentList.length > 0 ? (
          <ul className="m-0 grid gap-2 pl-5 text-sm">
            {documentList.map((document, index) => {
              const item = record(document);
              return (
                <li key={`${scalar(item?.fileName) ?? "document"}-${index}`}>
                  {scalar(item?.fileName) ?? "Prepared document"}
                  {scalar(item?.contentType)
                    ? ` · ${scalar(item?.contentType)}`
                    : ""}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="m-0 text-sm text-foreground-muted">
            No application document is attached yet.
          </p>
        )}
      </section>
    </div>
  );
}
