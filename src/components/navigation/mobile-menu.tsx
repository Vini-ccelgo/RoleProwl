"use client";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { ALL_NAV_ROUTES } from "@/config/routes";
import { NavigationLink } from "./navigation-link";

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mobile-menu">
      <button
        type="button"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        aria-controls="mobile-navigation"
        onClick={() => setOpen(!open)}
      >
        {open ? <X /> : <Menu />}
      </button>
      {open && (
        <nav id="mobile-navigation" aria-label="Mobile navigation">
          {ALL_NAV_ROUTES.map((route) => (
            <NavigationLink
              key={route.href}
              href={route.href}
              onClick={() => setOpen(false)}
            />
          ))}
          <a className="button button-secondary" href="/dashboard">
            Sign In
          </a>
        </nav>
      )}
    </div>
  );
}
