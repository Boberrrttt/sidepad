'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

type PromptModalProps = {
  open: boolean;
  title: string;
  body: string;
  label: string;
  confirmLabel: string;
  placeholder?: string;
  onClose: () => void;
  onConfirm: (value: string) => void | Promise<void>;
};

export function PromptModal({
  open,
  title,
  body,
  label,
  confirmLabel,
  placeholder,
  onClose,
  onConfirm,
}: PromptModalProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    setValue('');
    setError('');
    setSaving(false);

    const frame = requestAnimationFrame(() => inputRef.current?.focus());

    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) onClose();
    }

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, saving, onClose]);

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();

    const next = value.trim();
    if (!next || saving) return;

    setSaving(true);
    setError('');

    try {
      await onConfirm(next);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Something went wrong.'
      );
      setSaving(false);
    }
  }

  const canSubmit = Boolean(value.trim()) && !saving;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40 modal-success-backdrop"
        onClick={() => {
          if (!saving) onClose();
        }}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={submit}
        className="relative z-10 w-full max-w-sm rounded-[var(--radius)] bg-[var(--panel)] p-6 shadow-[0_24px_48px_rgba(14,20,17,0.22)] modal-success-enter"
      >
        <p className="m-0 text-lg font-semibold text-[var(--ink)]">{title}</p>
        <p className="mt-2 m-0 text-sm leading-relaxed text-[var(--mute)]">
          {body}
        </p>
        <label className="mt-4 block text-sm font-medium text-[var(--ink-soft)]">
          {label}
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError('');
            }}
            placeholder={placeholder}
            autoComplete="off"
            disabled={saving}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'prompt-modal-error' : undefined}
            className="mt-1.5 w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--mute)] focus:border-[var(--accent)] disabled:opacity-60"
          />
        </label>
        {error ? (
          <p
            id="prompt-modal-error"
            className="mt-2 m-0 text-sm text-[var(--danger)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-[var(--radius)] px-4 py-2 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:bg-[var(--line-soft)] active:scale-[0.98] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-press)] active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? 'Creating…' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
