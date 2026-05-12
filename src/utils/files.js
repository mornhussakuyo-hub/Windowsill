export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return '未知大小';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function fileKind(name = '') {
  const lower = name.toLowerCase();
  if (/\.(png|jpg|jpeg|webp|gif|bmp|svg)$/.test(lower)) return 'image';
  if (/\.(zip|rar|7z|tar|gz)$/.test(lower)) return 'archive';
  return 'text';
}

export function normalizeNativeFile(file) {
  return {
    name: file.name,
    path: file.path,
    type: fileKind(file.name),
    size: typeof file.size === 'number' ? formatFileSize(file.size) : file.size || '未知大小',
    time: '刚刚'
  };
}

export function normalizeDroppedFile(file, bridge) {
  const filePath = bridge.getPathForFile?.(file) || file.path || '';
  return {
    name: file.name,
    path: filePath,
    type: fileKind(file.name),
    size: formatFileSize(file.size),
    time: '刚刚'
  };
}

export function cleanUiError(error = '') {
  const text = String(error).replace(/\s+/g, ' ').trim();
  if (!text) return '没有识别结果';
  if (text.includes('�') || text.includes('AggregateException') || text.includes('Wait')) {
    return 'Windows OCR 识别失败。换一张更清晰的图片，或转成 PNG 后再试。';
  }
  return text;
}

export function loadStoredFiles() {
  try {
    const stored = JSON.parse(localStorage.getItem('windowsill.files') || '[]');
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((file) => file?.name && file?.path)
      .map((file) => ({
        name: String(file.name),
        path: String(file.path),
        type: file.type || fileKind(file.name),
        size: file.size || '未知大小',
        time: file.time || '上次暂存'
      }));
  } catch {
    return [];
  }
}
