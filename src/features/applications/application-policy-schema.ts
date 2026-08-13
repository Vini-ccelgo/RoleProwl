import { z } from "zod";

export const applicationPolicySchema = z.object({
  allowedRoleFamilies: z.array(z.string().trim().min(1)).max(50),
  minimumOverallFit: z.number().int().min(0).max(100),
  excludedSeniorities: z.array(z.string().trim().min(1)).max(20),
  salaryMinimum: z.number().int().positive().nullable(),
  allowedLocations: z.array(z.string().trim().min(1)).max(50),
  requireRemote: z.boolean(),
  allowedEmploymentTypes: z.array(z.string().trim().min(1)).max(20),
  rejectAuthorizationConflict: z.boolean(),
  companyBlacklist: z.array(z.string().trim().min(1)).max(100),
  dailyApplicationLimit: z.number().int().min(1).max(100),
  autonomyLevel: z.enum([
    "RECOMMEND_ONLY",
    "AUTO_PREPARE",
    "AUTO_SUBMIT_AUTHORIZED",
  ]),
});
