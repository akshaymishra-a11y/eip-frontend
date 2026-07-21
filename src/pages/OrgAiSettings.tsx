import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Icon, PageHeader, StatusPill } from '../components/ui';
import { Loader } from '../components/Loader';
import {
  deleteOrganizationAiConfig,
  fetchOrganizationAiConfig,
  saveOrganizationAiConfig,
  testAiProviderKey,
} from '../lib/api';
import { AI_PROVIDERS, defaultModelFor } from '../lib/ai-providers';
import { useConfirm } from '../lib/confirm-context';
import { describeSupabaseError } from '../lib/errors';
import { useOrg } from '../lib/org-context';
import type { AiProviderName, OrganizationAiConfig } from '../lib/types';

function inputClass() {
  return 'w-full h-10 px-3 bg-white border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all';
}

export default function OrgAiSettings() {
  const { currentOrganization, currentRole } = useOrg();
  const confirm = useConfirm();
  const isOrgAdmin = currentRole === 'owner' || currentRole === 'admin';

  const [config, setConfig] = useState<OrganizationAiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<AiProviderName>('gemini');
  const [model, setModel] = useState(defaultModelFor('gemini'));
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    if (!currentOrganization) return;
    const data = await fetchOrganizationAiConfig(currentOrganization.id);
    setConfig(data);
    if (data.provider) {
      setProvider(data.provider);
      setModel(data.model ?? defaultModelFor(data.provider));
    }
  }, [currentOrganization]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(describeSupabaseError(err, 'Could not load AI settings.')))
      .finally(() => setLoading(false));
  }, [load]);

  const handleProviderChange = (next: AiProviderName) => {
    setProvider(next);
    setModel(defaultModelFor(next));
    setTestResult(null);
  };

  const handleTest = async () => {
    if (!currentOrganization) return;
    if (!apiKey.trim()) {
      setError('Enter an API key to test.');
      return;
    }
    setError(null);
    setTestResult(null);
    setTesting(true);
    try {
      await testAiProviderKey(currentOrganization.id, { provider, model, apiKey: apiKey.trim() });
      setTestResult('ok');
    } catch (err) {
      setTestResult('error');
      setError(describeSupabaseError(err, 'Could not verify this key.'));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!currentOrganization) return;
    if (!apiKey.trim()) {
      setError('Enter an API key to save — it is never pre-filled back in for security, so it needs to be re-entered any time you change provider, model, or key.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const saved = await saveOrganizationAiConfig(currentOrganization.id, { provider, model, apiKey: apiKey.trim() });
      setConfig(saved);
      setApiKey('');
      setTestResult(null);
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not save this AI configuration.'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!currentOrganization) return;
    if (!(await confirm({ message: 'Revert to the platform default AI provider? Your saved key will be deleted.', tone: 'danger', confirmLabel: 'Revert' })))
      return;
    setError(null);
    setRemoving(true);
    try {
      await deleteOrganizationAiConfig(currentOrganization.id);
      setConfig({ provider: null, model: null, enabled: false, configured: false });
      setApiKey('');
      setTestResult(null);
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not revert to the platform default.'));
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <>
        <Loader fullScreen={false} messages={['Loading AI settings...']} />
      </>
    );
  }

  const selectedProviderOption = AI_PROVIDERS.find((p) => p.id === provider)!;

  return (
    <>
      <PageHeader
        title="AI Settings"
        subtitle="Bring your own AI provider and key — used instead of the platform default for this organization's AI features (error summaries, root-cause analysis, requirements extraction, executive summaries)."
      />

      {!isOrgAdmin ? (
        <Card className="p-6">
          <p className="text-sm text-text-secondary">
            Only an organization owner or admin can view or change AI provider settings. Contact your org admin if you'd like this
            changed.
          </p>
        </Card>
      ) : (
        <>
          <Card className="p-5 mb-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-base font-semibold text-text-primary mb-1">Current Configuration</h2>
                {config?.configured ? (
                  <p className="text-sm text-text-secondary">
                    Using <span className="font-medium text-text-primary">{AI_PROVIDERS.find((p) => p.id === config.provider)?.label}</span> —{' '}
                    <span className="font-mono text-xs">{config.model}</span>
                  </p>
                ) : (
                  <p className="text-sm text-text-secondary">Using the platform's default AI provider.</p>
                )}
              </div>
              <StatusPill tone={config?.configured ? 'success' : 'neutral'}>
                {config?.configured ? 'Custom key configured' : 'Platform default'}
              </StatusPill>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold text-text-primary mb-1">Configure a Provider</h2>
            <p className="text-xs text-text-secondary mb-4">
              Your API key is encrypted at rest and never shown again after saving — you'll need to re-enter it any time you change
              provider, model, or key.
            </p>

            {error && (
              <div className="flex items-start gap-2 mb-4 text-sm text-danger bg-danger-light rounded-md px-3 py-2.5">
                <Icon name="error" className="text-[18px] shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Provider</label>
                <select
                  className={inputClass()}
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value as AiProviderName)}
                >
                  {AI_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Model</label>
                <select className={inputClass()} value={model} onChange={(e) => setModel(e.target.value)}>
                  {selectedProviderOption.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">API Key</label>
              <input
                type="password"
                className={inputClass()}
                placeholder="Paste your API key"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestResult(null);
                }}
                autoComplete="off"
              />
            </div>

            {testResult === 'ok' && (
              <div className="flex items-center gap-2 mb-4 text-sm text-success bg-success-light rounded-md px-3 py-2.5">
                <Icon name="check_circle" className="text-[18px]" />
                <span>Key verified — this provider/model combination works.</span>
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="secondary" type="button" onClick={handleTest} disabled={testing || saving}>
                <Icon name="bolt" className="text-[16px]" />
                {testing ? 'Testing...' : 'Test Connection'}
              </Button>
              <Button variant="primary" type="button" onClick={handleSave} disabled={saving || testing}>
                <Icon name="save" className="text-[16px]" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
              {config?.configured && (
                <Button variant="ghost" type="button" onClick={handleRemove} disabled={removing}>
                  <Icon name="undo" className="text-[16px]" />
                  {removing ? 'Reverting...' : 'Revert to Platform Default'}
                </Button>
              )}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
