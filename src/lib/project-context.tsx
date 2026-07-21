import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { fetchProject } from './api';
import { describeSupabaseError } from './errors';
import { useOrg } from './org-context';
import type { Project } from './types';

type ProjectContextValue = {
  project: Project | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  const { setCurrentOrganizationId } = useOrg();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setProject(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProject(projectId);
      setProject(data);
    } catch (err) {
      setError(describeSupabaseError(err, 'Failed to load project'));
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Keeps "current organization" (used by the Topbar's org label and the
  // project tabs bar's per-org scoping) truthful to whatever project is
  // actually being viewed — there's no separate org-switcher UI, so without
  // this, opening a project from another org (e.g. via a pinned tab or
  // cross-org search result) would leave the Topbar/tabs bar showing the
  // previous org while displaying this org's project, and any newly-pinned
  // tab would get filed under the wrong org's bucket.
  useEffect(() => {
    if (project) setCurrentOrganizationId(project.organization_id);
  }, [project, setCurrentOrganizationId]);

  return (
    <ProjectContext.Provider value={{ project, loading, error, refresh }}>{children}</ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within a ProjectProvider');
  return ctx;
}
