import Link from "next/link";
import { RoleProwlLogo } from "@/components/brand/roleprowl-logo";
import { ALL_NAV_ROUTES, LEGAL_ROUTES } from "@/config/routes";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-trail" aria-hidden="true" />
      <div className="footer-grid container">
        <div>
          <RoleProwlLogo inverse />
          <p>
            Your AI job-search partner.
            <br />
            More matches. Fewer manual tasks. Better outcomes.
          </p>
        </div>
        <nav aria-label="Footer product navigation">
          {ALL_NAV_ROUTES.map((route) => (
            <Link key={route.href} href={route.href}>
              {route.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Footer legal navigation">
          {LEGAL_ROUTES.map((route) => (
            <Link key={route.href} href={route.href}>
              {route.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="footer-bottom container">
        <span>
          © {new Date().getFullYear()} RoleProwl. All rights reserved.
        </span>
        <span>Built around truthful, candidate-controlled applications.</span>
      </div>
    </footer>
  );
}
