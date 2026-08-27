"use client";

import { useId, useState } from "react";

const DEFAULT_COMPACT_LENGTH = 44;

export function compactFileName(
  fileName: string,
  maxLength = DEFAULT_COMPACT_LENGTH,
) {
  if (fileName.length <= maxLength) return fileName;

  const extensionStart = fileName.lastIndexOf(".");
  const extension =
    extensionStart > 0 && fileName.length - extensionStart <= 12
      ? fileName.slice(extensionStart)
      : "";
  const suffix = extension || fileName.slice(-12);
  const prefixLength = Math.max(8, maxLength - suffix.length - 1);
  return `${fileName.slice(0, prefixLength)}…${suffix}`;
}

export function InspectableFileNameView({
  className = "",
  disclosureId,
  expanded,
  fileName,
  onToggle,
}: {
  readonly className?: string;
  readonly disclosureId: string;
  readonly expanded: boolean;
  readonly fileName: string;
  readonly onToggle: () => void;
}) {
  return (
    <div className={`filename-inspector ${className}`.trim()}>
      <span className="filename-inspector-compact">
        {compactFileName(fileName)}
      </span>
      <button
        aria-controls={disclosureId}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Hide" : "Show"} full filename: ${fileName}`}
        className="filename-inspector-toggle"
        onClick={onToggle}
        type="button"
      >
        {expanded ? "Hide full filename" : "Show full filename"}
      </button>
      {expanded ? (
        <p className="safe-filename filename-inspector-full" id={disclosureId}>
          {fileName}
        </p>
      ) : null}
    </div>
  );
}

export function InspectableFileName({
  className = "",
  fileName,
}: {
  readonly className?: string;
  readonly fileName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const disclosureId = useId();

  return (
    <InspectableFileNameView
      className={className}
      disclosureId={disclosureId}
      expanded={expanded}
      fileName={fileName}
      onToggle={() => setExpanded((current) => !current)}
    />
  );
}
