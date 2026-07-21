import { CATEGORY_LABEL, PRIORITY_LABEL } from '../../lib/requirements-style';
import type { Requirement } from '../../lib/types';

export function RequirementCard({ req }: { req: Requirement }) {
  return (
    <div className="border border-border rounded-lg p-4 bg-white">
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        <span className="text-[11px] font-mono font-semibold text-text-muted">{req.requirement_key}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-primary-light text-primary">
          {CATEGORY_LABEL[req.category]}
        </span>
        {req.priority && (
          <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-warning-light text-warning">
            {PRIORITY_LABEL[req.priority]}
          </span>
        )}
        {req.ai_confidence != null && (
          <span className="text-[11px] text-text-muted ml-auto">{Math.round(req.ai_confidence * 100)}% confidence</span>
        )}
      </div>
      <p className="text-sm font-medium text-text-primary">{req.title}</p>
      {req.description && <p className="text-xs text-text-secondary mt-1">{req.description}</p>}
      {req.source_excerpt && (
        <p className="text-xs text-text-muted mt-2 italic border-l-2 border-border pl-2">"{req.source_excerpt}"</p>
      )}
      {req.suggested_test_cases && req.suggested_test_cases.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Suggested Test Cases</p>
          <ul className="space-y-1.5">
            {req.suggested_test_cases.map((tc, i) => (
              <li key={i} className="text-xs text-text-secondary">
                <span className="font-medium text-text-primary">{tc.title}</span>
                {tc.steps?.length > 0 && (
                  <ol className="list-decimal list-inside ml-3 text-text-muted">
                    {tc.steps.map((step, si) => (
                      <li key={si}>{step}</li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
