import { writeChat, readChat } from './chat';
import { readNote, writeNote } from './notes';
import type { AskEvent, ChatMessage } from './types';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'write_note',
      description: 'Replace the current note body with new markdown text',
      parameters: {
        type: 'object',
        properties: {
          body: { type: 'string', description: 'Full new note body' },
        },
        required: ['body'],
      },
    },
  },
];

type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

function getConfig() {
  return {
    apiKey: String(process.env.GROQ_API_KEY || '').trim(),
    model: String(process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'),
  };
}

async function streamChat(
  cfg: { apiKey: string; model: string },
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  withTools: boolean
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      stream: true,
      messages,
      ...(withTools ? { tools: TOOLS } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq ${res.status}: ${errText.slice(0, 200)}`);
  }

  let content = '';
  const toolCalls: ToolCall[] = [];
  let buf = '';
  const decoder = new TextDecoder();
  const body = res.body;
  if (!body) throw new Error('No stream body');

  const reader = body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';

    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;

      const data = s.slice(5).trim();
      if (!data || data === '[DONE]') continue;

      let json: {
        choices?: { delta?: { content?: string; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[];
      };
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }

      const delta = json.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        content += delta.content;
        onChunk(delta.content);
      }

      if (delta.tool_calls) {
        for (const part of delta.tool_calls) {
          const i = part.index ?? 0;
          if (!toolCalls[i]) {
            toolCalls[i] = {
              id: '',
              type: 'function',
              function: { name: '', arguments: '' },
            };
          }
          if (part.id) toolCalls[i].id = part.id;
          if (part.function?.name) toolCalls[i].function.name += part.function.name;
          if (part.function?.arguments) {
            toolCalls[i].function.arguments += part.function.arguments;
          }
        }
      }
    }
  }

  return { content, toolCalls: toolCalls.filter(Boolean) };
}

export async function runAsk(
  userId: string,
  name: string,
  message: string,
  emit: (ev: AskEvent) => void
): Promise<void> {
  const cfg = getConfig();
  if (!cfg.apiKey) throw new Error('Set GROQ_API_KEY in .env.local');

  const q = String(message ?? '').trim();
  if (!q) throw new Error('Enter a question');

  const note = await readNote(userId, name);
  const body = note?.body ?? '';
  const chat = await readChat(userId, name);
  const history = chat.messages.filter(
    (m) => m.role === 'user' || m.role === 'assistant'
  ) as ChatMessage[];

  const userMsg: ChatMessage = { role: 'user', content: q };
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You help with the user's note. Be concise. Use write_note when they ask you to write, rewrite, or edit the note.\n\nNote title: ${name}\n\nNote body:\n${body}`,
    },
    ...history,
    userMsg,
  ];

  let { content, toolCalls } = await streamChat(
    cfg,
    messages,
    (text) => emit({ type: 'chunk', text }),
    true
  );

  if (toolCalls.length) {
    messages.push({
      role: 'assistant',
      content: content || null,
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      if (tc.function.name !== 'write_note') {
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: 'unknown tool',
        });
        continue;
      }

      let args: { body?: string };
      try {
        args = JSON.parse(tc.function.arguments || '{}');
      } catch {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: 'bad args' });
        continue;
      }

      const next = String(args.body ?? '');
      const mtime = Date.now();
      await writeNote(userId, name, next, mtime);
      emit({ type: 'note_write', body: next, mtime });
      messages.push({ role: 'tool', tool_call_id: tc.id, content: 'ok' });
    }

    const follow = await streamChat(
      cfg,
      messages,
      (text) => emit({ type: 'chunk', text }),
      false
    );
    content = (content || '') + follow.content;
  }

  if (!content) throw new Error('Empty reply from Groq');

  history.push(userMsg, { role: 'assistant', content });
  await writeChat(userId, name, history, Date.now());
  emit({ type: 'done' });
}
