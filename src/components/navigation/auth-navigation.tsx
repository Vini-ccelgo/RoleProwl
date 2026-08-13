import { Show, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { isClerkConfigured } from "@/lib/auth/config";

function SignedOutActions() {
  return (
    <>
      <Button href="/sign-in" variant="secondary">
        Sign In
      </Button>
      <Button href="/sign-up">Get Started</Button>
    </>
  );
}

export function AuthNavigation() {
  if (!isClerkConfigured()) {
    return (
      <div className="header-actions">
        <SignedOutActions />
      </div>
    );
  }

  return (
    <div className="header-actions">
      <Show when="signed-out">
        <SignedOutActions />
      </Show>
      <Show when="signed-in">
        <Button href="/dashboard" variant="secondary">
          Dashboard
        </Button>
        <UserButton />
      </Show>
    </div>
  );
}
