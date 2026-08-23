"use client";

import { Trash2 } from "lucide-react";

const REMOVAL_CONFIRMATION =
  "Remove this verified résumé fact from your active profile? Its source history will be preserved.";

export function confirmFactRemoval(
  confirmOperator: (message: string) => boolean = (message) =>
    window.confirm(message),
) {
  return confirmOperator(REMOVAL_CONFIRMATION);
}

export function ConfirmFactRemovalButton() {
  return (
    <button
      className="record-delete verified-fact-remove-button"
      type="submit"
      onClick={(event) => {
        if (!confirmFactRemoval()) {
          event.preventDefault();
        }
      }}
    >
      <Trash2 size={16} aria-hidden="true" /> Remove from active facts
    </button>
  );
}
