export type ChatMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
};

export type Note = {
  name: string;
  body: string;
  mtime: number;
};

export type Chat = {
  name: string;
  messages: ChatMessage[];
  mtime: number;
};

export type OutboxOp =
  | { id: string; kind: 'note_write'; name: string; body: string; mtime: number }
  | { id: string; kind: 'note_rename'; from: string; to: string; mtime: number }
  | { id: string; kind: 'note_delete'; name: string; mtime: number }
  | { id: string; kind: 'chat_write'; name: string; messages: ChatMessage[]; mtime: number }
  | { id: string; kind: 'chat_delete'; name: string; mtime: number };

export type AskEvent =
  | { type: 'chunk'; text: string }
  | { type: 'note_write'; body: string; mtime: number }
  | { type: 'done' }
  | { type: 'error'; message: string };
