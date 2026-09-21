"use client";

import { useEffect, useState } from "react";

export const PROFILE_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "personal", label: "Personal" },
  { id: "experience", label: "Experience" },
  { id: "education-skills", label: "Education & skills" },
  { id: "preferences", label: "Preferences" },
  { id: "application-defaults", label: "Application defaults" },
] as const;

export function ProfileSectionNavigation() {
  const [currentSection, setCurrentSection] = useState<string>(
    PROFILE_SECTIONS[0].id,
  );

  useEffect(() => {
    const updateFromHash = () => {
      const hash = window.location.hash.slice(1);
      if (PROFILE_SECTIONS.some((section) => section.id === hash))
        setCurrentSection(hash);
    };
    updateFromHash();
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              left.boundingClientRect.top - right.boundingClientRect.top,
          )[0];
        if (visible?.target.id) setCurrentSection(visible.target.id);
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: 0 },
    );
    for (const section of PROFILE_SECTIONS) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    window.addEventListener("hashchange", updateFromHash);
    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", updateFromHash);
    };
  }, []);

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
            setCurrentSection(event.target.value);
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
