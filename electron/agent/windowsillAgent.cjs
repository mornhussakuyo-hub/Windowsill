const {
  compactFileForTool,
  displaySnippet,
  extractLinks,
  findRuntimeFile,
  getReadableStagedFiles,
  makeFileAttachment,
  normalizeForSearch
} = require('../features/localFileTools.cjs');

const agentTools = [
  {
    type: 'function',
    function: {
      name: 'list_staged_files',
      description: '列出用户暂存区里的文件。先用它确认文件名、路径、类型和是否可读取。',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
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
      parameters: { type: 'object', properties: {}, additionalProperties: false }
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
          query: { type: 'string' },
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
  },
  {
    type: 'function',
    function: {
      name: 'ocr_clipboard_image',
      description: '对当前剪贴板图片或剪贴板历史图片调用 Windows OCR。用户说识别剪贴板、OCR 剪贴板、读取剪贴板图片文字时必须调用它。',
      parameters: {
        type: 'object',
        properties: {
          identifier: { type: 'string', description: '可选。latest/current/当前/最近、图片、或 clipboard item id。默认 latest。' }
        },
        additionalProperties: false
      }
    }
  }
];

function buildAgentMessages(messages, files, ocrResults) {
  return [
    {
      role: 'system',
      content:
        '你是 Windowsill，一个能操作本机上下文的 Windows 桌面 agent。不要凭记忆猜暂存文件或剪贴板内容；遇到文件、剪贴板、链接、图片、OCR、发送附件等请求，必须先调用工具。用户要 OCR/识别剪贴板图片时，调用 ocr_clipboard_image；用户要 OCR/识别暂存区图片时，调用 ocr_staged_image。用户要“发送/给我/拿出来”时，除了读取内容，还要调用 attach_staged_files 或 attach_clipboard_items。回答简短、直接，说明你实际调用工具得到的结果。'
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
        ocrResults
      })
    },
    ...messages.map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: String(message.text || '')
    }))
  ];
}

function parseToolArgs(toolCall) {
  try {
    return JSON.parse(toolCall?.function?.arguments || '{}');
  } catch {
    return {};
  }
}

function toAssistantToolMessage(toolStep, toolCalls) {
  const message = {
    role: 'assistant',
    content: toolStep.content || '',
    tool_calls: toolCalls
  };

  if (typeof toolStep.reasoning_content === 'string') {
    message.reasoning_content = toolStep.reasoning_content;
  }

  return message;
}

function finalInstructionMessage() {
  return {
    role: 'system',
    content:
      '工具阶段已经结束。现在只能输出给用户看的最终自然语言回答。严禁输出、模拟或提及任何工具调用标记，包括 tool_calls、invoke、DSML、XML、JSON tool call、<｜｜DSML｜｜...>。如果工具已经附加了附件，只需要说已附上或简短说明内容。'
  };
}

function isToolProtocolLine(line) {
  return /(?:DSML|tool_calls|<\/?\s*invoke|invoke\s+name=|attach_clipboard_items|attach_staged_files)/i.test(line);
}

