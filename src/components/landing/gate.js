// Pure logic for the welcome gate on "/" (see WelcomeGate.jsx).
// Kept free of React, animejs and the Base44 SDK so it stays in the main
// bundle at near-zero cost and can be unit-tested with node --test.

export const DEMO_FLAG_KEY = "ew_demo_chosen";
export const WELCOME_PATH = "/welcome";
// "Explore the demo" opens the loan book with this flag; the loan book loads the real demo companies when the
// shared book has none yet (src/lib/demoLoad.js, src/pages/LoanBook.jsx).
export const DEMO_LOAD_PATH = "/?demo-load=1";

/** True when this browser has chosen "Explore the demo". Never throws. */
export function hasChosenDemo(storage) {
  try {
    return storage?.getItem(DEMO_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remembers the "Explore the demo" choice. Returns false if storage is unavailable. */
export function rememberDemoChoice(storage) {
  try {
    if (!storage) return false;
    storage.setItem(DEMO_FLAG_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Decide what "/" does for this visitor.
 * - "stay": render the loan book (signed in, or chose the demo)
 * - "wait": a session token is still being checked; render nothing yet
 * - "redirect": signed-out first visit; send to the welcome page
 */
export function decideWelcomeGate({ hasToken, isAuthenticated, isLoadingAuth, demoChosen }) {
  if (demoChosen || isAuthenticated) return "stay";
  if (!hasToken) return "redirect";
  return isLoadingAuth ? "wait" : "redirect";
}

/** localStorage, or undefined where it cannot be reached. */
export function browserStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

// In-memory fallback so "Explore the demo" still works for this page session
// when localStorage is blocked (private windows, strict privacy settings).
let chosenThisSession = false;

/** Records the demo choice in memory and, where possible, in storage. */
export function chooseDemo(storage) {
  chosenThisSession = true;
  return rememberDemoChoice(storage);
}

/** True if the demo was chosen in this page session or stored earlier. */
export function demoChosen(storage) {
  return chosenThisSession || hasChosenDemo(storage);
}
