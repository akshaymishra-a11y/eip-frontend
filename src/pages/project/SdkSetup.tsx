import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CodeBlock } from '../../components/CodeBlock';
import { Button, Card, Icon, PageHeader, StatusPill } from '../../components/ui';
import { fetchDiscoveredServices, isServiceOnline } from '../../lib/api';
import { useProject } from '../../lib/project-context';
import { SDK_FRAMEWORKS, maskApiKey, type SdkFrameworkId } from '../../lib/sdk-frameworks';
import type { DiscoveredService } from '../../lib/types';

const STEPS: { icon: string; tone: 'success' | 'warning' | 'danger'; title: string }[] = [
  { icon: 'tune', tone: 'success', title: 'Choose Framework' },
  { icon: 'download', tone: 'success', title: 'Install & Initialize the SDK' },
  { icon: 'storage', tone: 'warning', title: 'Register a Database (optional)' },
  { icon: 'terminal', tone: 'danger', title: 'Logging (optional)' },
  { icon: 'wifi_tethering', tone: 'success', title: 'Verify Connection' },
];

const STEP_CHIP_CLASSES: Record<'success' | 'warning' | 'danger', string> = {
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  danger: 'bg-danger-light text-danger',
};

function StepHeader({ index }: { index: number }) {
  const step = STEPS[index];
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${STEP_CHIP_CLASSES[step.tone]}`}>
        <Icon name={step.icon} className="text-[18px]" />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-text-muted">{index + 1}</span>
        <h2 className="text-base font-semibold text-text-primary">{step.title}</h2>
      </div>
    </div>
  );
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function SdkSetup() {
  const { project } = useProject();
  const [services, setServices] = useState<DiscoveredService[]>([]);
  const [checking, setChecking] = useState(true);
  const [frameworkId, setFrameworkId] = useState<SdkFrameworkId>('nodejs');

  const check = useCallback(async () => {
    if (!project) return;
    const data = await fetchDiscoveredServices(project.id);
    setServices(data);
  }, [project]);

  useEffect(() => {
    setChecking(true);
    check().finally(() => setChecking(false));
  }, [check]);

  if (!project) {
    return (
      <>
        <div className="py-16 text-center text-text-secondary text-sm">Loading…</div>
      </>
    );
  }

  const appServices = services.filter((s) => s.service_type === 'application');
  const connected = appServices.some(isServiceOnline);
  const framework = SDK_FRAMEWORKS.find((f) => f.id === frameworkId)!;

  return (
    <>
      <div className="mb-2">
        <Link to={`/projects/${project.id}/settings`} className="text-sm text-text-secondary hover:text-text-primary inline-flex items-center gap-1">
          <Icon name="arrow_back" className="text-[16px]" />
          Back to Settings
        </Link>
      </div>
      <PageHeader title="SDK Setup" subtitle="Get this project reporting real telemetry in under 5 minutes." />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5">
            <StepHeader index={0} />
            <div className="inline-flex flex-wrap items-center gap-1 bg-background border border-border rounded-lg p-1">
              {SDK_FRAMEWORKS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFrameworkId(f.id)}
                  className={`relative flex items-center gap-1.5 h-8 px-3.5 rounded-md text-sm font-medium transition-colors ${
                    frameworkId === f.id ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {f.label}
                  {!f.available && (
                    <span className="text-[9px] font-bold uppercase tracking-wide bg-warning-light text-warning px-1 py-0.5 rounded">
                      Soon
                    </span>
                  )}
                </button>
              ))}
            </div>
            {!framework.available && (
              <div className="flex items-start gap-2 mt-3 text-xs text-warning bg-warning-light rounded-md px-3 py-2">
                <Icon name="info" className="text-[16px] shrink-0" />
                <span>
                  The {framework.label} SDK is on our roadmap — the snippets below show the planned API. Use Node.js today for
                  production telemetry.
                </span>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <StepHeader index={1} />
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">Install the SDK, then add this to your application's entry point:</p>
              <CodeBlock label={framework.installLabel} code={framework.installCmd} />
              <CodeBlock label={framework.initLabel} code={framework.initCode(project.api_key, project.name)} />
            </div>
          </Card>

          <Card className="p-5">
            <StepHeader index={2} />
            <p className="text-sm text-text-secondary mb-3">
              Wrap your database pool to report query performance and see DB calls in Traces:
            </p>
            <CodeBlock label={framework.dbWrapLabel} code={framework.dbWrapCode} />
          </Card>

          <Card className="p-5">
            <StepHeader index={3} />
            <p className="text-sm text-text-secondary mb-3">Send structured logs, correlated to the active trace:</p>
            <CodeBlock label={framework.loggingLabel} code={framework.loggingCode} />
          </Card>

          <Card className="p-5">
            <StepHeader index={4} />
            <p className="text-sm text-text-secondary">
              Start your server and send a request — the Connection Status panel will flip to "Connected" once the first heartbeat lands.
            </p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5 h-fit">
            <h2 className="text-base font-semibold text-text-primary mb-3">Connection Status</h2>
            {checking ? (
              <p className="text-sm text-text-secondary">Checking…</p>
            ) : connected ? (
              <StatusPill tone="success">Connected — receiving telemetry</StatusPill>
            ) : (
              <StatusPill tone="warning">Waiting for telemetry</StatusPill>
            )}
            <p className="text-xs text-text-secondary mt-3">
              {connected
                ? `${appServices.filter(isServiceOnline).length} service(s) reported a heartbeat in the last 2 minutes.`
                : "We'll show services here as soon as the SDK sends its first heartbeat."}
            </p>

            {appServices.length > 0 && (
              <div className="mt-4 border-t border-border pt-3 space-y-2">
                {appServices.map((s) => {
                  const online = isServiceOnline(s);
                  return (
                    <div key={s.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${online ? 'bg-success' : 'bg-text-muted'}`} />
                        <span className="text-text-primary truncate">{s.name}</span>
                      </div>
                      <span className="text-xs text-text-secondary shrink-0">{timeAgo(s.last_seen_at)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <Button variant="secondary" className="w-full mt-4" onClick={() => check()} type="button">
              <Icon name="refresh" className="text-[16px]" />
              Check Again
            </Button>
          </Card>

          <Card className="p-5 h-fit">
            <h2 className="text-base font-semibold text-text-primary mb-3">Related Settings</h2>
            <div className="space-y-1">
              <Link
                to={`/projects/${project.id}/settings`}
                className="flex items-center justify-between px-2 py-2 -mx-2 rounded-md text-sm text-text-primary hover:bg-background"
              >
                <span className="flex items-center gap-2">
                  <Icon name="key" className="text-[18px] text-text-secondary" />
                  Security &amp; Access Scope
                </span>
                <Icon name="chevron_right" className="text-[18px] text-text-muted" />
              </Link>
              <Link to="/team" className="flex items-center justify-between px-2 py-2 -mx-2 rounded-md text-sm text-text-primary hover:bg-background">
                <span className="flex items-center gap-2">
                  <Icon name="group" className="text-[18px] text-text-secondary" />
                  Team Access
                </span>
                <Icon name="chevron_right" className="text-[18px] text-text-muted" />
              </Link>
            </div>
          </Card>

          <Card className="p-5 h-fit">
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Project API Key</h2>
            <code className="block w-full text-xs bg-background border border-border rounded px-3 py-2.5 text-text-primary truncate font-mono mb-2">
              {maskApiKey(project.api_key)}
            </code>
            <p className="text-xs text-text-secondary">Use this key to authenticate your SDK. Never share it in public repositories.</p>
          </Card>

          <Card className="p-5 h-fit">
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Documentation Links</h2>
            <div className="space-y-1">
              <span className="flex items-center gap-2 px-2 py-2 -mx-2 rounded-md text-sm text-text-muted">
                <Icon name="menu_book" className="text-[18px] text-text-muted" />
                SDK Reference Guide
              </span>
              <Link
                to={`/projects/${project.id}/sdk-setup`}
                className="flex items-center gap-2 px-2 py-2 -mx-2 rounded-md text-sm text-text-primary hover:bg-background"
              >
                <Icon name="science" className="text-[18px] text-text-secondary" />
                Advanced Instrumentation
              </Link>
              <Link
                to={`/projects/${project.id}/settings`}
                className="flex items-center gap-2 px-2 py-2 -mx-2 rounded-md text-sm text-text-primary hover:bg-background"
              >
                <Icon name="shield" className="text-[18px] text-text-secondary" />
                Security &amp; Permissions
              </Link>
            </div>
          </Card>

          {/* Plain divs, not <Card>: Card hard-codes bg-surface (white), which
              wins the cascade over an appended bg-secondary/bg-primary-light
              override in Tailwind's generated stylesheet order — silently
              left both of these rendering as plain white cards. */}
          <div className="rounded-lg shadow-sm p-5 h-fit bg-secondary text-white">
            <h2 className="text-sm font-semibold mb-1">Need Help?</h2>
            <p className="text-xs text-slate-300 mb-3">Our engineering support team is available for integration assistance.</p>
            <Button variant="secondary" className="w-full" type="button" disabled title="Coming soon">
              Chat with Support
            </Button>
          </div>

          <div className="rounded-lg shadow-sm p-5 h-fit bg-primary-light border border-primary/20">
            <div className="flex items-center gap-2 mb-1.5">
              <Icon name="tips_and_updates" className="text-[18px] text-primary" />
              <h2 className="text-sm font-semibold text-text-primary">Integration Tip</h2>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              Enable debug mode in development to log every payload the SDK sends, so you can confirm field mapping before promoting to
              production.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
