import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { DEMO_LOAD_PATH, browserStorage, chooseDemo } from "./gate";

export const SIGN_IN_PATH = "/login?returnTo=%2F";

const TONES = {
  dark: {
    primary: "bg-white text-ew-ink hover:bg-[#dfe6ee] active:bg-[#cdd6e1] focus-visible:outline-white",
    secondary:
      "border border-white/45 text-white hover:border-white hover:bg-white/10 active:bg-white/15 focus-visible:outline-white",
  },
  light: {
    primary: "bg-ew-ink text-white hover:bg-[#24344a] active:bg-[#0b141e]",
    secondary: "border border-ew-ink/40 text-ew-ink hover:border-ew-ink hover:bg-ew-ink/5 active:bg-ew-ink/10",
  },
};

const BASE =
  "inline-flex h-12 items-center justify-center rounded-[3px] px-6 text-[15px] font-semibold tracking-[-0.005em] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px]";

// "Sign in" goes to the existing login page and comes back to the loan book.
// "Explore the demo" remembers the choice so "/" stops redirecting here, and asks the loan book to load the
// real demo companies if the shared book has none yet.
export default function LandingCtas({ tone = "dark", className = "" }) {
  const navigate = useNavigate();
  const styles = TONES[tone];

  const handleExplore = (e) => {
    e.preventDefault();
    chooseDemo(browserStorage());
    navigate(DEMO_LOAD_PATH);
  };

  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-center ${className}`}>
      <Link to={SIGN_IN_PATH} className={`${BASE} ${styles.primary}`}>
        Sign in
      </Link>
      <a href={DEMO_LOAD_PATH} onClick={handleExplore} className={`${BASE} ${styles.secondary}`}>
        Explore the demo
      </a>
    </div>
  );
}

/** "Explore the demo" on its own (the landing nav uses it next to Sign in). Same behaviour as above. */
export function ExploreDemoLink({ className = "" }) {
  const navigate = useNavigate();
  return (
    <a
      href={DEMO_LOAD_PATH}
      onClick={(e) => {
        e.preventDefault();
        chooseDemo(browserStorage());
        navigate(DEMO_LOAD_PATH);
      }}
      className={className}
    >
      Explore the demo
    </a>
  );
}
