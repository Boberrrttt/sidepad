export type ChatMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
};

export type Note = {
  name: string;
  body: string;
  board: string;
  mtime: number;
};

export type GithubCardContentType = 'Issue' | 'PullRequest' | 'DraftIssue';

export type EncryptedSecret = {
  salt: string;
  iv: string;
  data: string;
};

export type BoardData = {
  v: 1;
  github?: {
    projectId: string;
    org: string;
    projectNumber: number;
    token?: EncryptedSecret;
    viewerId?: string;
    statusFieldId?: string;
    statusOptions?: Record<string, string>;
  };
  columns: Array<{
    id: string;
    name: string;
    cards: Array<{
      id: string;
      title: string;
      contentId?: string;
      contentType?: GithubCardContentType;
    }>;
  }>;
};

export type Chat = {
  name: string;
  messages: ChatMessage[];
  mtime: number;
};

export type OutboxOp =
  | {
      id: string;
      kind: 'note_write';
      name: string;
      body: string;
      board: string;
      mtime: number;
    }
  | { id: string; kind: 'note_rename'; from: string; to: string; mtime: number }
  | { id: string; kind: 'note_delete'; name: string; mtime: number }
  | { id: string; kind: 'chat_write'; name: string; messages: ChatMessage[]; mtime: number }
  | { id: string; kind: 'chat_delete'; name: string; mtime: number };

export type AskEvent =
  | { type: 'chunk'; text: string }
  | { type: 'note_write'; body: string; mtime: number }
  | { type: 'done' }
  | { type: 'error'; message: string };
