import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { AuthUnavailable } from "@/components/auth/auth-unavailable";
import { isClerkConfigured, safeInternalRedirect } from "@/lib/auth/config";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  if (!isClerkConfigured()) return <AuthUnavailable mode="sign-up" />;
  const { redirect_url: requested } = await searchParams;
  const redirectUrl = safeInternalRedirect(requested, "/onboarding");
  return <SignUp fallbackRedirectUrl={redirectUrl} signInUrl="/sign-in" />;
}
