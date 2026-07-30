'use client';

import { useEffect, useState } from 'react';
import { ConfirmModal } from '@/app/notes/components/confirm-modal';
import { syncGithubProject } from '@/app/notes/github/api';
import { serializeBoard } from '@/app/notes/helpers/board';
import {
  disconnectLinkedNote,
  findLinkedNote,
} from '@/app/notes/helpers/github-link';
import type { BoardData } from '@/app/shared/types';

type ConnectAppsModalProps = {
  open: boolean;
  onClose: () => void;
  noteName: string;
  github?: BoardData['github'];
  onBoardSynced: (boardJson: string) => void;
};

export function ConnectAppsModal({
  open,
  onClose,
  noteName,
  github,
  onBoardSynced,
}: ConnectAppsModalProps) {
  const [token, setToken] = useState('');
  const [org, setOrg] = useState('');
  const [project, setProject] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [overrideNote, setOverrideNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setToken('');
    setOrg(github?.org ?? '');
    setProject(
      github?.projectNumber != null ? String(github.projectNumber) : ''
    );
    setError('');
    setOverrideNote(null);
  }, [open, github?.org, github?.projectNumber]);

  if (!open) return null;

  async function saveGithubForm(forceOverride = false) {
    const nextToken = token.trim();
    const nextOrg = org.trim();
    const nextProject = project.trim();
    const projectNumber = Number(nextProject);

    if (!nextToken || !nextOrg || !nextProject) return;

    if (!Number.isFinite(projectNumber) || projectNumber < 1) {
      setError('Project number must be a positive number.');
      return;
    }

    const linked = await findLinkedNote(noteName, nextOrg, projectNumber);

    if (linked && !forceOverride) {
      setOverrideNote(linked.name);
      return;
    }

    setSaving(true);
    setError('');
    setOverrideNote(null);

    try {
      if (linked) {
        await disconnectLinkedNote(linked);
      }

      const board = await syncGithubProject({
        token: nextToken,
        org: nextOrg,
        project: projectNumber,
      });

      if (!board.github?.projectId) {
        throw new Error('GitHub sync returned no project id');
      }

      onBoardSynced(serializeBoard(board));
      setToken('');
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

  const canSubmit = Boolean(token.trim() && org.trim() && project.trim());

  return (
    <>
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
            Classic PAT with repo + project. Token stored on the server.
          </p>
          <label className="mt-4 block text-sm font-medium text-[var(--ink-soft)]">
            Token
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
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
      <ConfirmModal
        open={Boolean(overrideNote)}
        title="Project already connected"
        body={`“${overrideNote}” already uses this GitHub project. Connecting here disconnects that note.`}
        confirmLabel="Switch here"
        onClose={() => setOverrideNote(null)}
        onConfirm={() => {
          void saveGithubForm(true);
        }}
      />
    </>
  );
}
