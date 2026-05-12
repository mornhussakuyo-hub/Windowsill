const { app, clipboard, nativeImage } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function createClipboardRepository({ ensureDir, filePayload, hashBuffer, loadState, saveState }) {
  const history = [];
  let lastKey = '';
  let timer;

  function add(item) {
    history.unshift(item);
    const seen = new Set();
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const key = history[index].key;
      if (seen.has(key)) history.splice(index, 1);
      else seen.add(key);
    }
    history.splice(16);
    saveState({ clipboardHistory: history });
  }

  function snapshot() {
    const text = clipboard.readText()?.trim();
    if (text) {
      const key = `text:${crypto.createHash('sha1').update(text).digest('hex')}`;
      if (key !== lastKey) {
        lastKey = key;
        add({
          id: `${Date.now()}-${key.slice(5, 12)}`,
          key,
          type: 'text',
          text,
          preview: text.slice(0, 140),
          createdAt: Date.now()
        });
      }
      return;
    }

    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      const png = image.toPNG();
      const key = `image:${hashBuffer(png)}`;
      if (key !== lastKey) {
        lastKey = key;
        const dir = path.join(app.getPath('userData'), 'clipboard');
        ensureDir(dir);
        const filePath = path.join(dir, `clipboard-${Date.now()}.png`);
        fs.writeFileSync(filePath, png);
        add({
          id: `${Date.now()}-${key.slice(6, 13)}`,
          key,
          type: 'image',
          path: filePath,
          preview: image.resize({ width: 180 }).toDataURL(),
          createdAt: Date.now()
        });
      }
    }
  }

  function startWatcher() {
    const stored = loadState().clipboardHistory;
    if (Array.isArray(stored)) {
      history.splice(0, history.length, ...stored.filter((item) => item?.id && item?.type).slice(0, 16));
    }
    snapshot();
    timer = setInterval(snapshot, 1200);
  }

  function stopWatcher() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function getHistory() {
    snapshot();
    return history;
  }

  function writeItem(itemId) {
    const item = history.find((entry) => entry.id === itemId);
    if (!item) return { ok: false };
    if (item.type === 'text') clipboard.writeText(item.text);
    if (item.type === 'image' && item.path && fs.existsSync(item.path)) {
      clipboard.writeImage(nativeImage.createFromPath(item.path));
    }
    return { ok: true };
  }

  function stageImage(itemId) {
    const item = history.find((entry) => entry.id === itemId);
    if (!item || item.type !== 'image' || !item.path || !fs.existsSync(item.path)) return { ok: false };
    return { ok: true, file: filePayload(item.path) };
  }

  function currentPayload() {
    const text = clipboard.readText();
    if (text) {
      const key = `text:${crypto.createHash('sha1').update(text).digest('hex')}`;
      let item = history.find((entry) => entry.key === key);
      if (!item) {
        item = {
          id: `${Date.now()}-${key.slice(5, 12)}`,
          key,
          type: 'text',
          text,
          preview: text.slice(0, 220),
          createdAt: Date.now()
        };
        add(item);
      }
      return { type: 'text', text: text.slice(0, 12000), itemId: item.id, preview: item.preview };
    }

    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      const png = image.toPNG();
      const key = `image:${hashBuffer(png)}`;
      let item = history.find((entry) => entry.key === key);
      if (!item) {
        const dir = path.join(app.getPath('userData'), 'clipboard');
        ensureDir(dir);
        const filePath = path.join(dir, `clipboard-${Date.now()}.png`);
        fs.writeFileSync(filePath, png);
        item = {
          id: `${Date.now()}-${key.slice(6, 13)}`,
          key,
          type: 'image',
          path: filePath,
          preview: image.resize({ width: 180 }).toDataURL(),
          createdAt: Date.now()
        };
        add(item);
      }
      return { type: 'image', itemId: item.id, path: item.path, preview: '当前剪贴板图片' };
    }

    return { type: 'empty', text: '' };
  }

  function findItem(identifier) {
    snapshot();
    const raw = String(identifier || '').trim().toLowerCase();
    if (raw === 'latest' || raw === '最近' || raw === '当前') return history[0] || null;
    if (raw === 'text' || raw === '文字') return history.find((item) => item.type === 'text') || null;
    if (raw === 'image' || raw === '图片') return history.find((item) => item.type === 'image') || null;
    return history.find((item) => item.id === identifier || item.key === identifier) || null;
  }

  function search(query = '', maxResults = 8) {
    snapshot();
    const lower = String(query || '').toLowerCase();
    return history
      .map((item, index) => ({
        index: index + 1,
        id: item.id,
        type: item.type,
        preview: item.type === 'text' ? String(item.text || '').slice(0, 500) : '剪贴板图片',
        path: item.path,
        createdAt: item.createdAt
      }))
      .filter((item) => !lower || `${item.preview}\n${item.path || ''}`.toLowerCase().includes(lower))
      .slice(0, Math.min(Number(maxResults) || 8, 20));
  }

  function makeAttachment(item) {
    if (!item) return null;
    if (item.type === 'text') {
      const text = String(item.text || '').slice(0, 20000);
      return {
        id: `clipboard:${item.id}`,
        type: 'text',
        name: '剪贴板文字',
        text,
        previewText: item.preview || text.slice(0, 140)
      };
    }
    if (item.type === 'image') {
      return {
        id: `clipboard:${item.id}`,
        type: 'image',
        kind: 'image',
        name: path.basename(item.path || 'clipboard.png'),
        path: item.path,
        preview: item.preview,
        previewText: '剪贴板图片'
      };
    }
    return null;
  }

  return {
    currentPayload,
    findItem,
    getHistory,
    history,
    makeAttachment,
    search,
    snapshot,
    stageImage,
    startWatcher,
    stopWatcher,
    writeItem
  };
}

module.exports = { createClipboardRepository };
