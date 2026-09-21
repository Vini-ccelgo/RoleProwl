import { cn } from "@/lib/cn";

export function TextField({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
  min,
  max,
  placeholder,
  hint,
  warning,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: "text" | "email" | "url" | "tel" | "date" | "number";
  required?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
  hint?: string;
  warning?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        data-field-label={label}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        min={min}
        max={max}
        placeholder={placeholder}
      />
      {hint ? <small className="field-hint">{hint}</small> : null}
      {warning ? (
        <small className="field-warning" role="status">
          {warning}
        </small>
      ) : null}
      <small className="field-error" data-validation-message hidden />
    </label>
  );
}

export function TextAreaField({
  label,
  name,
  defaultValue,
  list = false,
  wide = false,
}: {
  label: string;
  name: string;
  defaultValue?: string | readonly string[] | null;
  list?: boolean;
  wide?: boolean;
}) {
  const value = Array.isArray(defaultValue)
    ? defaultValue.join("\n")
    : (defaultValue ?? "");
  return (
    <label className={cn("field", wide && "field-wide")}>
      <span>{label}</span>
      <textarea
        data-field-label={label}
        name={name}
        defaultValue={value}
        rows={list ? 3 : 4}
        placeholder={list ? "One per line or comma-separated" : undefined}
      />
      <small className="field-error" data-validation-message hidden />
    </label>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  options,
  required = false,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  options: readonly { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        data-field-label={label}
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
      >
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <small className="field-error" data-validation-message hidden />
    </label>
  );
}

export function dateInput(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}
