'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setLocalUserId } from '@/lib/local';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const res = await fetch(mode === 'login' ? '/api/login' : '/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        userId?: string;
      };

      if (!res.ok) throw new Error(data.error || 'Failed');
      if (!data.userId) throw new Error('missing user');

      setLocalUserId(data.userId);
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--panel)] p-8"
      >
        <p className="m-0 text-3xl font-bold tracking-tight text-[var(--forest)]">
          SidePad
        </p>
        <p className="mt-2 text-sm text-[var(--mute)]">
          {mode === 'login' ? 'Sign in to your pad' : 'Create your pad'}
        </p>

        <label className="mt-6 block text-sm font-medium text-[var(--ink-soft)]">
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
            minLength={2}
            autoComplete="username"
            className="mt-2 w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-[var(--ink-soft)]">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="mt-2 w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
          />
        </label>

        {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2.5 font-semibold text-white hover:bg-[var(--accent-press)] active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
          }}
          className="mt-4 w-full text-sm text-[var(--mute)] hover:text-[var(--ink)]"
        >
          {mode === 'login'
            ? 'Need an account? Register'
            : 'Have an account? Sign in'}
        </button>
      </form>
    </main>
  );
}
