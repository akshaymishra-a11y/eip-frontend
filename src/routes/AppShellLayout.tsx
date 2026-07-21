import { Outlet } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ProjectProvider, useProject } from '../lib/project-context';

// Mounted once per RequireOrg subtree (see App.tsx) instead of inside every
// page — pages used to each wrap themselves in <AppShell>, which meant the
// sidebar/topbar fully unmounted and remounted on every navigation (visible
// as a full-page flash that looked like a reload). ProjectProvider lives
// here too so project-scoped pages keep the same shell instance whether or
// not a projectId is present in the URL.
function Shell() {
  const { project } = useProject();
  return (
    <AppShell project={project}>
      <Outlet />
    </AppShell>
  );
}

export function AppShellLayout() {
  return (
    <ProjectProvider>
      <Shell />
    </ProjectProvider>
  );
}
