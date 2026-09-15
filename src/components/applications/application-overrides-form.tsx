"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type {
  ApplicationPacketAnswer,
  ApplicationPacketField,
} from "@/core/domain/applications/application-packet";
import {
  applicationAnswerValues,
  encodedApplicationAnswer,
} from "@/core/domain/applications/application-packet";

type EditableField = ApplicationPacketField | ApplicationPacketAnswer;

export function applicationOverridesAreDirty(
  initial: Readonly<Record<string, unknown>>,
  current: FormData,
) {
  return Object.entries(initial).some(
    ([name, value]) =>
      normalizeEditableValue(
        encodedApplicationAnswer(
          current
            .getAll(name)
            .flatMap((candidate) =>
              typeof candidate === "string" && candidate ? [candidate] : [],
            ),
        ),
      ) !== normalizeEditableValue(value),
  );
}

export function normalizeEditableValue(value: unknown) {
  if (value == null) return "";
  return String(value).replace(/\r\n?/gu, "\n");
}

function fieldName(field: EditableField) {
  return "questionId" in field
    ? `answer:${field.questionId}`
    : `identity:${field.key}`;
}

function requiresChoiceReview(field: EditableField) {
  return "questionId" in field && field.status === "CONFLICTING";
}

function answerChoices(answer: ApplicationPacketAnswer) {
  return answer.optionIdentities?.length
    ? answer.optionIdentities
    : answer.options.map((option) => ({ label: option, value: option }));
}

function OverrideInput({ field }: { readonly field: EditableField }) {
  const answer = "questionId" in field ? field : null;
  const name = fieldName(field);
  const label = `${field.label}${field.required ? " (required)" : ""}`;
  const answerOptions = answer?.options ?? [];
  if (answerOptions.length) {
    const mismatch = requiresChoiceReview(field);
    const choices = answerChoices(answer!);
    const selectedValues = mismatch ? [] : applicationAnswerValues(field.value);
    const useMultiple = (answer?.fieldTypes ?? []).includes(
      "multi_value_multi_select",
    );
    if (useMultiple)
      return (
        <fieldset className="field max-w-full min-w-0">
          <legend className="max-w-full break-words">{label}</legend>
          <input name={name} type="hidden" value="" />
          {mismatch ? (
            <small>
              The employer changed its choices. Select the intended values again
              explicitly.
            </small>
          ) : null}
          {choices.map((option) => (
            <label
              className="flex min-w-0 items-center gap-2"
              key={option.value}
            >
              <input
                defaultChecked={selectedValues.includes(option.value)}
                name={name}
                type="checkbox"
                value={option.value}
              />
              <span className="min-w-0 break-words">{option.label}</span>
            </label>
          ))}
        </fieldset>
      );
    const useRadio = (answer?.fieldTypes ?? []).some((type) =>
      type.toLocaleLowerCase("en-US").includes("radio"),
    );
    if (useRadio)
      return (
        <fieldset className="field max-w-full min-w-0">
          <legend className="max-w-full break-words">{label}</legend>
          {mismatch ? (
            <small>
              Current answer: <strong>{field.value}</strong>. Your previous
              answer does not match the employer&apos;s available choices.
              Choose a replacement explicitly.
            </small>
          ) : null}
          {choices.map((option) => (
            <label
              className="flex min-w-0 items-center gap-2"
              key={option.value}
            >
              <input
                defaultChecked={selectedValues.includes(option.value)}
                name={name}
                required={field.required || mismatch}
                type="radio"
                value={option.value}
              />
              <span className="min-w-0 break-words">{option.label}</span>
            </label>
          ))}
        </fieldset>
      );
    return (
      <label className="field max-w-full min-w-0">
        <span className="break-words">{label}</span>
        {mismatch ? (
          <small>
            Current answer: <strong>{field.value}</strong>. Your previous answer
            does not match the employer&apos;s available choices. Choose a
            replacement explicitly.
          </small>
        ) : null}
        <select
          className="max-w-full min-w-0"
          defaultValue={mismatch ? "" : (selectedValues[0] ?? "")}
          name={name}
          required={field.required || mismatch}
        >
          <option value="">Choose an answer</option>
          {choices.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
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
      <label className="field max-w-full min-w-0 md:col-span-2">
        <span className="break-words">{label}</span>
        <textarea
          className="max-w-full min-w-0"
          defaultValue={field.value ?? ""}
          maxLength={4_000}
          name={name}
          required={field.required}
          rows={4}
        />
      </label>
    );
  return (
    <label className="field max-w-full min-w-0">
      <span className="break-words">{label}</span>
      <input
        className="max-w-full min-w-0"
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
      aria-disabled={!dirty || pending}
      data-dirty={dirty ? "true" : "false"}
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
  const approvalRequired = fields.some(
    (field) =>
      "questionId" in field &&
      (field.resolutionDisposition === "PROPOSED_FOR_CANDIDATE" ||
        field.resolutionReasonCode === "CANDIDATE_KNOWLEDGE_CONFLICT"),
  );
  const [dirty, setDirty] = useState(approvalRequired);
  const initialValues = Object.fromEntries(
    fields.map((field) => [
      fieldName(field),
      requiresChoiceReview(field) ? "" : (field.value ?? ""),
    ]),
  );

  function updateDirty() {
    if (!formRef.current) return;
    const current = new FormData(formRef.current);
    setDirty(
      approvalRequired || applicationOverridesAreDirty(initialValues, current),
    );
  }

  return (
    <form
      action={saveAction}
      className="grid gap-4"
      onChange={updateDirty}
      ref={formRef}
    >
      <input name="applicationId" type="hidden" value={applicationId} />
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <OverrideInput field={field} key={field.key} />
        ))}
      </div>
      <SaveButton dirty={dirty} />
    </form>
  );
}
