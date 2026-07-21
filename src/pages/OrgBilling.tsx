import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Icon, PageHeader, StatusPill } from '../components/ui';
import {
  createCustomPlan,
  estimateCustomPlanPrice,
  getOrgProjectUsage,
  getOrgSeatCount,
  getOrgSubscription,
  getOrgUsageBreakdown,
  getPlans,
  getRetentionPolicies,
  updateOrgPlan,
  type OrgProjectUsage,
  type OrgUsageBreakdown,
} from '../lib/api';
import { describeSupabaseError } from '../lib/errors';
import { useOrg } from '../lib/org-context';
import type {
  CustomPlanPriceEstimate,
  OrganizationSubscription,
  Plan,
  RetentionDataType,
  RetentionPolicy,
  SubscriptionStatus,
} from '../lib/types';

// The org self-selects a plan for now (no payment processor wired up yet —
// see the note on `plans`/`organization_subscriptions` in supabase/schema.sql).
const RECOMMENDED_PLAN_ID = 'pro';

// Marketing copy for capabilities that are true today for every plan (no
// seat limits are enforced) or that aren't backed by real enforcement yet
// (support tiers, SSO). Project-count and API-limit lines are derived from
// real plan/usage data instead of being duplicated here.
const PLAN_DESCRIPTIONS: Record<string, string> = {
  free: 'Essential features for hobby projects and small experiments.',
  pro: 'Advanced tools and higher limits for growing teams.',
  enterprise: 'Custom solutions and dedicated support for large orgs.',
};

const PLAN_EXTRA_FEATURES: Record<string, string[]> = {
  free: ['Community support'],
  pro: ['Priority email support', 'Advanced telemetry'],
  enterprise: ['Dedicated support & SLA', 'SSO & Advanced Security'],
};

function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

function formatStorage(mb: number | null): string {
  if (mb == null) return '—';
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const SUBSCRIPTION_STATUS_TONE: Record<SubscriptionStatus, 'success' | 'warning' | 'danger'> = {
  active: 'success',
  grace_period: 'warning',
  suspended: 'danger',
};

const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: 'Active',
  grace_period: 'Grace period',
  suspended: 'Suspended',
};

// Decorative per-data-type accents on the retention chips — purely to tell
// the four telemetry types apart at a glance, same convention used on the
// Delivery Dashboard for provider/infra-source chips.
const RETENTION_LABEL: Record<RetentionDataType, string> = {
  logs: 'Logs',
  traces: 'Traces',
  db_queries: 'DB Queries',
  api_calls: 'API Calls',
};

const RETENTION_ICON: Record<RetentionDataType, string> = {
  logs: 'description',
  traces: 'route',
  db_queries: 'storage',
  api_calls: 'swap_horiz',
};

const RETENTION_CHIP_CLASSES: Record<RetentionDataType, string> = {
  logs: 'bg-sky-50 text-sky-600',
  traces: 'bg-violet-50 text-violet-600',
  db_queries: 'bg-amber-50 text-amber-600',
  api_calls: 'bg-teal-50 text-teal-600',
};

// A curated set, not a free-form number input — mirrors the Delivery
// Dashboard's polling-interval dropdown (a fixed discrete set that renders
// cleanly and is impossible to mistype). Unlike that one, the DB doesn't
// enforce this exact set (retention_policies only checks > 0) since there's
// no cron-tick-granularity reason it has to be discrete; it's a UX choice.
const RETENTION_DAY_OPTIONS = [1, 3, 7, 15, 30, 60, 90, 180, 365];

function formatDays(days: number): string {
  if (days === 365) return '365 days (1 year)';
  return `${days} day${days === 1 ? '' : 's'}`;
}

const DEFAULT_CUSTOM_DAYS: Record<RetentionDataType, number> = {
  logs: 15,
  traces: 7,
  db_queries: 7,
  api_calls: 15,
};

function formatApiLimitFeature(n: number | null): string {
  return n == null ? 'Custom API limits' : `${formatCompactNumber(n)} API requests/mo`;
}

function computeTone(value: number, limit: number | null): 'success' | 'warning' | 'danger' {
  if (limit == null) return 'success';
  if (value >= limit) return 'danger';
  if (value / limit >= 0.75) return 'warning';
  return 'success';
}

const TONE_BAR_CLASS: Record<'success' | 'warning' | 'danger', string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

