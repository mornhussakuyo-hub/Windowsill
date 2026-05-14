const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  shell,
  screen,
  Menu,
  Tray,
  nativeImage,
  dialog,
  clipboard,
  Notification
} = require('electron');
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');
const { runWindowsillAgent } = require('./agent/windowsillAgent.cjs');
const { createClipboardRepository } = require('./repositories/clipboardRepository.cjs');
require('dotenv').config({ path: path.join(process.cwd(), '.env'), quiet: true });

const isDev = !app.isPackaged;
const collapsedSize = { width: 280, height: 96 };
const collapsedVisibleSize = { width: 188, height: 44 };
const collapsedVisibleOffset = {
  x: Math.round((collapsedSize.width - collapsedVisibleSize.width) / 2),
  // Keep the visible island pinned to the window top; otherwise the native
  // resize compensation fights the CSS margin during collapse.
  y: 0
};
const expandedSize = { width: 820, height: 580 };
const fallbackReplies = [
  '可以。我会先把文件放进暂存架，然后你可以让我总结、重命名、压缩或者发给某个应用。',
  '这个动作适合做成快捷卡片：拖入文件后直接出现“总结 / OCR / 压缩 / 打开所在位置”。',
  '第一版 AI 入口已经准备好了；接上 API key 后，这里就会变成真正的桌面助手。'
];
const appIconPath = path.join(__dirname, 'assets', 'windowsill.ico');

let mainWindow;
let tray;
let isExpanded = false;
let isHidden = false;
let dragIcon;
let persistPositionTimer;
const clipboardHistory = [];
let clipboardRepository;
let lastClipboardKey = '';
let clipboardTimer;
let windowAnchor;
let suppressAutoCollapseUntil = 0;
const gotSingleInstanceLock = app.requestSingleInstanceLock();
let appSettings = {
  autoCollapseOnBlur: true,
  alwaysOnTop: true,
  hotkey: 'Alt+Space',
  ai: {}
};

function writeBootLog(message) {
  try {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    const baseDir = app.isReady() ? app.getPath('userData') : process.env.TEMP || process.cwd();
    const logPath = path.join(baseDir, 'windowsill-boot.log');
    ensureDir(path.dirname(logPath));
    fs.appendFileSync(logPath, line);
  } catch {
    // Boot logging must never block app startup.
  }
}

writeBootLog(`start packaged=${app.isPackaged} lock=${gotSingleInstanceLock} argv=${process.argv.join(' ')}`);

process.on('uncaughtException', (error) => {
  writeBootLog(`uncaughtException ${error?.stack || error?.message || error}`);
});

process.on('unhandledRejection', (reason) => {
  writeBootLog(`unhandledRejection ${reason?.stack || reason}`);
});

app.on('before-quit', () => writeBootLog('before-quit'));
app.on('quit', (_event, exitCode) => writeBootLog(`quit exitCode=${exitCode}`));

if (!gotSingleInstanceLock) {
  app.quit();
}

function isImagePath(filePath = '') {
  return /\.(png|jpe?g|bmp|gif|tiff?|webp)$/i.test(filePath);
}

function isReadableTextPath(filePath = '') {
  return /\.(txt|md|json|csv|log|js|jsx|ts|tsx|css|html?|xml|ya?ml|ini|env|ps1|bat|cmd)$/i.test(filePath);
}

