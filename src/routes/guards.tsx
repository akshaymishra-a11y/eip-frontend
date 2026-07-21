import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { useOrg } from '../lib/org-context';
import { Loader } from '../components/Loader';

const AUTH_MESSAGES = ['Initializing EIP SDK...', 'Validating system credentials...', 'Establishing secure session...'];
const ORG_MESSAGES = ['Loading your organizations...', 'Fetching workspace context...'];

export function RequireAuth() {
  const { session, initializing } = useAuth();
  if (initializing) return <Loader messages={AUTH_MESSAGES} />;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RequireOrg() {
  const { organizations, loading } = useOrg();
  if (loading) return <Loader messages={ORG_MESSAGES} />;
  if (organizations.length === 0) return <Navigate to="/organizations/new" replace />;
  return <Outlet />;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { session, initializing } = useAuth();
  if (initializing) return <Loader messages={AUTH_MESSAGES} />;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}
