const listEl = document.getElementById('note-list');
const titleEl = document.getElementById('note-title');
const bodyEl = document.getElementById('note-body');
const bodyLabelEl = document.getElementById('body-label');
const previewEl = document.getElementById('note-preview');
const statusEl = document.getElementById('status');
const wordCountEl = document.getElementById('word-count');
const editorEl = document.getElementById('editor');
const searchEl = document.getElementById('note-search');
const newBtn = document.getElementById('new-note');
const emptyNewBtn = document.getElementById('empty-new');
const deleteBtn = document.getElementById('delete-note');
const togglePreviewBtn = document.getElementById('toggle-preview');
const confirmEl = document.getElementById('confirm-dialog');
const confirmNameEl = document.getElementById('confirm-name');
const confirmOkBtn = document.getElementById('confirm-ok');
const confirmCancelBtn = document.getElementById('confirm-cancel');
const chatPanelEl = document.getElementById('chat-panel');
const chatLogEl = document.getElementById('chat-log');
const askInputEl = document.getElementById('ask-input');
const askBtn = document.getElementById('ask-btn');
const appEl = document.getElementById('app');
const chatCollapseBtn = document.getElementById('chat-collapse');
const chatClearBtn = document.getElementById('chat-clear');
const chatExpandBtn = document.getElementById('chat-expand');
const mdToolbarEl = document.getElementById('md-toolbar');
const openAtLoginEl = document.getElementById('open-at-login');

let current = null;
let saveTimer = null;
let allNotes = [];
let previewing = false;
let confirmResolve = null;
let asking = false;
let chatCollapsed = localStorage.getItem('sidepad-chat-collapsed') === '1';

function setChatCollapsed(collapsed) {
  chatCollapsed = collapsed;
  appEl.classList.toggle('chat-collapsed', collapsed);
  chatExpandBtn.hidden = !collapsed;
  localStorage.setItem('sidepad-chat-collapsed', collapsed ? '1' : '0');
  return window.sidepad.setChatCollapsed(collapsed);
}

function wordCount(text) {
  const parts = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts.length;
}

function setStatus(msg, kind = 'neutral') {
  statusEl.textContent = msg;
  statusEl.classList.toggle('is-error', kind === 'error');
  statusEl.classList.toggle('is-ok', kind === 'ok');
}

function setEmpty(empty) {
  editorEl.dataset.empty = empty ? 'true' : 'false';
  chatPanelEl.dataset.empty = empty ? 'true' : 'false';

  if (empty) {
    wordCountEl.textContent = '0 words';
    chatLogEl.innerHTML = '';
  }
}

function updateMeta() {
  if (!current) {
    setEmpty(true);
    return;
  }

  setEmpty(false);
  const n = wordCount(bodyEl.value);
  wordCountEl.textContent = n === 1 ? '1 word' : `${n} words`;
}

function cacheBody(name, body) {
  const note = allNotes.find((n) => n.name === name);
  if (note) note.body = body;
  else allNotes.unshift({ name, body });
}

function bumpNote(name) {
  const i = allNotes.findIndex((n) => n.name === name);
  if (i < 1) return;
  allNotes.unshift(allNotes.splice(i, 1)[0]);
}

async function setPreview(on) {
  previewing = on;
  bodyEl.hidden = on;
  previewEl.hidden = !on;
  bodyLabelEl.textContent = on ? 'Preview' : 'Body';
  togglePreviewBtn.textContent = on ? 'Edit' : 'Preview';
  togglePreviewBtn.classList.toggle('btn-primary', on);
  togglePreviewBtn.classList.toggle('btn-ghost', !on);

  if (on) {
    previewEl.innerHTML = await window.sidepad.parseMarkdown(bodyEl.value);
  }
}

async function refreshList() {
  allNotes = await window.sidepad.listNotes();
  renderList();
}

function renderList() {
  const q = searchEl.value.trim().toLowerCase();
  const notes = allNotes.filter(
    (n) => !q || n.name.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
  );

  listEl.innerHTML = '';

  for (const note of notes) {
    const li = document.createElement('li');
    li.className = 'note-row';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'note-item' + (note.name === current ? ' active' : '');
    btn.textContent = note.name;
    btn.addEventListener('click', () => openNote(note.name));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'note-delete';
    del.setAttribute('aria-label', `Delete ${note.name}`);
    del.textContent = '×';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteNoteByName(note.name).catch((err) => setStatus(String(err), 'error'));
    });

    li.appendChild(btn);
    li.appendChild(del);
    listEl.appendChild(li);
  }
}

