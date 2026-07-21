import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Card, Icon, KpiCard, PageHeader } from '../components/ui';
import { fetchOrganizationMembers, fetchPendingInvites, inviteMember, removeMember, revokeInvite } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useConfirm } from '../lib/confirm-context';
import { describeSupabaseError } from '../lib/errors';
import { useOrg } from '../lib/org-context';
import type { OrganizationMember, OrganizationRole, OrgInvite } from '../lib/types';

const ROLE_BADGE_CLASSES: Record<OrganizationRole, string> = {
  owner: 'bg-primary-light text-primary',
  admin: 'bg-warning-light text-warning',
  member: 'bg-background text-text-secondary',
};

const ROLE_INFO: { role: OrganizationRole; label: string; description: string }[] = [
  { role: 'owner', label: 'Owner', description: 'Full access to all resources, billing, and organization settings. Can manage all users.' },
  { role: 'admin', label: 'Admin', description: 'Can invite and remove members, and manage projects. Cannot delete the organization.' },
  { role: 'member', label: 'Member', description: 'Can view and work within projects. Cannot manage team membership or billing.' },
];

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function exportMembersCsv(orgName: string, members: OrganizationMember[]) {
  const header = 'Name,Email,Role\n';
  const rows = members
    .map((m) => `"${m.profile?.full_name ?? ''}","${m.profile?.email ?? ''}",${m.role}`)
    .join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${orgName || 'organization'}-team.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TeamManagement() {
  const { user } = useAuth();
  const { currentOrganization, currentRole } = useOrg();
  const confirm = useConfirm();
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = currentRole === 'owner' || currentRole === 'admin';

  const load = useCallback(async () => {
    if (!currentOrganization) return;
    const [memberData, inviteData] = await Promise.all([
      fetchOrganizationMembers(currentOrganization.id),
      fetchPendingInvites(currentOrganization.id),
    ]);
    setMembers(memberData);
    setInvites(inviteData);
  }, [currentOrganization]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    try {
      await inviteMember(currentOrganization.id, inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      await load();
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not send invite.'));
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!currentOrganization) return;
    if (!(await confirm({ message: 'Remove this member from the organization?', tone: 'danger', confirmLabel: 'Remove' }))) return;
    try {
      await removeMember(currentOrganization.id, userId);
      await load();
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not remove member.'));
    }
  };

  const handleRevoke = async (inviteId: string) => {
    try {
      await revokeInvite(inviteId);
      await load();
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not revoke invite.'));
    }
  };

  return (
    <>
      <PageHeader
        title="Team Management"
        subtitle={currentOrganization ? `Manage members of ${currentOrganization.name}.` : undefined}
        actions={
          members.length > 0 ? (
            <Button variant="secondary" onClick={() => exportMembersCsv(currentOrganization?.name ?? '', members)}>
              <Icon name="download" className="text-[18px]" />
              Export CSV
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 max-w-5xl">
        <KpiCard label="Total Members" value={members.length} icon="group" />
        <KpiCard label="Pending Invites" value={invites.length} icon="mail" deltaTone={invites.length > 0 ? 'warning' : 'success'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl">
        <div className="lg:col-span-2 space-y-6">
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">Members ({members.length})</h2>
            </div>
            {!loading && members.length === 0 ? (
              <p className="p-5 text-sm text-text-secondary">No members found.</p>
            ) : (
              <div className="divide-y divide-border">
                {members.map((member) => {
                  const displayName = member.profile?.full_name || member.profile?.email || member.user_id;
                  return (
                    <div key={member.user_id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                          {initials(displayName)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {displayName}
                            {member.user_id === user?.id && <span className="text-text-secondary font-normal"> (you)</span>}
                          </p>
                          <p className="text-xs text-text-secondary truncate">{member.profile?.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE_CLASSES[member.role]}`}>
                          {member.role}
                        </span>
                        {canManage && member.role !== 'owner' && member.user_id !== user?.id && (
                          <button
                            type="button"
                            onClick={() => handleRemove(member.user_id)}
                            className="text-text-muted hover:text-danger"
                            title="Remove member"
                          >
                            <Icon name="person_remove" className="text-[18px]" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {invites.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="text-base font-semibold text-text-primary">Pending Invites ({invites.length})</h2>
              </div>
              <div className="divide-y divide-border">
                {invites.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{invite.email}</p>
                      <p className="text-xs text-text-secondary">Invited {new Date(invite.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE_CLASSES[invite.role]}`}>{invite.role}</span>
                      {canManage && (
                        <button type="button" onClick={() => handleRevoke(invite.id)} className="text-text-muted hover:text-danger" title="Revoke invite">
                          <Icon name="close" className="text-[18px]" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {canManage && (
          <Card className="p-5 h-fit">
            <h2 className="text-base font-semibold text-text-primary mb-3">Invite Member</h2>
            <form onSubmit={handleInvite} className="space-y-3">
              <input
                type="email"
                required
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
                className="w-full h-10 px-3 bg-white border border-border rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button type="submit" variant="primary" className="w-full" disabled={inviting}>
                {inviting ? 'Sending…' : 'Send Invite'}
              </Button>
            </form>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 max-w-5xl">
        {ROLE_INFO.map((r) => (
          <Card key={r.role} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-text-primary">{r.label}</h3>
              <span className="text-xs text-text-secondary">
                {members.filter((m) => m.role === r.role).length} member{members.filter((m) => m.role === r.role).length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">{r.description}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
