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

export function InspectableFileName({
  className = "",
  fileName,
}: {
  readonly className?: string;
  readonly fileName: string;
}) {
  return (
    <details className={`filename-inspector ${className}`.trim()}>
      <summary
        aria-label={`Filename: ${fileName}. Activate to show the full filename.`}
      >
        <span aria-hidden="true" className="filename-inspector-compact">
          {compactFileName(fileName)}
        </span>
        <span aria-hidden="true" className="filename-inspector-action">
          Show full filename
        </span>
      </summary>
      <p className="safe-filename filename-inspector-full">{fileName}</p>
    </details>
  );
}