function appendChatMsg(role, content) {
  const el = document.createElement('div');
  el.className = 'chat-msg chat-msg-' + role;
  el.textContent = content;
  chatLogEl.appendChild(el);
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
  return el;
}

function renderChat(messages) {
  chatLogEl.innerHTML = '';

  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    appendChatMsg(m.role, m.content);
  }
}

async function loadChat() {
  if (!current) {
    chatLogEl.innerHTML = '';
    return;
  }

  renderChat(await window.sidepad.getChat(current));
}

async function clearChat() {
  if (!current || asking) return;

  await window.sidepad.clearChat(current);
  chatLogEl.innerHTML = '';
  setStatus('Chat cleared', 'ok');
}

async function openNote(name) {
  current = name;
  titleEl.value = name;
  bodyEl.value = await window.sidepad.readNote(name);

  await setPreview(false);
  await loadChat();

  setStatus('Editing');
  updateMeta();
  renderList();
}

async function saveCurrent() {
  if (!current) return;

  await window.sidepad.writeNote(current, bodyEl.value);
  cacheBody(current, bodyEl.value);
  bumpNote(current);
  setStatus('Saved', 'ok');
  updateMeta();
  renderList();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  setStatus('Saving…');
  saveTimer = setTimeout(() => {
    saveCurrent().catch((err) => setStatus(String(err), 'error'));
  }, 400);
}

function wrapSelection(before, after = before) {
  const start = bodyEl.selectionStart;
  const end = bodyEl.selectionEnd;
  const selected = bodyEl.value.slice(start, end) || 'text';
  const next = before + selected + after;

  bodyEl.setRangeText(next, start, end, 'end');
  bodyEl.focus();
  bodyEl.setSelectionRange(start + before.length, start + before.length + selected.length);
  updateMeta();
  scheduleSave();
}

function bulletSelection() {
  const start = bodyEl.selectionStart;
  const end = bodyEl.selectionEnd;
  const value = bodyEl.value;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = (() => {
    const i = value.indexOf('\n', end);
    return i === -1 ? value.length : i;
  })();
  const block = value.slice(lineStart, lineEnd);
  const next = block
    .split('\n')
    .map((line) => (line.startsWith('- ') ? line : `- ${line}`))
    .join('\n');

  bodyEl.setRangeText(next, lineStart, lineEnd, 'end');
  bodyEl.focus();
  bodyEl.setSelectionRange(lineStart, lineStart + next.length);
  updateMeta();
  scheduleSave();
}

async function commitTitle() {
  const name = titleEl.value.trim().replace(/\.md$/i, '');

  if (!name) {
    titleEl.value = current || '';
    return;
  }

  if (!current) {
    current = name;
    await window.sidepad.writeNote(current, bodyEl.value);
    cacheBody(current, bodyEl.value);
    setStatus('Created', 'ok');
  } else if (name !== current) {
    const from = current;
    current = await window.sidepad.renameNote(from, name);
    titleEl.value = current;
    const note = allNotes.find((n) => n.name === from);
    if (note) note.name = current;
    setStatus('Renamed', 'ok');
  }

  await refreshList();
  updateMeta();
}

async function createNote() {
  const taken = new Set(allNotes.map((n) => n.name));
  let name = 'New Note';
  for (let i = 2; taken.has(name); i++) name = `New Note ${i}`;

  current = name;
  titleEl.value = name;
  bodyEl.value = '';

  await window.sidepad.writeNote(current, '');
  cacheBody(current, '');
  await setPreview(false);
  await loadChat();

  setStatus('Created', 'ok');
  await refreshList();
  updateMeta();
  titleEl.focus();
  titleEl.select();
}

async function deleteNoteByName(name) {
  if (!name) return;
  if (!(await askDelete(name))) return;

  await window.sidepad.deleteNote(name);

  if (current === name) {
    current = null;
    titleEl.value = '';
    bodyEl.value = '';
    await setPreview(false);
    chatLogEl.innerHTML = '';
  }

  setStatus('Deleted', 'ok');
  await refreshList();

  if (!current) {
    if (allNotes.length) await openNote(allNotes[0].name);
    else setEmpty(true);
  }
}

function askDelete(name) {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    confirmNameEl.textContent = name;
    confirmEl.hidden = false;
    confirmOkBtn.focus();
  });
}

function closeConfirm(ok) {
  if (!confirmResolve) return;

  confirmEl.hidden = true;
  const resolve = confirmResolve;
  confirmResolve = null;
  resolve(ok);
}

