const fs = require('fs');
const path = require('path');
const { nativeImage } = require('electron');

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

function decodeTextBuffer(buffer) {
  if (!buffer || buffer.length === 0) return '';
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.slice(2).toString('utf16le');
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) return buffer.slice(2).swap16().toString('utf16le');
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return buffer.slice(3).toString('utf8');

  const sample = buffer.subarray(0, Math.min(buffer.length, 2000));
  let zeroOdd = 0;
  let zeroEven = 0;
  for (let index = 0; index < sample.length; index += 1) {
    if (sample[index] !== 0) continue;
    if (index % 2 === 0) zeroEven += 1;
    else zeroOdd += 1;
  }
  if (zeroOdd > sample.length * 0.18 || zeroEven > sample.length * 0.18) return buffer.toString('utf16le');
  return buffer.toString('utf8');
}

function normalizeForSearch(text = '') {
  return String(text).toLowerCase().replace(/\s+/g, '');
}

function displaySnippet(text = '', index = 0, tokenLength = 0) {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + Math.max(tokenLength, 1) + 180);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
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
  return files.slice(0, 80).map((file) => {
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

function matchIdentifier(value, identifier) {
  const target = normalizeForSearch(identifier);
  if (!target) return false;
  const name = normalizeForSearch(value.name);
  const base = normalizeForSearch(path.basename(value.name || '', path.extname(value.name || '')));
  const filePath = normalizeForSearch(value.path);
  return name === target || base === target || filePath === target ||
    name.includes(target) || filePath.includes(target) || target.includes(name) || target.includes(base);
}

function findRuntimeFile(files, identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return null;
  const index = Number(raw);
  if (Number.isInteger(index) && index >= 1 && index <= files.length) return files[index - 1];
  return files.find((file) => matchIdentifier(file, raw)) || null;
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
    if (image && !image.isEmpty()) attachment.preview = image.resize({ width: 180 }).toDataURL();
  }

  return attachment;
}

module.exports = {
  compactFileForTool,
  displaySnippet,
  extractLinks,
  fileKind,
  findRuntimeFile,
  getReadableStagedFiles,
  isImagePath,
  makeFileAttachment,
  normalizeForSearch
};
