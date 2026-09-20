"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type {
  ApplicationPacketAnswer,
  ApplicationPacketField,
} from "@/core/domain/applications/application-packet";
import {
  applicationAnswerCardinality,
  applicationAnswerValues,
  encodedApplicationAnswer,
} from "@/core/domain/applications/application-packet";
import {
  exclusiveChoiceValues,
  normalizedChoiceText,
} from "@/core/domain/applications/choice-taxonomy";

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
  const normalized = String(value).replace(/\r\n?/gu, "\n");
  try {
    const parsed: unknown = JSON.parse(normalized);
    if (Array.isArray(parsed))
      return encodedApplicationAnswer(
        parsed.flatMap((candidate) =>
          typeof candidate === "string" ? [candidate] : [],
        ),
      );
  } catch {
    // Plain scalar and text answers are compared as entered.
  }
  return normalized;
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

function MultiChoiceInput({
  answer,
  label,
  mismatch,
  name,
  selectedValues,
}: {
  readonly answer: ApplicationPacketAnswer;
  readonly label: string;
  readonly mismatch: boolean;
  readonly name: string;
  readonly selectedValues: readonly string[];
}) {
  const choices = answerChoices(answer);
  const proposed =
    answer.resolutionDisposition === "PROPOSED_FOR_CANDIDATE" &&
    selectedValues.length > 0;
  const [decision, setDecision] = useState<"USE" | "CHOOSE" | null>(
    proposed ? null : "CHOOSE",
  );
  const [selected, setSelected] = useState(
    () => new Set(proposed ? [] : selectedValues),
  );
  const [filter, setFilter] = useState("");
  const exclusive = exclusiveChoiceValues(choices);
  const matchingChoices = filter
    ? choices.filter((option) =>
        normalizedChoiceText(option.label).includes(
          normalizedChoiceText(filter),
        ),
      )
    : choices;
  const visibleChoices = matchingChoices.length ? matchingChoices : choices;
  const noFilterMatches = Boolean(filter) && matchingChoices.length === 0;
  const suggestedLabels = choices
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.label);
  const expanded = !proposed || decision === "CHOOSE";

  return (
    <fieldset
      className="field max-w-full min-w-0 md:col-span-2"
      data-choice-cardinality="multiple"
    >
      <legend className="max-w-full break-words">{label}</legend>
      <input name={name} type="hidden" value="" />
      {mismatch ? (
        <small>
          The employer changed its choices. Select the intended values again
          explicitly.
        </small>
      ) : null}
      {proposed ? (
        <div className="grid gap-2 rounded-lg border border-brand p-3 text-sm">
          <strong>RoleProwl matched: {suggestedLabels.join(", ")}</strong>
          <label className="flex items-center gap-2">
            <input
              checked={decision === "USE"}
              className="application-choice-input"
              name={`taxonomy-decision:${answer.questionId}`}
              onChange={() => {
                setDecision("USE");
                setSelected(new Set(selectedValues));
              }}
              required
              type="radio"
              value="use"
            />
            Use this answer
          </label>
          <label className="flex items-center gap-2">
            <input
              checked={decision === "CHOOSE"}
              className="application-choice-input"
              name={`taxonomy-decision:${answer.questionId}`}
              onChange={() => {
                setDecision("CHOOSE");
                setSelected(new Set());
              }}
              required
              type="radio"
              value="choose"
            />
            Choose another
          </label>
        </div>
      ) : null}
      {decision === "USE"
        ? selectedValues.map((value) => (
            <input key={value} name={name} type="hidden" value={value} />
          ))
        : null}
      {expanded && choices.length > 12 ? (
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Search employer options</span>
          <input
            className="max-w-full min-w-0"
            onChange={(event) => setFilter(event.currentTarget.value)}
            placeholder="Type to filter choices"
            type="search"
            value={filter}
          />
        </label>
      ) : null}
      {expanded ? (
        <>
          {noFilterMatches ? (
            <small>No matching option. Showing all employer options.</small>
          ) : null}
          <div
            className="border-border grid max-h-64 gap-1 overflow-y-auto rounded-lg border p-2"
            data-bounded-choice-list="true"
          >
            {visibleChoices.map((option) => (
              <label
                className="flex min-w-0 items-start gap-2 rounded px-1 py-1 text-sm"
                key={option.value}
              >
                <input
                  className="application-choice-input"
                  checked={selected.has(option.value)}
                  name={name}
                  onChange={(event) => {
                    const next = new Set(selected);
                    if (event.currentTarget.checked) {
                      if (exclusive.has(option.value)) next.clear();
                      else for (const value of exclusive) next.delete(value);
                      next.add(option.value);
                    } else next.delete(option.value);
                    setSelected(next);
                  }}
                  required={
                    (answer.required || mismatch) &&
                    selected.size === 0 &&
                    option.value === visibleChoices[0]?.value
                  }
                  type="checkbox"
                  value={option.value}
                />
                <span className="min-w-0 break-words">{option.label}</span>
              </label>
            ))}
          </div>
        </>
      ) : null}
      {answer.required || mismatch ? (
        <small>Select at least one option.</small>
      ) : null}
    </fieldset>
  );
}