async function deleteCurrent() {
  await deleteNoteByName(current);
}

async function askCurrent() {
  if (!current || asking) return;

  const message = askInputEl.value.trim();
  if (!message) {
    setStatus('Enter a question', 'error');
    return;
  }

  asking = true;
  askBtn.disabled = true;
  askInputEl.disabled = true;
  askInputEl.value = '';
  appendChatMsg('user', message);
  const assistantEl = appendChatMsg('assistant', 'Thinking…');
  assistantEl.classList.add('chat-thinking');
  let started = false;
  setStatus('Asking…');

  const off = window.sidepad.onAiChunk((chunk) => {
    if (!started) {
      started = true;
      assistantEl.classList.remove('chat-thinking');
      assistantEl.textContent = '';
    }

    assistantEl.textContent += chunk;
    chatLogEl.scrollTop = chatLogEl.scrollHeight;
  });
  const offNote = window.sidepad.onNoteWritten((body) => {
    bodyEl.value = body;
    cacheBody(current, body);
    updateMeta();
    if (previewing) setPreview(true);
  });

  try {
    await saveCurrent();
    await window.sidepad.askAi(current, message);
    setStatus('Reply ready', 'ok');
  } catch (err) {
    if (!started) assistantEl.remove();
    setStatus(String(err?.message || err), 'error');
  } finally {
    off();
    offNote();
    asking = false;
    askBtn.disabled = false;
    askInputEl.disabled = false;
    askInputEl.focus();
  }
}

newBtn.addEventListener('click', () => createNote().catch((err) => setStatus(String(err), 'error')));
emptyNewBtn.addEventListener('click', () => createNote().catch((err) => setStatus(String(err), 'error')));
deleteBtn.addEventListener('click', () => deleteCurrent().catch((err) => setStatus(String(err), 'error')));

confirmOkBtn.addEventListener('click', () => closeConfirm(true));
confirmCancelBtn.addEventListener('click', () => closeConfirm(false));
confirmEl.addEventListener('click', (e) => {
  if (e.target.dataset.confirm === 'cancel') closeConfirm(false);
});

askBtn.addEventListener('click', () => askCurrent());
askInputEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  askCurrent();
});

chatCollapseBtn.addEventListener('click', () =>
  setChatCollapsed(true).catch((err) => setStatus(String(err), 'error'))
);
chatClearBtn.addEventListener('click', () =>
  clearChat().catch((err) => setStatus(String(err), 'error'))
);
chatExpandBtn.addEventListener('click', () =>
  setChatCollapsed(false).catch((err) => setStatus(String(err), 'error'))
);

togglePreviewBtn.addEventListener('click', () =>
  setPreview(!previewing).catch((err) => setStatus(String(err), 'error'))
);

mdToolbarEl.addEventListener('mousedown', (e) => {
  if (e.target.closest('button[data-md]')) e.preventDefault();
});

mdToolbarEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-md]');
  if (!btn || previewing || !current) return;

  const kind = btn.dataset.md;
  if (kind === 'bold') wrapSelection('**');
  else if (kind === 'italic') wrapSelection('*');
  else if (kind === 'underline') wrapSelection('<u>', '</u>');
  else if (kind === 'bullet') bulletSelection();
});

bodyEl.addEventListener('input', () => {
  updateMeta();
  scheduleSave();
});
searchEl.addEventListener('input', renderList);
titleEl.addEventListener('change', () => commitTitle().catch((err) => setStatus(String(err), 'error')));
titleEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  commitTitle()
    .then(() => bodyEl.focus())
    .catch((err) => setStatus(String(err), 'error'));
});

document.addEventListener('keydown', (e) => {
  if (!confirmEl.hidden) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeConfirm(false);
    }
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    createNote().catch((err) => setStatus(String(err), 'error'));
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    searchEl.focus();
    searchEl.select();
  }
});

openAtLoginEl.addEventListener('change', () => {
  window.sidepad
    .setOpenAtLogin(openAtLoginEl.checked)
    .then((on) => {
      openAtLoginEl.checked = on;
      setStatus(on ? 'Opens on startup' : 'Startup off', 'ok');
    })
    .catch((err) => setStatus(String(err), 'error'));
});

refreshList()
  .then(async () => {
    openAtLoginEl.checked = await window.sidepad.getOpenAtLogin();
    await setChatCollapsed(chatCollapsed);
    if (allNotes.length) await openNote(allNotes[0].name);
    else setEmpty(true);
  })
  .catch((err) => setStatus(String(err), 'error'));
