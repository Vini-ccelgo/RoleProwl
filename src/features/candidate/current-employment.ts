export function currentEmploymentDateState(
  isCurrent: boolean,
  endDate: string,
) {
  return {
    disabled: isCurrent,
    endDate: isCurrent ? "" : endDate,
    isCurrent,
  };
}