function fileKind(filePath = '') {
  if (isImagePath(filePath)) return 'image';
  if (/\.(zip|rar|7z|tar|gz)$/i.test(filePath)) return 'archive';
  return 'text';
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function filePayload(filePath) {
  const stat = fs.statSync(filePath);
  return {
    name: path.basename(filePath),
    path: filePath,
    size: stat.size,
    mtimeMs: stat.mtimeMs
  };
}

function hashBuffer(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function statePath() {
  return path.join(app.getPath('userData'), 'windowsill-state.json');
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch {
    return {};
  }
}

function saveState(nextState) {
  const current = loadState();
  ensureDir(app.getPath('userData'));
  fs.writeFileSync(statePath(), JSON.stringify({ ...current, ...nextState }, null, 2));
}

function defaultAiSettings() {
  return {
    provider: process.env.WINDOWSILL_AI_PROVIDER || 'DeepSeek',
    apiKey: process.env.WINDOWSILL_AI_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.WINDOWSILL_AI_BASE_URL || 'https://api.deepseek.com/v1',
    model: process.env.WINDOWSILL_AI_MODEL || process.env.OPENAI_MODEL || 'deepseek-chat',
    temperature: Number.isFinite(Number(process.env.WINDOWSILL_AI_TEMPERATURE))
      ? Number(process.env.WINDOWSILL_AI_TEMPERATURE)
      : 0.6
  };
}

function normalizeTemperature(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.6;
  return Math.min(2, Math.max(0, Math.round(numeric * 100) / 100));
}

function getStoredSettings() {
  const stored = loadState().settings || {};
  const storedAi = stored.ai || {};
  const defaults = defaultAiSettings();
  return {
    autoCollapseOnBlur: stored.autoCollapseOnBlur !== false,
    alwaysOnTop: stored.alwaysOnTop !== false,
    launchAtLogin: app.getLoginItemSettings().openAtLogin,
    hotkey: typeof stored.hotkey === 'string' && stored.hotkey.trim() ? stored.hotkey.trim() : 'Alt+Space',
    ai: {
      provider: typeof storedAi.provider === 'string' ? storedAi.provider : defaults.provider,
      apiKey: Object.hasOwn(storedAi, 'apiKey') ? String(storedAi.apiKey || '') : defaults.apiKey,
      baseUrl: typeof storedAi.baseUrl === 'string' && storedAi.baseUrl.trim() ? storedAi.baseUrl : defaults.baseUrl,
      model: typeof storedAi.model === 'string' && storedAi.model.trim() ? storedAi.model : defaults.model,
      temperature: normalizeTemperature(Object.hasOwn(storedAi, 'temperature') ? storedAi.temperature : defaults.temperature)
    }
  };
}

function saveAppSettings(patch) {
  const current = getStoredSettings();
  const next = {
    ...current,
    ...patch,
    ai: {
      ...current.ai,
      ...(patch.ai || {})
    }
  };
  next.autoCollapseOnBlur = next.autoCollapseOnBlur !== false;
  next.alwaysOnTop = next.alwaysOnTop !== false;
  next.hotkey = typeof next.hotkey === 'string' && next.hotkey.trim() ? next.hotkey.trim() : 'Alt+Space';
  next.ai.temperature = normalizeTemperature(next.ai.temperature);
  appSettings = next;
  saveState({
    settings: {
      autoCollapseOnBlur: next.autoCollapseOnBlur,
      alwaysOnTop: next.alwaysOnTop,
      hotkey: next.hotkey,
      ai: next.ai
    }
  });
  if (Object.hasOwn(patch, 'launchAtLogin')) {
    app.setLoginItemSettings({ openAtLogin: Boolean(patch.launchAtLogin) });
  }
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(Boolean(appSettings.alwaysOnTop), 'screen-saver');
  }
  if (Object.hasOwn(patch, 'hotkey')) registerAppHotkey();
  return getStoredSettings();
}

function toggleWindowVisibility() {
  if (!mainWindow) return;
  if (mainWindow.isVisible() && !isHidden) requestHide();
  else requestShow();
}

function registerAppHotkey() {
  globalShortcut.unregisterAll();
  const accelerator = appSettings.hotkey || 'Alt+Space';
  const registered = globalShortcut.register(accelerator, toggleWindowVisibility);
  if (!registered && accelerator !== 'Alt+Space') {
    appSettings.hotkey = 'Alt+Space';
    globalShortcut.register('Alt+Space', toggleWindowVisibility);
    const current = loadState().settings || {};
    saveState({ settings: { ...current, hotkey: 'Alt+Space' } });
  }
  return registered;
}

function launchDetached(command) {
  return new Promise((resolve) => {
    const child = execFile(command, [], { windowsHide: false, detached: true }, (error) => {
      if (error) resolve({ ok: false, error: error.message });
    });
    child.on('spawn', () => {
      child.unref();
      resolve({ ok: true });
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addClipboardItem(item) {
  clipboardHistory.unshift(item);
  const seen = new Set();
  for (let index = clipboardHistory.length - 1; index >= 0; index -= 1) {
    const key = clipboardHistory[index].key;
    if (seen.has(key)) clipboardHistory.splice(index, 1);
    else seen.add(key);
  }
  clipboardHistory.splice(16);
  saveState({ clipboardHistory });
}

function snapshotClipboard() {
  const text = clipboard.readText()?.trim();
  if (text) {
    const key = `text:${crypto.createHash('sha1').update(text).digest('hex')}`;
    if (key !== lastClipboardKey) {
      lastClipboardKey = key;
      addClipboardItem({
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
    if (key !== lastClipboardKey) {
      lastClipboardKey = key;
      const dir = path.join(app.getPath('userData'), 'clipboard');
      ensureDir(dir);
      const filePath = path.join(dir, `clipboard-${Date.now()}.png`);
      fs.writeFileSync(filePath, png);
      addClipboardItem({
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

function startClipboardWatcher() {
  const stored = loadState().clipboardHistory;
  if (Array.isArray(stored)) {
    clipboardHistory.splice(0, clipboardHistory.length, ...stored.filter((item) => item?.id && item?.type).slice(0, 16));
  }
  snapshotClipboard();
  clipboardTimer = setInterval(snapshotClipboard, 1200);
}

async function waitForClipboardImageChange(previousKey, timeoutMs = 60000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      const png = image.toPNG();
      const key = hashBuffer(png);
      if (key !== previousKey) return { image, png, key };
    }
    await sleep(350);
  }

  return null;
}

async function captureWithSystemSnippingTool() {
  const before = clipboard.readImage();
  const beforeKey = before.isEmpty() ? '' : hashBuffer(before.toPNG());
  let restoreTimer;

  function restoreIsland() {
    if (!mainWindow) return;
    mainWindow.setOpacity(1);
    if (!mainWindow.isVisible()) mainWindow.showInactive();
  }

  try {
    if (mainWindow) {
      mainWindow.setOpacity(0);
      await sleep(80);
    }

    await shell.openExternal('ms-screenclip:');
    restoreTimer = setTimeout(restoreIsland, 900);
    const captured = await waitForClipboardImageChange(beforeKey);

    if (!captured) {
      return { ok: false, canceled: true, error: '截图已取消。' };
    }

    const dir = path.join(app.getPath('pictures'), 'Windowsill Screenshots');
    ensureDir(dir);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(dir, `Screenshot-${stamp}.png`);
    fs.writeFileSync(filePath, captured.png);
    snapshotClipboard();

    return { ok: true, file: filePayload(filePath) };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    if (restoreTimer) clearTimeout(restoreTimer);
    restoreIsland();
  }
}

function cleanOcrError(errorText = '') {
  const text = String(errorText)
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');

  if (/language|语言|OcrEngine/i.test(text)) {
    return 'Windows OCR 当前语言不可用，请在系统语言设置里安装 OCR 语言包。';
  }

  if (/路径为空|路径太短|path.*empty|path.*short/i.test(text)) {
    return '没有拿到图片路径，请重新选择文件。';
  }

  if (/pixel|bitmap|RecognizeAsync|Wait|AggregateException|HRESULT/i.test(text)) {
    return 'Windows OCR 识别失败。可以换一张更清晰的图片，或把图片转成 PNG 后再试。';
  }

  return text.slice(0, 180) || 'Windows OCR 识别失败。';
}

function getDragIcon(filePath) {
  if (isImagePath(filePath)) {
    const fileIcon = nativeImage.createFromPath(filePath).resize({ width: 48, height: 48 });
    if (fileIcon && !fileIcon.isEmpty()) return fileIcon;
  }

  if (dragIcon && !dragIcon.isEmpty()) return dragIcon;

  const appIcon = nativeImage.createFromPath(appIconPath);
  if (appIcon && !appIcon.isEmpty()) {
    dragIcon = appIcon.resize({ width: 48, height: 48 });
    if (dragIcon && !dragIcon.isEmpty()) return dragIcon;
  }

  dragIcon = nativeImage.createFromDataURL(
    'data:image/svg+xml;utf8,' +
      encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
          <rect width="64" height="64" rx="18" fill="#151719"/>
          <path d="M20 18h18l8 8v20H20V18Z" fill="#32c8bd"/>
          <path d="M38 18v9h8" fill="#8cf4ea"/>
        </svg>
      `)
  );

  if (!dragIcon || dragIcon.isEmpty()) {
    dragIcon = nativeImage.createFromBuffer(Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAAZElEQVR42u3QMQEAAAgDINc/9F3hB4kQ5IQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4G8GgAAB6UP4CgAAAABJRU5ErkJggg==',
      'base64'
    ));
  }

  return dragIcon;
}

function normalizeDragPath(filePath) {
  const raw = String(filePath || '').trim().replace(/^["']|["']$/g, '');
  if (!raw) return '';

  if (/^file:\/\//i.test(raw)) {
    try {
      return fileURLToPath(raw);
    } catch {
      return '';
    }
  }

  return path.resolve(raw);
}

function startNativeFileDrag(sender, filePath) {
  const resolvedPath = normalizeDragPath(filePath);
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    const error = '文件不存在或路径已经失效。';
    writeBootLog(`file drag failed missing path=${resolvedPath || filePath || ''}`);
    return { ok: false, error, path: resolvedPath };
  }

  try {
    const icon = getDragIcon(resolvedPath);
    if (!icon || icon.isEmpty()) {
      const error = '拖拽图标创建失败。';
      writeBootLog(`file drag failed empty icon path=${resolvedPath}`);
      return { ok: false, error, path: resolvedPath };
    }

    sender.startDrag({
      file: resolvedPath,
      icon
    });
    return { ok: true, path: resolvedPath };
  } catch (error) {
    writeBootLog(`file drag failed ${error?.stack || error?.message || error}`);
    return { ok: false, error: error.message || '系统拖拽启动失败。', path: resolvedPath };
  }
}

function runWindowsOcr(filePath) {
  return new Promise((resolve) => {
    if (!filePath || !isImagePath(filePath)) {
      resolve({ ok: false, text: '', error: '请选择图片文件。' });
      return;
    }

    const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and
  $_.IsGenericMethod -and
  $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
})[0]
function Await-WinRt($operation, [Type]$resultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($resultType)
  $task = $asTask.Invoke($null, @($operation))
  try {
    $task.GetAwaiter().GetResult()
  } catch {
    if ($_.Exception.InnerException) { throw $_.Exception.InnerException }
    throw
  }
}
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapPixelFormat, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapAlphaMode, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
$ocrPath = $env:WINDOWSILL_OCR_PATH
if ([string]::IsNullOrWhiteSpace($ocrPath)) { throw 'OCR 文件路径为空。' }
$file = Await-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ocrPath)) ([Windows.Storage.StorageFile])
$stream = Await-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync(
  [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,
  [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied
)) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) { throw 'Windows OCR 当前语言不可用。请在系统语言设置里安装 OCR 语言包。' }
$result = Await-WinRt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
$result.Text
`;

    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 4,
        env: { ...process.env, WINDOWSILL_OCR_PATH: filePath }
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({ ok: false, text: '', error: cleanOcrError(stderr || error.message) });
          return;
        }
        resolve({ ok: true, text: stdout.trim() });
      }
    );
  });
}

function shouldRunOcr(messages, files) {
  const latest = messages[messages.length - 1]?.text || '';
  const asksOcr = /ocr|识别|提取文字|图片文字|看图|读图/i.test(latest);
  return asksOcr && files.some((file) => isImagePath(file.path || file.name));
}

function formatOcrReply(ocrResults) {
  const usable = ocrResults.filter((result) => result.ok && result.text);
  if (usable.length === 0) {
    const error = ocrResults.find((result) => result.error)?.error;
    return error ? `OCR 没读出来：${error}` : 'OCR 没读出文字。';
  }

  return usable
    .map((result) => `【${result.name}】\n${result.text}`)
    .join('\n\n');
}

function latestUserText(messages) {
  const latest = [...messages].reverse().find((message) => message.role !== 'assistant');
  return String(latest?.text || '');
}

function decodeTextBuffer(buffer) {
  if (!buffer || buffer.length === 0) return '';
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.slice(2).toString('utf16le');
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return buffer.slice(2).swap16().toString('utf16le');
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.slice(3).toString('utf8');
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 2000));
  let zeroOdd = 0;
  let zeroEven = 0;
  for (let index = 0; index < sample.length; index += 1) {
    if (sample[index] === 0) {
      if (index % 2 === 0) zeroEven += 1;
      else zeroOdd += 1;
    }
  }
  if (zeroOdd > sample.length * 0.18 || zeroEven > sample.length * 0.18) {
    return buffer.toString('utf16le');
  }

  return buffer.toString('utf8');
}

function normalizeForSearch(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/\s+/g, '');
}

function displaySnippet(text = '', index = 0, tokenLength = 0) {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + Math.max(tokenLength, 1) + 180);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function extractSearchNeed(text) {
  const source = String(text || '');
  const query = source
    .replace(/(帮我|请|能不能|可以|一下|搜索|查找|找|发送|发给我|给我|打开|看看|读取|读|里面|其中|内容|文件|暂存区|剪切板|剪贴板|clipboard|图片|文档|文字|哪个|哪一个|哪些|是否|有没有|有无|的|把)/gi, ' ')
    .replace(/[，。！？、,.!?;:()[\]{}"'`\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    source,
    query,
    wantsFiles: /暂存区|文件|文档|发送|发给我|给我|搜索|查找|找/i.test(source),
    wantsClipboard: /剪切板|剪贴板|clipboard|复制|粘贴|图片|文字/i.test(source),
    wantsAttachment: /发送|发给我|给我|贴出来|拿出来|导出|send/i.test(source),
    wantsLinks: /链接|网址|url|http|https|www\.|路径|地址|link/i.test(source),
    wantsRead: /读取|读|看看|内容|看一下|打开看看|里面写/i.test(source)
  };
}

function readSmallTextFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > 256 * 1024 || !isReadableTextPath(filePath)) return '';
    return decodeTextBuffer(fs.readFileSync(filePath)).slice(0, 30000);
  } catch {
    return '';
  }
}

function extractLinks(text = '') {
  const patterns = [
    /https?:\/\/[^\s<>"'，。；、)）\]}]+/gi,
    /www\.[^\s<>"'，。；、)）\]}]+/gi,
    /\[[^\]]+\]\(([^)\s]+)\)/gi,
    /(?:[a-zA-Z]:\\|\\\\)[^\r\n<>:"|?*]+/g
  ];
  const links = [];
  const seen = new Set();

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = String(match[1] || match[0] || '').trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      links.push(value);
    }
  }

  return links;
}

function getReadableStagedFiles(files) {
  return files
    .slice(0, 80)
    .map((file) => {
      const filePath = file.path || '';
      const name = file.name || path.basename(filePath);
      const text = filePath && fs.existsSync(filePath) ? readSmallTextFile(filePath) : '';
      return {
        name,
        path: filePath,
        type: file.type || fileKind(filePath || name),
        size: file.size,
        text,
        readable: Boolean(text)
      };
    });
}

function scanFilesForLinks(indexedFiles) {
  return indexedFiles
    .filter((file) => file.readable)
    .map((file) => ({
      ...file,
      links: extractLinks(file.text)
    }))
    .filter((file) => file.links.length > 0);
}

function findNamedFiles(indexedFiles, need) {
  const source = normalizeForSearch(need.source);
  const query = normalizeForSearch(need.query);
  return indexedFiles.filter((file) => {
    const basename = normalizeForSearch(path.basename(file.name, path.extname(file.name)));
    const name = normalizeForSearch(file.name);
    if (!basename && !name) return false;
    return (source && (source.includes(name) || source.includes(basename))) ||
      (query && (name.includes(query) || query.includes(basename)));
  });
}

function makeFileAttachment(file, reason = '') {
  const filePath = file.path;
  const name = file.name || path.basename(filePath || '');
  const attachment = {
    id: `file:${filePath || name}`,
    type: isImagePath(filePath || name) ? 'image' : 'file',
    kind: fileKind(filePath || name),
    name,
    path: filePath,
    previewText: reason || filePath
  };

  if (attachment.type === 'image' && filePath && fs.existsSync(filePath)) {
    const image = nativeImage.createFromPath(filePath);
    if (image && !image.isEmpty()) {
      attachment.preview = image.resize({ width: 180 }).toDataURL();
    }
  }

  return attachment;
}

function makeClipboardAttachment(item) {
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

async function searchStagedFiles(indexedFiles, need) {
  if (!need.wantsFiles && !need.query) return [];
  const query = need.query.toLowerCase();
  const results = [];

  for (const file of indexedFiles.slice(0, 40)) {
    const filePath = file.path || '';
    const name = file.name || path.basename(filePath);
    const haystack = `${name}\n${filePath}\n${file.type || ''}`.toLowerCase();
    let score = query && haystack.includes(query) ? 8 : 0;
    let snippet = '';

    if (filePath && fs.existsSync(filePath)) {
      const text = file.text || '';
      if (text) {
        const lowerText = text.toLowerCase();
        const compactText = normalizeForSearch(text);
        const compactQuery = normalizeForSearch(query);
        const index = query ? lowerText.indexOf(query) : -1;
        const compactIndex = compactQuery ? compactText.indexOf(compactQuery) : -1;
        if (index >= 0) {
          score += 6;
          snippet = displaySnippet(text, index, query.length);
        } else if (compactIndex >= 0) {
          score += 5;
          snippet = text.slice(0, 420);
        } else if (!query && need.wantsFiles) {
          score += 1;
          snippet = text.slice(0, 320);
        } else if (need.wantsLinks && extractLinks(text).length > 0) {
          score += 4;
          snippet = extractLinks(text).slice(0, 3).join('\n');
        } else if (need.wantsRead && findNamedFiles([file], need).length > 0) {
          score += 7;
          snippet = text.slice(0, 1200);
        }
      }

      if (!query && need.wantsFiles) score += 2;
    }

    if (score > 0) {
      results.push({
        name,
        path: filePath,
        type: file.type || fileKind(filePath || name),
        size: file.size,
        score,
        snippet,
        links: extractLinks(file.text || '')
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 8);
}

function searchClipboardHistory(need) {
  if (!need.wantsClipboard && !need.query) return [];
  snapshotClipboard();
  const query = need.query.toLowerCase();

  return clipboardHistory
    .map((item) => {
      if (item.type === 'text') {
        const text = String(item.text || '');
        const score = query && text.toLowerCase().includes(query) ? 10 : !query && need.wantsClipboard ? 2 : 0;
        return score > 0 ? { ...item, score, preview: item.preview || text.slice(0, 140) } : null;
      }

      if (item.type === 'image') {
        const score = /图片|image|截图|剪贴板|剪切板/i.test(need.source) || (need.wantsClipboard && !query) ? 3 : 0;
        return score > 0 ? { ...item, score } : null;
      }

      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function buildDeterministicReply(need, indexedFiles, stagedMatches, linkMatches) {
  if (need.wantsLinks) {
    if (linkMatches.length === 0) {
      const checked = indexedFiles.filter((file) => file.readable).map((file) => `「${file.name}」`).join('、');
      return checked
        ? `我已经重新读取并扫描了 ${checked}，没有发现 URL、Markdown 链接或 Windows 路径。`
        : '暂存区里没有可读取的文本文件，所以没法扫描链接。';
    }

    return [
      `检测到 ${linkMatches.length} 个文件包含链接：`,
      ...linkMatches.map((file) => `- ${file.name}：${file.links.slice(0, 4).join('，')}`)
    ].join('\n');
  }

  if (need.wantsRead) {
    const namedFiles = findNamedFiles(indexedFiles, need).filter((file) => file.readable);
    if (namedFiles.length > 0) {
      const file = namedFiles[0];
      return `我重新读取了 ${file.name}：\n\n${file.text.slice(0, 1800).trim() || '文件是空的。'}`;
    }
  }

  if (/全文|全部内容|所有内容/i.test(need.source) && stagedMatches.length > 0) {
    return stagedMatches
      .filter((file) => file.snippet)
      .map((file) => `【${file.name}】\n${file.snippet}`)
      .join('\n\n');
  }

  return '';
}

async function buildAgentContext(messages, files) {
  const text = latestUserText(messages);
  const need = extractSearchNeed(text);
  const indexedFiles = getReadableStagedFiles(files);
  const linkMatches = scanFilesForLinks(indexedFiles);
  const stagedMatches = await searchStagedFiles(indexedFiles, need);
  const clipboardMatches = searchClipboardHistory(need);
  const attachments = [];
  const directText = buildDeterministicReply(need, indexedFiles, stagedMatches, linkMatches);

  if (need.wantsAttachment) {
    for (const match of stagedMatches.slice(0, 5)) {
      attachments.push(makeFileAttachment(match, match.snippet ? '内容匹配' : '文件匹配'));
    }
    for (const match of clipboardMatches.slice(0, 5)) {
      const attachment = makeClipboardAttachment(match);
      if (attachment) attachments.push(attachment);
    }
  }

  return {
    request: need,
    directText,
    fileIndex: indexedFiles.map((file) => ({
      name: file.name,
      path: file.path,
      type: file.type,
      size: file.size,
      readable: file.readable,
      links: extractLinks(file.text || ''),
      preview: file.readable ? file.text.slice(0, 1200) : ''
    })),
    linkMatches: linkMatches.map((file) => ({
      name: file.name,
      path: file.path,
      links: file.links
    })),
    stagedMatches,
    clipboardMatches: clipboardMatches.map((item) => ({
      id: item.id,
      type: item.type,
      text: item.type === 'text' ? String(item.text || '').slice(0, 12000) : undefined,
      path: item.path,
      preview: item.type === 'image' ? '剪贴板图片' : item.preview,
      createdAt: item.createdAt
    })),
    attachments
  };
}

async function collectOcrContext(files) {
  const imageFiles = files.filter((file) => isImagePath(file.path || file.name)).slice(0, 3);
  const results = [];

  for (const file of imageFiles) {
    if (!file.path) continue;
    const result = await runWindowsOcr(file.path);
    results.push({
      name: file.name || path.basename(file.path),
      path: file.path,
      ok: result.ok,
      text: result.text,
      error: result.error
    });
  }

  return results;
}

function getAiConfig() {
  const ai = appSettings.ai || getStoredSettings().ai;
  return {
    apiKey: ai.apiKey || '',
    baseUrl: (ai.baseUrl || 'https://api.deepseek.com/v1').replace(/\/$/, ''),
    model: ai.model || 'deepseek-chat',
    temperature: normalizeTemperature(ai.temperature)
  };
}

function buildAiMessages(messages, files, ocrResults, agentContext) {
  return [
    {
      role: 'system',
      content:
        '你是 Windowsill，一个能操作本机上下文的 Windows 桌面 agent。不要凭记忆猜暂存文件或剪贴板内容；遇到文件、剪贴板、链接、图片、OCR、发送附件等请求，必须先调用工具。用户要“发送/给我/拿出来”时，除了读取内容，还要调用 attach_staged_files 或 attach_clipboard_items。回答简短、直接，说明你实际调用工具得到的结果。'
    },
    {
      role: 'system',
      content: JSON.stringify({
        stagedFiles: files.map((file) => ({
          name: file.name,
          path: file.path,
          type: file.type,
          size: file.size
        })),
        ocrResults,
        localSearch: agentContext || null
      })
    },
    ...messages.map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: String(message.text || '')
    }))
  ];
}

function createAiRequestBody(config, messages, files, ocrResults, agentContext, stream = false) {
  return {
    model: config.model,
    temperature: config.temperature,
    stream,
    messages: buildAiMessages(messages, files, ocrResults, agentContext)
  };
}

const agentTools = [
  {
    type: 'function',
    function: {
      name: 'list_staged_files',
      description: '列出用户暂存区里的文件。先用它确认文件名、路径、类型和是否可读取。',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_staged_file',
      description: '读取一个暂存文本文件的内容。identifier 可以是文件名、完整路径或 list_staged_files 返回的 index。',
      parameters: {
        type: 'object',
        properties: {
          identifier: { type: 'string' },
          maxChars: { type: 'number', default: 6000 }
        },
        required: ['identifier'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_staged_files',
      description: '在暂存区文件名、路径和可读取文本内容里搜索关键词。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          maxResults: { type: 'number', default: 8 }
        },
        required: ['query'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_links_in_staged_files',
      description: '扫描暂存区文本文件里的 URL、Markdown 链接和 Windows 路径。不要自己用正则猜，找链接必须调用它。',
      parameters: {
        type: 'object',
        properties: {
          identifier: { type: 'string', description: '可选，指定某个文件名、路径或 index；不传则扫描全部暂存文件。' }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_current_clipboard',
      description: '现场读取系统当前剪贴板。用户刚复制的新内容必须用这个工具获取，不要依赖旧上下文。',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_clipboard_history',
      description: '搜索 Windowsill 保存的剪贴板历史，包含文字和图片记录。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '可选；不传则列出最近记录。' },
          maxResults: { type: 'number', default: 8 }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'attach_staged_files',
      description: '把暂存区里的文件作为附件发给用户。identifier 可以是文件名、路径、index，或数组。',
      parameters: {
        type: 'object',
        properties: {
          identifiers: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } }
            ]
          }
        },
        required: ['identifiers'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'attach_clipboard_items',
      description: '把剪贴板内容作为附件发给用户。identifier 可用 latest、all、文字/图片类型或 clipboard item id。',
      parameters: {
        type: 'object',
        properties: {
          identifiers: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } }
            ]
          }
        },
        required: ['identifiers'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ocr_staged_image',
      description: '对暂存区图片调用 Windows OCR。',
      parameters: {
        type: 'object',
        properties: {
          identifier: { type: 'string' }
        },
        required: ['identifier'],
        additionalProperties: false
      }
    }
  }
];

function parseToolArgs(toolCall) {
  try {
    return JSON.parse(toolCall?.function?.arguments || '{}');
  } catch {
    return {};
  }
}

function createAgentRuntime(files) {
  return {
    files: getReadableStagedFiles(files),
    attachments: []
  };
}

function matchIdentifier(value, identifier) {
  const target = normalizeForSearch(identifier);
  if (!target) return false;
  const name = normalizeForSearch(value.name);
  const base = normalizeForSearch(path.basename(value.name || '', path.extname(value.name || '')));
  const filePath = normalizeForSearch(value.path);
  return name === target || base === target || filePath === target ||
    name.includes(target) || filePath.includes(target) || target.includes(name) || target.includes(base);
}

function findRuntimeFile(runtime, identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return null;
  const index = Number(raw);
  if (Number.isInteger(index) && index >= 1 && index <= runtime.files.length) {
    return runtime.files[index - 1];
  }
  return runtime.files.find((file) => matchIdentifier(file, raw)) || null;
}

function asIdentifierArray(value) {
  return Array.isArray(value) ? value : [value];
}

function currentClipboardPayload() {
  const text = clipboard.readText();
  if (text) {
    const key = `text:${crypto.createHash('sha1').update(text).digest('hex')}`;
    const item = {
      id: `${Date.now()}-${key.slice(5, 12)}`,
      key,
      type: 'text',
      text,
      preview: text.slice(0, 220),
      createdAt: Date.now()
    };
    if (!clipboardHistory.some((entry) => entry.key === key)) addClipboardItem(item);
    return { type: 'text', text: text.slice(0, 12000), itemId: item.id, preview: item.preview };
  }

  const image = clipboard.readImage();
  if (!image.isEmpty()) {
    const png = image.toPNG();
    const key = `image:${hashBuffer(png)}`;
    let item = clipboardHistory.find((entry) => entry.key === key);
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
      addClipboardItem(item);
    }
    return { type: 'image', itemId: item.id, path: item.path, preview: '当前剪贴板图片' };
  }

  return { type: 'empty', text: '' };
}

function findClipboardItem(identifier) {
  snapshotClipboard();
  const raw = String(identifier || '').trim().toLowerCase();
  if (raw === 'latest' || raw === '最近' || raw === '当前') return clipboardHistory[0] || null;
  if (raw === 'text' || raw === '文字') return clipboardHistory.find((item) => item.type === 'text') || null;
  if (raw === 'image' || raw === '图片') return clipboardHistory.find((item) => item.type === 'image') || null;
  return clipboardHistory.find((item) => item.id === identifier || item.key === identifier) || null;
}

function compactFileForTool(file, index) {
  return {
    index: index + 1,
    name: file.name,
    path: file.path,
    type: file.type,
    size: file.size,
    readable: file.readable,
    links: extractLinks(file.text || '').slice(0, 8)
  };
}

async function executeAgentTool(toolCall, runtime) {
  const name = toolCall?.function?.name;
  const args = parseToolArgs(toolCall);

  if (name === 'list_staged_files') {
    return { files: runtime.files.map(compactFileForTool) };
  }

  if (name === 'read_staged_file') {
    const file = findRuntimeFile(runtime, args.identifier);
    if (!file) return { ok: false, error: '没有找到这个暂存文件。' };
    if (!file.readable) return { ok: false, file: compactFileForTool(file, runtime.files.indexOf(file)), error: '这个文件不是可直接读取的文本文件。' };
    return {
      ok: true,
      file: compactFileForTool(file, runtime.files.indexOf(file)),
      text: file.text.slice(0, Math.min(Number(args.maxChars) || 6000, 20000))
    };
  }

  if (name === 'search_staged_files') {
    const query = String(args.query || '');
    const maxResults = Math.min(Number(args.maxResults) || 8, 20);
    const lower = query.toLowerCase();
    const compactQuery = normalizeForSearch(query);
    const results = runtime.files
      .map((file, index) => {
        const haystack = `${file.name}\n${file.path}\n${file.text || ''}`;
        const lowerHaystack = haystack.toLowerCase();
        const compactHaystack = normalizeForSearch(haystack);
        const direct = lower ? lowerHaystack.indexOf(lower) : -1;
        const compact = compactQuery ? compactHaystack.indexOf(compactQuery) : -1;
        const score = direct >= 0 ? 10 : compact >= 0 ? 7 : 0;
        return score > 0
          ? {
              ...compactFileForTool(file, index),
              score,
              snippet: direct >= 0 ? displaySnippet(haystack, direct, query.length) : (file.text || '').slice(0, 420)
            }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
    return { query, results };
  }

  if (name === 'find_links_in_staged_files') {
    const targets = args.identifier ? [findRuntimeFile(runtime, args.identifier)].filter(Boolean) : runtime.files;
    return {
      files: targets
        .filter((file) => file.readable)
        .map((file) => ({
          file: compactFileForTool(file, runtime.files.indexOf(file)),
          links: extractLinks(file.text || '')
        }))
        .filter((item) => item.links.length > 0)
    };
  }

  if (name === 'get_current_clipboard') {
    return currentClipboardPayload();
  }

  if (name === 'search_clipboard_history') {
    snapshotClipboard();
    const query = String(args.query || '').toLowerCase();
    const maxResults = Math.min(Number(args.maxResults) || 8, 20);
    const items = clipboardHistory
      .map((item, index) => ({
        index: index + 1,
        id: item.id,
        type: item.type,
        preview: item.type === 'text' ? String(item.text || '').slice(0, 500) : '剪贴板图片',
        path: item.path,
        createdAt: item.createdAt
      }))
      .filter((item) => !query || `${item.preview}\n${item.path || ''}`.toLowerCase().includes(query))
      .slice(0, maxResults);
    return { items };
  }

  if (name === 'attach_staged_files') {
    const added = [];
    for (const identifier of asIdentifierArray(args.identifiers)) {
      const file = findRuntimeFile(runtime, identifier);
      if (!file) continue;
      const attachment = makeFileAttachment(file, file.path);
      runtime.attachments.push(attachment);
      added.push({ name: attachment.name, path: attachment.path, type: attachment.type });
    }
    return { ok: added.length > 0, attached: added };
  }

  if (name === 'attach_clipboard_items') {
    const rawIds = asIdentifierArray(args.identifiers);
    const ids = rawIds.some((id) => String(id).toLowerCase() === 'all')
      ? clipboardHistory.map((item) => item.id)
      : rawIds;
    const added = [];
    for (const identifier of ids) {
      const item = findClipboardItem(identifier);
      const attachment = item ? makeClipboardAttachment(item) : null;
      if (!attachment) continue;
      runtime.attachments.push(attachment);
      added.push({ name: attachment.name, type: attachment.type, path: attachment.path, previewText: attachment.previewText });
    }
    return { ok: added.length > 0, attached: added };
  }

  if (name === 'ocr_staged_image') {
    const file = findRuntimeFile(runtime, args.identifier);
    if (!file || !file.path) return { ok: false, error: '没有找到这个暂存图片。' };
    return { file: compactFileForTool(file, runtime.files.indexOf(file)), ...(await runWindowsOcr(file.path)) };
  }

  return { ok: false, error: `未知工具：${name}` };
}

async function requestAiToolStep(config, messages) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      temperature: Math.min(0.4, config.temperature),
      messages,
      tools: agentTools,
      tool_choice: 'auto'
    })
  });

  if (!response.ok) {
    throw new Error(`AI tool step failed: ${response.status} ${await readResponseText(response)}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message || {};
}

async function runAiAgent(config, messages, files, ocrResults, onDelta) {
  const runtime = createAgentRuntime(files);
  const agentMessages = buildAiMessages(messages, files, ocrResults, null);
  const toolStep = await requestAiToolStep(config, agentMessages);
  const toolCalls = Array.isArray(toolStep.tool_calls) ? toolStep.tool_calls : [];

  if (toolCalls.length === 0) {
    const text = String(toolStep.content || '').trim();
    if (!text) throw new Error('AI response did not include content or tool_calls');
    onDelta?.(text);
    return { text, attachments: runtime.attachments };
  }

  agentMessages.push({
    role: 'assistant',
    content: toolStep.content || '',
    tool_calls: toolCalls
  });

  for (const toolCall of toolCalls.slice(0, 12)) {
    const result = await executeAgentTool(toolCall, runtime);
    agentMessages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      name: toolCall.function?.name,
      content: JSON.stringify(result)
    });
  }

  const text = await requestAiStream(config, agentMessages, [], [], null, onDelta);
  return { text, attachments: runtime.attachments };
}

async function readResponseText(response) {
  const text = await response.text();
  return text.replace(/\s+/g, ' ').trim().slice(0, 600);
}

async function requestAiOnce(config, messages, files, ocrResults, agentContext) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(createAiRequestBody(config, messages, files, ocrResults, agentContext, false))
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status} ${await readResponseText(response)}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('AI response did not include message.content');
  return text;
}

async function requestAiStream(config, messages, files, ocrResults, agentContext, onDelta) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createAiRequestBody(config, messages, files, ocrResults, agentContext, true))
    });

    if (!response.ok) {
      throw new Error(`AI stream failed: ${response.status} ${await readResponseText(response)}`);
    }

    if (!response.body?.getReader) {
      throw new Error('AI stream response body is not readable');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const packets = buffer.split(/\n\n/);
      buffer = packets.pop() || '';

      for (const packet of packets) {
        const lines = packet.split(/\r?\n/);
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;

          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }

          for (const choice of parsed?.choices || []) {
            const content = choice?.delta?.content;
            if (typeof content === 'string' && content.length > 0) {
              fullText += content;
              onDelta(content);
            }
          }
        }
      }
    }

    if (!fullText.trim()) throw new Error('AI stream completed without content');
    return fullText.trim();
  } finally {
    clearTimeout(timeout);
  }
}

function getDefaultAnchor() {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  return {
    x: Math.round(workArea.x + workArea.width / 2),
    y: workArea.y + 10
  };
}

function clampToWorkArea(bounds, workArea, padding = 8) {
  return {
    ...bounds,
    x: Math.min(Math.max(bounds.x, workArea.x + padding), workArea.x + workArea.width - bounds.width - padding),
    y: Math.min(Math.max(bounds.y, workArea.y + padding), workArea.y + workArea.height - bounds.height - padding)
  };
}

function getCursorCenteredBounds(targetSize) {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const workArea = display.workArea;
  return clampToWorkArea(
    {
      x: Math.round(workArea.x + (workArea.width - targetSize.width) / 2),
      y: Math.round(workArea.y + (workArea.height - targetSize.height) / 2),
      width: targetSize.width,
      height: targetSize.height
    },
    workArea
  );
}

function clampBounds(bounds, mode = 'strict') {
  const display = screen.getDisplayMatching(bounds);
  const workArea = display.workArea;
  if (mode === 'heat') {
    const minX = workArea.x - collapsedVisibleOffset.x + 8;
    const maxX = workArea.x + workArea.width - collapsedVisibleSize.width - collapsedVisibleOffset.x - 8;
    const minY = workArea.y - collapsedVisibleOffset.y + 8;
    const maxY = workArea.y + workArea.height - collapsedVisibleSize.height - collapsedVisibleOffset.y - 8;
    return {
      ...bounds,
      x: Math.min(Math.max(bounds.x, minX), maxX),
      y: Math.min(Math.max(bounds.y, minY), maxY)
    };
  }

  const minVisible = mode === 'loose'
    ? Math.min(96, Math.max(48, bounds.width * 0.35))
    : bounds.width;
  const minVisibleHeight = mode === 'loose'
    ? Math.min(58, Math.max(32, bounds.height * 0.5))
    : bounds.height;
  const minX = mode === 'loose' ? workArea.x - bounds.width + minVisible : workArea.x + 8;
  const maxX = mode === 'loose'
    ? workArea.x + workArea.width - minVisible
    : workArea.x + workArea.width - bounds.width - 8;
  const minY = mode === 'loose' ? workArea.y - bounds.height + minVisibleHeight : workArea.y + 8;
  const maxY = mode === 'loose'
    ? workArea.y + workArea.height - minVisibleHeight
    : workArea.y + workArea.height - bounds.height - 8;

  return {
    ...bounds,
    x: Math.min(Math.max(bounds.x, minX), maxX),
    y: Math.min(Math.max(bounds.y, minY), maxY)
  };
}

function getBoundsForSize(targetSize) {
  if (!windowAnchor) {
    const saved = loadState().windowAnchor;
    windowAnchor =
      saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
        ? saved
        : getDefaultAnchor();
  }

  const isCollapsed = targetSize.width === collapsedSize.width && targetSize.height === collapsedSize.height;
  const bounds = {
    x: Math.round(windowAnchor.x - targetSize.width / 2),
    y: Math.round(windowAnchor.y - (isCollapsed ? collapsedVisibleOffset.y : 0)),
    width: targetSize.width,
    height: targetSize.height
  };

  return clampBounds(bounds, isCollapsed ? 'heat' : 'strict');
}

function updateAnchorFromBounds(bounds) {
  const isCollapsed = bounds.width === collapsedSize.width && bounds.height === collapsedSize.height;
  windowAnchor = {
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + (isCollapsed ? collapsedVisibleOffset.y : 0))
  };
}

function persistWindowAnchor() {
  if (!mainWindow) return;
  updateAnchorFromBounds(mainWindow.getBounds());
  saveState({ windowAnchor });
}

function schedulePersistWindowAnchor() {
  clearTimeout(persistPositionTimer);
  persistPositionTimer = setTimeout(() => {
    persistPositionTimer = null;
    if (!isHidden) persistWindowAnchor();
  }, 350);
}

function getPrimaryTopBounds(targetSize) {
  const bounds = getBoundsForSize(targetSize);
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  };
}

function applyWindowMode(expanded, notify = true) {
  if (!mainWindow) return;

  isExpanded = expanded;
  isHidden = false;
  const target = expanded ? expandedSize : collapsedSize;
  const bounds = getBoundsForSize(target);
  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.setAlwaysOnTop(Boolean(appSettings.alwaysOnTop), 'screen-saver');
  mainWindow.setSkipTaskbar(!expanded);
  if (!mainWindow.isVisible()) mainWindow.showInactive();

  mainWindow.setBounds(bounds);
  updateAnchorFromBounds(bounds);

  if (expanded) mainWindow.focus();
  else mainWindow.showInactive();

  if (notify) mainWindow.webContents.send('island:mode', { expanded });
}

function requestCollapse() {
  if (!mainWindow) return;
  mainWindow.webContents.send('island:collapse-request');
}

function requestHide() {
  if (!mainWindow || isHidden) return;
  mainWindow.webContents.send('island:hide-request');
}

function requestShow() {
  if (!mainWindow) return;
  isHidden = false;
  isExpanded = false;
  mainWindow.setBounds(getBoundsForSize(collapsedSize));
  mainWindow.showInactive();
  mainWindow.webContents.send('island:show-request');
}

function bringWindowToFront(expand = false, centerOnCursor = false) {
  if (!mainWindow) return;
  isHidden = false;
  isExpanded = Boolean(expand);
  const targetSize = expand ? expandedSize : collapsedSize;
  const bounds = centerOnCursor ? getCursorCenteredBounds(targetSize) : getBoundsForSize(targetSize);
  mainWindow.setOpacity(1);
  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.setAlwaysOnTop(Boolean(appSettings.alwaysOnTop), 'screen-saver');
  mainWindow.setSkipTaskbar(!expand);
  mainWindow.setBounds(bounds);
  updateAnchorFromBounds(bounds);
  if (expand) suppressAutoCollapseUntil = Date.now() + 15000;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.moveTop();
  mainWindow.focus();
  if (expand) {
    mainWindow.webContents.send('island:mode', { expanded: true });
  } else {
    mainWindow.webContents.send('island:show-request');
  }
}

function createWindow() {
  const initialSize = app.isPackaged ? expandedSize : collapsedSize;

  mainWindow = new BrowserWindow({
    ...getPrimaryTopBounds(initialSize),
    icon: appIconPath,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    skipTaskbar: !app.isPackaged,
    hasShadow: false,
    show: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (app.isPackaged) {
      bringWindowToFront(true);
      return;
    }

    mainWindow.showInactive();
    applyWindowMode(false, false);
  });

  mainWindow.webContents.once('did-finish-load', () => {
    writeBootLog('renderer did-finish-load');
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (app.isPackaged) {
        bringWindowToFront(true);
        return;
      }
      if (!mainWindow.isVisible()) bringWindowToFront();
    }, 450);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    writeBootLog(`renderer did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    writeBootLog(`renderer console level=${level} ${sourceId}:${line} ${message}`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeBootLog(`renderer gone ${details.reason} exitCode=${details.exitCode}`);
  });

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    writeBootLog(`loadFile ${indexPath} exists=${fs.existsSync(indexPath)}`);
    mainWindow.loadFile(indexPath, { query: { launch: 'expanded' } });
  }

  mainWindow.on('blur', () => {
    if (!appSettings.autoCollapseOnBlur) return;
    if (Date.now() < suppressAutoCollapseUntil) return;
    if (isExpanded) requestCollapse();
  });

  mainWindow.on('move', () => {
    schedulePersistWindowAnchor();
  });

  mainWindow.on('system-context-menu', (event) => {
    event.preventDefault();
    requestHide();
  });
}

app.on('second-instance', () => {
  if (mainWindow) {
    bringWindowToFront(true, true);
  }
});

function createTray() {
  const icon = nativeImage.createFromPath(appIconPath);
  tray = new Tray(icon);
  tray.setToolTip('Windowsill');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '显示 / 隐藏',
      click: () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible() && !isHidden) requestHide();
        else requestShow();
      }
    },
    {
      label: '展开',
      click: () => applyWindowMode(true)
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      click: () => app.quit()
    }
  ]));
}

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
  appSettings = getStoredSettings();
  createWindow();
  createTray();
  clipboardRepository = createClipboardRepository({
    ensureDir,
    filePayload,
    hashBuffer,
    loadState,
    saveState
  });
  clipboardRepository.startWatcher();

  registerAppHotkey();

  ipcMain.handle('island:set-expanded', (_event, expanded) => {
    applyWindowMode(Boolean(expanded), false);
    return { expanded: isExpanded };
  });

  ipcMain.handle('island:request-hide', () => {
    requestHide();
    return { ok: true };
  });

  ipcMain.handle('island:finish-hide', () => {
    if (!mainWindow) return { ok: false };
    isHidden = true;
    isExpanded = false;
    const bounds = getBoundsForSize(collapsedSize);
    mainWindow.setBounds(bounds);
    updateAnchorFromBounds(bounds);
    mainWindow.hide();
    return { ok: true };
  });

  ipcMain.handle('island:open-path', async (_event, filePath) => {
    if (!filePath) return { ok: false };
    const result = await shell.openPath(filePath);
    return { ok: result === '', error: result };
  });

  ipcMain.handle('island:open-url', async (_event, url) => {
    if (!url) return { ok: false };
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('island:show-in-folder', async (_event, filePath) => {
    if (!filePath) return { ok: false };
    shell.showItemInFolder(filePath);
    return { ok: true };
  });

  ipcMain.handle('island:open-downloads', async () => {
    const downloads = app.getPath('downloads');
    const result = await shell.openPath(downloads);
    return { ok: result === '', error: result };
  });

  ipcMain.handle('island:get-app-info', () => ({
    downloads: app.getPath('downloads'),
    desktop: app.getPath('desktop'),
    documents: app.getPath('documents'),
    pictures: app.getPath('pictures'),
    version: app.getVersion(),
    platform: process.platform
  }));

  ipcMain.handle('settings:get', () => ({
    ok: true,
    settings: getStoredSettings(),
    userData: app.getPath('userData')
  }));

  ipcMain.handle('settings:update', (_event, patch = {}) => {
    const cleanPatch = {};
    for (const key of ['autoCollapseOnBlur', 'alwaysOnTop', 'launchAtLogin']) {
      if (typeof patch[key] === 'boolean') cleanPatch[key] = patch[key];
    }
    if (typeof patch.hotkey === 'string') cleanPatch.hotkey = patch.hotkey;
    if (patch.ai && typeof patch.ai === 'object') {
      cleanPatch.ai = {};
      for (const key of ['provider', 'apiKey', 'baseUrl', 'model']) {
        if (typeof patch.ai[key] === 'string') cleanPatch.ai[key] = patch.ai[key];
      }
      if (Object.hasOwn(patch.ai, 'temperature')) cleanPatch.ai.temperature = patch.ai.temperature;
    }
    return {
      ok: true,
      settings: saveAppSettings(cleanPatch)
    };
  });

  ipcMain.handle('settings:open-data-dir', async () => {
    const result = await shell.openPath(app.getPath('userData'));
    return { ok: result === '', error: result };
  });

  ipcMain.handle('settings:reset-window-position', () => {
    windowAnchor = getDefaultAnchor();
    saveState({ windowAnchor });
    if (mainWindow) applyWindowMode(isExpanded, false);
    return { ok: true, windowAnchor };
  });

  ipcMain.handle('system:open-tool', async (_event, tool) => {
    if (tool === 'calculator') return launchDetached('calc.exe');
    if (tool === 'notepad') return launchDetached('notepad.exe');
    return { ok: false, error: '未知工具。' };
  });

  ipcMain.handle('island:capture-screen', async () => captureWithSystemSnippingTool());

  ipcMain.handle('clipboard:get-history', () => {
    return { ok: true, items: clipboardRepository.getHistory() };
  });

  ipcMain.handle('clipboard:write-item', (_event, itemId) => {
    return clipboardRepository.writeItem(itemId);
  });

  ipcMain.handle('clipboard:stage-image', (_event, itemId) => {
    return clipboardRepository.stageImage(itemId);
  });

  ipcMain.handle('system:notify', (_event, payload = {}) => {
    if (!Notification.isSupported()) return { ok: false, reason: 'unsupported' };
    new Notification({
      title: payload.title || 'Windowsill',
      body: payload.body || ''
    }).show();
    return { ok: true };
  });

  ipcMain.handle('island:choose-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择文件',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'tif', 'tiff', 'webp'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled) return { ok: false, files: [] };

    const files = result.filePaths.map(filePayload);

    return { ok: true, files };
  });

  ipcMain.handle('island:ocr-file', async (_event, filePath) => runWindowsOcr(filePath));

  ipcMain.on('island:start-file-drag', (event, filePath) => {
    startNativeFileDrag(event.sender, filePath);
  });

  ipcMain.on('island:start-file-drag-sync', (event, filePath) => {
    event.returnValue = startNativeFileDrag(event.sender, filePath);
  });

  ipcMain.handle('ai:chat', async (_event, payload = {}) => {
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const files = Array.isArray(payload.files) ? payload.files : [];
    const ocrResults = shouldRunOcr(messages, files) ? await collectOcrContext(files) : [];
    const config = getAiConfig();

    if (!config.apiKey || !config.model) {
      if (ocrResults.length > 0) {
        return {
          ok: true,
          text: formatOcrReply(ocrResults),
          attachments: [],
          tool: 'windows-ocr'
        };
      }

      return {
        ok: false,
        text: fallbackReplies[messages.length % fallbackReplies.length],
        attachments: [],
        reason: 'missing_config'
      };
    }

    try {
      const result = await runWindowsillAgent({
        config,
        messages,
        files,
        ocrResults,
        dependencies: { clipboardRepository, runWindowsOcr }
      });
      return { ok: true, text: result.text, attachments: result.attachments, tool: 'agent' };
    } catch (error) {
      return {
        ok: false,
        text: `AI 请求失败：${error.message}`,
        attachments: [],
        reason: error.message
      };
    }
  });

  ipcMain.handle('ai:chat-stream', async (event, payload = {}) => {
    const streamId = payload.streamId || `stream-${Date.now()}`;
    const send = (message) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(`ai:chat-stream:${streamId}`, message);
      }
    };
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const files = Array.isArray(payload.files) ? payload.files : [];
    const ocrResults = shouldRunOcr(messages, files) ? await collectOcrContext(files) : [];
    const config = getAiConfig();

    if (!config.apiKey || !config.model) {
      const text = ocrResults.length > 0
        ? formatOcrReply(ocrResults)
        : fallbackReplies[messages.length % fallbackReplies.length];
      send({ type: 'delta', text });
      send({ type: 'done', text, attachments: [] });
      return { ok: Boolean(text), text, attachments: [], reason: 'missing_config' };
    }

    try {
      const result = await runWindowsillAgent({
        config,
        messages,
        files,
        ocrResults,
        onDelta: (delta) => send({ type: 'delta', text: delta }),
        onAttachment: (attachment) => send({ type: 'attachment', attachment }),
        dependencies: { clipboardRepository, runWindowsOcr }
      });
      send({ type: 'done', text: result.text, attachments: result.attachments, tool: 'agent' });
      return { ok: true, text: result.text, attachments: result.attachments, streamed: true, tool: 'agent' };
    } catch (error) {
      const text = `AI 请求失败：${error.message}`;
      send({ type: 'error', text, reason: error.message, attachments: [] });
      return { ok: false, text, attachments: [], reason: error.message };
    }
  });
});

app.on('will-quit', () => {
  clipboardRepository?.stopWatcher();
  if (clipboardTimer) clearInterval(clipboardTimer);
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});
