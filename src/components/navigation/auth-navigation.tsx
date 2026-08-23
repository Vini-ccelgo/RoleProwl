import { Show, UserButton } from "@clerk/nextjs";
import { MobileMenu } from "@/components/navigation/mobile-menu";
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

export function MobileAuthNavigation() {
  const configured = isClerkConfigured();
  return (
    <div className="mobile-actions">
      {!configured && <Button href="/onboarding">Get Started</Button>}
      {configured && (
        <>
          <Show when="signed-out">
            <Button href="/onboarding">Get Started</Button>
          </Show>
          <Show when="signed-in">
            <Button href="/dashboard" variant="secondary">
              Workspace
            </Button>
          </Show>
        </>
      )}
      <MobileMenu />
    </div>
  );
}
