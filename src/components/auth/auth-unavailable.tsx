import Link from "next/link";

export function AuthUnavailable({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <div className="auth-unavailable">
      <p className="eyebrow">Authentication setup required</p>
      <h1>{mode === "sign-in" ? "Sign in" : "Create your account"}</h1>
      <p>
        Clerk is not configured in this environment. Protected RoleProwl routes
        remain inaccessible until the required keys are provided.
      </p>
      <Link className="button button-secondary" href="/">
        Return home
      </Link>
    </div>
  );
}
