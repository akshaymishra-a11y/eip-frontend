import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchMyRole, fetchOrganizations, redeemPendingInvites, redeemPendingProjectInvites } from './api';
import { useAuth } from './auth-context';
import type { Organization, OrganizationRole } from './types';

type OrgContextValue = {
  organizations: Organization[];
  currentOrganization: Organization | null;
  currentRole: OrganizationRole | null;
  setCurrentOrganizationId: (id: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
};

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth();
  // Supabase re-emits onAuthStateChange (e.g. TOKEN_REFRESHED) with a brand
  // new `session`/`user` object on every tab-focus and periodic token
  // refresh, even though it's still the same signed-in user. Keying off
  // this primitive id (instead of the `user` object reference) stops those
  // identity-only churns from re-running `refresh` below — which otherwise
  // flips `loading` back to true and makes RequireOrg swap the whole
  // dashboard out for its full-screen loader every time the tab regains
  // focus, looking like the app reloaded.
  const userId = user?.id ?? null;
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<OrganizationRole | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setOrganizations([]);
      setCurrentOrganizationId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Best-effort: join any org this user was invited to before fetching
      // the org list, so a freshly-redeemed invite shows up immediately.
      try {
        await redeemPendingInvites();
        await redeemPendingProjectInvites();
      } catch {
        // Not fatal — the user just won't see a brand-new invite until next refresh.
      }
      const orgs = await fetchOrganizations();
      setOrganizations(orgs);
      setCurrentOrganizationId((prev) => {
        if (prev && orgs.some((o) => o.id === prev)) return prev;
        return orgs[0]?.id ?? null;
      });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // Wait for auth to settle first — otherwise this runs once with user=null
    // (before getSession() resolves) and sets loading=false prematurely. On the
    // very next render, once the real session lands, RequireOrg reads that stale
    // loading=false alongside the still-empty organizations[] and redirects to
    // /organizations/new before this effect gets a chance to re-run for real.
    if (initializing) return;
    refresh();
  }, [refresh, initializing]);

  const currentOrganization = useMemo(
    () => organizations.find((o) => o.id === currentOrganizationId) ?? null,
    [organizations, currentOrganizationId]
  );

  useEffect(() => {
    if (!currentOrganization) {
      setCurrentRole(null);
      return;
    }
    let cancelled = false;
    fetchMyRole(currentOrganization.id).then((role) => {
      if (!cancelled) setCurrentRole(role);
    });
    return () => {
      cancelled = true;
    };
  }, [currentOrganization]);

  const value = useMemo<OrgContextValue>(
    () => ({ organizations, currentOrganization, currentRole, setCurrentOrganizationId, loading, refresh }),
    [organizations, currentOrganization, currentRole, loading, refresh]
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within an OrgProvider');
  return ctx;
}
