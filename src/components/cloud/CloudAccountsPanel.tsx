import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Icon, StatusPill } from '../ui';
import {
  createCloudAccount,
  deleteCloudAccount,
  fetchCloudAccounts,
  syncCloudAccount,
  updateCloudAccount,
} from '../../lib/api';
import type { CloudAccount, CloudAccountAuthMethod, CloudProvider } from '../../lib/types';
import { useConfirm } from '../../lib/confirm-context';
import { describeSupabaseError, humanizeCloudSyncError } from '../../lib/errors';

// Module 1 (docs/CLOUD_INTELLIGENCE_PLATFORM_DESIGN.md §3, widened for
// multi-cloud by docs/MULTI_CLOUD_ARCHITECTURE_DESIGN.md) — minimal connector
// UI. Kept separate from IntegrationsPanel/project_integrations deliberately
// (same rationale as the backend's dedicated cloud_accounts table): cloud
// credentials are higher blast-radius than a SonarQube token, so this isn't
// folded into the generic integrations form.

const DEFAULT_REGIONS: Record<CloudProvider, string> = { aws: 'us-east-1', azure: 'eastus', gcp: 'us-central1' };

const AUTH_METHODS_BY_PROVIDER: Record<CloudProvider, CloudAccountAuthMethod[]> = {
  aws: ['iam_role', 'access_key'],
  // Azure/GCP v1 are credential-based only (Service Principal / Service
  // Account key) — no federated-identity equivalent of AWS's iam_role in
  // this round (docs/MULTI_CLOUD_ARCHITECTURE_DESIGN.md scope decision).
  azure: ['service_principal'],
  gcp: ['service_account_key'],
};

function inputClass() {
  return 'w-full h-10 px-3 bg-white border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all';
}

function timeAgo(iso: string | null) {
  if (!iso) return 'Never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const SYNC_STATUS_TONE: Record<CloudAccount['sync_status'], 'success' | 'warning' | 'danger' | 'neutral'> = {
  ok: 'success',
  syncing: 'warning',
  error: 'danger',
  pending: 'neutral',
};

