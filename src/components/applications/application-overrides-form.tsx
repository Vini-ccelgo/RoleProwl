"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type {
  ApplicationPacketAnswer,
  ApplicationPacketField,
} from "@/core/domain/applications/application-packet";

type EditableField = ApplicationPacketField | ApplicationPacketAnswer;

export function applicationOverridesAreDirty(
  initial: Readonly<Record<string, string>>,
  current: FormData,
) {
  return Object.entries(initial).some(
    ([name, value]) => String(current.get(name) ?? "") !== value,
  );
}

function fieldName(field: EditableField) {
  return "questionId" in field
    ? `answer:${field.questionId}`
    : `identity:${field.key}`;
}

function requiresChoiceReview(field: EditableField) {
  return (
    "questionId" in field &&
    field.status === "CONFLICTING" &&
    (field.options ?? []).length > 0 &&
    Boolean(field.value) &&
    !field.options.includes(field.value!)
  );
}

function OverrideInput({ field }: { readonly field: EditableField }) {
  const answer = "questionId" in field ? field : null;
  const name = fieldName(field);
  const label = `${field.label}${field.required ? " (required)" : ""}`;
  const answerOptions = answer?.options ?? [];
  if (answerOptions.length) {
    const mismatch = requiresChoiceReview(field);
    return (
      <label className="field">
        <span>{label}</span>
        {mismatch ? (
          <small>
            Current answer: <strong>{field.value}</strong>. Your previous answer
            does not match the employer&apos;s available choices. Choose a
            replacement explicitly.
          </small>
        ) : null}
        <select
          defaultValue={mismatch ? "" : (field.value ?? "")}
          name={name}
          required={field.required || mismatch}
        >
          <option value="">Choose an answer</option>
          {answerOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const isLongAnswer =
    answer && !(answer.fieldTypes ?? []).includes("input_text");
  if (isLongAnswer)
    return (
      <label className="field sm:col-span-2">
        <span>{label}</span>
        <textarea
          defaultValue={field.value ?? ""}
          maxLength={4_000}
          name={name}
          required={field.required}
          rows={4}
        />
      </label>
    );
  return (
    <label className="field">
      <span>{label}</span>
      <input
        defaultValue={field.value ?? ""}
        maxLength={field.key === "country" ? 2 : 4_000}
        name={name}
        required={field.required}
        type={
          field.key === "email"
            ? "email"
            : field.key === "phone"
              ? "tel"
              : "text"
        }
      />
      {field.status === "CONFLICTING" && field.alternatives?.length ? (
        <small>
          Confirm one value. Known alternatives: {field.alternatives.join(", ")}
        </small>
      ) : null}
    </label>
  );
}

function SaveButton({ dirty }: { readonly dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="button button-primary w-fit"
      disabled={!dirty || pending}
      type="submit"
    >
      {pending ? "Saving and re-checking…" : "Save and re-check application"}
    </button>
  );
}

export function ApplicationOverridesForm({
  applicationId,
  fields,
  saveAction,
}: {
  readonly applicationId: string;
  readonly fields: readonly EditableField[];
  readonly saveAction: (formData: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);
  const initialValues = Object.fromEntries(
    fields.map((field) => [
      fieldName(field),
      requiresChoiceReview(field) ? "" : (field.value ?? ""),
    ]),
  );

  function updateDirty() {
    if (!formRef.current) return;
    const current = new FormData(formRef.current);
    setDirty(applicationOverridesAreDirty(initialValues, current));
  }

  return (
    <form
      action={saveAction}
      className="grid gap-4"
      onChange={updateDirty}
      ref={formRef}
    >
      <input name="applicationId" type="hidden" value={applicationId} />
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <OverrideInput field={field} key={field.key} />
        ))}
      </div>
      <SaveButton dirty={dirty} />
    </form>
  );
}
