import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Icon } from '../components/ui';
import { SdkInstructions } from '../components/SdkInstructions';
import { addIpAllowlistEntry, createProject, generateApiKey, getOrgProjectUsage, type OrgProjectUsage } from '../lib/api';
import { describeSupabaseError } from '../lib/errors';
import { useOrg } from '../lib/org-context';
import type { AccessScope, Environment } from '../lib/types';

const STEPS = ['Project Details', 'Environment', 'Security & Access'];

const ENVIRONMENTS: { value: Environment; label: string; description: string; icon: string }[] = [
  { value: 'production', label: 'Production', description: 'High availability, automatic backups, suitable for live traffic.', icon: 'bolt' },
  { value: 'staging', label: 'Staging', description: 'Mirror of production for final testing before deployment.', icon: 'science' },
  { value: 'development', label: 'Development', description: 'Isolated environment for building and debugging features.', icon: 'code' },
];

const ACCESS_SCOPES: { value: AccessScope; label: string; description: string }[] = [
  { value: 'read_only', label: 'Read-only Access', description: 'Telemetry data retrieval and monitoring only. No config changes.' },
  { value: 'standard', label: 'Standard Operator', description: 'Update infra configs and manage service lifecycles.' },
  { value: 'full', label: 'Full Access (Admin)', description: 'Unrestricted access including billing and user management.' },
];

const CIDR_PATTERN = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;

type PendingIpEntry = { key: string; label: string; cidr: string };

const GUIDELINES = [
  {
    icon: 'label',
    tone: 'success' as const,
    title: 'Naming Convention',
    body: 'Use kebab-case for project names — it keeps things consistent with the API key and any infrastructure identifiers generated from it.',
  },
  {
    icon: 'info',
    tone: 'warning' as const,
    title: 'Choosing an Environment',
    body: 'The environment you pick here just labels the project — you can create separate projects per environment if you want isolated dashboards and alerts.',
  },
  {
    icon: 'vpn_key',
    tone: 'neutral' as const,
    title: 'API Key Security',
    body: 'Your API key is shown only once. Store it in a secrets manager or .env file — if it leaks, generate a new project and rotate.',
  },
];

const GUIDELINE_TONE_CLASSES: Record<'success' | 'warning' | 'neutral', string> = {
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  neutral: 'bg-primary-light text-primary',
};

function Stepper({ steps, currentIndex }: { steps: string[]; currentIndex: number }) {
  return (
    <div className="flex items-center mb-8">
      {steps.map((label, i) => (
        <div key={label} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
          <div className="flex items-center gap-2.5 shrink-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                i < currentIndex
                  ? 'bg-primary text-white'
                  : i === currentIndex
                    ? 'bg-primary text-white ring-4 ring-primary-light'
                    : 'bg-surface border border-border text-text-secondary'
              }`}
            >
              {i < currentIndex ? <Icon name="check" className="text-[16px]" /> : i + 1}
            </div>
            <span className={`text-sm font-semibold whitespace-nowrap ${i <= currentIndex ? 'text-text-primary' : 'text-text-secondary'}`}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-4 ${i < currentIndex ? 'bg-primary' : 'bg-border'}`} />}
        </div>
      ))}
    </div>
  );
}