export function CloudAccountsPanel({ projectId }: { projectId: string }) {
  const confirm = useConfirm();
  const [accounts, setAccounts] = useState<CloudAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdTrustPolicy, setCreatedTrustPolicy] = useState<{ accountId: string; policy: string } | null>(null);
  const [expandedErrorAccountId, setExpandedErrorAccountId] = useState<string | null>(null);

  const [provider, setProvider] = useState<CloudProvider>('aws');
  const [accountIdentifier, setAccountIdentifier] = useState('');
  const [accountAlias, setAccountAlias] = useState('');
  const [authMethod, setAuthMethod] = useState<CloudAccountAuthMethod>('iam_role');
  const [roleArn, setRoleArn] = useState('');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [serviceAccountKeyJson, setServiceAccountKeyJson] = useState('');
  const [regionsInput, setRegionsInput] = useState(DEFAULT_REGIONS.aws);

  const handleProviderChange = (next: CloudProvider) => {
    setProvider(next);
    setAuthMethod(AUTH_METHODS_BY_PROVIDER[next][0]);
    setRegionsInput(DEFAULT_REGIONS[next]);
  };

  const load = useCallback(async () => {
    const rows = await fetchCloudAccounts(projectId);
    setAccounts(rows);
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(describeSupabaseError(err, 'Could not load cloud accounts — only org owners/admins can see this.')))
      .finally(() => setLoading(false));
  }, [load]);

  const resetForm = () => {
    setProvider('aws');
    setAccountIdentifier('');
    setAccountAlias('');
    setAuthMethod('iam_role');
    setRoleArn('');
    setAccessKeyId('');
    setSecretAccessKey('');
    setTenantId('');
    setClientId('');
    setClientSecret('');
    setServiceAccountKeyJson('');
    setRegionsInput(DEFAULT_REGIONS.aws);
  };

  const handleAdd = async () => {
    setError(null);
    const connectedRegions = regionsInput
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    if (provider === 'aws' && !/^\d{12}$/.test(accountIdentifier.trim())) {
      setError('Account identifier must be a 12-digit AWS account id.');
      return;
    }
    if (provider === 'azure' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountIdentifier.trim())) {
      setError('Account identifier must be an Azure subscription ID (a UUID).');
      return;
    }
    if (provider === 'gcp' && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(accountIdentifier.trim())) {
      setError('Account identifier must be a GCP project ID (lowercase letters, digits, hyphens, 6-30 chars).');
      return;
    }
    if (!connectedRegions.length) {
      setError('At least one region is required.');
      return;
    }
    if (authMethod === 'access_key' && (!accessKeyId.trim() || !secretAccessKey.trim())) {
      setError('Access key ID and secret access key are both required for the access key method.');
      return;
    }
    if (authMethod === 'service_principal' && (!tenantId.trim() || !clientId.trim() || !clientSecret.trim())) {
      setError('Tenant ID, client ID, and client secret are all required for the Service Principal method.');
      return;
    }
    if (authMethod === 'service_account_key' && !serviceAccountKeyJson.trim()) {
      setError('A Service Account JSON key is required.');
      return;
    }

    setSaving(true);
    try {
      const created = await createCloudAccount(projectId, {
        provider,
        accountIdentifier: accountIdentifier.trim(),
        accountAlias: accountAlias.trim() || undefined,
        authMethod,
        roleArn: authMethod === 'iam_role' && roleArn.trim() ? roleArn.trim() : undefined,
        accessKeyId: authMethod === 'access_key' ? accessKeyId.trim() : undefined,
        secretAccessKey: authMethod === 'access_key' ? secretAccessKey.trim() : undefined,
        tenantId: authMethod === 'service_principal' ? tenantId.trim() : undefined,
        clientId: authMethod === 'service_principal' ? clientId.trim() : undefined,
        clientSecret: authMethod === 'service_principal' ? clientSecret.trim() : undefined,
        serviceAccountKeyJson: authMethod === 'service_account_key' ? serviceAccountKeyJson.trim() : undefined,
        connectedRegions,
      });
      if (created.trustPolicy) {
        setCreatedTrustPolicy({ accountId: created.id, policy: JSON.stringify(created.trustPolicy, null, 2) });
      }
      setShowForm(false);
      resetForm();
      await load();
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not save cloud account.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async (id: string) => {
    try {
      await syncCloudAccount(id);
      await load();
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not trigger sync.'));
    }
  };

  const handleToggleEnabled = async (account: CloudAccount) => {
    try {
      await updateCloudAccount(account.id, { enabled: !account.enabled });
      await load();
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not update account.'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ message: 'Remove this cloud account? Discovery for it will stop immediately.', tone: 'danger', confirmLabel: 'Remove' })))
      return;
    try {
      await deleteCloudAccount(id);
      await load();
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not remove cloud account.'));
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Connected Cloud Accounts</h2>
          <p className="text-xs text-text-secondary">
            Connect an AWS account, Azure subscription, or GCP project to automatically discover its infrastructure. AWS IAM role
            (preferred) never requires storing a long-lived secret. Only visible to org owners/admins.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setShowForm((v) => !v)}>
          <Icon name={showForm ? 'close' : 'add'} className="text-[16px]" />
          {showForm ? 'Cancel' : 'Connect Account'}
        </Button>
      </div>

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      {createdTrustPolicy && (
        <div className="mt-4 border border-warning/40 bg-warning/5 rounded-lg p-4">
          <p className="text-xs font-semibold text-text-primary mb-1">Trust policy for account {createdTrustPolicy.accountId}</p>
          <p className="text-xs text-text-secondary mb-2">
            Create an IAM role in your AWS account with this trust policy, attach a read-only policy for the resource types you
            want discovered, then edit this account below with the resulting role ARN to activate discovery.
          </p>
          <pre className="text-[11px] bg-white border border-border rounded p-3 overflow-auto max-h-56">{createdTrustPolicy.policy}</pre>
          <Button type="button" variant="secondary" className="mt-2" onClick={() => setCreatedTrustPolicy(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {showForm && (
        <div className="mt-4 border border-border rounded-lg p-4 space-y-3">
          <div>
            <label className="text-xs text-text-secondary block mb-1">Provider</label>
            <select value={provider} onChange={(e) => handleProviderChange(e.target.value as CloudProvider)} className={inputClass()}>
              <option value="aws">AWS</option>
              <option value="azure">Azure</option>
              <option value="gcp">GCP</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-secondary block mb-1">
                {provider === 'aws' ? 'AWS Account ID' : provider === 'azure' ? 'Azure Subscription ID' : 'GCP Project ID'}
              </label>
              <input
                value={accountIdentifier}
                onChange={(e) => setAccountIdentifier(e.target.value)}
                placeholder={
                  provider === 'aws' ? '123456789012' : provider === 'azure' ? 'e.g. 11111111-2222-3333-4444-555555555555' : 'my-project-123'
                }
                className={inputClass()}
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1">Alias (optional)</label>
              <input value={accountAlias} onChange={(e) => setAccountAlias(e.target.value)} placeholder="prod" className={inputClass()} />
            </div>
          </div>

          {provider === 'aws' && (
            <div>
              <label className="text-xs text-text-secondary block mb-1">Connection method</label>
              <select value={authMethod} onChange={(e) => setAuthMethod(e.target.value as CloudAccountAuthMethod)} className={inputClass()}>
                <option value="iam_role">IAM role (preferred — no long-lived secret stored)</option>
                <option value="access_key">Access key (fallback)</option>
              </select>
            </div>
          )}

          {authMethod === 'iam_role' && (
            <div>
              <label className="text-xs text-text-secondary block mb-1">Role ARN (leave blank to get the trust policy first)</label>
              <input
                value={roleArn}
                onChange={(e) => setRoleArn(e.target.value)}
                placeholder="arn:aws:iam::123456789012:role/eip-discovery"
                className={inputClass()}
              />
            </div>
          )}

          {authMethod === 'access_key' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-secondary block mb-1">Access key ID</label>
                <input value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} className={inputClass()} />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Secret access key</label>
                <input type="password" value={secretAccessKey} onChange={(e) => setSecretAccessKey(e.target.value)} className={inputClass()} />
              </div>
            </div>
          )}

          {authMethod === 'service_principal' && (
            <div className="space-y-3">
              <p className="text-xs text-text-secondary">
                Create a Service Principal (<code>az ad sp create-for-rbac</code>) and grant it Reader + Cost Management Reader +
                Monitor Reader at the subscription scope — EIP never requests write access.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-secondary block mb-1">Tenant ID</label>
                  <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} className={inputClass()} />
                </div>
                <div>
                  <label className="text-xs text-text-secondary block mb-1">Client ID</label>
                  <input value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputClass()} />
                </div>
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Client secret</label>
                <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} className={inputClass()} />
              </div>
            </div>
          )}

          {authMethod === 'service_account_key' && (
            <div className="space-y-2">
              <p className="text-xs text-text-secondary">
                Create a Service Account and grant it Viewer + Security Reviewer (or a narrower read-only role) at the project
                scope, then paste the whole downloaded JSON key file below — EIP never requests write access.
              </p>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Service account JSON key</label>
                <textarea
                  value={serviceAccountKeyJson}
                  onChange={(e) => setServiceAccountKeyJson(e.target.value)}
                  rows={4}
                  placeholder={'{ "type": "service_account", "client_email": "...", "private_key": "...", ... }'}
                  className={`${inputClass()} h-auto font-mono text-xs`}
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-text-secondary block mb-1">Regions (comma-separated)</label>
            <input
              value={regionsInput}
              onChange={(e) => setRegionsInput(e.target.value)}
              placeholder={provider === 'aws' ? 'us-east-1, eu-west-1' : provider === 'azure' ? 'eastus, westeurope' : 'us-central1, europe-west1'}
              className={inputClass()}
            />
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleAdd} disabled={saving}>
              {saving ? 'Saving…' : 'Connect Account'}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 divide-y divide-border">
        {!loading && accounts.length === 0 && <p className="text-sm text-text-secondary py-4">No cloud accounts connected yet.</p>}
        {accounts.map((account) => {
          const humanizedError = account.last_error ? humanizeCloudSyncError(account.last_error) : null;
          const expanded = expandedErrorAccountId === account.id;
          // sync_status='error' just means "at least one collector failed" —
          // when every failure humanizes to an informational tone (a known
          // environmental condition like a network-blocked resource type,
          // not an account misconfiguration) the rest of discovery still
          // succeeded, so this shows as a soft "partial" pill instead of a
          // hard red "error" one.
          const isSoftError = account.sync_status === 'error' && humanizedError?.tone === 'info';
          const pillTone = isSoftError ? 'warning' : SYNC_STATUS_TONE[account.sync_status];
          const pillLabel = isSoftError ? 'partial' : account.sync_status;
          return (
          <div key={account.id} className="py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text-primary truncate">
                  {account.account_alias || account.account_identifier}
                  <span className="ml-2 text-xs font-normal text-text-secondary">{account.account_identifier}</span>
                </div>
                <div className="text-xs text-text-secondary">
                  {account.provider === 'azure' ? 'Azure' : account.provider === 'gcp' ? 'GCP' : 'AWS'} ·{' '}
                  {account.auth_method === 'iam_role'
                    ? 'IAM role'
                    : account.auth_method === 'access_key'
                      ? 'Access key'
                      : account.auth_method === 'service_principal'
                        ? 'Service Principal'
                        : 'Service Account key'}{' '}
                  · {account.connected_regions.join(', ')} · last discovery {timeAgo(account.last_discovery_at)}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusPill tone={pillTone}>{pillLabel}</StatusPill>
                <Button type="button" variant="secondary" onClick={() => handleSync(account.id)}>
                  <Icon name="sync" className="text-[16px]" />
                  Sync
                </Button>
                <button
                  type="button"
                  onClick={() => handleToggleEnabled(account)}
                  className="text-xs text-text-secondary hover:text-text-primary px-2"
                >
                  {account.enabled ? 'Disable' : 'Enable'}
                </button>
                <button type="button" onClick={() => handleDelete(account.id)} className="text-text-muted hover:text-danger p-1">
                  <Icon name="delete" className="text-[18px]" />
                </button>
              </div>
            </div>
            {humanizedError && (
              <div
                className={`mt-2 w-full max-w-xl min-h-[2.75rem] max-h-48 overflow-y-auto rounded-md border px-3 py-2 flex items-start gap-2 ${
                  humanizedError.tone === 'info' ? 'border-warning/40 bg-warning/5' : 'border-danger/40 bg-danger/5'
                }`}
              >
                <Icon
                  name="info"
                  className={`text-[16px] mt-0.5 shrink-0 ${humanizedError.tone === 'info' ? 'text-warning' : 'text-danger'}`}
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-xs ${humanizedError.tone === 'info' ? 'text-warning' : 'text-danger'}`}>
                    {humanizedError.summary}
                    {humanizedError.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setExpandedErrorAccountId(expanded ? null : account.id)}
                        className="ml-1.5 underline hover:no-underline"
                      >
                        {expanded ? 'Hide details' : 'Show details'}
                      </button>
                    )}
                  </p>
                  {expanded && humanizedError.items.length > 1 && (
                    <ul className="mt-2 space-y-1 border-l-2 border-border pl-3">
                      {humanizedError.items.map((item, i) => (
                        <li key={i} className={`text-xs ${item.tone === 'info' ? 'text-warning' : 'text-danger'}`}>
                          {item.label ? <span className="font-medium">{item.label}: </span> : null}
                          {item.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
          );
        })}
      </div>
    </Card>
  );
}
