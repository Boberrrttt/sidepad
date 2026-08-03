'use client';

import { useEffect } from 'react';

type ConfirmModalProps = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  tone?: 'danger' | 'accent';
  hideCancel?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  tone = 'danger',
  hideCancel = false,
  onClose,
  onConfirm,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isSuccess = tone === 'accent';

  const confirmClass = isSuccess
    ? 'rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-press)] active:scale-[0.98]'
    : 'rounded-[var(--radius)] bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:brightness-95 active:scale-[0.98]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40 modal-success-backdrop"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-sm rounded-[var(--radius)] bg-[var(--panel)] p-6 shadow-[0_24px_48px_rgba(14,20,17,0.22)] modal-success-enter"
      >
        <p className="m-0 text-lg font-semibold text-[var(--ink)]">{title}</p>
        <p className="mt-2 m-0 text-sm leading-relaxed text-[var(--mute)]">
          {body}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          {hideCancel ? null : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-[var(--radius)] px-4 py-2 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:bg-[var(--line-soft)] active:scale-[0.98]"
            >
              Cancel
            </button>
          )}
          <button type="button" onClick={onConfirm} className={confirmClass}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
