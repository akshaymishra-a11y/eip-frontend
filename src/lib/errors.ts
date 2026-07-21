import { humanizeNodeType } from './cloud-graph-style';

const HTML_BODY_PATTERN = /<!DOCTYPE html|<html[\s>]/i;

// Translates one raw technical error string (from a background sync/poll —
// e.g. cloud_accounts.last_error, project_integrations.last_error) into a
// human-readable sentence. Pattern-matches the handful of failure shapes
// this platform's collectors/pollers actually produce (raw HTTP status
// codes, AWS/Azure/GCP error payloads, network-level failures) rather than
// showing the technical text directly — falls back to the original message
// verbatim for anything unrecognized, so nothing is ever silently hidden.
export type ErrorTone = 'info' | 'danger';

function humanizeSingleErrorMessage(message: string): { message: string; tone: ErrorTone } {
  const trimmed = message.trim();
  if (!trimmed) return { message: trimmed, tone: 'danger' };

  // AWS Cost Explorer hasn't finished ingesting data yet — most commonly
  // because it was only just enabled on the account (AWS backfills over the
  // following ~24h). Expected and self-resolving, not a real failure, so
  // callers should style this as an informational notice, not an error.
  if (trimmed.includes('DataUnavailableException')) {
    return {
      message: 'Cost data not yet available — AWS is still backfilling Cost Explorer for this account (usually resolves within 24h).',
      tone: 'info',
    };
  }

  // A non-JSON (typically HTML) response body reaching this far means
  // something in the network path (a corporate proxy/firewall) intercepted
  // the request before it reached the cloud provider's real API. This is an
  // environmental condition outside the account's own configuration (and
  // outside this platform's control) — every other resource type that isn't
  // blocked by the same network policy still syncs normally, so it's styled
  // as informational rather than a blocking error, same as throttling/5xx
  // below.
  if (HTML_BODY_PATTERN.test(trimmed)) {
    return { message: 'Could not reach the cloud provider for this resource type — a network or firewall issue on this platform\'s network appears to be blocking just this request (other resource types are unaffected).', tone: 'info' };
  }

  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(trimmed)) {
    return { message: 'Could not connect to the cloud provider for this resource type — likely the same network condition as above (other resource types are unaffected).', tone: 'info' };
  }

  if (/\b(401|403)\b/.test(trimmed) || /AccessDenied|UnauthorizedOperation|AuthFailure|invalid_client|invalid_grant|Tenant .* not found/i.test(trimmed)) {
    return { message: 'Authentication failed — check that the credentials are correct and have the required permissions.', tone: 'danger' };
  }

  if (/\b429\b/.test(trimmed) || /Throttl|RequestLimitExceeded|rateLimitExceeded/i.test(trimmed)) {
    return { message: 'Rate limited by the cloud provider — this will be retried automatically.', tone: 'info' };
  }

  if (/\b5\d{2}\b/.test(trimmed)) {
    return { message: 'The cloud provider is experiencing issues on its end — this will be retried automatically.', tone: 'info' };
  }

  if (/\b404\b/.test(trimmed)) {
    return { message: 'The requested resource could not be found — this may indicate a configuration issue.', tone: 'danger' };
  }

  return { message: trimmed, tone: 'danger' };
}

function humanizeErrorLabel(label: string): string {
  if (label === 'credentials') return 'Connecting';
  if (label === 'topology inference') return 'Topology analysis';
  return humanizeNodeType(label);
}

export type HumanizedSyncError = {
  summary: string;
  tone: ErrorTone;
  items: { label: string; message: string; tone: ErrorTone }[];
};

// Cloud account sync errors are a semicolon-joined list of
// "{node_type} ({region}): {message}" segments (cloud-discovery.poller.ts) —
// this splits and humanizes each one. Plain single-message errors (e.g.
// project_integrations.last_error) come back as a single item.
export function humanizeCloudSyncError(rawError: string): HumanizedSyncError {
  const segments = rawError
    .split('; ')
    .map((s) => s.trim())
    .filter(Boolean);

  const items = segments.map((segment) => {
    const idx = segment.indexOf(': ');
    if (idx === -1) {
      const { message, tone } = humanizeSingleErrorMessage(segment);
      return { label: '', message, tone };
    }
    const rawLabel = segment.slice(0, idx);
    const rest = segment.slice(idx + 2);
    const regionMatch = rawLabel.match(/^(.+?)\s*\(([^)]+)\)$/);
    const label = regionMatch ? `${humanizeErrorLabel(regionMatch[1])} (${regionMatch[2]})` : humanizeErrorLabel(rawLabel);
    const { message, tone } = humanizeSingleErrorMessage(rest);
    return { label, message, tone };
  });

  const overallTone: ErrorTone = items.some((i) => i.tone === 'danger') ? 'danger' : 'info';
  const summary =
    items.length === 0
      ? 'An error occurred while syncing with the cloud provider.'
      : items.length === 1
        ? items[0].message
        : `${items.length} discovery checks couldn't complete.`;

  return { summary, tone: overallTone, items };
}

// Supabase/PostgREST errors carry a `.message` that's often too generic on
// its own (e.g. plain "permission denied") — `.hint` usually has the actual
// actionable detail, and `.code` lets us recognize specific, common
// misconfigurations (missing table, RLS denial) instead of just relaying
// whatever Postgres said. Crucially, these errors are plain objects, not
// `Error` instances, so `err instanceof Error` checks silently discard them.
export function describeSupabaseError(err: unknown, fallback: string): string {
  const e = err as { message?: string; hint?: string; code?: string } | null;
  if (e && typeof e === 'object') {
    if (e.message?.includes('PROJECT_LIMIT_REACHED')) {
      const detail = e.message.split('PROJECT_LIMIT_REACHED:')[1]?.trim() ?? e.message;
      return `${detail} Upgrade your plan from the Billing page to add more.`;
    }
    if (e.code === 'PGRST205' || e.code === '42P01') {
      return "That table doesn't exist in your Supabase project yet. Paste the latest supabase/schema.sql into the Supabase SQL Editor and run it, then reload this page.";
    }
    if (e.code === '42501' || e.code === 'PGRST301') {
      const detail = e.message ?? '';
      return `Permission denied — restricted by row-level security. Check that your account has the right role in this organization/project. (${detail})`;
    }
    if (e.message) return e.hint ? `${e.message} (${e.hint})` : e.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
