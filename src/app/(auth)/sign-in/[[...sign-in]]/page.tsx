import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { AuthUnavailable } from "@/components/auth/auth-unavailable";
import { isClerkConfigured, safeInternalRedirect } from "@/lib/auth/config";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  if (!isClerkConfigured()) return <AuthUnavailable mode="sign-in" />;
  const { redirect_url: requested } = await searchParams;
  const redirectUrl = safeInternalRedirect(requested, "/dashboard");
  return <SignIn fallbackRedirectUrl={redirectUrl} signUpUrl="/sign-up" />;
}
