import { useState } from 'react';
import { Icon } from './ui';

export function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg overflow-hidden border border-border">
      <div className="flex items-center justify-between px-3 py-1.5 bg-secondary/95">
        <span className="text-[11px] font-mono text-slate-400">{label}</span>
        <button type="button" onClick={handleCopy} className="flex items-center gap-1 text-slate-400 hover:text-white">
          <Icon name={copied ? 'check' : 'content_copy'} className="text-[14px]" />
          <span className="text-[11px]">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="bg-secondary text-slate-100 p-3 text-[11px] leading-relaxed overflow-x-auto font-mono m-0">{code}</pre>
    </div>
  );
}
