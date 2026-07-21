import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Icon } from '../../components/ui';
import { IntegrationsPanel } from '../../components/IntegrationsPanel';
import {
  addIpAllowlistEntry,
  archiveProject,
  deleteProject,
  fetchIpAllowlist,
  fetchMyProjectRole,
  fetchMyRole,
  fetchProjectMembers,
  fetchProjectPendingInvites,
  inviteProjectMember,
  regenerateProjectApiKey,
  removeIpAllowlistEntry,
  removeProjectMember,
  revokeProjectInvite,
  unarchiveProject,
  updateProjectAccessScope,
} from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { useConfirm } from '../../lib/confirm-context';
import { describeSupabaseError } from '../../lib/errors';
import { useProject } from '../../lib/project-context';
import type { AccessScope, IpAllowlistEntry, OrganizationRole, ProjectInvite, ProjectMember, ProjectRole } from '../../lib/types';

const ACCESS_SCOPES: { value: AccessScope; label: string; description: string; icon: string; tone: 'success' | 'warning' | 'danger' }[] = [
  {
    value: 'read_only',
    label: 'Read-only Access',
    description: 'Telemetry data retrieval and monitoring only. No config changes.',
    icon: 'visibility',
    tone: 'success',
  },
  {
    value: 'standard',
    label: 'Standard Operator',
    description: 'Update infra configs and manage service lifecycles.',
    icon: 'build',
    tone: 'warning',
  },
  {
    value: 'full',
    label: 'Full Access (Admin)',
    description: 'Unrestricted access including billing and user management.',
    icon: 'admin_panel_settings',
    tone: 'danger',
  },
];

const SCOPE_CHIP_CLASSES: Record<'success' | 'warning' | 'danger', string> = {
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  danger: 'bg-danger-light text-danger',
};

const CIDR_PATTERN = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-b-0">
      <span className="text-sm text-text-primary">{label}</span>
      <span className="text-sm text-text-secondary capitalize">{value}</span>
    </div>
  );
}

