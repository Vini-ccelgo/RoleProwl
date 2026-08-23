import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import Script from "next/script";
import { isClerkConfigured } from "@/lib/auth/config";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "RoleProwl — Track the right opportunities",
    template: "%s | RoleProwl",
  },
  description: "A truth-first, candidate-controlled job search workspace.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const document = (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );

  if (!isClerkConfigured()) return document;

  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/onboarding"
    >
      {document}
    </ClerkProvider>
  );
}
