import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download } from 'lucide-react';
import { CompactIsland } from '../components/CompactIsland.jsx';
import { ManagerContent } from '../components/ManagerContent.jsx';
import { ManagerSidebar } from '../components/ManagerSidebar.jsx';
import { ManagerTopbar } from '../components/ManagerTopbar.jsx';
import { bridge } from '../lib/bridge.js';
import { navItems, panelSize, quickActions, shellTransitions } from './constants.jsx';
import { buildDefaultShortcuts, loadStoredShortcuts, makeShortcut, sortShortcuts } from '../utils/shortcuts.js';
import { cleanUiError, loadStoredFiles, normalizeDroppedFile, normalizeNativeFile } from '../utils/files.js';
import '../styles.css';

const DEFAULT_FOCUS_MS = 25 * 60 * 1000;
const MIN_FOCUS_MS = 1000;
const MAX_FOCUS_MS = 23 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000;

function clampFocusMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_FOCUS_MS;
  return Math.max(MIN_FOCUS_MS, Math.min(MAX_FOCUS_MS, Math.round(numeric / 1000) * 1000));
}

function loadStoredFocus() {
  try {
    const stored = JSON.parse(localStorage.getItem('windowsill.focus') || '{}');
    const minutes = Number(stored.minutes);
    const durationMs = Number(stored.durationMs);
    const endsAt = Number(stored.endsAt);
    const pausedRemaining = Number(stored.pausedRemaining);
    const initialDuration = Number.isFinite(durationMs) && durationMs > 0
      ? durationMs
      : (Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * 1000 : DEFAULT_FOCUS_MS);
    return {
      durationMs: clampFocusMs(initialDuration),
      endsAt: Number.isFinite(endsAt) && endsAt > Date.now() ? endsAt : 0,
      pausedRemaining: Number.isFinite(pausedRemaining) && pausedRemaining > 0
        ? Math.min(MAX_FOCUS_MS, Math.max(0, Math.round(pausedRemaining / 1000) * 1000))
        : 0
    };
  } catch {
    return { durationMs: DEFAULT_FOCUS_MS, endsAt: 0, pausedRemaining: 0 };
  }
}

function defaultToolIds() {
  return quickActions.map((item) => item.action);
}

function loadStoredToolIds() {
  const allIds = defaultToolIds();
  try {
    const stored = JSON.parse(localStorage.getItem('windowsill.visibleTools') || 'null');
    if (Array.isArray(stored)) {
      const known = new Set(allIds);
      const visible = stored.filter((id) => known.has(id));
      for (const id of ['calculator', 'notepad']) {
        if (known.has(id) && !visible.includes(id)) visible.push(id);
      }
      return visible;
    }
  } catch {
    // Ignore invalid saved layout.
  }
  return allIds;
}

const TODO_PRIORITY_ORDER = { fast: 0, normal: 1, leisure: 2 };

