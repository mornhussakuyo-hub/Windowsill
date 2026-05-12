export const bridge = window.windowsill ?? {
  setExpanded: async () => {},
  requestHide: async () => {},
  finishHide: async () => {},
  openPath: async () => {},
  openUrl: async () => {},
  showInFolder: async () => {},
  openDownloads: async () => {},
  getAppInfo: async () => ({ downloads: '' }),
  getSettings: async () => ({ ok: true, settings: {} }),
  updateSettings: async (settings) => ({ ok: true, settings }),
  openDataDir: async () => ({ ok: false }),
  resetWindowPosition: async () => ({ ok: false }),
  openSystemTool: async () => ({ ok: false }),
  captureScreen: async () => ({ ok: false }),
  chooseFiles: async () => ({ ok: false, files: [] }),
  getPathForFile: () => '',
  ocrFile: async () => ({ ok: false, text: '' }),
  startFileDrag: () => {},
  getClipboardHistory: async () => ({ ok: true, items: [] }),
  writeClipboardItem: async () => ({ ok: false }),
  stageClipboardImage: async () => ({ ok: false }),
  notify: async () => ({ ok: false }),
  chat: async () => ({ text: '我在。' }),
  chatStream: async (_messages, _files, handlers = {}) => {
    handlers.onDelta?.('我在。');
    return { ok: true, text: '我在。' };
  },
  onModeChange: () => () => {},
  onCollapseRequest: () => () => {},
  onHideRequest: () => () => {},
  onShowRequest: () => () => {}
};
