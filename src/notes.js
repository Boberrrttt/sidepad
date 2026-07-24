const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function notesDir() {
  const dir = path.join(app.getPath('userData'), 'notes');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeName(name) {
  const base = path.basename(String(name)).replace(/\.md$/i, '');
  if (!base || base === '.' || base === '..') throw new Error('bad note name');
  return base + '.md';
}

function listNotes() {
  const dir = notesDir();

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const p = path.join(dir, f);
      return { f, mtime: fs.statSync(p).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .map(({ f }) => ({
      name: f.slice(0, -3),
      body: fs.readFileSync(path.join(dir, f), 'utf8'),
    }));
}

function readNote(name) {
  return fs.readFileSync(path.join(notesDir(), safeName(name)), 'utf8');
}

function writeNote(name, body) {
  fs.writeFileSync(path.join(notesDir(), safeName(name)), String(body ?? ''), 'utf8');
}

function renameNote(from, to) {
  const src = path.join(notesDir(), safeName(from));
  const dest = path.join(notesDir(), safeName(to));

  if (src === dest) return path.basename(dest, '.md');
  if (fs.existsSync(dest)) throw new Error('note exists');

  fs.renameSync(src, dest);
  return path.basename(dest, '.md');
}

function deleteNote(name) {
  fs.unlinkSync(path.join(notesDir(), safeName(name)));
}

module.exports = { listNotes, readNote, writeNote, renameNote, deleteNote };
