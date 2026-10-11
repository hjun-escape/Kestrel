import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { appParams } from "@/lib/app-params";
import { WELCOME_PATH, browserStorage, decideWelcomeGate, demoChosen } from "./gate";

// Sends a signed-out first-time visitor from "/" to the welcome page.
// Signed-in users, and anyone who chose "Explore the demo" in this browser,
// get the loan book as before. Sign-in itself stays optional. Opening presenter
// mode (?demo=1) counts as choosing the demo.
export default function WelcomeGate({ children }) {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const { search } = useLocation();
  const decision = decideWelcomeGate({
    hasToken: Boolean(appParams.token),
    isAuthenticated,
    isLoadingAuth,
    demoChosen: demoChosen(browserStorage()) || new URLSearchParams(search).get("demo") === "1",
  });

  if (decision === "redirect") return <Navigate to={WELCOME_PATH} replace />;
  if (decision === "wait") return null;
  return children;
}
