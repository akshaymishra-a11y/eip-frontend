import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CodeBlock } from '../../components/CodeBlock';
import { Button, Card, Icon, StatusPill } from '../../components/ui';
import { fetchDiscoveredServices, isServiceOnline } from '../../lib/api';
import { useProject } from '../../lib/project-context';
import { SDK_FRAMEWORKS, maskApiKey, type SdkFrameworkId } from '../../lib/sdk-frameworks';
import type { DiscoveredService } from '../../lib/types';

function StepNumber({ index, title }: { index: number; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center shrink-0 text-xs font-bold">
        {index}
      </div>
      <h2 className="text-base font-semibold text-text-primary">{title}</h2>
    </div>
  );
}

export default function ProjectOnboarding() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [frameworkId, setFrameworkId] = useState<SdkFrameworkId>('nodejs');
  const [services, setServices] = useState<DiscoveredService[]>([]);
  const [checking, setChecking] = useState(true);

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

  const framework = SDK_FRAMEWORKS.find((f) => f.id === frameworkId)!;
  const connected = services.filter((s) => s.service_type === 'application').some(isServiceOnline);

  const docLinks: { icon: string; label: string; to?: string }[] = [
    { icon: 'menu_book', label: 'SDK Reference Guide' },
    { icon: 'science', label: 'Advanced Instrumentation', to: `/projects/${project.id}/sdk-setup` },
    { icon: 'shield', label: 'Security & Permissions', to: `/projects/${project.id}/settings` },
  ];

  return (
    <>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-success-light text-success flex items-center justify-center shrink-0">
            <Icon name="check_circle" className="text-[24px]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">Project Created Successfully!</h1>
            <p className="text-sm text-text-secondary mt-1">
              Your project <span className="font-semibold text-text-primary">{project.name}</span> is ready. Follow the guide below to
              integrate the SDK.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-5">
              <StepNumber index={1} title="Choose Framework" />
              <div className="inline-flex flex-wrap items-center gap-1 bg-background border border-border rounded-lg p-1">
                {SDK_FRAMEWORKS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFrameworkId(f.id)}
                    className={`relative flex items-center gap-1.5 h-8 px-3.5 rounded-md text-sm font-medium transition-colors ${
                      frameworkId === f.id
                        ? 'bg-white text-text-primary shadow-sm'
                        : 'text-text-secondary hover:text-text-primary'
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
                    production telemetry; we'll notify this project's team as soon as {framework.label} support ships.
                  </span>
                </div>
              )}
            </Card>

            <Card className="p-5">
              <StepNumber index={2} title="Install SDK" />
              <CodeBlock label={framework.installLabel} code={framework.installCmd} />
            </Card>

            <Card className="p-5">
              <StepNumber index={3} title="Initialize Agent" />
              <p className="text-sm text-text-secondary mb-3">Add this snippet to your application entry point.</p>
              <CodeBlock label={framework.initLabel} code={framework.initCode(project.api_key, project.name)} />
            </Card>

            <Card className="p-5">
              <StepNumber index={4} title="Verify Connection" />
              {checking ? (
                <p className="text-sm text-text-secondary">Checking…</p>
              ) : connected ? (
                <StatusPill tone="success">Connected — receiving telemetry</StatusPill>
              ) : (
                <StatusPill tone="warning">Waiting for telemetry…</StatusPill>
              )}
              <p className="text-sm text-text-secondary mt-3 mb-3">Start your server and send a test request.</p>
              <Button variant="primary" onClick={() => check()} type="button">
                <Icon name="refresh" className="text-[16px]" />
                Check Connection
              </Button>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-5">
              <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Project API Key</h2>
              <code className="block w-full text-xs bg-background border border-border rounded px-3 py-2.5 text-text-primary truncate font-mono mb-2">
                {maskApiKey(project.api_key)}
              </code>
              <p className="text-xs text-text-secondary">Use this key to authenticate your SDK. Never share it in public repositories.</p>
            </Card>

            <Card className="p-5">
              <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Documentation Links</h2>
              <div className="space-y-1">
                {docLinks.map((d) =>
                  d.to ? (
                    <Link
                      key={d.label}
                      to={d.to}
                      className="flex items-center gap-2 px-2 py-2 -mx-2 rounded-md text-sm text-text-primary hover:bg-background"
                    >
                      <Icon name={d.icon} className="text-[18px] text-text-secondary" />
                      {d.label}
                    </Link>
                  ) : (
                    <span key={d.label} className="flex items-center gap-2 px-2 py-2 -mx-2 rounded-md text-sm text-text-muted">
                      <Icon name={d.icon} className="text-[18px] text-text-muted" />
                      {d.label}
                    </span>
                  ),
                )}
              </div>
            </Card>

            {/* Plain divs, not <Card>: Card hard-codes bg-surface (white),
                which wins the cascade over an appended bg-secondary/
                bg-primary-light override in Tailwind's generated stylesheet
                order — silently left both of these rendering as plain white
                cards. */}
            <div className="rounded-lg shadow-sm p-5 bg-secondary text-white">
              <h2 className="text-sm font-semibold mb-1">Need Help?</h2>
              <p className="text-xs text-slate-300 mb-3">Our engineering support team is available for integration assistance.</p>
              <Button variant="secondary" className="w-full" type="button" disabled title="Coming soon">
                Chat with Support
              </Button>
            </div>

            <div className="rounded-lg shadow-sm p-5 bg-primary-light border border-primary/20">
              <div className="flex items-center gap-2 mb-1.5">
                <Icon name="tips_and_updates" className="text-[18px] text-primary" />
                <h2 className="text-sm font-semibold text-text-primary">Integration Tip</h2>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                Enable debug mode in development to log every payload the SDK sends, so you can confirm field mapping before promoting
                to production.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-8 pt-5 border-t border-border">
          <Button variant="secondary" onClick={() => navigate(`/projects/${project.id}/settings`)} type="button">
            <Icon name="arrow_back" className="text-[18px]" />
            Back to Security
          </Button>
          <Button variant="primary" onClick={() => navigate(`/projects/${project.id}`)} type="button">
            Go to Project Overview
            <Icon name="arrow_forward" className="text-[18px]" />
          </Button>
        </div>
      </div>
    </>
  );
}
