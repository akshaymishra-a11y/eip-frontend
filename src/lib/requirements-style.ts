import type { Requirement, RequirementDocumentStatus } from './types';

// Shared between RequirementsDashboard (the list) and RequirementDocumentDetail
// (the per-document page) so both render the same labels/formatting.

export function formatFileSize(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const CATEGORY_LABEL: Record<Requirement['category'], string> = {
  functional: 'Functional',
  non_functional: 'Non-functional',
  business_rule: 'Business rule',
  constraint: 'Constraint',
};

export const PRIORITY_LABEL: Record<NonNullable<Requirement['priority']>, string> = {
  must: 'Must',
  should: 'Should',
  could: 'Could',
  wont: "Won't",
};

export function statusTone(status: RequirementDocumentStatus) {
  if (status === 'processed') return 'success' as const;
  if (status === 'failed') return 'danger' as const;
  if (status === 'processing') return 'warning' as const;
  return 'neutral' as const;
}

export function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
