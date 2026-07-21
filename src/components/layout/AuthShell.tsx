import type { ReactNode } from 'react';
import { Icon } from '../ui';

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-background">
      <div className="flex-1 flex items-center justify-center p-gutter relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px]" />
        </div>
        <div className="relative z-10 w-full max-w-[440px]">
          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-secondary rounded flex items-center justify-center shadow-sm">
                <Icon name="schema" className="text-white text-[24px]" />
              </div>
              <h1 className="text-xl font-semibold text-text-primary tracking-tight">Engineering Intel</h1>
            </div>
            <p className="text-sm text-text-secondary">Enterprise Tier Infrastructure Monitoring</p>
          </div>
          {children}
        </div>
      </div>
      <div className="hidden lg:flex w-[35%] bg-secondary relative overflow-hidden flex-col justify-center p-gutter">
        <div className="absolute inset-0 opacity-20">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
        </div>
        <div className="relative z-10 space-y-4 max-w-md">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/20 border border-primary/30 rounded-full">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-white font-semibold text-[10px] uppercase tracking-widest">
              Global Status: Operational
            </span>
          </div>
          <h3 className="text-3xl font-bold text-white leading-tight">
            Unified Intelligence for Engineering Teams.
          </h3>
          <p className="text-sm text-slate-300">
            Consolidate metrics, traces, and logs into a single source of truth for your entire infrastructure
            stack.
          </p>
        </div>
      </div>
    </div>
  );
}
