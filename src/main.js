const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const notes = require('./notes');
const chat = require('./chat');
const ai = require('./ai');

function titleOverlay(collapsed) {
  return {
    color: '#00000000',
    symbolColor: collapsed ? '#121512' : '#eef1ee',
    height: 36,
  };
}

const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');

function startupPrefPath() {
  return path.join(app.getPath('userData'), 'open-at-login');
}

function getOpenAtLogin() {
  const p = startupPrefPath();
  if (!fs.existsSync(p)) return true;
  return fs.readFileSync(p, 'utf8') !== '0';
}

function setOpenAtLogin(on) {
  const want = !!on;
  fs.writeFileSync(startupPrefPath(), want ? '1' : '0');
  app.setLoginItemSettings({ openAtLogin: want, path: process.execPath });
  return want;
}

function applyStartupPref() {
  setOpenAtLogin(getOpenAtLogin());
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#14201a',
    icon: iconPath,
    titleBarStyle: 'hidden',
    titleBarOverlay: titleOverlay(false),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.sidepad.app');

  applyStartupPref();
  Menu.setApplicationMenu(null);

  ipcMain.handle('list-notes', () => notes.listNotes());
  ipcMain.handle('read-note', (_e, name) => notes.readNote(name));
  ipcMain.handle('write-note', (_e, name, body) => notes.writeNote(name, body));
  ipcMain.handle('rename-note', (_e, from, to) => {
    const name = notes.renameNote(from, to);
    chat.renameChat(from, to);
    return name;
  });
  ipcMain.handle('delete-note', (_e, name) => {
    notes.deleteNote(name);
    chat.deleteChat(name);
  });
  ipcMain.handle('parse-markdown', (_e, md) => marked.parse(String(md ?? ''), { async: false }));
  ipcMain.handle('get-chat', (_e, name) => chat.readChat(name));
  ipcMain.handle('clear-chat', (_e, name) => chat.deleteChat(name));
  ipcMain.handle('ask-ai', (e, name, message) =>
    ai.askAi(
      name,
      message,
      (chunk) => e.sender.send('ai-chunk', chunk),
      (body) => e.sender.send('note-written', body)
    )
  );
  ipcMain.handle('set-chat-collapsed', (e, collapsed) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) win.setTitleBarOverlay(titleOverlay(!!collapsed));
  });
  ipcMain.handle('get-open-at-login', () => getOpenAtLogin());
  ipcMain.handle('set-open-at-login', (_e, on) => setOpenAtLogin(on));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