function sanitizeFinalText(text = '') {
  return String(text)
    .split(/\r?\n/)
    .filter((line) => !isToolProtocolLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function asIdentifierArray(value) {
  return Array.isArray(value) ? value : [value];
}

function createRuntime(files, onAttachment) {
  return {
    files: getReadableStagedFiles(files),
    attachments: [],
    onAttachment
  };
}

function addRuntimeAttachment(runtime, attachment) {
  if (!attachment) return;
  if (runtime.attachments.some((item) => item.id === attachment.id)) return;
  runtime.attachments.push(attachment);
  runtime.onAttachment?.(attachment);
}

async function executeTool(toolCall, runtime, dependencies) {
  const name = toolCall?.function?.name;
  const args = parseToolArgs(toolCall);
  const { clipboardRepository, runWindowsOcr } = dependencies;

  if (name === 'list_staged_files') {
    return { files: runtime.files.map(compactFileForTool) };
  }

  if (name === 'read_staged_file') {
    const file = findRuntimeFile(runtime.files, args.identifier);
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
        const direct = lower ? haystack.toLowerCase().indexOf(lower) : -1;
        const compact = compactQuery ? normalizeForSearch(haystack).indexOf(compactQuery) : -1;
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
    const targets = args.identifier ? [findRuntimeFile(runtime.files, args.identifier)].filter(Boolean) : runtime.files;
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

  if (name === 'get_current_clipboard') return clipboardRepository.currentPayload();

  if (name === 'search_clipboard_history') {
    return { items: clipboardRepository.search(args.query || '', args.maxResults || 8) };
  }

  if (name === 'attach_staged_files') {
    const attached = [];
    for (const identifier of asIdentifierArray(args.identifiers)) {
      const file = findRuntimeFile(runtime.files, identifier);
      if (!file) continue;
      const attachment = makeFileAttachment(file, file.path);
      addRuntimeAttachment(runtime, attachment);
      attached.push({ name: attachment.name, path: attachment.path, type: attachment.type });
    }
    return { ok: attached.length > 0, attached };
  }

  if (name === 'attach_clipboard_items') {
    const rawIds = asIdentifierArray(args.identifiers);
    const ids = rawIds.some((id) => String(id).toLowerCase() === 'all')
      ? clipboardRepository.history.map((item) => item.id)
      : rawIds;
    const attached = [];
    for (const identifier of ids) {
      const attachment = clipboardRepository.makeAttachment(clipboardRepository.findItem(identifier));
      if (!attachment) continue;
      addRuntimeAttachment(runtime, attachment);
      attached.push({ name: attachment.name, type: attachment.type, path: attachment.path, previewText: attachment.previewText });
    }
    return { ok: attached.length > 0, attached };
  }

  if (name === 'ocr_staged_image') {
    const file = findRuntimeFile(runtime.files, args.identifier);
    if (!file || !file.path) return { ok: false, error: '没有找到这个暂存图片。' };
    return { file: compactFileForTool(file, runtime.files.indexOf(file)), ...(await runWindowsOcr(file.path)) };
  }

  if (name === 'ocr_clipboard_image') {
    const identifier = args.identifier || 'latest';
    let item = clipboardRepository.findItem(identifier);
    if (!item || item.type !== 'image') {
      const current = clipboardRepository.currentPayload();
      if (current.type === 'image') item = clipboardRepository.findItem(current.itemId || 'latest');
    }
    if (!item || item.type !== 'image' || !item.path) {
      return { ok: false, error: '当前剪贴板里没有可 OCR 的图片。' };
    }
    return {
      clipboardItem: {
        id: item.id,
        type: item.type,
        path: item.path,
        createdAt: item.createdAt
      },
      ...(await runWindowsOcr(item.path))
    };
  }

  return { ok: false, error: `未知工具：${name}` };
}

async function readResponseText(response) {
  const text = await response.text();
  return text.replace(/\s+/g, ' ').trim().slice(0, 600);
}

async function requestToolStep(config, messages) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      messages,
      tools: agentTools,
      tool_choice: 'auto'
    })
  });

  if (!response.ok) throw new Error(`AI tool step failed: ${response.status} ${await readResponseText(response)}`);
  const data = await response.json();
  return data?.choices?.[0]?.message || {};
}

async function requestFinalStream(config, messages, onDelta) {
  const finalMessages = [...messages, finalInstructionMessage()];
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.4,
      stream: true,
      messages: finalMessages
    })
  });

  if (!response.ok) throw new Error(`AI final stream failed: ${response.status} ${await readResponseText(response)}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let displayBuffer = '';

  function consumePacket(packet) {
    for (const line of packet.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        return;
      }
      for (const choice of parsed?.choices || []) {
        const content = choice?.delta?.content;
        if (typeof content === 'string' && content.length > 0) {
          fullText += content;
          displayBuffer += content;
          const lines = displayBuffer.split(/\r?\n/);
          displayBuffer = lines.pop() || '';
          for (const line of lines) {
            if (!isToolProtocolLine(line)) onDelta?.(`${line}\n`);
          }
        }
      }
    }
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const packets = buffer.split(/\n\n/);
    buffer = packets.pop() || '';
    for (const packet of packets) {
      consumePacket(packet);
    }
  }

  if (buffer.trim()) consumePacket(buffer);
  if (displayBuffer && !isToolProtocolLine(displayBuffer)) onDelta?.(displayBuffer);

  const sanitized = sanitizeFinalText(fullText);
  if (!sanitized) throw new Error('AI final stream completed without content');
  return sanitized;
}

async function runWindowsillAgent({ config, messages, files, ocrResults = [], onDelta, onAttachment, dependencies }) {
  const runtime = createRuntime(files, onAttachment);
  const agentMessages = buildAgentMessages(messages, files, ocrResults);

  for (let round = 0; round < 5; round += 1) {
    const toolStep = await requestToolStep(config, agentMessages);
    const toolCalls = Array.isArray(toolStep.tool_calls) ? toolStep.tool_calls : [];
    if (toolCalls.length === 0) break;

    agentMessages.push(toAssistantToolMessage(toolStep, toolCalls));
    for (const toolCall of toolCalls.slice(0, 12)) {
      const result = await executeTool(toolCall, runtime, dependencies);
      agentMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.function?.name,
        content: JSON.stringify(result)
      });
    }
  }

  const text = await requestFinalStream(config, agentMessages, onDelta);
  return { text, attachments: runtime.attachments };
}

module.exports = { runWindowsillAgent };
