import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here
import LoanBook from '@/pages/LoanBook';
import CompanyDetail from '@/pages/CompanyDetail';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

// Signed-out visitors go to our own /login (with returnTo), never Base44's
// hosted login. The auth pages sit outside ProtectedRoute, so there is no loop.
const SignedOutRedirect = () => {
  const location = useLocation();
  const returnTo = location.pathname + location.search;
  const target = returnTo === "/" ? "/login" : `/login?returnTo=${encodeURIComponent(returnTo)}`;
  return <Navigate to={target} replace />;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route element={<ProtectedRoute unauthenticatedElement={<SignedOutRedirect />} />}>
      <Route path="/" element={<LoanBook />} />
      <Route path="/borrower/:id" element={<CompanyDetail />} />
      <Route path="*" element={<PageNotFound />} />
    </Route>
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