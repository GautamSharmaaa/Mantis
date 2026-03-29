import React from "react";
import { Link, useLocation } from "react-router-dom";

const navLinks = [
  { label: "Dashboard", to: "/", icon: "grid" },
  { label: "My Info", to: "/info", icon: "user" },
  { label: "API Key Settings", to: "/settings", icon: "key" },
];

function NavIcon({ type }) {
  if (type === "user") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path d="M10 10a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-5 6a5 5 0 0 1 10 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      </svg>
    );
  }

  if (type === "key") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path d="M8.75 11.25a3.75 3.75 0 1 1 2.91-1.39H18v2h-1.75v1.75H14.5v1.75h-2.25v-2.17a3.74 3.74 0 0 1-3.5-1.94Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 4h4v4H4Zm8 0h4v4h-4ZM4 12h4v4H4Zm8 0h4v4h-4Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

function BrandIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 3.5 13.8 9l5.7 1.8L13.8 12.6 12 18.5l-1.8-5.9-5.7-1.8L10.2 9 12 3.5Zm6.4 11.2.9 2.7 2.7.9-2.7.9-.9 2.8-.9-2.8-2.8-.9 2.8-.9.9-2.7Z" fill="currentColor" />
    </svg>
  );
}

export default function Sidebar({ onCreateResume }) {
  const location = useLocation();

  return (
    <aside className="sidebar">
      <div className="sidebar__top">
        <div className="sidebar__brand">
          <div className="sidebar__brand-icon">
            <BrandIcon />
          </div>
          <h1>Mantis</h1>
        </div>

        <button className="sidebar__create" onClick={onCreateResume} type="button">
          <span>+</span>
          <span>Create Resume</span>
        </button>
      </div>

      <nav className="sidebar__nav" aria-label="Primary">
        {navLinks.map((link) => (
          <Link
            key={link.label}
            to={link.to}
            className={`sidebar__link ${location.pathname === link.to ? "sidebar__link--active" : ""}`}
          >
            <NavIcon type={link.icon} />
            <span>{link.label}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__user-avatar">M</div>
        <div>
          <strong>User</strong>
          <span>Free Plan</span>
        </div>
      </div>
    </aside>
  );
}
