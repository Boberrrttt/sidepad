'use client';

import { useEffect, useState } from 'react';
import { serializeBoard } from '@/app/notes/components/kanban-board';
import { syncGithubProject } from '@/app/notes/github/api';
import {
  clearGithubSession,
  getGithubSession,
  setGithubSession,
} from '@/app/notes/github/session';
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  type EncryptedSecret,
} from '@/app/notes/github/secret-crypto';

type GithubConn = {
  token: EncryptedSecret;
  org: string;
  project: string;
};

const STORAGE_KEY = 'sidepad.connections';

function loadGithub(): GithubConn | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || '{}'
    ) as { github?: { token: unknown; org: string; project: string } };

    if (
      !parsed.github?.org ||
      !parsed.github?.project ||
      !isEncryptedSecret(parsed.github.token)
    ) {
      return null;
    }

    return {
      token: parsed.github.token,
      org: parsed.github.org,
      project: parsed.github.project,
    };
  } catch {
    return null;
  }
}

function saveGithub(next: GithubConn | null) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(next ? { github: next } : {})
  );
}

type ConnectAppsModalProps = {
  open: boolean;
  onClose: () => void;
  onBoardSynced: (boardJson: string) => void;
};

export function ConnectAppsModal({
  open,
  onClose,
  onBoardSynced,
}: ConnectAppsModalProps) {
  const [stored, setStored] = useState<GithubConn | null>(null);
  const [token, setToken] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [org, setOrg] = useState('');
  const [project, setProject] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;

    const loaded = loadGithub();
    setStored(loaded);
    setToken('');
    setPassphrase('');
    setOrg(loaded?.org ?? '');
    setProject(loaded?.project ?? '');
    setError('');
  }, [open]);

  if (!open) return null;

  async function resolveToken(nextPass: string) {
    const typed = token.trim();
    if (typed) return typed;

    if (stored) return decryptSecret(stored.token, nextPass);

    const session = getGithubSession();
    if (session) return session;

    throw new Error('Token required');
  }

  async function saveGithubForm() {
    const nextPass = passphrase.trim();
    const nextOrg = org.trim();
    const nextProject = project.trim();
    const projectNumber = Number(nextProject);

    if (!nextPass || !nextOrg || !nextProject) return;

    if (!Number.isFinite(projectNumber) || projectNumber < 1) {
      setError('Project number must be a positive number.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const nextToken = await resolveToken(nextPass);
      const board = await syncGithubProject(nextToken, nextOrg, projectNumber);

      const next: GithubConn = {
        token: await encryptSecret(nextToken, nextPass),
        org: nextOrg,
        project: nextProject,
      };

      saveGithub(next);
      setStored(next);
      setGithubSession(nextToken);
      onBoardSynced(serializeBoard(board));
      setToken('');
      setPassphrase('');
      onClose();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not sync GitHub project.'
      );
    } finally {
      setSaving(false);
    }
  }

  function disconnectGithub() {
    saveGithub(null);
    setStored(null);
    clearGithubSession();
    setToken('');
    setPassphrase('');
    setOrg('');
    setProject('');
  }

  const canSubmit =
    passphrase.trim() &&
    org.trim() &&
    project.trim() &&
    (token.trim() || Boolean(stored) || Boolean(getGithubSession()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connect GitHub"
        className="relative z-10 w-full max-w-sm rounded-[var(--radius)] bg-[var(--panel)] p-6 shadow-[0_24px_48px_rgba(14,20,17,0.22)]"
      >
        <p className="m-0 text-lg font-semibold">Connect GitHub</p>
        <p className="mt-2 text-sm text-[var(--mute)]">
          Classic PAT with repo + project. Token encrypted in this browser.
        </p>
        <label className="mt-4 block text-sm font-medium text-[var(--ink-soft)]">
          Token{stored ? ' (leave blank to unlock stored)' : ''}
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="off"
            className="mt-1.5 w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-[var(--ink-soft)]">
          Encrypt passphrase
          <input
            type="password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            autoComplete="new-password"
            className="mt-1.5 w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-[var(--ink-soft)]">
          Org
          <input
            value={org}
            onChange={(event) => setOrg(event.target.value)}
            placeholder="my-org"
            className="mt-1.5 w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-[var(--ink-soft)]">
          Project number
          <input
            value={project}
            onChange={(event) => setProject(event.target.value)}
            placeholder="1"
            inputMode="numeric"
            className="mt-1.5 w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        {error ? (
          <p className="mt-3 m-0 text-sm text-[var(--danger)]">{error}</p>
        ) : null}
        <div className="mt-5 flex justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius)] px-4 py-2 text-sm hover:bg-[var(--line-soft)]"
          >
            Close
          </button>
          <div className="flex gap-2">
            {stored ? (
              <button
                type="button"
                onClick={disconnectGithub}
                className="rounded-[var(--radius)] px-4 py-2 text-sm text-[var(--danger)] hover:bg-[color-mix(in_oklab,var(--danger)_12%,transparent)]"
              >
                Disconnect
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving || !canSubmit}
              onClick={() => {
                void saveGithubForm();
              }}
              className="rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-press)] active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Syncing…' : 'Save & sync'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
