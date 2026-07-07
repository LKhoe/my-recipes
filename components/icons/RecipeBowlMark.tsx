/**
 * The app's icon mark: a steaming bowl, kept to a handful of soft curves so it stays legible
 * down to favicon size. Colors match the design tokens in app/globals.css exactly (see the
 * OKLCH -> sRGB values computed when this was designed — DECISIONS.md "App logo"). The rim
 * cutout is hardcoded to the light-mode cream background since dark mode isn't actually wired
 * up anywhere yet (the .dark tokens in globals.css are unused) — revisit if that changes.
 * Mirrored as static markup in app/icon.svg for the favicon; keep both in sync if this changes.
 */
export function RecipeBowlMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <path
        d="M10 26C10 26 13 48 32 48C51 48 54 26 54 26C54 26 45 22 32 22C19 22 10 26 10 26Z"
        fill="#C25237"
      />
      <path
        d="M16 33C18 42 25 46 32 46C39 46 46 42 48 33C43 40 37 43 32 43C27 43 21 40 16 33Z"
        fill="#76392A"
        opacity="0.3"
      />
      <ellipse cx="32" cy="26" rx="22" ry="5.5" fill="#FCF8F3" />
      <ellipse cx="32" cy="26" rx="22" ry="5.5" fill="none" stroke="#76392A" strokeWidth="1" opacity="0.3" />
      <path
        d="M25 21Q18 15 25 11Q31 7 24 2"
        stroke="#CD995C"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M40 20Q46 15 40 11Q35 8 41 4"
        stroke="#CD995C"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