export default function CreateProjectWizard() {
  const { currentOrganization } = useOrg();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [environment, setEnvironment] = useState<Environment>('development');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [accessScope, setAccessScope] = useState<AccessScope>('read_only');
  const [ipEntries, setIpEntries] = useState<PendingIpEntry[]>([]);
  const [ipLabel, setIpLabel] = useState('');
  const [ipCidr, setIpCidr] = useState('');
  const [ipError, setIpError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [usage, setUsage] = useState<OrgProjectUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);

  // The DB trigger (enforce_project_limit(), see supabase/schema.sql) is the
  // real gate — this is only a friendlier upfront check so a maxed-out org
  // doesn't fill out the whole wizard before hitting a rejection on submit.
  useEffect(() => {
    if (!currentOrganization) return;
    let cancelled = false;
    getOrgProjectUsage(currentOrganization.id)
      .then((u) => {
        if (!cancelled) setUsage(u);
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentOrganization]);

  const atProjectLimit = usage?.maxProjects != null && usage.activeCount >= usage.maxProjects;

  const canContinue = useMemo(() => {
    if (stepIndex === 0) return name.trim().length > 0;
    return true;
  }, [stepIndex, name]);

  const handleGenerateKey = () => setApiKey(generateApiKey(environment));

  const handleCopy = async () => {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddIpEntry = () => {
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
    setIpEntries((entries) => [...entries, { key: crypto.randomUUID(), label, cidr }]);
    setIpLabel('');
    setIpCidr('');
  };

  const handleRemoveIpEntry = (key: string) => {
    setIpEntries((entries) => entries.filter((e) => e.key !== key));
  };

  const handleNext = async () => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((i) => i + 1);
      return;
    }
    if (!currentOrganization) {
      setError('No organization selected.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const project = await createProject({
        organizationId: currentOrganization.id,
        name: name.trim(),
        description: description.trim() || undefined,
        environment,
        apiKey: apiKey ?? generateApiKey(environment),
        accessScope,
      });
      // Best-effort: queued IP ranges are written after the project exists.
      // A failure here shouldn't block landing on the new project — the user
      // can always add ranges later from Settings.
      await Promise.all(ipEntries.map((e) => addIpAllowlistEntry(project.id, e.label, e.cidr).catch(() => null)));
      navigate(`/projects/${project.id}/onboarding`, { replace: true });
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not create project.'));
    } finally {
      setCreating(false);
    }
  };

  const handlePrev = () => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
    else navigate('/projects');
  };

  if (!usageLoading && atProjectLimit) {
    return (
      <>
        <div className="max-w-2xl mx-auto">
          <Card className="p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-warning-light text-warning flex items-center justify-center mx-auto mb-4">
              <Icon name="upgrade" className="text-[24px]" />
            </div>
            <h1 className="text-lg font-bold text-text-primary mb-2">You've reached your plan's project limit</h1>
            <p className="text-sm text-text-secondary mb-6">
              {usage?.activeCount} of {usage?.maxProjects} active projects used. Archive an existing project or upgrade your plan to create another
              one.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="secondary" onClick={() => navigate('/projects')}>
                Back to Projects
              </Button>
              <Link to="/billing">
                <Button variant="primary">Upgrade Plan</Button>
              </Link>
            </div>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">New Project Wizard</h1>
          <p className="text-sm text-text-secondary mt-1">Register a new project to start receiving telemetry from the SDK.</p>
        </div>

        <Stepper steps={STEPS} currentIndex={stepIndex} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6">
            {stepIndex === 0 && (
              <div>
                <h2 className="text-lg font-bold text-text-primary mb-1">Step 1: Project Details</h2>
                <p className="text-sm text-text-secondary mb-5">Give your project a name and describe what it does.</p>
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide" htmlFor="projectName">
                      Project Name <span className="text-danger">*</span>
                    </label>
                    <input
                      id="projectName"
                      required
                      placeholder="e.g. Payment Gateway"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full h-11 px-3.5 bg-white border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide" htmlFor="projectDesc">
                      Description <span className="text-text-muted font-normal">(optional)</span>
                    </label>
                    <textarea
                      id="projectDesc"
                      rows={4}
                      placeholder="Describe the project's technical scope and core objectives…"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full p-3.5 bg-white border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {stepIndex === 1 && (
              <div>
                <h2 className="text-lg font-bold text-text-primary mb-1">Step 2: Environment</h2>
                <p className="text-sm text-text-secondary mb-5">Choose the default environment this project represents.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {ENVIRONMENTS.map((env) => {
                    const selected = environment === env.value;
                    return (
                      <button
                        key={env.value}
                        type="button"
                        onClick={() => setEnvironment(env.value)}
                        className={`text-left border rounded-lg p-4 transition-colors ${
                          selected ? 'border-primary bg-primary-light' : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Icon name={env.icon} className={`text-[20px] ${selected ? 'text-primary' : 'text-text-secondary'}`} />
                          <span
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              selected ? 'border-primary bg-primary' : 'border-border'
                            }`}
                          >
                            {selected && <Icon name="check" className="text-white text-[12px]" />}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-text-primary">{env.label}</div>
                        <p className="text-xs text-text-secondary mt-1">{env.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {stepIndex === 2 && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-lg font-bold text-text-primary mb-1">Step 3: Security &amp; Access</h2>
                  <p className="text-sm text-text-secondary mb-5">
                    Generate credentials, choose an access scope, and optionally restrict which networks can use this project's key.
                  </p>

                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-text-primary">Generate Project API Key</span>
                    <span className="text-[10px] font-bold text-warning uppercase bg-warning-light px-1.5 py-0.5 rounded">
                      High Sensitivity
                    </span>
                  </div>

                  {apiKey ? (
                    <div className="bg-primary-light border border-primary rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-text-primary">Your Secret Key</span>
                        <span className="text-[10px] font-bold text-warning uppercase bg-warning-light px-1.5 py-0.5 rounded">
                          Copy now
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-surface border border-border rounded px-2 py-2 text-text-primary truncate font-mono">
                          {apiKey}
                        </code>
                        <button
                          type="button"
                          onClick={handleCopy}
                          className="w-9 h-9 shrink-0 flex items-center justify-center bg-surface border border-border rounded hover:bg-background"
                        >
                          <Icon name={copied ? 'check' : 'content_copy'} className="text-[18px]" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-danger">
                        <Icon name="warning" className="text-[14px]" />
                        This key will only be shown once. If lost, you'll need to rotate credentials via a new project.
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleGenerateKey}
                      className="w-full h-11 flex items-center justify-center gap-2 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background"
                    >
                      <Icon name="autorenew" className="text-[18px]" />
                      Generate Key
                    </button>
                  )}

                  {apiKey && <div className="mt-4"><SdkInstructions apiKey={apiKey} /></div>}
                </div>

                <div className="pt-6 border-t border-border">
                  <h3 className="text-sm font-semibold text-text-primary mb-1">Access Scopes</h3>
                  <p className="text-xs text-text-secondary mb-3">Sets what this project's API key is permitted to do. Can be changed later from Settings.</p>
                  <div className="space-y-2">
                    {ACCESS_SCOPES.map((scope) => {
                      const selected = accessScope === scope.value;
                      return (
                        <button
                          key={scope.value}
                          type="button"
                          onClick={() => setAccessScope(scope.value)}
                          className={`w-full flex items-start gap-3 text-left border rounded-lg p-3.5 transition-colors ${
                            selected ? 'border-primary bg-primary-light' : 'border-border hover:border-primary/40'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                              selected ? 'border-primary bg-primary' : 'border-border'
                            }`}
                          >
                            {selected && <Icon name="check" className="text-white text-[12px]" />}
                          </span>
                          <div>
                            <div className="text-sm font-semibold text-text-primary">{scope.label}</div>
                            <p className="text-xs text-text-secondary mt-0.5">{scope.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-6 border-t border-border">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-semibold text-text-primary">IP Whitelisting (CIDR)</h3>
                  </div>
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
                      className="w-full sm:w-48 h-10 px-3 bg-white border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                    <Button type="button" variant="secondary" onClick={handleAddIpEntry} className="shrink-0">
                      <Icon name="add" className="text-[18px]" />
                      Add Range
                    </Button>
                  </div>
                  {ipError && <p className="text-xs text-danger mb-2">{ipError}</p>}

                  {ipEntries.length > 0 && (
                    <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
                      {ipEntries.map((entry) => (
                        <div key={entry.key} className="flex items-center justify-between px-3.5 py-2.5">
                          <div>
                            <div className="text-sm text-text-primary">{entry.label}</div>
                            <div className="text-xs text-text-secondary font-mono">{entry.cidr}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveIpEntry(entry.key)}
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
            )}

            {error && <p className="text-sm text-danger mt-4">{error}</p>}

            <div className="flex gap-3 mt-8 pt-5 border-t border-border">
              <Button variant="secondary" onClick={handlePrev} type="button">
                {stepIndex === 0 ? 'Cancel' : 'Previous'}
              </Button>
              <div className="flex-1" />
              <Button variant="primary" onClick={handleNext} disabled={!canContinue || creating} type="button">
                {creating ? 'Creating…' : stepIndex === STEPS.length - 1 ? 'Create Project' : `Next: ${STEPS[stepIndex + 1]}`}
                {!creating && <Icon name="arrow_forward" className="text-[18px]" />}
              </Button>
            </div>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Icon name="auto_awesome" className="text-primary text-[18px]" />
              Project Guidelines
            </div>
            {GUIDELINES.map((g) => (
              <Card key={g.title} className="p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${GUIDELINE_TONE_CLASSES[g.tone]}`}>
                    <Icon name={g.icon} className="text-[16px]" />
                  </div>
                  <span className="text-sm font-semibold text-text-primary">{g.title}</span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">{g.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
