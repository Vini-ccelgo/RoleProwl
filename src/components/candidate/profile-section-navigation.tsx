"use client";

import { useSyncExternalStore } from "react";

export const PROFILE_SECTIONS = [
  { id: "details", label: "Details" },
  { id: "resume-facts", label: "Résumé facts" },
  { id: "experience", label: "Experience" },
  { id: "education", label: "Education" },
  { id: "skills", label: "Skills" },
  { id: "projects", label: "Projects" },
  { id: "authorization", label: "Authorization" },
  { id: "preferences", label: "Preferences" },
] as const;

function subscribeToHashChange(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function getCurrentSection() {
  const hash = window.location.hash.slice(1);
  return PROFILE_SECTIONS.some((section) => section.id === hash)
    ? hash
    : PROFILE_SECTIONS[0].id;
}

export function ProfileSectionNavigation() {
  const currentSection = useSyncExternalStore(
    subscribeToHashChange,
    getCurrentSection,
    () => PROFILE_SECTIONS[0].id,
  );

  return (
    <>
      <nav
        className="vault-jump-nav vault-jump-nav-desktop"
        aria-label="Career Profile sections"
      >
        {PROFILE_SECTIONS.map((section) => (
          <a
            aria-current={
              currentSection === section.id ? "location" : undefined
            }
            href={`#${section.id}`}
            key={section.id}
          >
            {section.label}
          </a>
        ))}
      </nav>
      <label className="vault-jump-select">
        <span>Career Profile section</span>
        <select
          aria-label="Career Profile section"
          value={currentSection}
          onChange={(event) => {
            window.location.hash = event.target.value;
          }}
        >
          {PROFILE_SECTIONS.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
