import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, EmptyState, Icon, PageHeader, Pagination } from '../../components/ui';
import { LogVolumeChart, type LogVolumeBucket } from '../../components/charts/LogVolumeChart';
import { fetchLogs } from '../../lib/api';
import { useProject } from '../../lib/project-context';
import type { LogEntry, LogLevel } from '../../lib/types';

const LEVEL_CLASS: Record<LogLevel, string> = {
  debug: 'text-text-muted bg-background',
  info: 'text-primary bg-primary-light',
  warn: 'text-warning bg-warning-light',
  error: 'text-danger bg-danger-light',
};

const LEVEL_DOT_CLASS: Record<LogLevel, string> = {
  debug: 'bg-text-muted',
  info: 'bg-primary',
  warn: 'bg-warning',
  error: 'bg-danger',
};

const LEVELS: LogLevel[] = ['error', 'warn', 'info', 'debug'];
const PAGE_SIZE = 25;

function buildVolumeBuckets(entries: LogEntry[]): LogVolumeBucket[] {
  const now = Date.now();
  const buckets: LogVolumeBucket[] = Array.from({ length: 24 }, (_, i) => {
    const hoursAgo = 23 - i;
    const hour = new Date(now - hoursAgo * 60 * 60 * 1000).getHours();
    return { label: `${hour}:00`, debug: 0, info: 0, warn: 0, error: 0 };
  });
  for (const entry of entries) {
    const hoursAgo = Math.floor((now - new Date(entry.occurred_at).getTime()) / (60 * 60 * 1000));
    const bucket = 23 - hoursAgo;
    if (bucket >= 0 && bucket < 24) buckets[bucket][entry.level] += 1;
  }
  return buckets;
}

export default function LogsExplorer() {
  const { project } = useProject();
  const [allLogs, setAllLogs] = useState<LogEntry[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<LogLevel | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const loadAll = useCallback(async () => {
    if (!project) return;
    const result = await fetchLogs(project.id, { pageSize: 500 });
    setAllLogs(result.data);
  }, [project]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    setPage(1);
  }, [level, search]);

  const load = useCallback(async () => {
    if (!project) return;
    const result = await fetchLogs(project.id, {
      level: level || undefined,
      search: search.trim() || undefined,
      page,
      pageSize: PAGE_SIZE,
    });
    setLogs(result.data);
    setTotal(result.total);
  }, [project, level, search, page]);

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => {
      load().finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [load]);

  const volumeBuckets = useMemo(() => buildVolumeBuckets(allLogs), [allLogs]);
  const levelCounts = useMemo(() => {
    const counts: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const entry of allLogs) counts[entry.level] += 1;
    return counts;
  }, [allLogs]);

  const noFilters = !level && !search.trim();

  return (
    <>
      <PageHeader title="Logs" subtitle="Search and filter application logs, most recent first." />

      {allLogs.length > 0 && (
        <Card className="p-5 mb-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-text-primary">Log Volume</h2>
            <p className="text-xs text-text-secondary">By level, last 24 hours</p>
          </div>
          <LogVolumeChart data={volumeBuckets} />
          <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-border">
            {LEVELS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevel(level === lvl ? '' : lvl)}
                className={`flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 transition-colors ${
                  level === lvl ? 'bg-background font-semibold text-text-primary' : 'text-text-secondary hover:bg-background'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${LEVEL_DOT_CLASS[lvl]}`} />
                {lvl.toUpperCase()}
                <span className="text-text-muted">{levelCounts[lvl]}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[240px]">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[18px]" />
          <input
            placeholder="Search log messages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-white border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as LogLevel | '')}
          className="h-9 px-3 bg-white border border-border rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">All Levels</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
      </div>

      {!loading && logs.length === 0 ? (
        <Card>
          <EmptyState
            icon="terminal"
            title={noFilters ? 'No logs yet' : 'No logs match these filters'}
            description={
              noFilters
                ? 'Logs appear here once the SDK’s logger (monitor.logger.info/warn/error/debug) is called from your app.'
                : 'Try a different search term or level.'
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border font-mono text-xs">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 px-5 py-3">
                <span className={`shrink-0 px-1.5 py-0.5 rounded font-sans font-bold text-[10px] uppercase ${LEVEL_CLASS[log.level]}`}>
                  {log.level}
                </span>
                <span className="text-text-muted shrink-0">{new Date(log.occurred_at).toLocaleString()}</span>
                <span className="text-text-secondary shrink-0">{log.service_name}</span>
                <span className="text-text-primary flex-1 min-w-0 break-words">{log.message}</span>
                {log.trace_id && (
                  <span className="text-text-muted shrink-0">trace:{log.trace_id.slice(0, 8)}</span>
                )}
              </div>
            ))}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </Card>
      )}
    </>
  );
}
