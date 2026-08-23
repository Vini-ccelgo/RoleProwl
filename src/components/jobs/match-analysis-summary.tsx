import Link from "next/link";
import {
  hasSufficientEvidenceForHighFit,
  type MatchAssessment,
  type MatchEvidence,
} from "@/core/domain/matching/match-job";
import {
  buildAssessmentGuidance,
  splitMatchEvidence,
} from "@/features/jobs/match-presentation";

export interface MatchAnalysisSummaryData {
  readonly confidence: number;
  readonly gaps: unknown;
  readonly hardConflicts: unknown;
  readonly overallFit: number;
  readonly partialMatches: unknown;
  readonly preferenceScore: number;
  readonly qualificationScore: number;
  readonly scoringVersion: string;
  readonly strengths: unknown;
  readonly unknowns: unknown;
}

function evidence(
  value: unknown,
  assessment: MatchAssessment,
): MatchEvidence[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        if (
          !item ||
          typeof item !== "object" ||
          typeof (item as MatchEvidence).code !== "string" ||
          typeof (item as MatchEvidence).label !== "string" ||
          typeof (item as MatchEvidence).evidence !== "string"
        )
          return [];
        const candidate = item as Partial<MatchEvidence> &
          Pick<MatchEvidence, "code" | "evidence" | "label">;
        return [
          {
            assessment: candidate.assessment ?? assessment,
            category: candidate.category ?? "QUALIFICATION",
            code: candidate.code,
            evidence: candidate.evidence,
            label: candidate.label,
          },
        ];
      })
    : [];
}

function EvidenceGroup({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly MatchEvidence[];
}) {
  if (!items.length) return null;
  return (
    <div className="grid gap-1">
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="m-0 grid gap-1 pl-5 text-sm text-foreground-muted">
        {items.map((item) => (
          <li key={`${title}-${item.code}`}>
            <span className="text-foreground">{item.label}:</span>{" "}
            {item.evidence}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MatchAnalysisSummary({
  analysis,
  compact = false,
}: {
  readonly analysis: MatchAnalysisSummaryData;
  readonly compact?: boolean;
}) {
  const rawGroups = {
    conflicts: evidence(analysis.hardConflicts, "CONFLICT"),
    gaps: evidence(analysis.gaps, "GAP"),
    partials: evidence(analysis.partialMatches, "PARTIAL"),
    strengths: evidence(analysis.strengths, "SUPPORTED"),
    unknowns: evidence(analysis.unknowns, "UNKNOWN"),
  };
  const groups = splitMatchEvidence(rawGroups);
  const assessedCount =
    groups.conflicts.length +
    groups.gaps.length +
    groups.partials.length +
    groups.strengths.length +
    groups.preferences.filter((item) => item.assessment !== "UNKNOWN").length;
  const coverage = Math.round(analysis.confidence * 100);
  const preliminary = !hasSufficientEvidenceForHighFit(analysis.confidence);
  const guidance = buildAssessmentGuidance([
    ...groups.unknowns,
    ...groups.preferences.filter((item) => item.assessment === "UNKNOWN"),
  ]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {assessedCount ? (
          <div>
            <p className="m-0 text-xs font-semibold tracking-wide text-foreground-muted uppercase">
              Estimated fit
            </p>
            <strong className="text-2xl text-brand">
              {analysis.overallFit}%
            </strong>
            {preliminary && (
              <p className="m-0 text-xs text-foreground-muted">
                Preliminary — more evidence is needed before High fit can be
                confirmed.
              </p>
            )}
          </div>
        ) : (
          <div>
            <span className="badge">Not enough evidence to estimate fit</span>
            <p className="mb-0 text-xs text-foreground-muted">
              Missing evidence is unknown, not a failed qualification.
            </p>
          </div>
        )}
        <div className="text-right">
          <p className="m-0 text-xs font-semibold tracking-wide text-foreground-muted uppercase">
            Evidence coverage
          </p>
          <strong className="text-xl">{coverage}%</strong>
        </div>
      </div>

      {!compact && assessedCount > 0 && (
        <p className="m-0 text-sm">
          Qualification {analysis.qualificationScore}/100 · Preference{" "}
          {analysis.preferenceScore}/100 · {analysis.scoringVersion}
        </p>
      )}

      <div className={compact ? "grid gap-3" : "grid gap-4"}>
        <EvidenceGroup title="Known strengths" items={groups.strengths} />
        <EvidenceGroup title="Partial support" items={groups.partials} />
        <EvidenceGroup title="Confirmed gaps" items={groups.gaps} />
        <EvidenceGroup title="Conflicts" items={groups.conflicts} />
        <EvidenceGroup
          title="Unknown / missing evidence"
          items={groups.unknowns}
        />
        <EvidenceGroup title="Preferences" items={groups.preferences} />
      </div>

      {!compact && guidance.length > 0 && (
        <section className="border-border grid gap-2 rounded-xl border p-3">
          <h4 className="text-sm font-semibold">Improve this assessment</h4>
          <ul className="m-0 grid gap-1 pl-5 text-sm text-foreground-muted">
            {guidance.map((item) => (
              <li key={item.code}>
                {item.href ? (
                  <Link className="font-semibold text-brand" href={item.href}>
                    {item.label}
                  </Link>
                ) : (
                  item.label
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
