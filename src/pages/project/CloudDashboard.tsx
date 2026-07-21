import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, Icon, KpiCard, PageHeader, StatusPill } from '../../components/ui';
import { CloudCostTrendChart, type CloudCostTrendPoint } from '../../components/charts/CloudCostTrendChart';
import { fetchCloudCostSnapshots, fetchCloudResources } from '../../lib/api';
import { useProject } from '../../lib/project-context';
import type { CloudCostSnapshot, CloudResource } from '../../lib/types';

const RESOURCE_TYPE_LABEL: Record<string, string> = {
  ec2_instance: 'EC2 Instances',
  rds_instance: 'RDS Instances',
  s3_bucket: 'S3 Buckets',
};

function stateTone(state: string | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (!state) return 'neutral';
  const s = state.toLowerCase();
  if (s === 'running' || s === 'available') return 'success';
  if (s === 'stopped' || s === 'stopping' || s === 'deleting' || s === 'failed') return 'danger';
  if (s === 'pending' || s === 'starting' || s === 'rebooting' || s === 'modifying' || s === 'creating') return 'warning';
  return 'neutral';
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function CloudDashboard() {
  const { project } = useProject();
  const [resources, setResources] = useState<CloudResource[]>([]);
  const [costSnapshots, setCostSnapshots] = useState<CloudCostSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!project) return;
    const [resourcesResult, costResult] = await Promise.allSettled([
      fetchCloudResources(project.id),
      fetchCloudCostSnapshots(project.id),
    ]);

    if (resourcesResult.status === 'fulfilled') setResources(resourcesResult.value);
    else console.error('[CloudDashboard] fetchCloudResources failed:', resourcesResult.reason);

    if (costResult.status === 'fulfilled') setCostSnapshots(costResult.value);
    else console.error('[CloudDashboard] fetchCloudCostSnapshots failed:', costResult.reason);
  }, [project]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const grouped = useMemo(() => {
    const byType = new Map<string, CloudResource[]>();
    for (const r of resources) {
      const list = byType.get(r.resource_type) ?? [];
      list.push(r);
      byType.set(r.resource_type, list);
    }
    return byType;
  }, [resources]);

  const totalCostLast30d = useMemo(() => costSnapshots.reduce((sum, c) => sum + Number(c.amount_usd), 0), [costSnapshots]);

  const costCategories = useMemo(() => Array.from(new Set(costSnapshots.map((c) => c.service_category))).sort(), [costSnapshots]);

  const costTrendData: CloudCostTrendPoint[] = useMemo(() => {
    const byDate = new Map<string, CloudCostTrendPoint>();
    for (const c of costSnapshots) {
      const point = byDate.get(c.date) ?? { date: c.date };
      point[c.service_category] = Number(c.amount_usd);
      byDate.set(c.date, point);
    }
    return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [costSnapshots]);

  const hasAnyData = resources.length > 0 || costSnapshots.length > 0;

  return (
    <>
      <PageHeader title="Cloud & FinOps" subtitle="AWS resource inventory and 30-day cost trend by service." />

      {!loading && !hasAnyData ? (
        <Card>
          <EmptyState
            icon="cloud"
            title="No AWS data synced yet"
            description="Configure an AWS integration (access key, secret key, region) under Project Settings → Integrations and the platform polls EC2, RDS, S3, and Cost Explorer automatically every ~30 minutes — no manual sync step needed."
            action={
              project && (
                <Link to={`/projects/${project.id}/settings`}>
                  <Button variant="secondary" type="button">
                    <Icon name="settings" className="text-[16px]" />
                    Go to Integrations
                  </Button>
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Total Resources" value={resources.length} icon="dns" />
            <KpiCard label="EC2 Instances" value={grouped.get('ec2_instance')?.length ?? 0} icon="memory" />
            <KpiCard label="RDS Instances" value={grouped.get('rds_instance')?.length ?? 0} icon="storage" />
            <KpiCard label="30-Day Cost" value={`$${totalCostLast30d.toFixed(2)}`} icon="payments" />
          </div>

          <Card className="p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-text-primary">Cost Trend</h2>
              <span className="text-xs text-text-secondary">Daily spend by AWS service, last 30 days (Cost Explorer)</span>
            </div>
            {costTrendData.length > 0 ? (
              <CloudCostTrendChart data={costTrendData} categories={costCategories} />
            ) : (
              <p className="text-sm text-text-secondary py-8 text-center">
                No cost data yet — this fills in after the first successful poll of the AWS integration.
              </p>
            )}
          </Card>

          {resources.length === 0 ? (
            <Card>
              <EmptyState icon="dns" title="No resources discovered yet" description="This fills in after the first successful poll of the AWS integration." />
            </Card>
          ) : (
            Array.from(grouped.entries()).map(([resourceType, list]) => (
              <Card key={resourceType} className="overflow-hidden mb-6">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="text-base font-semibold text-text-primary">{RESOURCE_TYPE_LABEL[resourceType] ?? resourceType}</h2>
                  <p className="text-xs text-text-secondary">
                    {list.length} resource{list.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-text-secondary uppercase tracking-wide border-b border-border">
                        <th className="px-5 py-2.5 font-semibold">Name</th>
                        <th className="px-5 py-2.5 font-semibold">Region</th>
                        <th className="px-5 py-2.5 font-semibold">State</th>
                        <th className="px-5 py-2.5 font-semibold">Tags</th>
                        <th className="px-5 py-2.5 font-semibold">Last Seen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {list.map((r) => (
                        <tr key={r.id}>
                          <td className="px-5 py-3 text-text-primary">
                            <div className="font-medium">{r.resource_name ?? r.resource_id}</div>
                            <div className="text-xs text-text-muted font-mono">{r.resource_id}</div>
                          </td>
                          <td className="px-5 py-3 text-text-secondary">{r.region ?? '—'}</td>
                          <td className="px-5 py-3">
                            <StatusPill tone={stateTone(r.state)}>{r.state ? r.state.toUpperCase() : 'N/A'}</StatusPill>
                          </td>
                          <td className="px-5 py-3 text-xs text-text-secondary">
                            {r.tags && Object.keys(r.tags).length > 0
                              ? Object.entries(r.tags)
                                  .slice(0, 3)
                                  .map(([k, v]) => `${k}=${v}`)
                                  .join(', ')
                              : '—'}
                          </td>
                          <td className="px-5 py-3 text-text-secondary whitespace-nowrap">{timeAgo(r.last_seen_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))
          )}
        </>
      )}
    </>
  );
}
