const notes = require('./notes');
const chat = require('./chat');
const { getConfig } = require('./config');

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

async function streamChat(cfg, messages, onChunk, withTools) {
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
  const toolCalls = [];
  let buf = '';
  const decoder = new TextDecoder();

  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';

    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;

      const data = s.slice(5).trim();
      if (!data || data === '[DONE]') continue;

      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }

      const delta = json.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        content += delta.content;
        if (onChunk) onChunk(delta.content);
      }

      if (delta.tool_calls) {
        for (const part of delta.tool_calls) {
          const i = part.index ?? 0;
          if (!toolCalls[i]) toolCalls[i] = { id: '', type: 'function', function: { name: '', arguments: '' } };
          if (part.id) toolCalls[i].id = part.id;
          if (part.function?.name) toolCalls[i].function.name += part.function.name;
          if (part.function?.arguments) toolCalls[i].function.arguments += part.function.arguments;
        }
      }
    }
  }

  return { content, toolCalls: toolCalls.filter(Boolean) };
}

async function askAi(name, message, onChunk, onNoteWrite) {
  const cfg = getConfig();
  if (!cfg.apiKey.trim()) throw new Error('Set GROQ_API_KEY in .env');

  const q = String(message ?? '').trim();
  if (!q) throw new Error('Enter a question');

  const body = notes.readNote(name);
  const history = chat.readChat(name);
  const userMsg = { role: 'user', content: q };
  const messages = [
    {
      role: 'system',
      content: `You help with the user's note. Be concise. Use write_note when they ask you to write, rewrite, or edit the note.\n\nNote title: ${name}\n\nNote body:\n${body}`,
    },
    ...history,
    userMsg,
  ];

  let { content, toolCalls } = await streamChat(cfg, messages, onChunk, true);

  if (toolCalls.length) {
    messages.push({
      role: 'assistant',
      content: content || null,
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      if (tc.function.name !== 'write_note') {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: 'unknown tool' });
        continue;
      }

      let args;
      try {
        args = JSON.parse(tc.function.arguments || '{}');
      } catch {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: 'bad args' });
        continue;
      }

      const next = String(args.body ?? '');
      notes.writeNote(name, next);
      if (onNoteWrite) onNoteWrite(next);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: 'ok' });
    }

    const follow = await streamChat(cfg, messages, onChunk, false);
    content = (content || '') + follow.content;
  }

  if (!content) throw new Error('Empty reply from Groq');

  history.push(userMsg, { role: 'assistant', content });
  chat.writeChat(name, history);
  return content;
}

module.exports = { askAi };
