'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { nearBottom } from '@/app/notes/helpers/near-bottom';
import { toHtml } from '@/app/notes/helpers/markdown';
import { streamAsk } from '@/app/notes/ask/api';
import {
  clearChatLocal,
  getChatLocal,
  mirrorNoteFromServer,
  syncAll,
} from '@/app/notes/sync/api';
import { errorMessage } from '@/app/shared/errors';
import type { ChatMessage } from '@/app/shared/types';

const PROMPTS = ['Summarize this note', 'Rewrite more clearly', 'Fill in gaps'];

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
  onBoardWrite: (board: string) => Promise<void>;
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
  onBoardWrite,
}: AskPanelProps) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [askInput, setAskInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [panelStatus, setPanelStatus] = useState<string | null>(null);
  const [liveSteps, setLiveSteps] = useState<string[]>([]);
  const chatLogRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
    setLiveSteps([]);
    setPanelStatus(null);
  }, [current, loadChat]);

  function scrollChatIfNeeded() {
    const element = chatLogRef.current;
    if (!element || !nearBottom(element)) return;
    element.scrollTop = element.scrollHeight;
  }

  async function clearChat() {
    if (!current || isAsking) return;

    await clearChatLocal(current);
    setChatMessages([]);
    setLiveSteps([]);
    setPanelStatus(null);
  }

  function stopAsk() {
    abortRef.current?.abort();
  }

  async function askCurrent(override?: string, regenerate = false) {
    if (!current || isAsking) return;

    if (!navigator.onLine) {
      flash('Ask needs network', 'error');
      return;
    }

    const message = (override ?? askInput).trim();

    if (!message) {
      setPanelStatus('Enter a question');
      return;
    }

    const abortController = new AbortController();
    abortRef.current = abortController;

    setIsAsking(true);
    setIsThinking(true);
    setPanelStatus('Asking…');
    setLiveSteps([]);

    if (regenerate) {
      setChatMessages((previous) => {
        const next = [...previous];
        if (next[next.length - 1]?.role === 'assistant') next.pop();
        return next;
      });
    } else {
      setAskInput('');
      setChatMessages((previous) => [...previous, { role: 'user', content: message }]);
    }

    let hasStarted = false;

    try {
      await saveCurrent();

      for await (const askEvent of streamAsk(
        current,
        message,
        abortController.signal
      )) {
        if (askEvent.type === 'chunk') {
          if (!hasStarted) {
            hasStarted = true;
            setIsThinking(false);
            setChatMessages((previous) => [
              ...previous,
              { role: 'assistant', content: askEvent.text },
            ]);
          } else {
            setChatMessages((previous) => {
              const next = [...previous];
              const lastMessage = next[next.length - 1];

              if (lastMessage?.role === 'assistant') {
                next[next.length - 1] = {
                  role: 'assistant',
                  content: String(lastMessage.content || '') + askEvent.text,
                };
              }

              return next;
            });
          }

          requestAnimationFrame(scrollChatIfNeeded);
        } else if (askEvent.type === 'note_write') {
          setPanelStatus('Writing note…');
          setLiveSteps((previous) => [...previous, 'Updated note']);
          await onNoteWrite(askEvent.body);
          await mirrorNoteFromServer(current, askEvent.body, askEvent.mtime);
          await refreshList();
          requestAnimationFrame(scrollChatIfNeeded);
        } else if (askEvent.type === 'board_write') {
          setPanelStatus('Writing board…');
          setLiveSteps((previous) => [...previous, 'Updated board']);
          await onBoardWrite(askEvent.board);
          await mirrorNoteFromServer(current, null, askEvent.mtime, askEvent.board);
          await refreshList();
          requestAnimationFrame(scrollChatIfNeeded);
        } else if (askEvent.type === 'error') {
          throw new Error(askEvent.message);
        }
      }

      await syncAll();
      await loadChat(current);
      setPanelStatus(null);
    } catch (caughtError) {
      if (abortController.signal.aborted) {
        setPanelStatus('Stopped');
        setIsThinking(false);
        return;
      }

      if (!hasStarted && !regenerate) {
        setChatMessages((previous) =>
          previous[previous.length - 1]?.role === 'user'
            ? previous.slice(0, -1)
            : previous
        );
      }

      setPanelStatus(errorMessage(caughtError));
      flash(errorMessage(caughtError), 'error');
    } finally {
      setIsThinking(false);
      setIsAsking(false);
      abortRef.current = null;
    }
  }

  function regenerateLast() {
    const lastUser = [...chatMessages]
      .reverse()
      .find((chatMessage) => chatMessage.role === 'user');

    if (!lastUser?.content) return;

    askCurrent(String(lastUser.content), true).catch((caughtError) =>
      flash(errorMessage(caughtError), 'error')
    );
  }

  async function copyMessage(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setPanelStatus('Copied');
    } catch {
      flash('Copy failed', 'error');
    }
  }

  const lastAssistantIndex = chatMessages.reduce(
    (foundIndex, chatMessage, messageIndex) =>
      chatMessage.role === 'assistant' ? messageIndex : foundIndex,
    -1
  );

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
        <div className="min-w-0">
          <p className="m-0 pt-1 text-[15px] font-semibold tracking-tight text-[var(--ink)]">
            Ask
          </p>
          {current ? (
            <p className="m-0 mt-0.5 truncate text-[12px] text-[var(--mute)]">{current}</p>
          ) : null}
        </div>
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
        ) : chatMessages.length === 0 && !isThinking ? (
          <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 px-2 text-center">
            <div>
              <p className="m-0 text-[15px] font-medium tracking-tight text-[var(--ink-soft)]">
                Ready when you are
              </p>
              <p className="mt-2 m-0 max-w-[22ch] text-[13px] leading-relaxed text-[var(--mute)]">
                Ask to rewrite, summarize, or fill gaps in this note.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={!isOnline || isAsking}
                  onClick={() =>
                    askCurrent(prompt).catch((caughtError) =>
                      flash(errorMessage(caughtError), 'error')
                    )
                  }
                  className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] px-2.5 py-1 text-[12px] text-[var(--ink-soft)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 py-3">
            {chatMessages.map((chatMessage, messageIndex) => {
              const content = String(chatMessage.content || '');
              const isUser = chatMessage.role === 'user';
              const isLastAssistant = messageIndex === lastAssistantIndex;
              const showCaret = isAsking && isLastAssistant && !isThinking && !isUser;

              return (
                <div
                  key={messageIndex}
                  className={`group flex max-w-[92%] flex-col gap-1 ${
                    isUser ? 'ml-auto items-end' : 'mr-auto items-start'
                  }`}
                >
                  <div
                    className={`px-3 py-2 text-sm leading-relaxed ${
                      isUser
                        ? 'rounded-[var(--radius)] rounded-br-sm bg-[var(--accent-soft)] text-[var(--forest)]'
                        : 'rounded-[var(--radius)] rounded-bl-sm bg-[var(--paper)] text-[var(--ink)]'
                    }`}
                  >
                    {isUser ? (
                      content
                    ) : (
                      <div className="note-preview [&_*:first-child]:mt-0 [&_*:last-child]:mb-0">
                        <span dangerouslySetInnerHTML={{ __html: toHtml(content) }} />
                        {showCaret ? (
                          <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-current align-text-bottom" />
                        ) : null}
                      </div>
                    )}
                  </div>
                  {!isUser && content ? (
                    <div className="flex gap-2 px-1">
                      <button
                        type="button"
                        onClick={() =>
                          copyMessage(content).catch((caughtError) =>
                            flash(errorMessage(caughtError), 'error')
                          )
                        }
                        className="text-[11px] text-[var(--mute)] transition-colors hover:text-[var(--ink)]"
                      >
                        Copy
                      </button>
                      {isLastAssistant && !isAsking ? (
                        <button
                          type="button"
                          disabled={!isOnline}
                          onClick={regenerateLast}
                          className="text-[11px] text-[var(--mute)] transition-colors hover:text-[var(--ink)] disabled:opacity-50"
                        >
                          Regenerate
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {liveSteps.map((step, stepIndex) => (
              <div
                key={`step-${stepIndex}`}
                className="mr-auto rounded-[var(--radius)] border border-[var(--line-soft)] px-2.5 py-1 text-[12px] text-[var(--mute)]"
              >
                {step}
              </div>
            ))}

            {isThinking ? (
              <div className="mr-auto rounded-[var(--radius)] rounded-bl-sm bg-[var(--paper)] px-3 py-2 text-sm text-[var(--mute)]">
                <span className="inline-flex gap-1">
                  <span className="animate-pulse">·</span>
                  <span className="animate-pulse [animation-delay:150ms]">·</span>
                  <span className="animate-pulse [animation-delay:300ms]">·</span>
                </span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--line-soft)] p-3">
        {panelStatus ? (
          <p className="mb-2 m-0 text-[12px] text-[var(--mute)]">{panelStatus}</p>
        ) : null}
        {chatMessages.length > 0 ? (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              disabled={isAsking}
              onClick={() =>
                clearChat().catch((caughtError) =>
                  flash(errorMessage(caughtError), 'error')
                )
              }
              className="rounded-[var(--radius)] px-2 py-1 text-[12px] text-[var(--mute)] transition-colors hover:bg-[var(--line-soft)] hover:text-[var(--ink)] active:scale-[0.98] disabled:opacity-50"
            >
              Clear chat
            </button>
          </div>
        ) : null}
        <div className="flex gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] p-1.5 focus-within:border-[var(--accent)]">
          <textarea
            value={askInput}
            rows={1}
            disabled={isAsking || isEmpty || !isOnline}
            onChange={(event) => setAskInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey) return;
              event.preventDefault();
              askCurrent().catch((caughtError) =>
                flash(errorMessage(caughtError), 'error')
              );
            }}
            placeholder={isOnline ? 'Ask about this note' : 'Needs network'}
            className="max-h-28 min-h-[2.25rem] min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm outline-none disabled:opacity-60"
          />
          {isAsking ? (
            <button
              type="button"
              onClick={stopAsk}
              className="shrink-0 self-end rounded-[calc(var(--radius)-2px)] bg-[var(--ink-soft)] px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--ink)] active:scale-[0.98]"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              disabled={isEmpty || !isOnline}
              onClick={() =>
                askCurrent().catch((caughtError) =>
                  flash(errorMessage(caughtError), 'error')
                )
              }
              className="shrink-0 self-end rounded-[calc(var(--radius)-2px)] bg-[var(--accent)] px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-press)] active:scale-[0.98] disabled:opacity-50"
            >
              Ask
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
