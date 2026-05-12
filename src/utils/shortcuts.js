export function loadStoredShortcuts() {
  try {
    const raw = localStorage.getItem('windowsill.shortcuts');
    if (!raw) return null;
    const stored = JSON.parse(raw);
    if (Array.isArray(stored)) {
      return stored
        .filter((item) => item?.path && item?.name)
        .map((item) => ({
          id: item.id || `${Date.now()}-${item.path}`,
          name: String(item.name),
          path: String(item.path),
          visits: Number.isFinite(item.visits) ? item.visits : 0,
          createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
          lastVisitedAt: Number.isFinite(item.lastVisitedAt) ? item.lastVisitedAt : 0,
          builtIn: Boolean(item.builtIn || item.fixed)
        }));
    }
  } catch {
    return null;
  }
  return null;
}

export function buildDefaultShortcuts(appInfo) {
  const now = Date.now();
  return [
    { id: 'downloads', name: '下载', path: appInfo.downloads, builtIn: true },
    { id: 'desktop', name: '桌面', path: appInfo.desktop, builtIn: true },
    { id: 'documents', name: '文档', path: appInfo.documents, builtIn: true },
    { id: 'pictures', name: '图片', path: appInfo.pictures, builtIn: true }
  ]
    .filter((item) => item.path)
    .map((item, index) => ({
      ...item,
      visits: 0,
      createdAt: now + index,
      lastVisitedAt: 0
    }));
}

export function sortShortcuts(shortcuts) {
  return [...shortcuts].sort((a, b) => {
    const visitDiff = (b.visits || 0) - (a.visits || 0);
    if (visitDiff !== 0) return visitDiff;
    const recentDiff = (b.lastVisitedAt || 0) - (a.lastVisitedAt || 0);
    if (recentDiff !== 0) return recentDiff;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

export function makeShortcut(path, name = '') {
  const trimmedPath = path.trim().replace(/^["']|["']$/g, '');
  const fallbackName = trimmedPath.split(/[\\/]/).filter(Boolean).pop() || trimmedPath;
  return {
    id: `${Date.now()}-${trimmedPath}`,
    name: (name || fallbackName).trim(),
    path: trimmedPath,
    visits: 0,
    createdAt: Date.now(),
    lastVisitedAt: 0,
    builtIn: false
  };
}
