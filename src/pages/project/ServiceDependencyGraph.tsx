import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, Icon, PageHeader } from '../../components/ui';
import { fetchServiceDependencyEdges } from '../../lib/api';
import { useProject } from '../../lib/project-context';
import type { DependencyEdge } from '../../lib/types';

const KIND_ICON: Record<string, string> = {
  db: 'storage',
  cache: 'speed',
  external: 'public',
  server: 'http',
  internal: 'settings_ethernet',
};

export default function ServiceDependencyGraph() {
  const { project } = useProject();
  const [edges, setEdges] = useState<DependencyEdge[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!project) return;
    const data = await fetchServiceDependencyEdges(project.id);
    setEdges(data);
  }, [project]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const services = Array.from(new Set(edges.map((e) => e.from)));
  const dependencies = Array.from(new Set(edges.map((e) => `${e.to}::${e.kind}`))).map((key) => {
    const [to, kind] = key.split('::');
    return { to, kind, edges: edges.filter((e) => e.to === to && e.kind === kind) };
  });

  return (
    <>
      <PageHeader
        title="Service Dependency Graph"
        subtitle="Real call edges observed from traced DB/cache/external calls, last 24 hours."
      />

      {!loading && edges.length === 0 ? (
        <Card>
          <EmptyState
            icon="hub"
            title="No dependency calls observed yet"
            description="Edges appear here once the SDK observes DB, cache, or external calls made while handling a request (e.g. via wrapDatabase())."
          />
        </Card>
      ) : (
        <div className="bg-secondary rounded-lg p-8 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          <div className="relative flex items-center gap-4 mb-6 text-xs text-slate-300">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-success" /> Healthy
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-danger" /> Errors observed
            </span>
          </div>
          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Application Services</p>
              {services.map((service) => (
                <div key={service} className="bg-white/5 backdrop-blur border border-primary/40 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <Icon name="dns" className="text-primary text-[18px]" />
                    <span className="text-sm font-medium text-white">{service}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Calls {edges.filter((e) => e.from === service).length} dependenc
                    {edges.filter((e) => e.from === service).length === 1 ? 'y' : 'ies'}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Dependencies</p>
              {dependencies.map(({ to, kind, edges: depEdges }) => {
                const hasErrors = depEdges.some((e) => e.errorCount > 0);
                const content = (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${hasErrors ? 'bg-danger' : 'bg-success'}`} />
                      <Icon name={KIND_ICON[kind] ?? 'hub'} className="text-slate-300 text-[18px]" />
                      <span className="text-sm font-medium text-white">{to}</span>
                      <span className="text-[10px] uppercase text-slate-400 ml-auto">{kind}</span>
                    </div>
                    <div className="space-y-1.5">
                      {depEdges.map((edge) => (
                        <div key={`${edge.from}-${edge.to}-${edge.kind}`} className="flex items-center justify-between text-xs">
                          <span className="text-slate-300">← {edge.from}</span>
                          <span className="text-slate-400">
                            {edge.callCount} calls · {edge.avgDurationMs.toFixed(0)}ms avg
                            {edge.errorCount > 0 && (
                              <span className="text-danger ml-1">
                                · {edge.errorCount} error{edge.errorCount === 1 ? '' : 's'}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                );

                if (kind === 'db') {
                  return (
                    <Link
                      key={`${to}-${kind}`}
                      to={`/projects/${project?.id}/dependencies/db/${to}`}
                      className="block bg-white/5 backdrop-blur border border-white/10 hover:border-primary/60 rounded-lg p-4 transition-colors"
                    >
                      {content}
                    </Link>
                  );
                }

                return (
                  <div key={`${to}-${kind}`} className="bg-white/5 backdrop-blur border border-white/10 rounded-lg p-4">
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
