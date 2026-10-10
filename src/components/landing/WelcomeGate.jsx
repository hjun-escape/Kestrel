import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { appParams } from "@/lib/app-params";
import { WELCOME_PATH, browserStorage, decideWelcomeGate, demoChosen } from "./gate";

// Sends a signed-out first-time visitor from "/" to the welcome page.
// Signed-in users, and anyone who chose "Explore the demo" in this browser,
// get the loan book as before. Sign-in itself stays optional.
export default function WelcomeGate({ children }) {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const decision = decideWelcomeGate({
    hasToken: Boolean(appParams.token),
    isAuthenticated,
    isLoadingAuth,
    demoChosen: demoChosen(browserStorage()),
  });

  if (decision === "redirect") return <Navigate to={WELCOME_PATH} replace />;
  if (decision === "wait") return null;
  return children;
}
