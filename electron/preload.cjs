const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('windowsill', {
  setExpanded: (expanded) => ipcRenderer.invoke('island:set-expanded', expanded),
  requestHide: () => ipcRenderer.invoke('island:request-hide'),
  finishHide: () => ipcRenderer.invoke('island:finish-hide'),
  openPath: (filePath) => ipcRenderer.invoke('island:open-path', filePath),
  openUrl: (url) => ipcRenderer.invoke('island:open-url', url),
  showInFolder: (filePath) => ipcRenderer.invoke('island:show-in-folder', filePath),
  openDownloads: () => ipcRenderer.invoke('island:open-downloads'),
  getAppInfo: () => ipcRenderer.invoke('island:get-app-info'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  openDataDir: () => ipcRenderer.invoke('settings:open-data-dir'),
  resetWindowPosition: () => ipcRenderer.invoke('settings:reset-window-position'),
  openSystemTool: (tool) => ipcRenderer.invoke('system:open-tool', tool),
  captureScreen: () => ipcRenderer.invoke('island:capture-screen'),
  chooseFiles: () => ipcRenderer.invoke('island:choose-files'),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  ocrFile: (filePath) => ipcRenderer.invoke('island:ocr-file', filePath),
  startFileDrag: (filePath) => ipcRenderer.send('island:start-file-drag', filePath),
  getClipboardHistory: () => ipcRenderer.invoke('clipboard:get-history'),
  writeClipboardItem: (itemId) => ipcRenderer.invoke('clipboard:write-item', itemId),
  stageClipboardImage: (itemId) => ipcRenderer.invoke('clipboard:stage-image', itemId),
  notify: (title, body) => ipcRenderer.invoke('system:notify', { title, body }),
  chat: (messages, files) => ipcRenderer.invoke('ai:chat', { messages, files }),
  chatStream: (messages, files, handlers = {}) => {
    const streamId = `stream-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const channel = `ai:chat-stream:${streamId}`;
    const listener = (_event, payload = {}) => {
      if (payload.type === 'delta') handlers.onDelta?.(payload.text || '');
      if (payload.type === 'attachment') handlers.onAttachment?.(payload.attachment);
      if (payload.type === 'error') handlers.onError?.(payload);
      if (payload.type === 'done') handlers.onDone?.(payload);
    };
    ipcRenderer.on(channel, listener);
    return ipcRenderer
      .invoke('ai:chat-stream', { streamId, messages, files })
      .finally(() => ipcRenderer.removeListener(channel, listener));
  },
  onModeChange: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('island:mode', listener);
    return () => ipcRenderer.removeListener('island:mode', listener);
  },
  onCollapseRequest: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('island:collapse-request', listener);
    return () => ipcRenderer.removeListener('island:collapse-request', listener);
  },
  onHideRequest: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('island:hide-request', listener);
    return () => ipcRenderer.removeListener('island:hide-request', listener);
  },
  onShowRequest: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('island:show-request', listener);
    return () => ipcRenderer.removeListener('island:show-request', listener);
  }
});
