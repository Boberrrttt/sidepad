const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function chatsDir() {
  const dir = path.join(app.getPath('userData'), 'chats');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function chatPath(name) {
  const base = path.basename(String(name)).replace(/\.json$/i, '');
  if (!base || base === '.' || base === '..') throw new Error('bad chat name');
  return path.join(chatsDir(), base + '.json');
}

function readChat(name) {
  try {
    const data = JSON.parse(fs.readFileSync(chatPath(name), 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeChat(name, messages) {
  fs.writeFileSync(chatPath(name), JSON.stringify(messages ?? [], null, 2), 'utf8');
}

function renameChat(from, to) {
  const src = chatPath(from);
  const dest = chatPath(to);

  if (src === dest || !fs.existsSync(src)) return;
  if (fs.existsSync(dest)) fs.unlinkSync(dest);

  fs.renameSync(src, dest);
}

function deleteChat(name) {
  const p = chatPath(name);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

module.exports = { readChat, writeChat, renameChat, deleteChat };
