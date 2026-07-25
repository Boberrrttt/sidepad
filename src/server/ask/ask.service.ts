import type { AskEvent, ChatMessage } from '@/shared/types';
import { writeChat, readChat } from '@/server/chat/chat.service';
import { readNote, writeNote } from '@/server/notes/notes.service';

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

type GroqConfig = {
  apiKey: string;
  model: string;
};

function getConfig(): GroqConfig {
  return {
    apiKey: String(process.env.GROQ_API_KEY || '').trim(),
    model: String(process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'),
  };
}

async function streamChat(
  config: GroqConfig,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  withTools: boolean
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      messages,
      ...(withTools ? { tools: TOOLS } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq ${response.status}: ${errorText.slice(0, 200)}`);
  }

  let content = '';
  const toolCalls: ToolCall[] = [];
  let buffer = '';
  const decoder = new TextDecoder();
  const responseBody = response.body;

  if (!responseBody) throw new Error('No stream body');

  const reader = responseBody.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;

      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;

      let json: {
        choices?: {
          delta?: {
            content?: string;
            tool_calls?: {
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }[];
          };
        }[];
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
          const callIndex = part.index ?? 0;

          if (!toolCalls[callIndex]) {
            toolCalls[callIndex] = {
              id: '',
              type: 'function',
              function: { name: '', arguments: '' },
            };
          }

          if (part.id) toolCalls[callIndex].id = part.id;
          if (part.function?.name) {
            toolCalls[callIndex].function.name += part.function.name;
          }
          if (part.function?.arguments) {
            toolCalls[callIndex].function.arguments += part.function.arguments;
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
  emit: (askEvent: AskEvent) => void
): Promise<void> {
  const config = getConfig();
  if (!config.apiKey) throw new Error('Set GROQ_API_KEY in .env.local');

  const question = String(message ?? '').trim();
  if (!question) throw new Error('Enter a question');

  const note = await readNote(userId, name);
  const body = note?.body ?? '';
  const chat = await readChat(userId, name);
  const history = chat.messages.filter(
    (chatMessage) => chatMessage.role === 'user' || chatMessage.role === 'assistant'
  ) as ChatMessage[];

  const userMessage: ChatMessage = { role: 'user', content: question };
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You help with the user's note. Be concise. Use write_note when they ask you to write, rewrite, or edit the note.\n\nNote title: ${name}\n\nNote body:\n${body}`,
    },
    ...history,
    userMessage,
  ];

  let { content, toolCalls } = await streamChat(
    config,
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

    for (const toolCall of toolCalls) {
      if (toolCall.function.name !== 'write_note') {
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: 'unknown tool',
        });
        continue;
      }

      let args: { body?: string };

      try {
        args = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: 'bad args',
        });
        continue;
      }

      const nextBody = String(args.body ?? '');
      const mtime = Date.now();
      await writeNote(userId, name, nextBody, mtime);
      emit({ type: 'note_write', body: nextBody, mtime });
      messages.push({ role: 'tool', tool_call_id: toolCall.id, content: 'ok' });
    }

    const follow = await streamChat(
      config,
      messages,
      (text) => emit({ type: 'chunk', text }),
      false
    );
    content = (content || '') + follow.content;
  }

  if (!content) throw new Error('Empty reply from Groq');

  history.push(userMessage, { role: 'assistant', content });
  await writeChat(userId, name, history, Date.now());
  emit({ type: 'done' });
}
