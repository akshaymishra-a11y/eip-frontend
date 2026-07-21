import { useEffect, useState } from 'react';
import { Icon } from './ui';

const DEFAULT_MESSAGES = [
  'Initializing EIP SDK...',
  'Validating system credentials...',
  'Discovering microservices...',
  'Establishing secure telemetry channel...',
];

function useSimulatedProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let current = 0;
    let timeout: ReturnType<typeof setTimeout>;
    const tick = () => {
      // Caps below 100 — this is a cosmetic "still working" indicator, not a
      // real measurement, so it should never claim completion on its own;
      // the component simply unmounts once the real fetch/check resolves.
      current = Math.min(current + Math.random() * 8 + 1, 96);
      setProgress(current);
      timeout = setTimeout(tick, Math.random() * 400 + 200);
    };
    timeout = setTimeout(tick, 150);
    return () => clearTimeout(timeout);
  }, []);
  return progress;
}

function useMessageTicker(messages: string[], intervalMs: number) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (messages.length <= 1) return;
    setIndex(0);
    const id = setInterval(() => setIndex((i) => (i + 1) % messages.length), intervalMs);
    return () => clearInterval(id);
  }, [messages, intervalMs]);
  return messages[index] ?? messages[0];
}

// One consistent rich design everywhere (logo, orbiting service nodes,
// simulated progress bar, rotating status line) — `fullScreen` only
// changes how it's positioned so it fits whatever it's loading into:
// a fixed viewport overlay before the app shell exists (auth/org checks),
// or a block that fills the current page's content area once the
// sidebar/topbar are already on screen.
export function Loader({
  fullScreen = true,
  messages = DEFAULT_MESSAGES,
}: {
  fullScreen?: boolean;
  messages?: string[];
}) {
  const progress = useSimulatedProgress();
  const message = useMessageTicker(messages, fullScreen ? 1400 : 1600);

  return (
    <div
      className={`flex flex-col items-center justify-center overflow-hidden bg-background ${
        fullScreen ? 'fixed inset-0 z-50' : 'relative w-full min-h-[70vh]'
      }`}
    >
      {fullScreen && <div className="eip-scanline" />}

      <div className="flex flex-col items-center gap-2 mb-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.35)]">
            <Icon name="hub" className="text-white text-[18px]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">EIP</h1>
        </div>
        <p className="text-text-secondary uppercase tracking-widest text-[10px] font-semibold">
          Engineering Intelligence Platform
        </p>
      </div>

      <div className="relative w-56 h-56 mb-10 flex items-center justify-center">
        <div className="absolute inset-0 bg-primary/5 rounded-full blur-[60px]" />
        <div className="absolute inset-0 eip-orbit">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-lg bg-white border border-border flex items-center justify-center shadow-sm">
            <Icon name="dns" className="text-primary text-[18px]" />
          </div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-10 h-10 rounded-lg bg-white border border-border flex items-center justify-center shadow-sm">
            <Icon name="storage" className="text-primary text-[18px]" />
          </div>
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 rounded-lg bg-white border border-border flex items-center justify-center shadow-sm">
            <Icon name="cloud" className="text-primary text-[18px]" />
          </div>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-10 h-10 rounded-lg bg-white border border-border flex items-center justify-center shadow-sm">
            <Icon name="api" className="text-primary text-[18px]" />
          </div>
        </div>
        <svg className="absolute inset-0 w-full h-full opacity-40" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#CBD5E1" strokeDasharray="2 2" strokeWidth="0.5" />
          <line x1="50" y1="50" x2="50" y2="10" stroke="#2563EB" strokeDasharray="4 2" strokeWidth="0.75" />
          <line x1="50" y1="50" x2="50" y2="90" stroke="#2563EB" strokeDasharray="4 2" strokeWidth="0.75" />
          <line x1="50" y1="50" x2="10" y2="50" stroke="#2563EB" strokeDasharray="4 2" strokeWidth="0.75" />
          <line x1="50" y1="50" x2="90" y2="50" stroke="#2563EB" strokeDasharray="4 2" strokeWidth="0.75" />
        </svg>
        <div className="relative w-20 h-20 bg-white border-2 border-primary rounded-2xl flex items-center justify-center shadow-md z-20 eip-pulse-core">
          <div className="absolute inset-0 bg-primary/10 animate-ping rounded-2xl" />
          <Icon name="power" className="text-primary text-[32px]" />
        </div>
      </div>

      <div className="w-full max-w-sm space-y-3 px-6">
        <div className="flex justify-between items-end px-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">System Integrity</span>
          <span className="font-mono text-lg font-bold text-text-primary">{Math.floor(progress)}%</span>
        </div>
        <div className="h-2 w-full bg-background rounded-full overflow-hidden border border-border">
          <div className="h-full bg-primary rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mt-6 h-6 flex items-center justify-center px-6">
        <p key={message} className="text-sm font-mono text-text-secondary eip-log-fade-in flex items-center gap-2">
          <span className="text-primary text-[10px]">&gt;&gt;</span>
          <span className="font-semibold text-text-primary">{message}</span>
        </p>
      </div>

      <p
        className={`text-center text-text-secondary italic text-sm opacity-80 ${
          fullScreen ? 'fixed bottom-12' : 'mt-10'
        }`}
      >
        Plugging into your engineering ecosystem...
      </p>
    </div>
  );
}
