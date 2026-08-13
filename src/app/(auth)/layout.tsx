import { RoleProwlLogo } from "@/components/brand/roleprowl-logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="auth-shell">
      <div className="auth-brand">
        <RoleProwlLogo />
      </div>
      <div className="auth-panel">{children}</div>
    </main>
  );
}
