import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>;
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover shadow-sm',
  secondary: 'bg-white text-text-primary border border-border hover:bg-background',
  danger: 'bg-danger text-white hover:opacity-90 shadow-sm',
  ghost: 'text-text-secondary hover:text-text-primary hover:bg-background',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }>(
  function Button({ variant = 'secondary', className = '', children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] ${buttonVariantClasses[variant]} ${className}`}
        {...rest}
      >
        {children}
      </button>
    );
  }
);

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`bg-surface border border-border rounded-lg shadow-sm ${className}`}>{children}</div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-text-secondary mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
    </div>
  );
}

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

const statusToneClasses: Record<StatusTone, string> = {
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  danger: 'bg-danger-light text-danger',
  neutral: 'bg-background text-text-secondary',
};

const statusDotClasses: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-text-muted',
};

export function StatusPill({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${statusToneClasses[tone]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${statusDotClasses[tone]}`} />
      {children}
    </span>
  );
}

const kpiChipClasses: Record<StatusTone, string> = {
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  danger: 'bg-danger-light text-danger',
  neutral: 'bg-primary-light text-primary',
};

const kpiDeltaClasses: Record<StatusTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-text-secondary',
};

// A corner badge on the icon chip so tone is never color-only — success gets
// a check, warning/danger get an exclamation (distinct background darkness
// and icon from success), neutral gets nothing. Keeps the signal readable
// for colorblind users without adding a second text label everywhere.
const kpiBadgeClasses: Record<StatusTone, string> = {
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
  danger: 'bg-danger text-white',
  neutral: '',
};

const kpiBadgeIcon: Record<StatusTone, string> = {
  success: 'check',
  warning: 'priority_high',
  danger: 'priority_high',
  neutral: '',
};

export function KpiCard({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  icon,
  hint,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  deltaTone?: StatusTone;
  icon?: string;
  hint?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        {icon ? (
          <div className={`relative w-10 h-10 rounded-lg flex items-center justify-center ${kpiChipClasses[deltaTone]}`}>
            <Icon name={icon} className="text-[20px]" />
            {deltaTone !== 'neutral' && (
              <span
                className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-surface ${kpiBadgeClasses[deltaTone]}`}
              >
                <Icon name={kpiBadgeIcon[deltaTone]} className="text-[9px]" />
              </span>
            )}
          </div>
        ) : (
          <span />
        )}
        {delta && <span className={`text-xs font-semibold ${kpiDeltaClasses[deltaTone]}`}>{delta}</span>}
      </div>
      <div>
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide block mb-1">{label}</span>
        <span className="text-3xl font-bold text-text-primary">{value}</span>
      </div>
      {hint && <p className="text-xs text-text-secondary mt-2">{hint}</p>}
    </Card>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  iconClassName = 'bg-background text-text-muted',
}: {
  icon: string;
  title: string;
  description: string;
  action?: ReactNode;
  iconClassName?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${iconClassName}`}>
        <Icon name={icon} className="text-[24px]" />
      </div>
      <h3 className="text-base font-semibold text-text-primary mb-1">{title}</h3>
      <p className="text-sm text-text-secondary max-w-sm">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-border flex-wrap gap-3">
      <p className="text-xs text-text-secondary">
        Showing {start}-{end} of {total}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="h-8 px-3 rounded-md text-xs font-semibold bg-white border border-border text-text-secondary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <span className="text-xs text-text-secondary">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="h-8 px-3 rounded-md text-xs font-semibold bg-white border border-border text-text-secondary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

