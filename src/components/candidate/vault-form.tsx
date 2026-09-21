"use client";

import { useActionState, useEffect, useRef } from "react";
import type { CandidateFormState } from "@/features/candidate/form-state";
import { initialCandidateFormState } from "@/features/candidate/form-state";
import { cn } from "@/lib/cn";

type CandidateAction = (
  state: CandidateFormState,
  formData: FormData,
) => Promise<CandidateFormState>;

export function VaultForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  submitLabel = "Save",
}: {
  action: CandidateAction;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  submitLabel?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    action,
    initialCandidateFormState,
  );

  useEffect(() => {
    if (resetOnSuccess && state.status === "success") formRef.current?.reset();
  }, [resetOnSuccess, state.status]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className={cn("vault-form", className)}
      noValidate
      onInput={(event) => {
        const control = event.target;
        if (!(
          control instanceof HTMLInputElement ||
          control instanceof HTMLSelectElement ||
          control instanceof HTMLTextAreaElement
        ))
          return;
        control.removeAttribute("aria-invalid");
        const message = control
          .closest(".field")
          ?.querySelector<HTMLElement>("[data-validation-message]");
        if (message) {
          if (control.getAttribute("aria-describedby") === message.id)
            control.removeAttribute("aria-describedby");
          message.hidden = true;
          message.textContent = "";
        }
      }}
      onSubmit={(event) => {
        const controls = [
          ...event.currentTarget.querySelectorAll<
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          >("input, select, textarea"),
        ];
        const invalid = controls.filter((control) => !control.validity.valid);
        if (!invalid.length) return;
        event.preventDefault();
        for (const control of invalid) {
          control.setAttribute("aria-invalid", "true");
          const message = control
            .closest(".field")
            ?.querySelector<HTMLElement>("[data-validation-message]");
          if (message) {
            if (!message.id)
              message.id = `field-error-${globalThis.crypto.randomUUID()}`;
            control.setAttribute("aria-describedby", message.id);
            const label = control.dataset.fieldLabel ?? "This field";
            message.textContent = control.validity.valueMissing
              ? `${label} is required.`
              : `Enter a valid ${label.toLocaleLowerCase("en-US")}.`;
            message.hidden = false;
          }
        }
        invalid[0]?.focus({ preventScroll: true });
        invalid[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
    >
      <div className="vault-form-grid">{children}</div>
      <div className="vault-form-footer">
        <p className={`form-message ${state.status}`} aria-live="polite">
          {state.message}
        </p>
        <button
          className="button button-primary"
          disabled={pending}
          type="submit"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
