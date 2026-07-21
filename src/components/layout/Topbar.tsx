import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth-context';
import { useOrg } from '../../lib/org-context';
import { Icon } from '../ui';
import { ProjectTabsBar } from './ProjectTabsBar';

export function Topbar({ activeProject }: { activeProject?: { id: string; name: string } | null }) {
  const { signOut } = useAuth();
  const { currentOrganization } = useOrg();
  const navigate = useNavigate();

  return (
    <>
      <header className="fixed top-0 right-0 left-sidebar h-topbar bg-surface border-b border-border/60 flex items-center justify-between px-6 z-30">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-text-primary">{currentOrganization?.name ?? 'Observability Engine'}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="w-9 h-9 flex items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary transition-colors"
            title="Notifications"
          >
            <Icon name="notifications" className="text-[20px]" />
          </button>
          <button
            type="button"
            onClick={() => {
              signOut();
              navigate('/login');
            }}
            className="w-9 h-9 flex items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-danger transition-colors"
            title="Sign out"
          >
            <Icon name="logout" className="text-[20px]" />
          </button>
        </div>
      </header>
      <ProjectTabsBar activeProject={activeProject} />
    </>
  );
}
