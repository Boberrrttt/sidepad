const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sidepad', {
  listNotes: () => ipcRenderer.invoke('list-notes'),
  readNote: (name) => ipcRenderer.invoke('read-note', name),
  writeNote: (name, body) => ipcRenderer.invoke('write-note', name, body),
  renameNote: (from, to) => ipcRenderer.invoke('rename-note', from, to),
  deleteNote: (name) => ipcRenderer.invoke('delete-note', name),
  parseMarkdown: (md) => ipcRenderer.invoke('parse-markdown', md),

  askAi: (name, message) => ipcRenderer.invoke('ask-ai', name, message),
  getChat: (name) => ipcRenderer.invoke('get-chat', name),
  clearChat: (name) => ipcRenderer.invoke('clear-chat', name),
  setChatCollapsed: (collapsed) => ipcRenderer.invoke('set-chat-collapsed', collapsed),
  getOpenAtLogin: () => ipcRenderer.invoke('get-open-at-login'),
  setOpenAtLogin: (on) => ipcRenderer.invoke('set-open-at-login', on),

  onAiChunk: (cb) => {
    const fn = (_e, chunk) => cb(chunk);
    ipcRenderer.on('ai-chunk', fn);
    return () => ipcRenderer.removeListener('ai-chunk', fn);
  },
  onNoteWritten: (cb) => {
    const fn = (_e, body) => cb(body);
    ipcRenderer.on('note-written', fn);
    return () => ipcRenderer.removeListener('note-written', fn);
  },
});
