"use client";

import { useState } from "react";

export function CopyApplicationValue({ value }: { readonly value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="text-xs font-semibold text-brand"
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
