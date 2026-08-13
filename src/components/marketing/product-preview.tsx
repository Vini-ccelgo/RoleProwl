import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarCheck,
  ClipboardList,
  Target,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const stats = [
  {
    label: "Top Matches",
    value: "18",
    note: "Illustrative roles",
    icon: Target,
  },
  {
    label: "Application Queue",
    value: "9",
    note: "Ready to review",
    icon: ClipboardList,
  },
  { label: "Applications", value: "27", note: "In progress", icon: TrendingUp },
  { label: "Interviews", value: "4", note: "Scheduled", icon: CalendarCheck },
] as const;
const matches = [
  "Product Manager",
  "Growth Marketing Manager",
  "Product Operations Lead",
];
const queue = [
  "Senior Product Manager",
  "Marketing Manager",
  "Customer Success Manager",
];
const progress = [
  "Interview scheduled",
  "Application moved to review",
  "Response from employer",
];

export function ProductPreview() {
  return (
    <div className="preview" aria-label="Illustrative product preview">
      <div className="preview-top">
        <div>
          <Badge>Product preview</Badge>
          <h2>Your job search, organized.</h2>
          <p>Everything you need to find the right role and stay on track.</p>
        </div>
        <span className="preview-date">
          <CalendarCheck size={16} /> This week
        </span>
      </div>
      <div className="stat-grid">
        {stats.map(({ label, value, note, icon: Icon }) => (
          <div className="preview-stat" key={label}>
            <span>
              <small>{label}</small>
              <strong>{value}</strong>
              <em>{note}</em>
            </span>
            <Icon aria-hidden="true" />
          </div>
        ))}
      </div>
      <div className="preview-columns">
        <PreviewList title="Top Job Matches" items={matches} kind="match" />
        <PreviewList title="Application Queue" items={queue} kind="queue" />
        <PreviewList title="Recent Progress" items={progress} kind="progress" />
      </div>
    </div>
  );
}
function PreviewList({
  title,
  items,
  kind,
}: {
  title: string;
  items: readonly string[];
  kind: string;
}) {
  return (
    <div className="preview-list">
      <h3>
        {title}
        <ArrowUpRight size={15} />
      </h3>
      {items.map((item, index) => (
        <div className="preview-row" key={item}>
          <span className="row-icon">
            {kind === "progress" ? (
              <TrendingUp size={14} />
            ) : (
              <BriefcaseBusiness size={14} />
            )}
          </span>
          <span>
            <strong>{item}</strong>
            <small>
              {kind === "progress"
                ? `${index + 1} day ago`
                : "Sample company · Flexible"}
            </small>
          </span>
          {kind !== "progress" && (
            <Badge>
              {kind === "match"
                ? `${92 - index * 5}% Match`
                : index === 2
                  ? "Review"
                  : "High Fit"}
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}