function UsageMetricCard({
  label,
  value,
  limit,
  pct,
  tone,
  badge,
}: {
  label: string;
  value: string;
  limit: string;
  pct: number;
  tone: 'success' | 'warning' | 'danger';
  badge?: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-5 shadow-sm">
      <div className="flex justify-between items-center mb-3">
        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{label}</div>
        {badge && (
          <span className="bg-danger-light text-danger text-[10px] font-bold px-2 py-0.5 rounded border border-danger/20">{badge}</span>
        )}
      </div>
      <div className="flex items-end gap-1 mb-2">
        <span className="text-2xl font-bold text-text-primary leading-none">{value}</span>
        <span className="text-sm text-text-secondary mb-0.5">/ {limit}</span>
      </div>
      <div className="w-full h-1.5 bg-background rounded-full overflow-hidden mt-3">
        <div className={`h-full rounded-full ${TONE_BAR_CLASS[tone]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Deliberately bar-free — logs/traces/db_queries/storage have no enforced
// plan cap the way Projects/API Requests do, so a progress bar here would
// imply a limit that doesn't exist. Just the number, same principle as the
// Delivery Dashboard's structural (no-status) stage chips.
function InfoStatCard({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{label}</div>
        <Icon name={icon} className="text-[16px] text-text-muted" />
      </div>
      <span className="text-2xl font-bold text-text-primary leading-none">{value}</span>
      {hint && <p className="text-xs text-text-secondary mt-2">{hint}</p>}
    </div>
  );
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-background ${className}`} />;
}

export default function OrgBilling() {
  const { currentOrganization, currentRole } = useOrg();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<OrganizationSubscription | null>(null);
  const [usage, setUsage] = useState<OrgProjectUsage | null>(null);
  const [usageBreakdown, setUsageBreakdown] = useState<OrgUsageBreakdown | null>(null);
  const [retentionPolicies, setRetentionPolicies] = useState<RetentionPolicy[]>([]);
  const [seatCount, setSeatCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updatingPlanId, setUpdatingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  const [customDays, setCustomDays] = useState<Record<RetentionDataType, number>>(DEFAULT_CUSTOM_DAYS);
  const [savingCustomPlan, setSavingCustomPlan] = useState(false);
  const [priceEstimate, setPriceEstimate] = useState<CustomPlanPriceEstimate | null>(null);
  const [estimatingPrice, setEstimatingPrice] = useState(false);

  const isOwner = currentRole === 'owner';

  const load = useCallback(async () => {
    if (!currentOrganization) return;
    const subscriptionData = await getOrgSubscription(currentOrganization.id);
    const [planData, usageData, usageBreakdownData, seatData, retentionData] = await Promise.all([
      getPlans(),
      getOrgProjectUsage(currentOrganization.id),
      getOrgUsageBreakdown(currentOrganization.id),
      getOrgSeatCount(currentOrganization.id),
      getRetentionPolicies(subscriptionData?.plan_id ?? 'free'),
    ]);
    setSubscription(subscriptionData);
    setPlans(planData);
    setUsage(usageData);
    setUsageBreakdown(usageBreakdownData);
    setSeatCount(seatData);
    setRetentionPolicies(retentionData);
  }, [currentOrganization]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Live price preview — recomputes on every dropdown change so the number
  // shown while building is always exactly what create_custom_plan() would
  // charge if saved right now, not a stale/approximate figure.
  useEffect(() => {
    if (!showCustomBuilder || !currentOrganization) return;
    let cancelled = false;
    setEstimatingPrice(true);
    estimateCustomPlanPrice(currentOrganization.id, customDays)
      .then((estimate) => {
        if (!cancelled) setPriceEstimate(estimate);
      })
      .catch((err) => {
        if (!cancelled) setError(describeSupabaseError(err, 'Could not estimate custom plan price.'));
      })
      .finally(() => {
        if (!cancelled) setEstimatingPrice(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showCustomBuilder, customDays, currentOrganization]);

  const handleSelectPlan = async (planId: string) => {
    if (!currentOrganization) return;
    setUpdatingPlanId(planId);
    setError(null);
    try {
      await updateOrgPlan(currentOrganization.id, planId);
      await load();
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not change plan.'));
    } finally {
      setUpdatingPlanId(null);
    }
  };

  // Prefills from whatever's active right now — the current plan's own
  // retention (if already on the custom plan, that's the custom numbers
  // themselves, so this doubles as "edit my custom plan") — so opening the
  // builder never resets someone's numbers back to arbitrary defaults.
  const handleOpenCustomBuilder = () => {
    const byType = Object.fromEntries(retentionPolicies.map((p) => [p.data_type, p.retention_days])) as Partial<
      Record<RetentionDataType, number>
    >;
    setCustomDays({ ...DEFAULT_CUSTOM_DAYS, ...byType });
    setShowCustomBuilder(true);
  };

  const handleSaveCustomPlan = async () => {
    if (!currentOrganization) return;
    setSavingCustomPlan(true);
    setError(null);
    try {
      await createCustomPlan(currentOrganization.id, customDays);
      setShowCustomBuilder(false);
      await load();
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not save custom plan.'));
    } finally {
      setSavingCustomPlan(false);
    }
  };

  const currentPlan = plans.find((p) => p.id === subscription?.plan_id) ?? null;
  const publicPlans = plans.filter((p) => !p.is_custom);
  const activeCount = usage?.activeCount ?? 0;
  const maxProjects = usage?.maxProjects ?? null;
  const atProjectLimit = maxProjects != null && activeCount >= maxProjects;
  const upgradeTarget = publicPlans.find((p) => p.sort_order > (currentPlan?.sort_order ?? -1)) ?? null;

  const apiUsage = usageBreakdown?.apiCallsIngested ?? 0;
  const projectsPct = maxProjects ? Math.min(100, (activeCount / maxProjects) * 100) : 8;
  const apiLimit = currentPlan?.max_api_requests_per_month ?? null;
  const apiPct = apiLimit ? Math.min(100, (apiUsage / apiLimit) * 100) : 8;
  const seatPct = Math.min(60, seatCount * 5);

  const showLimitBanner = atProjectLimit || subscription?.status === 'grace_period' || subscription?.status === 'suspended';

  return (
    <>
      <PageHeader
        title="Billing & Plans"
        subtitle="Manage your subscription, usage, and payment methods."
        actions={
          subscription ? (
            <StatusPill tone={SUBSCRIPTION_STATUS_TONE[subscription.status]}>
              {currentPlan?.name ?? subscription.plan_id} · {SUBSCRIPTION_STATUS_LABEL[subscription.status]}
            </StatusPill>
          ) : undefined
        }
      />

      {showLimitBanner && (
        <div className="bg-danger/5 border-l-4 border-danger rounded-r-lg p-4 flex items-start gap-4 mb-8">
          <div className="text-danger mt-0.5">
            <Icon name="error" className="text-[20px]" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-text-primary m-0">Project Limit Reached</h3>
            <p className="text-sm text-text-secondary mt-1">
              You have reached the maximum number of active projects ({activeCount}/{maxProjects ?? '∞'}) for the {currentPlan?.name ?? 'current'}{' '}
              plan.{' '}
              {subscription?.grace_period_ends_at ? (
                <>
                  Archive projects or upgrade by{' '}
                  <strong className="text-text-primary">{new Date(subscription.grace_period_ends_at).toLocaleDateString()}</strong> to create new
                  ones.
                </>
              ) : (
                'Archive projects or upgrade to create new ones.'
              )}
            </p>
            <div className="mt-3 flex gap-4">
              {upgradeTarget && (
                <button
                  type="button"
                  className="text-sm font-medium text-danger hover:text-danger/80"
                  onClick={() => handleSelectPlan(upgradeTarget.id)}
                  disabled={!isOwner || updatingPlanId !== null}
                >
                  Upgrade to {upgradeTarget.name}
                </button>
              )}
              <Link to="/projects" className="text-sm font-medium text-text-secondary hover:text-text-primary">
                Manage Projects
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Current Usage */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-text-primary mb-4">Current Usage</h2>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SkeletonBlock className="h-[104px]" />
            <SkeletonBlock className="h-[104px]" />
            <SkeletonBlock className="h-[104px]" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <UsageMetricCard
              label="Projects"
              value={String(activeCount)}
              limit={maxProjects == null ? '∞' : String(maxProjects)}
              pct={projectsPct}
              tone={computeTone(activeCount, maxProjects)}
              badge={atProjectLimit ? 'LIMIT REACHED' : undefined}
            />
            <UsageMetricCard
              label="API Requests"
              value={formatCompactNumber(apiUsage)}
              limit={apiLimit == null ? 'Custom' : formatCompactNumber(apiLimit)}
              pct={apiPct}
              tone={computeTone(apiUsage, apiLimit)}
            />
            <UsageMetricCard label="Team Seats" value={String(seatCount)} limit="Unlimited" pct={seatPct} tone="success" />
          </div>
        )}
      </section>

      {/* Telemetry ingested — the raw volume behind the Projects/API cards above.
          No progress bars here: unlike Projects/API Requests, there's no plan cap
          on log/trace/db-query volume, only a retention window (see Data Retention
          below), so a bar would imply a limit that doesn't exist. */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-text-primary mb-1">Telemetry Ingested This Month</h2>
        <p className="text-sm text-text-secondary mb-4">
          Raw event volume received from your services' SDKs. Retention (below) determines how long it's kept, not a plan cap.
        </p>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <SkeletonBlock className="h-[104px]" />
            <SkeletonBlock className="h-[104px]" />
            <SkeletonBlock className="h-[104px]" />
            <SkeletonBlock className="h-[104px]" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <InfoStatCard label="Logs" value={formatCompactNumber(usageBreakdown?.logsIngested ?? 0)} icon="description" />
            <InfoStatCard label="Traces" value={formatCompactNumber(usageBreakdown?.tracesIngested ?? 0)} icon="route" />
            <InfoStatCard label="DB Queries" value={formatCompactNumber(usageBreakdown?.dbQueriesIngested ?? 0)} icon="storage" />
            <InfoStatCard
              label="Storage Used"
              value={formatStorage(usageBreakdown?.storageUsedMb ?? null)}
              hint={usageBreakdown?.storageUsedMb == null ? 'Refreshes nightly — no snapshot yet' : 'As of last nightly refresh'}
              icon="save"
            />
          </div>
        )}
      </section>

      {/* Data retention — how long each telemetry type above is kept before
          cleanup_expired_telemetry() deletes it, for this org's current plan. */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-text-primary mb-1">Data Retention</h2>
        <p className="text-sm text-text-secondary mb-4">
          How long each telemetry type is kept on the {currentPlan?.name ?? 'current'} plan before it's automatically cleaned up.
        </p>
        {loading ? (
          <SkeletonBlock className="h-[88px]" />
        ) : retentionPolicies.length === 0 ? (
          <div className="bg-surface border border-border rounded-lg p-5 shadow-sm">
            <p className="text-sm text-text-secondary">No retention policy configured for this plan yet.</p>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-5 shadow-sm flex flex-wrap gap-3">
            {retentionPolicies.map((policy) => (
              <div key={policy.data_type} className="flex items-center gap-3 border border-border rounded-lg px-4 py-3 flex-1 min-w-[180px]">
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${RETENTION_CHIP_CLASSES[policy.data_type]}`}>
                  <Icon name={RETENTION_ICON[policy.data_type]} className="text-[18px]" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-text-primary">{RETENTION_LABEL[policy.data_type]}</div>
                  <div className="text-xs text-text-secondary">
                    Kept {policy.retention_days} day{policy.retention_days === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Custom retention plan — build_custom_plan() dynamically creates a
          plans row + 4 retention_policies rows scoped to this org, then
          switches organization_subscriptions to it. Once active, the "Data
          Retention" section above already reflects it (it just reads
          whatever plan is current), so this section doesn't need to repeat
          those numbers — it's purely the entry point to create/edit it. */}
      <section className="mb-10">
        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-base font-bold text-text-primary mb-1">Custom Retention Plan</h2>
              <p className="text-sm text-text-secondary max-w-xl">
                {currentPlan?.is_custom
                  ? "You're on your own custom retention plan (see the numbers above). Adjust any of them below."
                  : "Don't need one of the preset tiers? Pick exactly how long each telemetry type is kept, independent of Free/Pro/Enterprise."}
              </p>
            </div>
            {!showCustomBuilder && (
              <div className="flex items-center gap-3 shrink-0">
                {currentPlan?.is_custom && (
                  <span className="text-right">
                    <span className="text-lg font-bold text-text-primary">{formatCents(currentPlan.price_cents)}</span>
                    <span className="text-xs text-text-secondary">/mo</span>
                  </span>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleOpenCustomBuilder}
                  disabled={!isOwner}
                  title={!isOwner ? 'Only the organization owner can build a custom plan' : undefined}
                >
                  <Icon name="tune" className="text-[16px]" />
                  {currentPlan?.is_custom ? 'Edit Custom Plan' : 'Build Custom Plan'}
                </Button>
              </div>
            )}
          </div>

          {showCustomBuilder && (
            <div className="mt-4 border-t border-border pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {(['logs', 'traces', 'db_queries', 'api_calls'] as RetentionDataType[]).map((type) => (
                  <div key={type}>
                    <label className="text-xs text-text-secondary flex items-center gap-1.5 mb-1">
                      <Icon name={RETENTION_ICON[type]} className="text-[14px]" />
                      {RETENTION_LABEL[type]}
                    </label>
                    <select
                      value={customDays[type]}
                      onChange={(e) => setCustomDays((prev) => ({ ...prev, [type]: Number(e.target.value) }))}
                      className="w-full h-10 px-3 bg-white border border-border rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      {RETENTION_DAY_OPTIONS.map((days) => (
                        <option key={days} value={days}>
                          {formatDays(days)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Full breakdown, not just a total — base fee, storage cost, the
                  $/GB rate, and the estimated GB per data type it's derived
                  from, so the number is never a black box. */}
              <div className="mt-4 bg-background border border-border rounded-lg p-4">
                {estimatingPrice && !priceEstimate ? (
                  <p className="text-sm text-text-secondary">Calculating price…</p>
                ) : priceEstimate ? (
                  <>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-sm font-semibold text-text-primary">Estimated price</span>
                      <span className={`text-2xl font-bold text-text-primary transition-opacity ${estimatingPrice ? 'opacity-50' : ''}`}>
                        {formatCents(priceEstimate.total_cents)}
                        <span className="text-sm font-normal text-text-secondary">/mo</span>
                      </span>
                    </div>

                    {!priceEstimate.has_usage_data && (
                      <div className="mt-2 flex items-start gap-2 text-xs text-warning bg-warning-light rounded-md px-3 py-2">
                        <Icon name="info" className="text-[14px] mt-0.5 shrink-0" />
                        <span>
                          No ingestion recorded this month or last month, so there's nothing to project a storage rate from — the price above is
                          the base fee only and won't change as you adjust retention until your services start sending telemetry.
                        </span>
                      </div>
                    )}

                    <div className="mt-3 space-y-1.5 text-sm">
                      <div className="flex items-center justify-between text-text-secondary">
                        <span>Base platform fee</span>
                        <span>{formatCents(priceEstimate.base_fee_cents)}</span>
                      </div>
                      <div className="flex items-center justify-between text-text-secondary">
                        <span>
                          Storage (~{priceEstimate.estimated_gb.toFixed(2)} GB estimated at {formatCents(priceEstimate.price_per_gb_cents)}/GB)
                        </span>
                        <span>{formatCents(priceEstimate.storage_cost_cents)}</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-x-4 gap-y-1">
                      {(['logs', 'traces', 'db_queries', 'api_calls'] as RetentionDataType[]).map((type) => (
                        <span key={type} className="text-xs text-text-secondary">
                          {RETENTION_LABEL[type]}: ~{priceEstimate.breakdown[type].estimated_gb.toFixed(2)} GB
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-text-muted mt-3">
                      Estimated from your current ingestion rate projected across each retention window — actual storage (and price) moves
                      with real usage, not a fixed number. Storage priced at {formatCents(priceEstimate.infra_cost_per_gb_cents)}/GB
                      infra cost + {priceEstimate.target_margin_pct}% margin.
                    </p>
                  </>
                ) : null}
              </div>

              <div className="mt-3 flex items-center gap-3">
                <Button type="button" onClick={handleSaveCustomPlan} disabled={savingCustomPlan || !priceEstimate}>
                  {savingCustomPlan ? 'Saving…' : priceEstimate ? `Save Custom Plan — ${formatCents(priceEstimate.total_cents)}/mo` : 'Save Custom Plan'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowCustomBuilder(false)} disabled={savingCustomPlan}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      {/* Available Plans */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-text-primary">Available Plans</h2>
          <div className="flex items-center gap-1 bg-background p-1 rounded-lg border border-border">
            <button type="button" className="px-3 py-1 text-sm font-medium bg-surface text-text-primary rounded shadow-sm border border-border/50">
              Monthly
            </button>
            <button
              type="button"
              disabled
              title="Coming soon"
              className="px-3 py-1 text-sm font-medium text-text-muted cursor-not-allowed"
            >
              Annually <span className="text-[10px] text-success ml-1">Save 20%</span>
            </button>
          </div>
        </div>

        {loading ? (
          <SkeletonBlock className="h-[420px]" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 border border-border rounded-xl bg-surface overflow-hidden shadow-sm">
            {publicPlans.map((plan, i) => {
              const isCurrent = subscription?.plan_id === plan.id;
              const isRecommended = plan.id === RECOMMENDED_PLAN_ID;
              const isLastColumn = i === publicPlans.length - 1;
              const isDowngrade = currentPlan != null && plan.sort_order < currentPlan.sort_order;
              const features = [
                plan.max_projects === null ? 'Unlimited projects' : `Up to ${plan.max_projects} active project${plan.max_projects === 1 ? '' : 's'}`,
                formatApiLimitFeature(plan.max_api_requests_per_month),
                ...(PLAN_EXTRA_FEATURES[plan.id] ?? []),
              ];

              return (
                <div
                  key={plan.id}
                  className={`relative p-6 flex flex-col ${!isLastColumn ? 'border-b md:border-b-0 md:border-r border-border' : ''} ${
                    isRecommended ? 'bg-primary/5' : ''
                  }`}
                >
                  {isRecommended && <div className="absolute top-0 left-0 w-full h-1 bg-primary" />}

                  <div className="mb-4 h-7 flex items-center">
                    {isCurrent ? (
                      <span className="bg-background text-text-secondary border border-border text-[11px] font-bold px-2 py-1 rounded">
                        Current Plan
                      </span>
                    ) : isRecommended ? (
                      <span className="bg-primary-light text-primary text-[11px] font-bold px-2 py-1 rounded">Most Popular</span>
                    ) : null}
                  </div>

                  <h3 className="text-lg font-bold text-text-primary mb-1">{plan.name}</h3>
                  <p className="text-sm text-text-secondary mb-4 h-10">{PLAN_DESCRIPTIONS[plan.id] ?? ''}</p>

                  <div className="mb-6">
                    {plan.max_projects === null ? (
                      <span className="text-3xl font-bold text-text-primary">Custom</span>
                    ) : (
                      <span className="text-3xl font-bold text-text-primary">
                        ${(plan.price_cents / 100).toFixed(0)}
                        <span className="text-sm font-normal text-text-secondary ml-1">/mo</span>
                      </span>
                    )}
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-text-secondary">
                        <Icon name="check" className={`text-[16px] mt-0.5 shrink-0 ${isRecommended ? 'text-primary' : 'text-text-secondary'}`} />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <button
                      type="button"
                      disabled
                      className="w-full py-2 px-4 rounded-md text-sm font-medium bg-background text-text-secondary border border-border cursor-default"
                    >
                      Current Plan
                    </button>
                  ) : (
                    <Button
                      variant={isRecommended ? 'primary' : 'secondary'}
                      className="w-full"
                      disabled={!isOwner || updatingPlanId !== null}
                      onClick={() => handleSelectPlan(plan.id)}
                      title={!isOwner ? 'Only the organization owner can change plans' : undefined}
                    >
                      {updatingPlanId === plan.id
                        ? 'Switching…'
                        : plan.id === 'enterprise'
                          ? 'Contact Sales'
                          : `${isDowngrade ? 'Downgrade' : 'Upgrade'} to ${plan.name}`}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Billing History */}
      <section>
        <h2 className="text-lg font-bold text-text-primary mb-4">Billing History</h2>
        <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-background border-b border-border">
                <th className="py-3 px-4 text-xs font-semibold text-text-secondary uppercase tracking-wider">Date</th>
                <th className="py-3 px-4 text-xs font-semibold text-text-secondary uppercase tracking-wider">Description</th>
                <th className="py-3 px-4 text-xs font-semibold text-text-secondary uppercase tracking-wider">Amount</th>
                <th className="py-3 px-4 text-xs font-semibold text-text-secondary uppercase tracking-wider text-right">Receipt</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4}>
                  <EmptyState
                    icon="receipt_long"
                    title="No billing history yet"
                    description="Invoices will appear here once a payment method is connected. You're currently on a self-serve plan with no charges."
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