function loadStoredTodos() {
  try {
    const stored = JSON.parse(localStorage.getItem('windowsill.todos') || '[]');
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((item) => item?.title)
      .map((item) => ({
        id: item.id || `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: String(item.title),
        content: String(item.content || ''),
        priority: ['fast', 'normal', 'leisure'].includes(item.priority) ? item.priority : 'normal',
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
        updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : 0
      }));
  } catch {
    return [];
  }
}

function sortTodos(todos) {
  return [...todos].sort((a, b) => {
    const priorityDiff = TODO_PRIORITY_ORDER[a.priority] - TODO_PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

function normalizeUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function loadStoredLinks() {
  try {
    const stored = JSON.parse(localStorage.getItem('windowsill.links') || '[]');
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((item) => item?.url && item?.name)
      .map((item) => ({
        id: item.id || `link-${Date.now()}-${item.url}`,
        name: String(item.name),
        url: String(item.url),
        visits: Number.isFinite(item.visits) ? item.visits : 0,
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
        lastVisitedAt: Number.isFinite(item.lastVisitedAt) ? item.lastVisitedAt : 0
      }));
  } catch {
    return [];
  }
}

function sortLinks(links) {
  return [...links].sort((a, b) => {
    const visitDiff = (b.visits || 0) - (a.visits || 0);
    if (visitDiff !== 0) return visitDiff;
    const recentDiff = (b.lastVisitedAt || 0) - (a.lastVisitedAt || 0);
    if (recentDiff !== 0) return recentDiff;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

function Island() {
  const launchExpanded = new URLSearchParams(window.location.search).get('launch') === 'expanded';
  const [shellMode, setShellMode] = React.useState('visible');
  const [expanded, setExpanded] = React.useState(launchExpanded);
  const [contentMode, setContentMode] = React.useState(launchExpanded ? 'panel' : 'compact');
  const [activeSection, setActiveSection] = React.useState('home');
  const [dragging, setDragging] = React.useState(false);
  const [files, setFiles] = React.useState(loadStoredFiles);
  const [input, setInput] = React.useState('');
  const [shortcutPathInput, setShortcutPathInput] = React.useState('');
  const [shortcutNameInput, setShortcutNameInput] = React.useState('');
  const [shortcuts, setShortcuts] = React.useState(loadStoredShortcuts);
  const [linkUrlInput, setLinkUrlInput] = React.useState('');
  const [linkNameInput, setLinkNameInput] = React.useState('');
  const [links, setLinks] = React.useState(loadStoredLinks);
  const [todos, setTodos] = React.useState(loadStoredTodos);
  const [appInfo, setAppInfo] = React.useState({ downloads: '', desktop: '', documents: '', pictures: '' });
  const [copied, setCopied] = React.useState(false);
  const [copiedMessageId, setCopiedMessageId] = React.useState('');
  const [clipboardOpen, setClipboardOpen] = React.useState(false);
  const [clipboardItems, setClipboardItems] = React.useState([]);
  const [visibleToolIds, setVisibleToolIds] = React.useState(loadStoredToolIds);
  const [appSettings, setAppSettings] = React.useState({
    autoCollapseOnBlur: true,
    alwaysOnTop: true,
    launchAtLogin: false,
    userData: ''
  });
  const [thinking, setThinking] = React.useState(false);
  const [messages, setMessages] = React.useState([
    { id: 'welcome', role: 'assistant', text: '早。把文件拖进来，或者直接告诉我你想做什么。' }
  ]);
  const [time, setTime] = React.useState(() => new Date());
  const storedFocus = React.useMemo(loadStoredFocus, []);
  const [focusDurationMs, setFocusDurationMs] = React.useState(storedFocus.durationMs);
  const [focusEndsAt, setFocusEndsAt] = React.useState(storedFocus.endsAt);
  const [focusPausedRemaining, setFocusPausedRemaining] = React.useState(storedFocus.pausedRemaining);
  const [focusRemaining, setFocusRemaining] = React.useState(
    storedFocus.endsAt ? Math.max(0, storedFocus.endsAt - Date.now()) : storedFocus.pausedRemaining
  );
  const dragDepth = React.useRef(0);

  React.useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    bridge.getAppInfo?.().then((info) => {
      if (info) setAppInfo(info);
    });
    bridge.getSettings?.().then((result) => {
      if (result?.settings) {
        setAppSettings({ ...result.settings, userData: result.userData || '' });
      }
    });
    const offMode = bridge.onModeChange?.(({ expanded: next }) => {
      if (next) openIsland();
    });
    const offCollapse = bridge.onCollapseRequest?.(() => closeIsland());
    const offHide = bridge.onHideRequest?.(() => hideIsland());
    const offShow = bridge.onShowRequest?.(() => showIsland());
    return () => {
      clearInterval(timer);
      offMode?.();
      offCollapse?.();
      offHide?.();
      offShow?.();
    };
  }, []);

  React.useEffect(() => {
    localStorage.setItem('windowsill.files', JSON.stringify(files));
  }, [files]);

  React.useEffect(() => {
    localStorage.setItem('windowsill.visibleTools', JSON.stringify(visibleToolIds));
  }, [visibleToolIds]);

  React.useEffect(() => {
    if (shortcuts !== null) {
      localStorage.setItem('windowsill.shortcuts', JSON.stringify(shortcuts));
    }
  }, [shortcuts]);

  React.useEffect(() => {
    localStorage.setItem('windowsill.links', JSON.stringify(links));
  }, [links]);

  React.useEffect(() => {
    localStorage.setItem('windowsill.todos', JSON.stringify(todos));
  }, [todos]);

  React.useEffect(() => {
    if (shortcuts !== null) return;
    if (!appInfo.downloads && !appInfo.desktop && !appInfo.documents && !appInfo.pictures) return;
    setShortcuts(buildDefaultShortcuts(appInfo));
  }, [appInfo, shortcuts]);

  React.useEffect(() => {
    localStorage.setItem('windowsill.focus', JSON.stringify({
      durationMs: focusDurationMs,
      minutes: Math.max(1, Math.round(focusDurationMs / 60000)),
      endsAt: focusEndsAt,
      pausedRemaining: focusPausedRemaining
    }));
  }, [focusDurationMs, focusEndsAt, focusPausedRemaining]);

  React.useEffect(() => {
    if (!focusEndsAt) {
      setFocusRemaining(focusPausedRemaining || 0);
      return undefined;
    }

    const tick = () => {
      const remaining = Math.max(0, focusEndsAt - Date.now());
      setFocusRemaining(remaining);
      if (remaining <= 0) {
        setFocusEndsAt(0);
        setFocusPausedRemaining(0);
        bridge.notify?.('专注结束', '倒计时结束，起来动一下。');
        setMessages((current) => [
          ...current,
          { id: `focus-${Date.now()}`, role: 'assistant', text: '专注时间到了。' }
        ]);
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [focusEndsAt, focusPausedRemaining]);

  function openIsland() {
    if (expanded && contentMode === 'panel') {
      setShellMode('visible');
      return;
    }

    window.clearTimeout(openIsland.timer);
    window.clearTimeout(closeIsland.timer);
    window.clearTimeout(showIsland.timer);
    window.clearTimeout(showIsland.doneTimer);
    window.clearTimeout(hideIsland.dotTimer);
    window.clearTimeout(hideIsland.timer);
    setShellMode('visible');
    setContentMode('none');
    Promise.resolve(bridge.setExpanded?.(true)).finally(() => {
      window.requestAnimationFrame(() => {
        setExpanded(true);
        openIsland.timer = window.setTimeout(() => setContentMode('panel'), 390);
      });
    });
  }

  function showIsland() {
    window.clearTimeout(showIsland.timer);
    window.clearTimeout(showIsland.doneTimer);
    window.clearTimeout(hideIsland.dotTimer);
    window.clearTimeout(hideIsland.timer);
    setExpanded(false);
    setContentMode('none');
    setShellMode('hidden');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setShellMode('dot');
        showIsland.timer = window.setTimeout(() => {
          setShellMode('reveal');
          showIsland.doneTimer = window.setTimeout(() => {
            setShellMode('visible');
            setContentMode('compact');
          }, 560);
        }, 190);
      });
    });
  }

  function hideIsland() {
    window.clearTimeout(openIsland.timer);
    window.clearTimeout(closeIsland.timer);
    window.clearTimeout(showIsland.timer);
    window.clearTimeout(showIsland.doneTimer);
    window.clearTimeout(hideIsland.dotTimer);
    window.clearTimeout(hideIsland.timer);
    setClipboardOpen(false);
    setContentMode('none');
    setExpanded(false);
    setShellMode('dot');
    hideIsland.dotTimer = window.setTimeout(() => setShellMode('hidden'), 420);
    hideIsland.timer = window.setTimeout(() => {
      setContentMode('compact');
      bridge.finishHide?.();
    }, 680);
  }

  function closeIsland() {
    window.clearTimeout(openIsland.timer);
    window.clearTimeout(closeIsland.timer);
    window.clearTimeout(showIsland.timer);
    window.clearTimeout(showIsland.doneTimer);
    setShellMode('visible');
    setContentMode('none');
    setExpanded(false);
    closeIsland.timer = window.setTimeout(() => {
      setContentMode('compact');
      bridge.setExpanded?.(false);
    }, 430);
  }

  function toggle() {
    if (expanded) closeIsland();
    else openIsland();
  }

  function handleContextMenu(event) {
    event.preventDefault();
    hideIsland();
  }

  function handleDrop(event) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const dropped = Array.from(event.dataTransfer.files ?? []).map((file) => normalizeDroppedFile(file, bridge));

    if (dropped.length > 0) {
      setFiles((current) => [...dropped, ...current]);
      setActiveSection('files');
      openIsland();
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: `收到了 ${dropped.length} 个文件。要我先总结、OCR，还是整理命名？` }
      ]);
    }
  }

  function isFileDrag(event) {
    return Array.from(event.dataTransfer?.types || []).includes('Files');
  }

  function handleDragEnter(event) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function handleDragOver(event) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  }

  function handleDragLeave(event) {
    if (!isFileDrag(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed) return;
    const now = Date.now();
    const userMessage = { id: `user-${now}`, role: 'user', text: trimmed };
    const assistantId = `assistant-${now}`;
    const nextMessages = [...messages, userMessage];
    let streamedText = '';
    let streamedAttachments = [];

    setMessages([...nextMessages, { id: assistantId, role: 'assistant', text: '', streaming: true }]);
    setInput('');
    setThinking(true);

    const finishMessage = (text, extra = {}) => {
      const finalText = (text || '').trim() || '我在，但刚才没拿到有效回复。';
      const nextAttachments = extra.attachments || streamedAttachments;
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, text: finalText, streaming: false, ...extra, attachments: nextAttachments }
            : message
        )
      );
      setThinking(false);
    };

    try {
      const result = await bridge.chatStream?.(nextMessages, files, {
        onDelta: (delta) => {
          if (!delta) return;
          streamedText += delta;
          setThinking(false);
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? { ...message, text: streamedText, streaming: true }
                : message
            )
          );
        },
        onAttachment: (attachment) => {
          if (!attachment) return;
          streamedAttachments = streamedAttachments.some((item) => item.id === attachment.id)
            ? streamedAttachments
            : [...streamedAttachments, attachment];
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? { ...message, attachments: streamedAttachments }
                : message
            )
          );
        },
        onError: (payload) => {
          finishMessage(payload?.text || payload?.reason || 'AI 请求失败。', { error: true });
        },
        onDone: (payload) => {
          finishMessage(payload?.text || streamedText, {
            fallback: payload?.fallback,
            attachments: payload?.attachments || []
          });
        }
      });

      if (!result?.ok && !streamedText) {
        finishMessage(result?.text || result?.reason || 'AI 请求失败。', { error: true });
      }
    } catch (error) {
      finishMessage(`AI 请求失败：${error.message}`, { error: true });
    }
  }

  function removeFile(index) {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleAction(action) {
    if (action === 'downloads') await bridge.openDownloads?.();
    if (action === 'calculator') await bridge.openSystemTool?.('calculator');
    if (action === 'notepad') await bridge.openSystemTool?.('notepad');
    if (action === 'ocr') await chooseAndRunOcr();
    if (action === 'screenshot') await takeScreenshot();
    if (action === 'clipboard') await openClipboardPanel();
    if (action === 'translate') {
      setActiveSection('chat');
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: '把要翻译的文字发给我，我会直接处理。' }
      ]);
    }
    if (action === 'focus') {
      setActiveSection('tools');
      openIsland();
    }
  }

  async function chooseFilesToStage() {
    const chosen = await bridge.chooseFiles?.();
    if (!chosen?.ok || chosen.files.length === 0) return;
    const selected = chosen.files.map(normalizeNativeFile);
    setFiles((current) => [...selected, ...current]);
    setActiveSection('files');
  }

  async function takeScreenshot() {
    const result = await bridge.captureScreen?.();
    openIsland();
    if (result?.ok && result.file) {
      const file = normalizeNativeFile(result.file);
      setFiles((current) => [file, ...current]);
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: `截图已暂存：${file.name}` }
      ]);
      return;
    }
    if (result?.canceled) return;
    setMessages((current) => [
      ...current,
      { role: 'assistant', text: `截图失败：${result?.error || '没有捕获到屏幕'}` }
    ]);
  }

  async function openClipboardPanel() {
    const result = await bridge.getClipboardHistory?.();
    setClipboardItems(result?.items ?? []);
    setClipboardOpen(true);
    setActiveSection('tools');
    openIsland();
  }

  async function chooseAndRunOcr() {
    const chosen = await bridge.chooseFiles?.();
    if (!chosen?.ok || chosen.files.length === 0) return;

    const selected = chosen.files.map(normalizeNativeFile);
    setFiles((current) => [...selected, ...current]);
    setActiveSection('chat');
    openIsland();
    setThinking(true);

    const results = [];
    for (const file of selected.filter((item) => item.type === 'image')) {
      const result = await bridge.ocrFile?.(file.path);
      results.push({ file, result });
    }

    const text = results.length
      ? results
          .map(({ file, result }) => {
            if (!result?.ok) return `【${file.name}】\nOCR 失败：${cleanUiError(result?.error)}`;
            return `【${file.name}】\n${result.text || '没有识别到文字'}`;
          })
          .join('\n\n')
      : '请选择图片文件来 OCR。';

    setMessages((current) => [
      ...current,
      { role: 'user', text: 'OCR 这些文件' },
      { role: 'assistant', text }
    ]);
    setThinking(false);
  }

  function handleFileDragStart(event, file) {
    if (!file.path) return;
    event.preventDefault();
    bridge.startFileDrag?.(file.path);
  }

  async function restoreClipboardItem(item) {
    const result = await bridge.writeClipboardItem?.(item.id);
    if (result?.ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    }
  }

  async function stageClipboardImage(item) {
    const result = await bridge.stageClipboardImage?.(item.id);
    if (!result?.ok || !result.file) return;
    setFiles((current) => [normalizeNativeFile(result.file), ...current]);
    setActiveSection('files');
  }

  function addShortcut() {
    const path = shortcutPathInput.trim().replace(/^["']|["']$/g, '');
    if (!path) return;
    const shortcut = makeShortcut(path, shortcutNameInput);
    setShortcuts((current) => [
      shortcut,
      ...(current ?? []).filter((item) => item.path.toLowerCase() !== path.toLowerCase())
    ]);
    setShortcutPathInput('');
    setShortcutNameInput('');
  }

  function removeShortcut(id) {
    setShortcuts((current) => (current ?? []).filter((item) => item.id !== id));
  }

  function renameShortcut(id, name) {
    const nextName = name.trim();
    if (!nextName) return;
    setShortcuts((current) =>
      (current ?? []).map((item) => (item.id === id ? { ...item, name: nextName } : item))
    );
  }

  async function openShortcut(shortcut) {
    if (!shortcut?.path) return;
    await bridge.openPath?.(shortcut.path);
    setShortcuts((current) =>
      (current ?? []).map((item) =>
        item.id === shortcut.id
          ? { ...item, visits: (item.visits || 0) + 1, lastVisitedAt: Date.now() }
          : item
      )
    );
  }

  function addLink() {
    const url = normalizeUrl(linkUrlInput);
    if (!url) return;
    const fallbackName = url.replace(/^https?:\/\//i, '').split(/[/?#]/)[0] || url;
    const link = {
      id: `${Date.now()}-${url}`,
      name: (linkNameInput || fallbackName).trim(),
      url,
      visits: 0,
      createdAt: Date.now(),
      lastVisitedAt: 0
    };
    setLinks((current) => [
      link,
      ...current.filter((item) => item.url.toLowerCase() !== url.toLowerCase())
    ]);
    setLinkUrlInput('');
    setLinkNameInput('');
  }

  function removeLink(id) {
    setLinks((current) => current.filter((item) => item.id !== id));
  }

  function renameLink(id, name) {
    const nextName = name.trim();
    if (!nextName) return;
    setLinks((current) => current.map((item) => (item.id === id ? { ...item, name: nextName } : item)));
  }

  async function openLink(link) {
    if (!link?.url) return;
    await bridge.openUrl?.(link.url);
    setLinks((current) =>
      current.map((item) =>
        item.id === link.id
          ? { ...item, visits: (item.visits || 0) + 1, lastVisitedAt: Date.now() }
          : item
      )
    );
  }

  function createTodo(todo) {
    const title = todo.title.trim();
    if (!title) return;
    setTodos((current) => [
      {
        id: `todo-${Date.now()}`,
        title,
        content: todo.content.trim(),
        priority: todo.priority,
        createdAt: Date.now(),
        updatedAt: 0
      },
      ...current
    ]);
  }

  function updateTodo(id, todo) {
    const title = todo.title.trim();
    if (!title) return;
    setTodos((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              title,
              content: todo.content.trim(),
              priority: todo.priority,
              updatedAt: Date.now()
            }
          : item
      )
    );
  }

  function removeTodo(id) {
    setTodos((current) => current.filter((item) => item.id !== id));
  }

  function startFocusTimer() {
    const duration = clampFocusMs(focusDurationMs);
    setFocusDurationMs(duration);
    setFocusPausedRemaining(0);
    setFocusRemaining(duration);
    setFocusEndsAt(Date.now() + duration);
    setActiveSection('tools');
  }

  function setFocusTime(value) {
    const next = clampFocusMs(value);
    setFocusDurationMs(next);
    if (focusPausedRemaining > 0 && !focusEndsAt) {
      setFocusPausedRemaining(next);
      setFocusRemaining(next);
    } else if (!focusEndsAt) {
      setFocusRemaining(0);
    }
  }

  async function updateAppSetting(key, value) {
    const optimistic = { ...appSettings, [key]: value };
    setAppSettings(optimistic);
    const result = await bridge.updateSettings?.({ [key]: value });
    if (result?.settings) {
      setAppSettings({ ...result.settings, userData: optimistic.userData });
    }
  }

  function resetToolLayout() {
    setVisibleToolIds(defaultToolIds());
  }

  function clearStagedFiles() {
    setFiles([]);
  }

  function toggleFocusPause() {
    if (focusEndsAt) {
      const remaining = Math.max(0, focusEndsAt - Date.now());
      setFocusEndsAt(0);
      setFocusPausedRemaining(remaining);
      setFocusRemaining(remaining);
      return;
    }

    if (focusPausedRemaining > 0) {
      setFocusEndsAt(Date.now() + focusPausedRemaining);
      setFocusPausedRemaining(0);
    }
  }

  function cancelFocusTimer() {
    setFocusEndsAt(0);
    setFocusPausedRemaining(0);
    setFocusRemaining(0);
  }

  async function copyPrompt() {
    const prompt = '总结暂存文件，提取待办事项，并给出下一步建议。';
    await navigator.clipboard?.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  async function copyAssistantMessage(message) {
    const text = message.text?.trim();
    if (!text) return;
    await navigator.clipboard?.writeText(text);
    setCopiedMessageId(message.id);
    setTimeout(() => setCopiedMessageId((current) => (current === message.id ? '' : current)), 1200);
  }

  const allShortcuts = sortShortcuts(shortcuts ?? []);
  const allLinks = sortLinks(links);
  const allTodos = sortTodos(todos);
  const activeNav = navItems.find((item) => item.id === activeSection) ?? navItems[0];

  const clock = time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const compactDateTime = time.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  const shellTarget = shellMode === 'hidden' || shellMode === 'dot'
    ? shellMode
    : dragging && !expanded
      ? 'drop'
    : expanded
      ? 'expanded'
      : 'collapsed';
  const shellTransition = shellMode === 'hidden'
    ? shellTransitions.hidden
    : shellMode === 'dot'
      ? shellTransitions.dot
      : shellMode === 'reveal'
        ? shellTransitions.reveal
        : dragging && !expanded
          ? shellTransitions.drop
        : expanded
          ? shellTransitions.expanded
          : shellTransitions.collapsed;

  return (
    <main
      className={`stage ${expanded ? 'is-expanded' : ''} ${dragging ? 'is-dragging' : ''}`}
      onContextMenu={handleContextMenu}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <motion.section
        className="island-shell"
        initial={false}
        variants={{
          hidden: { width: 10, height: 10, borderRadius: 999, opacity: 0, scale: 0.45 },
          dot: { width: 20, height: 20, borderRadius: 999, opacity: 1, scale: 1 },
          collapsed: { width: 188, height: 44, borderRadius: 999, opacity: 1, scale: 1 },
          drop: { width: 260, height: 72, borderRadius: 18, opacity: 1, scale: 1 },
          expanded: { width: panelSize.width, height: panelSize.height, borderRadius: 18, opacity: 1, scale: 1 }
        }}
        transition={shellTransition}
        animate={shellTarget}
      >
        <AnimatePresence mode="popLayout">
          {contentMode === 'compact' ? (
            <motion.div
              key="compact"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16 }}
            >
              <CompactIsland dateTime={compactDateTime} onToggle={toggle} />
            </motion.div>
          ) : contentMode === 'panel' ? (
            <motion.div
              key="expanded"
              className="panel"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <ManagerSidebar activeSection={activeSection} navItems={navItems} onSelect={setActiveSection} />

              <section className="manager-main">
                <ManagerTopbar
                  activeLabel={activeNav.label}
                  clock={clock}
                  fileCount={files.length}
                  onScreenshot={takeScreenshot}
                  onToggle={toggle}
                />
                <motion.div
                  className="manager-content"
                  key={activeSection}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.16 }}
                >
                  <ManagerContent
                    activeSection={activeSection}
                    files={files}
                    messages={messages}
                    thinking={thinking}
                    input={input}
                    setInput={setInput}
                    shortcutPathInput={shortcutPathInput}
                    setShortcutPathInput={setShortcutPathInput}
                    shortcutNameInput={shortcutNameInput}
                    setShortcutNameInput={setShortcutNameInput}
                    allShortcuts={allShortcuts}
                    linkUrlInput={linkUrlInput}
                    setLinkUrlInput={setLinkUrlInput}
                    linkNameInput={linkNameInput}
                    setLinkNameInput={setLinkNameInput}
                    allLinks={allLinks}
                    todos={allTodos}
                    focusDurationMs={focusDurationMs}
                    setFocusDurationMs={setFocusTime}
                    focusEndsAt={focusEndsAt}
                    focusPausedRemaining={focusPausedRemaining}
                    focusRemaining={focusRemaining}
                    clipboardItems={clipboardItems}
                    visibleToolIds={visibleToolIds}
                    setVisibleToolIds={setVisibleToolIds}
                    appSettings={appSettings}
                    copied={copied}
                    copiedMessageId={copiedMessageId}
                    onSendMessage={sendMessage}
                    onCopyMessage={copyAssistantMessage}
                    onChooseFiles={chooseFilesToStage}
                    onFileDragStart={handleFileDragStart}
                    onRemoveFile={removeFile}
                    onAddShortcut={addShortcut}
                    onRemoveShortcut={removeShortcut}
                    onRenameShortcut={renameShortcut}
                    onOpenShortcut={openShortcut}
                    onAddLink={addLink}
                    onRemoveLink={removeLink}
                    onRenameLink={renameLink}
                    onOpenLink={openLink}
                    onCreateTodo={createTodo}
                    onUpdateTodo={updateTodo}
                    onRemoveTodo={removeTodo}
                    onStartFocus={startFocusTimer}
                    onToggleFocusPause={toggleFocusPause}
                    onCancelFocus={cancelFocusTimer}
                    onHandleAction={handleAction}
                    onRestoreClipboard={restoreClipboardItem}
                    onStageClipboardImage={stageClipboardImage}
                    onOpenClipboard={openClipboardPanel}
                    onCopyPrompt={copyPrompt}
                    onSelectSection={setActiveSection}
                    onUpdateAppSetting={updateAppSetting}
                    onOpenDataDir={() => bridge.openDataDir?.()}
                    onResetWindowPosition={() => bridge.resetWindowPosition?.()}
                    onResetToolLayout={resetToolLayout}
                    onClearStagedFiles={clearStagedFiles}
                  />
                </motion.div>
              </section>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {dragging && (
            <motion.div
              className="drag-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Download size={30} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </main>
  );
}

export default Island;
