import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-white" role="status" aria-live="polite">
    <div
      className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800 motion-reduce:animate-none"
      aria-hidden="true"
    />
    <span className="sr-only">Checking your session</span>
  </div>
);

// Gate for any route tree. Signed-out visitors are sent to sign-in (or to
// `unauthenticatedElement` when supplied); unregistered users see the
// access-denied screen. Everything else renders the nested routes.
export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth, navigateToLogin } = useAuth();

  const isSignedOut = authChecked && (!isAuthenticated || (authError && authError.type !== 'user_not_registered'));
  const shouldRedirect = isSignedOut && !unauthenticatedElement;

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  useEffect(() => {
    if (shouldRedirect) {
      navigateToLogin();
    }
  }, [shouldRedirect, navigateToLogin]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  if (authError?.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  if (isSignedOut) {
    return unauthenticatedElement ?? fallback;
  }

  return <Outlet />;
}
