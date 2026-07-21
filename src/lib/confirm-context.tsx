import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Icon } from '../components/ui';

export type ConfirmOptions = {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
};

type ConfirmRequest = ConfirmOptions & { resolve: (value: boolean) => void };

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

// App-wide replacement for window.confirm() — a native confirm() blocks the
// whole page with a browser-chrome dialog that can't be styled and is easy
// to accidentally dismiss with a stray Enter. This renders one dialog at a
// time via context so every call site (IntegrationsPanel, TeamManagement,
// ProjectSettings, ArchitectureView, ...) keeps the exact same
// `if (!(await confirm(...))) return;` shape it already used for
// window.confirm(), just awaited instead of synchronous.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Functional setState so this never closes over a stale `request` — calling
  // confirm() again while a dialog is already open resolves the orphaned one
  // as cancelled instead of leaking a Promise that never settles (whatever
  // `await`ed it would otherwise hang forever).
  const confirm = useCallback<ConfirmFn>((options) => {
    const opts = typeof options === 'string' ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      setRequest((prev) => {
        prev?.resolve(false);
        return { ...opts, resolve };
      });
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setRequest((prev) => {
      prev?.resolve(value);
      return null;
    });
  }, []);

  // No custom "Enter confirms" binding on purpose: the cancel button is
  // autofocused below, so native button semantics mean a stray Enter (e.g.
  // focus left over from a form behind the dialog) activates Cancel, not a
  // destructive Confirm — the safe default without any extra logic. Escape
  // isn't natively bound to anything, so that still needs an explicit
  // listener. Tab/Shift+Tab are trapped between the two buttons so keyboard
  // focus can't leave the dialog while it's open, and body scroll is locked
  // so the page behind it can't move.
  useEffect(() => {
    if (!request) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const previousActiveElement = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        settle(false);
        return;
      }
      if (e.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button');
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      previousActiveElement?.focus();
    };
  }, [request, settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={() => settle(false)}
        >
          <div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={request.title ? 'eip-confirm-title' : undefined}
            aria-describedby="eip-confirm-message"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-surface border border-border rounded-lg shadow-2xl p-5"
          >
            <div className="flex items-start gap-3 mb-5">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                  request.tone === 'danger' ? 'bg-danger-light text-danger' : 'bg-primary-light text-primary'
                }`}
              >
                <Icon name={request.tone === 'danger' ? 'warning' : 'help'} className="text-[18px]" />
              </div>
              <div className="min-w-0 pt-1">
                {request.title && (
                  <h3 id="eip-confirm-title" className="text-sm font-semibold text-text-primary mb-1">
                    {request.title}
                  </h3>
                )}
                <div id="eip-confirm-message" className="text-sm text-text-secondary leading-relaxed">
                  {request.message}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button ref={cancelButtonRef} type="button" variant="secondary" onClick={() => settle(false)}>
                {request.cancelLabel ?? 'Cancel'}
              </Button>
              <Button type="button" variant={request.tone === 'danger' ? 'danger' : 'primary'} onClick={() => settle(true)}>
                {request.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}