export default function ProjectSettings() {
  const { project, refresh } = useProject();
  const { user } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invites, setInvites] = useState<ProjectInvite[]>([]);
  const [myProjectRole, setMyProjectRole] = useState<ProjectRole | null>(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingScope, setSavingScope] = useState(false);
  const [ipEntries, setIpEntries] = useState<IpAllowlistEntry[]>([]);
  const [ipLoading, setIpLoading] = useState(true);
  const [ipLabel, setIpLabel] = useState('');
  const [ipCidr, setIpCidr] = useState('');
  const [ipError, setIpError] = useState<string | null>(null);
  const [ipSaving, setIpSaving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ProjectRole>('member');
  const [inviting, setInviting] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [orgRoleForProject, setOrgRoleForProject] = useState<OrganizationRole | null>(null);
  const [orgRoleError, setOrgRoleError] = useState<string | null>(null);

  // Deliberately scoped to *this project's own* organization_id, not
  // whatever org happens to be selected in the global org switcher
  // (useOrg()'s currentOrganization) — those two can differ for any user
  // with more than one org, silently hiding this section from a genuine
  // owner/admin just because a different org was last active in the
  // switcher. This was a real bug: fixed 2026-07-13 after a user reported
  // being an org owner but not seeing the Integrations panel. A previous
  // version of this fetch had no .catch(), so a failed request here (401/
  // network/etc.) would leave orgRoleForProject stuck at null forever with
  // zero visible indication why the panel below wasn't showing — surfacing
  // it now instead of silently swallowing it.
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    fetchMyRole(project.organization_id)
      .then((role) => {
        if (cancelled) return;
        setOrgRoleForProject(role);
        setOrgRoleError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[ProjectSettings] fetchMyRole failed:', err);
        setOrgRoleError(describeSupabaseError(err, 'Could not verify your organization role.'));
      });
    return () => {
      cancelled = true;
    };
  }, [project]);

  const loadMembers = useCallback(async () => {
    if (!project) return;
    const [memberRows, inviteRows, role] = await Promise.all([
      fetchProjectMembers(project.id),
      fetchProjectPendingInvites(project.id),
      fetchMyProjectRole(project.id),
    ]);
    setMembers(memberRows);
    setInvites(inviteRows);
    setMyProjectRole(role);
  }, [project]);

  const loadIpAllowlist = useCallback(async () => {
    if (!project) return;
    const entries = await fetchIpAllowlist(project.id);
    setIpEntries(entries);
  }, [project]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    setIpLoading(true);
    loadIpAllowlist().finally(() => setIpLoading(false));
  }, [loadIpAllowlist]);

  if (!project) {
    return (
      <>
        <div className="py-16 text-center text-text-secondary text-sm">Loading…</div>
      </>
    );
  }

  const isOrgAdmin = orgRoleForProject === 'owner' || orgRoleForProject === 'admin';
  const canManageTeam = isOrgAdmin || myProjectRole === 'admin';

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setTeamError(null);
    try {
      await inviteProjectMember(project.id, inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      await loadMembers();
    } catch (err) {
      setTeamError(describeSupabaseError(err, 'Could not send invite.'));
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!(await confirm({ message: 'Remove this member from the project?', tone: 'danger', confirmLabel: 'Remove' }))) return;
    try {
      await removeProjectMember(project.id, userId);
      await loadMembers();
    } catch (err) {
      setTeamError(describeSupabaseError(err, 'Could not remove member.'));
    }
  };

  const handleRevokeProjectInvite = async (inviteId: string) => {
    try {
      await revokeProjectInvite(inviteId);
      await loadMembers();
    } catch (err) {
      setTeamError(describeSupabaseError(err, 'Could not revoke invite.'));
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(project.api_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateKey = async () => {
    if (!(await confirm({ message: 'The current key will stop working immediately. Continue?', tone: 'danger', confirmLabel: 'Regenerate' })))
      return;
    setRegenerating(true);
    setError(null);
    try {
      await regenerateProjectApiKey(project);
      await refresh();
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not regenerate key.'));
    } finally {
      setRegenerating(false);
    }
  };

  const handleArchiveToggle = async () => {
    const archiving = project.status === 'active';
    const confirmMsg = archiving
      ? 'Archived projects are hidden from the project list by default. You can unarchive it later.'
      : 'This project will show up in the active project list again.';
    if (!(await confirm({ title: archiving ? 'Archive this project?' : 'Unarchive this project?', message: confirmMsg, confirmLabel: archiving ? 'Archive' : 'Unarchive' })))
      return;
    try {
      if (archiving) await archiveProject(project.id);
      else await unarchiveProject(project.id);
      await refresh();
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not update project.'));
    }
  };

  const handleDelete = async () => {
    if (
      !(await confirm({
        title: 'Delete this project?',
        message: 'This permanently deletes the project and all of its telemetry. This cannot be undone.',
        tone: 'danger',
        confirmLabel: 'Delete Project',
      }))
    )
      return;
    try {
      await deleteProject(project.id);
      navigate('/projects', { replace: true });
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not delete project.'));
    }
  };

  const handleAccessScopeChange = async (scope: AccessScope) => {
    setSavingScope(true);
    setError(null);
    try {
      await updateProjectAccessScope(project.id, scope);
      await refresh();
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not update access scope.'));
    } finally {
      setSavingScope(false);
    }
  };

  const handleAddIpEntry = async () => {
    const label = ipLabel.trim();
    const cidr = ipCidr.trim();
    if (!label || !cidr) {
      setIpError('Both a label and a CIDR range are required.');
      return;
    }
    if (!CIDR_PATTERN.test(cidr)) {
      setIpError('CIDR must look like 192.168.1.0/24.');
      return;
    }
    setIpError(null);
    setIpSaving(true);
    try {
      await addIpAllowlistEntry(project.id, label, cidr);
      setIpLabel('');
      setIpCidr('');
      await loadIpAllowlist();
    } catch (err) {
      setIpError(describeSupabaseError(err, 'Could not add IP range.'));
    } finally {
      setIpSaving(false);
    }
  };

  const handleRemoveIpEntry = async (id: string) => {
    try {
      await removeIpAllowlistEntry(id);
      setIpEntries((entries) => entries.filter((e) => e.id !== id));
    } catch (err) {
      setIpError(describeSupabaseError(err, 'Could not remove IP range.'));
    }
  };

  return (
    <>
      <h1 className="text-2xl font-bold text-text-primary mb-6">Project Settings</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl">
        <Card className="p-5">
          <h2 className="text-base font-semibold text-text-primary mb-2">General</h2>
          <Row label="Project Name" value={project.name} />
          <Row label="Environment" value={project.environment} />
          <Row label="Status" value={project.status} />
          <Row label="Created" value={new Date(project.created_at).toLocaleDateString()} />
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold text-text-primary mb-3">API Key</h2>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-background border border-border rounded px-3 py-2.5 text-text-primary truncate font-mono">
              {project.api_key}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="w-10 h-10 shrink-0 flex items-center justify-center bg-background border border-border rounded hover:bg-border/40"
            >
              <Icon name={copied ? 'check' : 'content_copy'} className="text-[18px]" />
            </button>
          </div>
          <Button variant="secondary" className="w-full mt-3" onClick={handleRegenerateKey} disabled={regenerating} type="button">
            <Icon name="autorenew" className="text-[16px]" />
            {regenerating ? 'Regenerating…' : 'Regenerate Key'}
          </Button>
          <Link to={`/projects/${project.id}/sdk-setup`}>
            <Button variant="secondary" className="w-full mt-2" type="button">
              <Icon name="terminal" className="text-[16px]" />
              SDK Setup Instructions
            </Button>
          </Link>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-text-primary mb-1">Security &amp; Access</h2>
          <p className="text-xs text-text-secondary mb-5">Manage what this project's API key can do and which networks may use it.</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Access Scope</h3>
              <div className="space-y-2.5">
                {ACCESS_SCOPES.map((scope) => {
                  const selected = project.access_scope === scope.value;
                  return (
                    <button
                      key={scope.value}
                      type="button"
                      disabled={savingScope}
                      onClick={() => handleAccessScopeChange(scope.value)}
                      className={`w-full flex items-center gap-3.5 text-left border rounded-lg p-3.5 transition-colors disabled:opacity-60 ${
                        selected ? 'border-primary bg-primary-light' : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${SCOPE_CHIP_CLASSES[scope.tone]}`}>
                        <Icon name={scope.icon} className="text-[18px]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-text-primary">{scope.label}</div>
                        <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{scope.description}</p>
                      </div>
                      <span
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          selected ? 'border-primary bg-primary' : 'border-border'
                        }`}
                      >
                        {selected && <Icon name="check" className="text-white text-[12px]" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">IP Whitelisting (CIDR)</h3>
              <p className="text-xs text-text-secondary mb-3">
                Optional — restrict which networks may use this project's API key. Leave empty to allow any source.
              </p>

              <div className="flex flex-col sm:flex-row gap-2 mb-2">
                <input
                  placeholder="Label, e.g. Primary Corporate VPN"
                  value={ipLabel}
                  onChange={(e) => setIpLabel(e.target.value)}
                  className="flex-1 h-10 px-3 bg-white border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
                <input
                  placeholder="192.168.1.0/24"
                  value={ipCidr}
                  onChange={(e) => setIpCidr(e.target.value)}
                  className="w-full sm:w-36 h-10 px-3 bg-white border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
                <Button type="button" variant="secondary" onClick={handleAddIpEntry} disabled={ipSaving} className="shrink-0">
                  <Icon name="add" className="text-[18px]" />
                  Add
                </Button>
              </div>
              {ipError && <p className="text-xs text-danger mb-2">{ipError}</p>}

              {ipLoading ? (
                <p className="text-sm text-text-secondary">Loading…</p>
              ) : ipEntries.length === 0 ? (
                <div className="border border-dashed border-border rounded-lg p-4 text-center">
                  <p className="text-sm text-text-secondary">No IP ranges configured — any source can use this key.</p>
                </div>
              ) : (
                <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
                  {ipEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between px-3.5 py-2.5">
                      <div>
                        <div className="text-sm text-text-primary">{entry.label}</div>
                        <div className="text-xs text-text-secondary font-mono">{entry.cidr}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveIpEntry(entry.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-danger"
                      >
                        <Icon name="delete" className="text-[18px]" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        {orgRoleError && (
          <Card className="p-5 lg:col-span-2 border-danger/40">
            <p className="text-sm text-danger">
              Could not determine whether you're an org owner/admin for this project, so Integrations is hidden as a
              precaution: {orgRoleError}
            </p>
          </Card>
        )}
        {isOrgAdmin && <IntegrationsPanel projectId={project.id} />}

        <Card className="p-5">
          <h2 className="text-base font-semibold text-text-primary mb-1">Team Access</h2>
          <p className="text-xs text-text-secondary mb-2">Only people added here can see this project.</p>
          <button
            type="button"
            onClick={() => setShowMembers((v) => !v)}
            className="w-full flex items-center justify-between py-2 text-sm text-text-primary"
          >
            <span>Members</span>
            <span className="flex items-center gap-1 text-text-secondary">
              {members.length}
              <Icon name={showMembers ? 'expand_less' : 'chevron_right'} className="text-[18px]" />
            </span>
          </button>
          {showMembers && (
            <div className="mt-2 border-t border-border pt-3 space-y-4">
              <div className="space-y-1.5">
                {members.length === 0 ? (
                  <p className="text-sm text-text-secondary">No members found.</p>
                ) : (
                  members.map((m) => (
                    <div key={m.user_id} className="flex items-center justify-between text-sm">
                      <span className="text-text-primary truncate">
                        {m.profile?.full_name || m.profile?.email || m.user_id}
                        {m.user_id === user?.id && <span className="text-text-secondary"> (you)</span>}
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="text-text-secondary capitalize">{m.role}</span>
                        {canManageTeam && m.user_id !== user?.id && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(m.user_id)}
                            className="text-text-muted hover:text-danger"
                            title="Remove from project"
                          >
                            <Icon name="person_remove" className="text-[16px]" />
                          </button>
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {invites.length > 0 && (
                <div className="space-y-1.5 border-t border-border pt-3">
                  <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Pending Invites</p>
                  {invites.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between text-sm">
                      <span className="text-text-primary truncate">{invite.email}</span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="text-text-secondary capitalize">{invite.role}</span>
                        {canManageTeam && (
                          <button
                            type="button"
                            onClick={() => handleRevokeProjectInvite(invite.id)}
                            className="text-text-muted hover:text-danger"
                            title="Revoke invite"
                          >
                            <Icon name="close" className="text-[16px]" />
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {canManageTeam && (
                <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2 border-t border-border pt-3">
                  <input
                    type="email"
                    required
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1 h-9 px-3 bg-white border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as ProjectRole)}
                    className="h-9 px-3 bg-white border border-border rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <Button type="submit" variant="secondary" disabled={inviting} className="shrink-0">
                    {inviting ? 'Inviting…' : 'Invite'}
                  </Button>
                </form>
              )}
              {teamError && <p className="text-xs text-danger">{teamError}</p>}
            </div>
          )}
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="text-base font-semibold text-text-primary mb-1">Danger Zone</h2>
          <Button variant="secondary" className="w-full" onClick={handleArchiveToggle} type="button">
            <Icon name={project.status === 'active' ? 'archive' : 'unarchive'} className="text-[16px]" />
            {project.status === 'active' ? 'Archive Project' : 'Unarchive Project'}
          </Button>
          <Button variant="danger" className="w-full" onClick={handleDelete} type="button">
            <Icon name="delete_forever" className="text-[16px]" />
            Delete Project
          </Button>
        </Card>
      </div>

      {error && <p className="text-sm text-danger mt-4">{error}</p>}
    </>
  );
}
