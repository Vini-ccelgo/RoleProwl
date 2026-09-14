export const PROPOSAL_DESTINATIONS = {
  PROFILE_FIRST_NAME: {
    canonicalPath: "candidateFacts.profileFirstNames",
    legacyPaths: [],
    label: "First name",
    cardinality: "MULTIPLE",
  },
  PROFILE_LAST_NAME: {
    canonicalPath: "candidateFacts.profileLastNames",
    legacyPaths: [],
    label: "Last name",
    cardinality: "MULTIPLE",
  },
  PROFILE_EMAIL: {
    canonicalPath: "candidateFacts.profileEmails",
    legacyPaths: ["candidateProfile.email"],
    label: "Profile email",
    cardinality: "MULTIPLE",
  },
  PROFILE_PHONE: {
    canonicalPath: "candidateFacts.profilePhones",
    legacyPaths: [],
    label: "Phone",
    cardinality: "MULTIPLE",
  },
  PROFILE_LINKEDIN_URL: {
    canonicalPath: "candidateFacts.linkedInUrls",
    legacyPaths: [],
    label: "LinkedIn URL",
    cardinality: "MULTIPLE",
  },
  PROFILE_WEBSITE_URL: {
    canonicalPath: "candidateFacts.websiteUrls",
    legacyPaths: [],
    label: "Website URL",
    cardinality: "MULTIPLE",
  },
  PROFILE_LOCATION: {
    canonicalPath: "candidateFacts.profileLocations",
    legacyPaths: [],
    label: "Current location",
    cardinality: "MULTIPLE",
  },
  WORK_EXPERIENCE_TEXT: {
    canonicalPath: "candidateFacts.workExperience",
    legacyPaths: ["workExperiences"],
    label: "Work experience",
    cardinality: "MULTIPLE",
  },
  EDUCATION_TEXT: {
    canonicalPath: "candidateFacts.education",
    legacyPaths: ["educationRecords"],
    label: "Education",
    cardinality: "MULTIPLE",
  },
  SKILL_TEXT: {
    canonicalPath: "candidateFacts.skills",
    legacyPaths: ["skills"],
    label: "Skill",
    cardinality: "MULTIPLE",
  },
  PROJECT_TEXT: {
    canonicalPath: "candidateFacts.projects",
    legacyPaths: ["projects"],
    label: "Project",
    cardinality: "MULTIPLE",
  },
  CREDENTIAL_TEXT: {
    canonicalPath: "candidateFacts.credentials",
    legacyPaths: ["credentials"],
    label: "Credential",
    cardinality: "MULTIPLE",
  },
  LANGUAGE_TEXT: {
    canonicalPath: "candidateFacts.languages",
    legacyPaths: [],
    label: "Language",
    cardinality: "MULTIPLE",
  },
} as const;

export type SupportedProposalFactType = keyof typeof PROPOSAL_DESTINATIONS;

export function getProposalDestination(factType: string) {
  return Object.hasOwn(PROPOSAL_DESTINATIONS, factType)
    ? PROPOSAL_DESTINATIONS[factType as SupportedProposalFactType]
    : undefined;
}

export function isSupportedProposalDestination(
  factType: string,
  targetPath: string,
) {
  const destination = getProposalDestination(factType);
  return Boolean(
    destination &&
    (destination.canonicalPath === targetPath ||
      destination.legacyPaths.some((path) => path === targetPath)),
  );
}
