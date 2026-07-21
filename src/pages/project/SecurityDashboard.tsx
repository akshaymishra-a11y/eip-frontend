import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, Icon, KpiCard, PageHeader, Pagination, StatusPill } from '../../components/ui';
import { DailySecurityTrendChart, type DailySecurityTrendPoint } from '../../components/charts/DailySecurityTrendChart';
import { fetchLatestCodeScans, fetchSecurityDailyTrend, fetchVulnerabilityFindings } from '../../lib/api';
import { useProject } from '../../lib/project-context';
import type { CodeScan, FindingSeverity, ScanTool, VulnerabilityFinding } from '../../lib/types';

const TOOL_LABEL: Record<ScanTool, string> = {
  sonarqube: 'SonarQube',
  sarif: 'SARIF',
  'npm-audit': 'npm audit',
};

const SEVERITY_ORDER: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
const PAGE_SIZE = 20;

const SEVERITY_CLASS: Record<FindingSeverity, string> = {
  critical: 'text-danger bg-danger-light',
  high: 'text-danger bg-danger-light',
  medium: 'text-warning bg-warning-light',
  low: 'text-primary bg-primary-light',
  info: 'text-text-muted bg-background',
};

function gateTone(status: CodeScan['quality_gate_status']) {
  if (status === 'passed') return 'success' as const;
  if (status === 'failed') return 'danger' as const;
  if (status === 'warn') return 'warning' as const;
  return 'neutral' as const;
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

export default function SecurityDashboard() {
  const { project } = useProject();
  const [scans, setScans] = useState<CodeScan[]>([]);
  const [allFindings, setAllFindings] = useState<VulnerabilityFinding[]>([]);
  const [findings, setFindings] = useState<VulnerabilityFinding[]>([]);
  const [total, setTotal] = useState(0);
  const [dailyTrend, setDailyTrend] = useState<DailySecurityTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<FindingSeverity | ''>('');
  const [toolFilter, setToolFilter] = useState<ScanTool | ''>('');
  const [page, setPage] = useState(1);

  const loadAll = useCallback(async () => {
    if (!project) return;
    const [result, dailyMetrics] = await Promise.all([
      fetchVulnerabilityFindings(project.id, { pageSize: 500 }),
      fetchSecurityDailyTrend(project.id, 30),
    ]);
    setAllFindings(result.data);
    setDailyTrend(
      dailyMetrics.map((d) => ({ date: d.date, vulnerabilitiesFound: d.vulnerabilities_found, vulnerabilitiesFixed: d.vulnerabilities_fixed }))
    );
  }, [project]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    setPage(1);
  }, [severityFilter, toolFilter]);

  const load = useCallback(async () => {
    if (!project) return;
    const [scansResult, findingsResult] = await Promise.allSettled([
      fetchLatestCodeScans(project.id),
      fetchVulnerabilityFindings(project.id, {
        severity: severityFilter || undefined,
        tool: toolFilter || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    ]);

    if (scansResult.status === 'fulfilled') setScans(scansResult.value);
    else console.error('[SecurityDashboard] fetchLatestCodeScans failed:', scansResult.reason);

    if (findingsResult.status === 'fulfilled') {
      setFindings(findingsResult.value.data);
      setTotal(findingsResult.value.total);
    } else console.error('[SecurityDashboard] fetchVulnerabilityFindings failed:', findingsResult.reason);
  }, [project, severityFilter, toolFilter, page]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const totals = useMemo(() => {
    const openVulnerabilities = allFindings.length;
    const critical = allFindings.filter((f) => f.severity === 'critical').length;
    const failedGates = scans.filter((s) => s.quality_gate_status === 'failed').length;
    const avgCoverage = (() => {
      const withCoverage = scans.filter((s) => s.coverage != null);
      if (!withCoverage.length) return null;
      return withCoverage.reduce((sum, s) => sum + (s.coverage ?? 0), 0) / withCoverage.length;
    })();
    return { openVulnerabilities, critical, failedGates, avgCoverage };
  }, [allFindings, scans]);

  const hasAnyData = scans.length > 0 || allFindings.length > 0;

  return (
    <>
      <PageHeader
        title="Security & Quality"
        subtitle="Code scan results from SonarQube, SARIF-producing tools (Trivy, Snyk, CodeQL, Semgrep...), and npm audit."
      />

      {!loading && !hasAnyData ? (
        <Card>
          <EmptyState
            icon="shield"
            title="No scan reports yet"
            description="Configure a SonarQube server or GitHub Actions artifact under Project Settings → Integrations and the platform polls it automatically — no CI step needed. Or push a one-off report yourself with the eip-scan-report CLI (--npm-audit, --sarif, or --sonarqube)."
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
            <KpiCard
              label="Open Findings"
              value={totals.openVulnerabilities}
              icon="bug_report"
              deltaTone={totals.openVulnerabilities > 0 ? 'danger' : 'success'}
            />
            <KpiCard label="Critical" value={totals.critical} icon="warning" deltaTone={totals.critical > 0 ? 'danger' : 'success'} />
            <KpiCard
              label="Failed Quality Gates"
              value={totals.failedGates}
              icon="verified"
              deltaTone={totals.failedGates > 0 ? 'danger' : 'success'}
            />
            <KpiCard
              label="Avg. Coverage"
              value={totals.avgCoverage != null ? `${totals.avgCoverage.toFixed(1)}%` : '—'}
              icon="donut_large"
            />
          </div>

          <Card className="p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-text-primary">30-Day Trend</h2>
              <span className="text-xs text-text-secondary">Daily rollup — vulnerabilities found vs. fixed</span>
            </div>
            {dailyTrend.length > 0 ? (
              <DailySecurityTrendChart data={dailyTrend} />
            ) : (
              <p className="text-sm text-text-secondary py-8 text-center">
                No daily trend data yet — this fills in after the first nightly aggregation run.
              </p>
            )}
          </Card>

          <Card className="overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">Latest Scans</h2>
              <p className="text-xs text-text-secondary">One row per service + tool combination, most recent run.</p>
            </div>
            {scans.length === 0 ? (
              <div className="px-5 py-6">
                <EmptyState icon="fact_check" title="No scans reported" description="Push a scan report to see it here." />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {scans.map((scan) => (
                  <div key={scan.id} className="px-5 py-3 flex items-center gap-4 flex-wrap">
                    <StatusPill tone={gateTone(scan.quality_gate_status)}>
                      {scan.quality_gate_status ? scan.quality_gate_status.toUpperCase() : 'N/A'}
                    </StatusPill>
                    <span className="text-sm font-medium text-text-primary">{scan.service_name}</span>
                    <span className="text-xs text-text-secondary">{TOOL_LABEL[scan.tool]}</span>
                    <div className="flex items-center gap-3 text-xs text-text-secondary ml-auto">
                      {scan.bugs != null && <span>{scan.bugs} bugs</span>}
                      {scan.vulnerabilities != null && <span>{scan.vulnerabilities} vulnerabilities</span>}
                      {scan.code_smells != null && <span>{scan.code_smells} code smells</span>}
                      {scan.coverage != null && <span>{scan.coverage.toFixed(1)}% coverage</span>}
                      {scan.security_rating && <span>Security: {scan.security_rating}</span>}
                      {scan.maintainability_rating && <span>Maintainability: {scan.maintainability_rating}</span>}
                      <span className="text-text-muted whitespace-nowrap">{timeAgo(scan.scanned_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Findings</h2>
                <p className="text-xs text-text-secondary">Open vulnerabilities, bugs, and dependency advisories.</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value as FindingSeverity | '')}
                  className="text-sm border border-border rounded-md px-2 py-1.5 bg-white text-text-primary"
                >
                  <option value="">All severities</option>
                  {SEVERITY_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
                <select
                  value={toolFilter}
                  onChange={(e) => setToolFilter(e.target.value as ScanTool | '')}
                  className="text-sm border border-border rounded-md px-2 py-1.5 bg-white text-text-primary"
                >
                  <option value="">All tools</option>
                  {(Object.keys(TOOL_LABEL) as ScanTool[]).map((t) => (
                    <option key={t} value={t}>
                      {TOOL_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {findings.length === 0 ? (
              <div className="px-5 py-6">
                <EmptyState icon="check_circle" title="No open findings" description="Nothing matches the current filters." />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {findings.map((finding) => (
                  <div key={finding.id} className="px-5 py-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${SEVERITY_CLASS[finding.severity]}`}>
                        {finding.severity}
                      </span>
                      <span className="text-sm font-medium text-text-primary truncate">{finding.title}</span>
                      {finding.cve_id && (
                        <span className="text-[11px] font-mono text-text-muted bg-background px-1.5 py-0.5 rounded">
                          {finding.cve_id}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-text-muted whitespace-nowrap">{timeAgo(finding.detected_at)}</span>
                    </div>
                    <p className="text-xs text-text-secondary mt-1 flex items-center gap-2 flex-wrap">
                      <Icon name="dns" className="text-[14px]" /> {finding.service_name}
                      <span className="text-text-muted">·</span> {TOOL_LABEL[finding.tool]}
                      {finding.file_path && (
                        <>
                          <span className="text-text-muted">·</span>
                          <span className="font-mono">
                            {finding.file_path}
                            {finding.line_number ? `:${finding.line_number}` : ''}
                          </span>
                        </>
                      )}
                      {finding.package_name && (
                        <>
                          <span className="text-text-muted">·</span>
                          <span className="font-mono">
                            {finding.package_name}
                            {finding.package_version ? `@${finding.package_version}` : ''}
                          </span>
                        </>
                      )}
                      {finding.fixed_version && (
                        <>
                          <span className="text-text-muted">·</span>
                          <span className="text-success">fix: {finding.fixed_version}</span>
                        </>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {findings.length > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />}
          </Card>
        </>
      )}
    </>
  );
}