function ProposedTextInput({
  answer,
  label,
  name,
}: {
  readonly answer: ApplicationPacketAnswer;
  readonly label: string;
  readonly name: string;
}) {
  const [decision, setDecision] = useState<"USE" | "ADJUST" | null>(null);
  const calculated = answer.resolutionReasonCode?.startsWith(
    "CONTEXTUAL_EXPERIENCE_DURATION",
  );
  const employerCompensationProposal =
    answer.resolutionReasonCode === "EMPLOYER_POSTED_COMPENSATION_PROPOSAL";
  const longAnswer = !answer.fieldTypes.includes("input_text");
  return (
    <fieldset className="field max-w-full min-w-0 md:col-span-2">
      <legend className="max-w-full break-words">{label}</legend>
      <div className="grid gap-2 rounded-lg border border-brand p-3 text-sm">
        <strong>
          RoleProwl {calculated ? "calculated" : "proposed"}: {answer.value}
        </strong>
        {employerCompensationProposal ? (
          <small>
            Based on compensation published with this job. This is a proposal,
            not a stored candidate salary fact, and requires your confirmation.
          </small>
        ) : null}
        <label className="flex items-center gap-2">
          <input
            checked={decision === "USE"}
            className="application-choice-input"
            name={`proposal-decision:${answer.questionId}`}
            onChange={() => setDecision("USE")}
            required
            type="radio"
            value="use"
          />
          Use this answer
        </label>
        <label className="flex items-center gap-2">
          <input
            checked={decision === "ADJUST"}
            className="application-choice-input"
            name={`proposal-decision:${answer.questionId}`}
            onChange={() => setDecision("ADJUST")}
            required
            type="radio"
            value="adjust"
          />
          Adjust
        </label>
      </div>
      {decision === "USE" ? (
        <input name={name} type="hidden" value={answer.value ?? ""} />
      ) : null}
      {decision === "ADJUST" ? (
        longAnswer ? (
          <textarea
            className="max-w-full min-w-0"
            defaultValue={answer.value ?? ""}
            maxLength={4_000}
            name={name}
            required={answer.required}
            rows={4}
          />
        ) : (
          <input
            className="max-w-full min-w-0"
            defaultValue={answer.value ?? ""}
            maxLength={4_000}
            name={name}
            required={answer.required}
            type="text"
          />
        )
      ) : null}
    </fieldset>
  );
}

function ProposedSingleChoiceInput({
  answer,
  label,
  name,
  selectedValue,
}: {
  readonly answer: ApplicationPacketAnswer;
  readonly label: string;
  readonly name: string;
  readonly selectedValue: string;
}) {
  const [decision, setDecision] = useState<"USE" | "CHOOSE" | null>(null);
  const choices = answerChoices(answer);
  const proposedLabel =
    choices.find((option) => option.value === selectedValue)?.label ??
    selectedValue;
  const useRadio = answer.fieldTypes.some((type) =>
    type.toLocaleLowerCase("en-US").includes("radio"),
  );
  return (
    <fieldset className="field max-w-full min-w-0">
      <legend className="max-w-full break-words">{label}</legend>
      <div className="grid gap-2 rounded-lg border border-brand p-3 text-sm">
        <strong>RoleProwl proposed: {proposedLabel}</strong>
        <label className="flex items-center gap-2">
          <input
            checked={decision === "USE"}
            className="application-choice-input"
            name={`proposal-decision:${answer.questionId}`}
            onChange={() => setDecision("USE")}
            required
            type="radio"
            value="use"
          />
          Use this answer
        </label>
        <label className="flex items-center gap-2">
          <input
            checked={decision === "CHOOSE"}
            className="application-choice-input"
            name={`proposal-decision:${answer.questionId}`}
            onChange={() => setDecision("CHOOSE")}
            required
            type="radio"
            value="choose"
          />
          Choose another
        </label>
      </div>
      {decision === "USE" ? (
        <input name={name} type="hidden" value={selectedValue} />
      ) : null}
      {decision === "CHOOSE" ? (
        useRadio ? (
          <div className="grid gap-1">
            {choices.map((option) => (
              <label
                className="flex min-w-0 items-center gap-2"
                key={option.value}
              >
                <input
                  className="application-choice-input"
                  name={name}
                  required={answer.required}
                  type="radio"
                  value={option.value}
                />
                <span className="min-w-0 break-words">{option.label}</span>
              </label>
            ))}
          </div>
        ) : (
          <select
            className="max-w-full min-w-0"
            data-choice-cardinality="single"
            defaultValue=""
            name={name}
            required={answer.required}
          >
            <option value="">Choose an answer</option>
            {choices.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )
      ) : null}
    </fieldset>
  );
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
    const useMultiple = applicationAnswerCardinality(answer!) === "MULTIPLE";
    if (useMultiple)
      return (
        <MultiChoiceInput
          answer={answer!}
          label={label}
          mismatch={mismatch}
          name={name}
          selectedValues={selectedValues}
        />
      );
    if (
      answer?.resolutionDisposition === "PROPOSED_FOR_CANDIDATE" &&
      selectedValues[0]
    )
      return (
        <ProposedSingleChoiceInput
          answer={answer}
          label={label}
          name={name}
          selectedValue={selectedValues[0]}
        />
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
                className="application-choice-input"
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
          data-choice-cardinality="single"
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
  if (
    answer?.resolutionDisposition === "PROPOSED_FOR_CANDIDATE" &&
    answer.value
  )
    return <ProposedTextInput answer={answer} label={label} name={name} />;
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
