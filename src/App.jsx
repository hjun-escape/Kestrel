import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here
import LoanBook from '@/pages/LoanBook';
import CompanyDetail from '@/pages/CompanyDetail';
// The Assistant page pulls in assistant-ui; load it only when visited.
const Assistant = lazy(() => import('@/pages/Assistant'));
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

// Sign-in is optional: anyone with the link can browse, screen and refresh
// (Sense testers open it without an account). Signing in adds the user menu
// and unlocks the features whose backend functions require a user (Ask,
// analyst brief, lender check, cash-flow check, recording a decision); those
// functions return 401 with a "Sign in to ..." message for everyone else.
const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/" element={<LoanBook />} />
    <Route path="/borrower/:id" element={<CompanyDetail />} />
    <Route path="/assistant" element={<Suspense fallback={null}><Assistant /></Suspense>} />
    <Route path="*" element={<PageNotFound />} />
  </Routes>
);


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AppRoutes />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App