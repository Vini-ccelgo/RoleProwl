import {
  BadgeCheck,
  ChartNoAxesCombined,
  ClipboardCheck,
  Compass,
  FilePenLine,
  Fingerprint,
  ListChecks,
  Mountain,
  ScanSearch,
  ShieldCheck,
  SlidersHorizontal,
  Target,
} from "lucide-react";

export const workflowSteps = [
  {
    title: "Discover Opportunities",
    text: "Find relevant supported opportunities.",
    icon: Target,
  },
  {
    title: "Evaluate Your Fit",
    text: "Analyze qualifications, preferences and conflicts.",
    icon: Compass,
  },
  {
    title: "Prepare & Personalize",
    text: "Generate truthful application material.",
    icon: FilePenLine,
  },
  {
    title: "Manage Your Pipeline",
    text: "Organize prepared and submitted applications.",
    icon: ListChecks,
  },
  {
    title: "Track & Improve",
    text: "Record responses, interviews and outcomes.",
    icon: Mountain,
  },
] as const;

export const features = [
  {
    title: "Verified Candidate Profile",
    text: "Build from one factual source of truth that you control.",
    icon: BadgeCheck,
  },
  {
    title: "Explainable Matching",
    text: "Understand why a role is a good fit, with clear reasoning.",
    icon: Fingerprint,
  },
  {
    title: "Policy-Based Automation",
    text: "Keep every action within candidate-defined authority.",
    icon: SlidersHorizontal,
  },
  {
    title: "Review Queue",
    text: "Escalate applications that require your attention.",
    icon: ClipboardCheck,
  },
  {
    title: "Application Tracking",
    text: "Preserve application history and outcomes.",
    icon: ChartNoAxesCombined,
  },
] as const;

export const principles = [
  { title: "Built for job seekers", icon: ScanSearch },
  { title: "Truth-first applications", icon: ShieldCheck },
  { title: "You control automation", icon: SlidersHorizontal },
] as const;
