"use client";

import { useState } from "react";
import { currentEmploymentDateState } from "@/features/candidate/current-employment";

export function CurrentEmploymentFields({
  defaultCurrent = false,
  defaultEndDate = "",
}: {
  readonly defaultCurrent?: boolean;
  readonly defaultEndDate?: string;
}) {
  const [state, setState] = useState(() =>
    currentEmploymentDateState(defaultCurrent, defaultEndDate),
  );

  return (
    <>
      <label className="field">
        <span>End date</span>
        <input
          disabled={state.disabled}
          name="endDate"
          onChange={(event) =>
            setState((current) => ({
              ...current,
              endDate: event.target.value,
            }))
          }
          type="date"
          value={state.endDate}
        />
      </label>
      <label className="field checkbox-field">
        <input
          checked={state.isCurrent}
          name="isCurrent"
          onChange={(event) =>
            setState((current) =>
              currentEmploymentDateState(event.target.checked, current.endDate),
            )
          }
          type="checkbox"
        />
        <span>Current employment</span>
      </label>
    </>
  );
}
