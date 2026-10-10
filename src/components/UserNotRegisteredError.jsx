import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';

const UserNotRegisteredError = () => {
  const { email, signOut } = useAuth();

  return (
    <AuthLayout
      title="Your account does not have access"
      subtitle={
        email
          ? `${email} is not registered for Early Warning.`
          : 'This account is not registered for Early Warning.'
      }
    >
      <div role="alert" className="space-y-5 text-sm leading-relaxed text-slate-800">
        <p>Ask the app administrator to add your work email, or sign in with a different account.</p>
        <Button
          type="button"
          onClick={() => signOut()}
          className="h-11 w-full rounded-md bg-slate-900 font-medium text-white hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          Sign out and use another account
        </Button>
      </div>
    </AuthLayout>
  );
};

export default UserNotRegisteredError;
