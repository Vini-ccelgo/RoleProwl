"use client";

import { saveApplicationPolicyAction } from "./actions";
import { VaultForm } from "@/components/candidate/vault-form";
import {
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/candidate/vault-fields";

export interface ApplicationPolicyFormValue {
  readonly allowedEmploymentTypes: readonly string[];
  readonly allowedLocations: readonly string[];
  readonly allowedRoleFamilies: readonly string[];
  readonly autonomyLevel:
    "RECOMMEND_ONLY" | "AUTO_PREPARE" | "AUTO_SUBMIT_AUTHORIZED";
  readonly companyBlacklist: readonly string[];
  readonly dailyApplicationLimit: number;
  readonly excludedSeniorities: readonly string[];
  readonly minimumOverallFit: number;
  readonly rejectAuthorizationConflict: boolean;
  readonly requireRemote: boolean;
  readonly salaryMinimum: number | null;
}

export function ApplicationPolicyForm({
  policy,
}: {
  readonly policy: ApplicationPolicyFormValue;
}) {
  return (
    <VaultForm
      action={saveApplicationPolicyAction}
      submitLabel="Save application policy"
    >
      <SelectField
        label="Automation authority"
        name="autonomyLevel"
        defaultValue={policy.autonomyLevel}
        required
        options={[
          { value: "RECOMMEND_ONLY", label: "Recommend only" },
          { value: "AUTO_PREPARE", label: "Prepare, never submit" },
          {
            value: "AUTO_SUBMIT_AUTHORIZED",
            label: "Submit only through authorized integrations",
          },
        ]}
      />
      <TextField
        label="Minimum overall fit (0–100)"
        name="minimumOverallFit"
        type="number"
        min={0}
        max={100}
        required
        defaultValue={policy.minimumOverallFit}
      />
      <TextField
        label="Daily application limit"
        name="dailyApplicationLimit"
        type="number"
        min={1}
        max={100}
        required
        defaultValue={policy.dailyApplicationLimit}
      />
      <TextField
        label="Minimum salary"
        name="salaryMinimum"
        type="number"
        min={1}
        defaultValue={policy.salaryMinimum}
      />
      <TextAreaField
        label="Allowed role families"
        name="allowedRoleFamilies"
        list
        defaultValue={policy.allowedRoleFamilies}
      />
      <TextAreaField
        label="Allowed locations"
        name="allowedLocations"
        list
        defaultValue={policy.allowedLocations}
      />
      <TextAreaField
        label="Allowed employment types"
        name="allowedEmploymentTypes"
        list
        defaultValue={policy.allowedEmploymentTypes}
      />
      <TextAreaField
        label="Excluded seniorities"
        name="excludedSeniorities"
        list
        defaultValue={policy.excludedSeniorities}
      />
      <TextAreaField
        label="Company blacklist"
        name="companyBlacklist"
        list
        defaultValue={policy.companyBlacklist}
      />
      <label className="field checkbox-field">
        <input
          defaultChecked={policy.requireRemote}
          name="requireRemote"
          type="checkbox"
        />
        <span>Require remote work</span>
      </label>
      <label className="field checkbox-field">
        <input
          defaultChecked={policy.rejectAuthorizationConflict}
          name="rejectAuthorizationConflict"
          type="checkbox"
        />
        <span>Reject work-authorization conflicts</span>
      </label>
    </VaultForm>
  );
}
