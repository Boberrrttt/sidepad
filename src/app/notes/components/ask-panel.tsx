'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearChatLocal,
  getChatLocal,
  mirrorNoteFromServer,
  syncAll,
} from '@/client/sync.api';
import { errorMessage } from '@/shared/errors';
import type { AskEvent, ChatMessage } from '@/shared/types';

type AskPanelProps = {
  current: string | null;
  isEmpty: boolean;
  isOnline: boolean;
  isCollapsed: boolean;
  isOverlay: boolean;
  onCollapse: (isCollapsed: boolean) => void;
  flash: (message: string, kind?: 'neutral' | 'ok' | 'error') => void;
  saveCurrent: () => Promise<void>;
  refreshList: () => Promise<void>;
  onNoteWrite: (body: string) => Promise<void>;
};

export function AskPanel({
  current,
  isEmpty,
  isOnline,
  isCollapsed,
  isOverlay,
  onCollapse,
  flash,
  saveCurrent,
  refreshList,
  onNoteWrite,
}: AskPanelProps) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [askInput, setAskInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const chatLogRef = useRef<HTMLDivElement>(null);

  const loadChat = useCallback(async (name: string | null) => {
    if (!name) {
      setChatMessages([]);
      return;
    }

    const chat = await getChatLocal(name);
    setChatMessages(
      chat.messages.filter(
        (chatMessage) =>
          chatMessage.role === 'user' || chatMessage.role === 'assistant'
      )
    );
  }, []);

  useEffect(() => {
    void loadChat(current);
  }, [current, loadChat]);

  async function clearChat() {
    if (!current || isAsking) return;

    await clearChatLocal(current);
    setChatMessages([]);
    flash('Chat cleared', 'ok');
  }

  async function askCurrent() {
    if (!current || isAsking) return;

    if (!navigator.onLine) {
      flash('Ask needs network', 'error');
      return;
    }

    const message = askInput.trim();

    if (!message) {
      flash('Enter a question', 'error');
      return;
    }

    setIsAsking(true);
    setAskInput('');
    setChatMessages((previous) => [...previous, { role: 'user', content: message }]);
    setChatMessages((previous) => [
      ...previous,
      { role: 'assistant', content: 'Thinking…' },
    ]);
    flash('Asking…');

    let hasStarted = false;

    try {
      await saveCurrent();

      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: current, message }),
      });

      if (!response.ok || !response.body) throw new Error(await response.text());

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          const askEvent = JSON.parse(line) as AskEvent;

          if (askEvent.type === 'chunk') {
            setChatMessages((previous) => {
              const next = [...previous];
              const last = next[next.length - 1];

              if (!hasStarted) {
                hasStarted = true;
                next[next.length - 1] = {
                  role: 'assistant',
                  content: askEvent.text,
                };
              } else if (last?.role === 'assistant') {
                next[next.length - 1] = {
                  role: 'assistant',
                  content: String(last.content || '') + askEvent.text,
                };
              }

              return next;
            });

            requestAnimationFrame(() => {
              if (chatLogRef.current) {
                chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
              }
            });
          } else if (askEvent.type === 'note_write') {
            await onNoteWrite(askEvent.body);
            await mirrorNoteFromServer(current, askEvent.body, askEvent.mtime);
            await refreshList();
          } else if (askEvent.type === 'error') {
            throw new Error(askEvent.message);
          }
        }
      }

      await syncAll();
      await loadChat(current);
      flash('Reply ready', 'ok');
    } catch (caughtError) {
      if (!hasStarted) {
        setChatMessages((previous) => previous.slice(0, -1));
      }

      flash(errorMessage(caughtError), 'error');
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <aside
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--panel)] transition-[opacity,transform] duration-200 ${
        isCollapsed
          ? 'pointer-events-none border-0 opacity-0'
          : isOverlay
            ? 'fixed inset-y-0 right-0 z-40 w-[min(320px,90vw)] border-0 opacity-100 shadow-[-8px_0_32px_rgba(0,0,0,0.28)]'
            : 'opacity-100'
      }`}
      aria-label="Note chat"
    >
      <div className="flex items-start justify-between gap-2 px-4 pb-3 pt-5">
        <p className="m-0 pt-1 text-[15px] font-semibold tracking-tight text-[var(--ink)]">Ask</p>
        <button
          type="button"
          aria-label="Hide ask"
          onClick={() => onCollapse(true)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-[var(--mute)] transition-colors hover:bg-[var(--line-soft)] hover:text-[var(--ink)] active:scale-[0.98]"
        >
          ›
        </button>
      </div>

      <div ref={chatLogRef} className="min-h-0 flex-1 overflow-auto px-4">
        {isEmpty ? (
          <div className="flex h-full min-h-[12rem] items-center justify-center px-2 text-center">
            <p className="m-0 max-w-[18ch] text-sm leading-relaxed text-[var(--mute)]">
              Open a note to ask about it.
            </p>
          </div>
        ) : chatMessages.length === 0 ? (
          <div className="flex h-full min-h-[12rem] flex-col items-center justify-center px-2 text-center">
            <p className="m-0 text-[15px] font-medium tracking-tight text-[var(--ink-soft)]">
              Ready when you are
            </p>
            <p className="mt-2 m-0 max-w-[22ch] text-[13px] leading-relaxed text-[var(--mute)]">
              Ask to rewrite, summarize, or fill gaps in this note.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 py-3">
            {chatMessages.map((chatMessage, messageIndex) => (
              <div
                key={messageIndex}
                className={`max-w-[92%] px-3 py-2 text-sm leading-relaxed ${
                  chatMessage.role === 'user'
                    ? 'ml-auto rounded-[var(--radius)] rounded-br-sm bg-[var(--accent-soft)] text-[var(--forest)]'
                    : 'mr-auto rounded-[var(--radius)] rounded-bl-sm bg-[var(--paper)] text-[var(--ink)]'
                } ${chatMessage.content === 'Thinking…' ? 'italic text-[var(--mute)]' : ''}`}
              >
                {chatMessage.content}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--line-soft)] p-3">
        {chatMessages.length > 0 ? (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() =>
                clearChat().catch((caughtError) =>
                  flash(errorMessage(caughtError), 'error')
                )
              }
              className="rounded-[var(--radius)] px-2 py-1 text-[12px] text-[var(--mute)] transition-colors hover:bg-[var(--line-soft)] hover:text-[var(--ink)] active:scale-[0.98]"
            >
              Clear chat
            </button>
          </div>
        ) : null}
        <div className="flex gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] p-1.5 focus-within:border-[var(--accent)]">
          <input
            value={askInput}
            disabled={isAsking || isEmpty || !isOnline}
            onChange={(event) => setAskInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              askCurrent().catch((caughtError) =>
                flash(errorMessage(caughtError), 'error')
              );
            }}
            placeholder={isOnline ? 'Ask about this note' : 'Needs network'}
            className="min-w-0 flex-1 border-0 bg-transparent px-2 py-1.5 text-sm outline-none disabled:opacity-60"
          />
          <button
            type="button"
            disabled={isAsking || isEmpty || !isOnline}
            onClick={() =>
              askCurrent().catch((caughtError) =>
                flash(errorMessage(caughtError), 'error')
              )
            }
            className="shrink-0 rounded-[calc(var(--radius)-2px)] bg-[var(--accent)] px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-press)] active:scale-[0.98] disabled:opacity-50"
          >
            Ask
          </button>
        </div>
      </div>
    </aside>
  );
}
