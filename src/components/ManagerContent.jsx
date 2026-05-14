import { motion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import {
  ArrowUpRight,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  FileArchive,
  FolderOpen,
  FolderPlus,
  Globe2,
  HardDrive,
  Info,
  Keyboard,
  KeyRound,
  Link2,
  ListTodo,
  MessageSquareText,
  Mic,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wrench,
  X,
  Zap
} from 'lucide-react';
import { quickActions } from '../app/constants.jsx';
import { bridge } from '../lib/bridge.js';
import { FileIcon } from './FileIcon.jsx';

function ShortcutList({ items, compact, onRemove, onRename, onOpen }) {
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setEditingName(item.name);
  };

  const handleConfirmEdit = () => {
    if (editingName.trim()) {
      onRename(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  return (
    <div className={compact ? 'shortcut-list compact-list' : 'shortcut-list'}>
      {items.length === 0 && <div className="empty-files">暂无目录</div>}
      {items.map((item) => (
        <div className="shortcut-item" key={item.id}>
          <button className="shortcut-main" type="button" onClick={() => onOpen(item)}>
            <span className="shortcut-icon"><FolderOpen size={17} /></span>
            <span>
              {editingId === item.id ? (
                <>
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmEdit();
                      if (e.key === 'Escape') handleCancelEdit();
                    }}
                    onBlur={handleConfirmEdit}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      fontSize: 'inherit',
                      fontWeight: 'bold',
                      border: '1px solid currentColor',
                      background: 'transparent',
                      padding: '2px 4px',
                      margin: 0,
                      minWidth: '100px',
                      display: 'block'
                    }}
                  />
                  <small>{item.path ? ` | ${item.path}` : ''}{item.visits ? ` · ${item.visits} 次` : ''}</small>
                </>
              ) : (
                <>
                  <strong>{item.name}</strong>
                  <small>{item.path ? ` | ${item.path}` : ''}{item.visits ? ` · ${item.visits} 次` : ''}</small>
                </>
              )}
            </span>
          </button>
          <button
            className="tiny-button"
            type="button"
            title="改名"
            onClick={() => handleStartEdit(item)}
          >
            <Pencil size={13} />
          </button>
          <button className="tiny-button" type="button" title="移除" onClick={() => onRemove(item.id)}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function FileList({ files, onDragStart, onRemove }) {
  const openFile = (file) => {
    if (file.path) bridge.openPath?.(file.path);
  };

  return (
    <div className="file-list manager-file-list">
      {files.length === 0 && <div className="empty-files">暂无文件</div>}
      {files.map((file, index) => (
        <div
          className="file-item"
          key={`${file.name}-${index}`}
          data-draggable={Boolean(file.path)}
        >
          <div
            className="file-drag-zone"
            role="button"
            tabIndex={file.path ? 0 : -1}
            title={file.path || file.name}
            draggable={Boolean(file.path)}
            onDragStart={(event) => onDragStart(event, file)}
            onClick={() => openFile(file)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openFile(file);
              }
            }}
          >
            <span className={`file-icon ${file.type}`}>
              <FileIcon type={file.type} />
            </span>
            <span className="file-main">
              <strong>{file.name}</strong>
              <small>{file.size} · {file.time}</small>
            </span>
          </div>
          <button
            className="tiny-button"
            type="button"
            title="打开所在位置"
            onClick={() => file.path && bridge.showInFolder?.(file.path)}
          >
            <ArrowUpRight size={14} />
          </button>
          <button className="tiny-button" type="button" title="移除" onClick={() => onRemove(index)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function LinkList({ items, onRemove, onRename, onOpen }) {
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');

  const confirmEdit = () => {
    if (editingName.trim()) onRename(editingId, editingName.trim());
    setEditingId(null);
    setEditingName('');
  };

  return (
    <div className="shortcut-list">
      {items.length === 0 && <div className="empty-files">暂无链接</div>}
      {items.map((item) => (
        <div className="shortcut-item" key={item.id}>
          <button className="shortcut-main" type="button" onClick={() => onOpen(item)}>
            <span className="shortcut-icon"><Link2 size={17} /></span>
            <span>
              {editingId === item.id ? (
                <>
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') confirmEdit();
                      if (event.key === 'Escape') setEditingId(null);
                    }}
                    onBlur={confirmEdit}
                    onClick={(event) => event.stopPropagation()}
                    className="inline-edit-input"
                  />
                  <small>{item.url}{item.visits ? ` · ${item.visits} 次` : ''}</small>
                </>
              ) : (
                <>
                  <strong>{item.name}</strong>
                  <small>{item.url}{item.visits ? ` · ${item.visits} 次` : ''}</small>
                </>
              )}
            </span>
          </button>
          <button
            className="tiny-button"
            type="button"
            title="改名"
            onClick={() => {
              setEditingId(item.id);
              setEditingName(item.name);
            }}
          >
            <Pencil size={13} />
          </button>
          <button className="tiny-button" type="button" title="移除" onClick={() => onRemove(item.id)}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

const todoPriorityMeta = {
  fast: { label: '火速', className: 'fast' },
  normal: { label: '一般', className: 'normal' },
  leisure: { label: '悠闲', className: 'leisure' }
};

function formatTime(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function TodoForm({ initialTodo, onSubmit, onCancel }) {
  const [title, setTitle] = useState(initialTodo?.title || '');
  const [content, setContent] = useState(initialTodo?.content || '');
  const [priority, setPriority] = useState(initialTodo?.priority || 'normal');

  const submit = () => {
    if (!title.trim()) return;
    onSubmit({ title, content, priority });
  };

  return (
    <div className="todo-form">
      <input
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.ctrlKey) submit();
        }}
        placeholder="待办名称"
      />
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="待办内容"
      />
      <div className="todo-form-footer">
        <div className="priority-picker">
          {Object.entries(todoPriorityMeta).map(([value, meta]) => (
            <button
              className={`priority-chip ${meta.className} ${priority === value ? 'active' : ''}`}
              type="button"
              key={value}
              onClick={() => setPriority(value)}
            >
              <i />
              <span>{meta.label}</span>
            </button>
          ))}
        </div>
        <div className="todo-form-actions">
          <button className="mini-command" type="button" onClick={onCancel}>
            <X size={15} />
            <span>取消</span>
          </button>
          <button className="mini-command primary-command" type="button" onClick={submit}>
            <Check size={15} />
            <span>保存</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function TodoWorkbench({ todos, onCreateTodo, onUpdateTodo, onRemoveTodo }) {
  const [editingMode, setEditingMode] = useState(false);
  const [formMode, setFormMode] = useState(null);
  const [editingTodo, setEditingTodo] = useState(null);

  const closeForm = () => {
    setFormMode(null);
    setEditingTodo(null);
  };

  return (
    <section className="manager-card todo-workbench">
      <div className="card-head">
        <div className="section-title"><ListTodo size={18} /><span>待办</span></div>
        <div className="head-actions">
          <button
            className="mini-command"
            type="button"
            onClick={() => {
              setFormMode('create');
              setEditingTodo(null);
            }}
          >
            <Plus size={15} />
            <span>创建待办</span>
          </button>
          <button className="mini-command" type="button" onClick={() => setEditingMode((current) => !current)}>
            {editingMode ? <Check size={15} /> : <Pencil size={15} />}
            <span>{editingMode ? '确定' : '编辑待办'}</span>
          </button>
        </div>
      </div>

      {formMode && (
        <TodoForm
          initialTodo={editingTodo}
          onCancel={closeForm}
          onSubmit={(todo) => {
            if (formMode === 'edit' && editingTodo) onUpdateTodo(editingTodo.id, todo);
            else onCreateTodo(todo);
            closeForm();
          }}
        />
      )}

      <div className="todo-list">
        {todos.length === 0 && <div className="empty-files">暂无待办</div>}
        {todos.map((todo) => {
          const meta = todoPriorityMeta[todo.priority] || todoPriorityMeta.normal;
          return (
            <article className="todo-item" key={todo.id}>
              <span className={`priority-dot ${meta.className}`} />
              <div className="todo-main">
                <div className="todo-title-row">
                  <strong>{todo.title}</strong>
                  <span>{meta.label}</span>
                </div>
                {todo.content && <p>{todo.content}</p>}
                <small>
                  创建 {formatTime(todo.createdAt)}
                  {todo.updatedAt ? ` · 修改 ${formatTime(todo.updatedAt)}` : ''}
                </small>
              </div>
              {editingMode && (
                <div className="todo-actions">
                  <button className="tiny-button" type="button" title="修改" onClick={() => {
                    setEditingTodo(todo);
                    setFormMode('edit');
                  }}>
                    <Pencil size={13} />
                  </button>
                  <button className="tiny-button" type="button" title="删除" onClick={() => onRemoveTodo(todo.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MessageList({
  messages,
  thinking,
  input,
  setInput,
  onSend,
  copiedMessageId,
  onCopyMessage
}) {
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, thinking]);

  return (
    <>
      <div className="messages">
        {messages.map((message, index) => {
          const messageId = message.id || `${message.role}-${index}`;
          return (
            <motion.div
              className={`bubble ${message.role} ${message.error ? 'error' : ''} ${message.streaming ? 'streaming' : ''}`}
              key={messageId}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {message.role === 'assistant' && <Bot size={15} />}
              <span>{message.text || (message.streaming ? '正在输入...' : '')}</span>
              {message.attachments?.length > 0 && (
                <div className="bubble-attachments">
                  {message.attachments.map((attachment) => (
                    <div
                      className="attachment-card"
                      data-draggable={Boolean(attachment.path)}
                      key={attachment.id || attachment.path || attachment.text}
                    >
                      <div
                        className="attachment-drag-zone"
                        role={attachment.path ? 'button' : undefined}
                        tabIndex={attachment.path ? 0 : undefined}
                        draggable={Boolean(attachment.path)}
                        title={attachment.path || attachment.previewText || attachment.text || attachment.name}
                        onDragStart={(event) => {
                          if (!attachment.path) return;
                          event.stopPropagation();
                          if (event.dataTransfer) {
                            event.dataTransfer.effectAllowed = 'copy';
                          }
                          event.preventDefault();
                          const result = bridge.startFileDrag?.(attachment.path);
                          if (result?.ok === false) {
                            console.warn('Windowsill attachment drag failed:', result.error || attachment.path);
                          }
                        }}
                        onClick={() => attachment.path && bridge.openPath?.(attachment.path)}
                        onKeyDown={(event) => {
                          if (!attachment.path) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            bridge.openPath?.(attachment.path);
                          }
                        }}
                      >
                        {attachment.type === 'image' && attachment.preview ? (
                          <img src={attachment.preview} alt="" />
                        ) : (
                          <span className={`file-icon ${attachment.kind || attachment.type}`}>
                            <FileIcon type={attachment.kind || attachment.type} />
                          </span>
                        )}
                        <div>
                          <strong>{attachment.name || (attachment.type === 'text' ? '剪贴板文字' : '文件')}</strong>
                          <small>{attachment.previewText || attachment.path || attachment.text}</small>
                        </div>
                      </div>
                      {attachment.type === 'text' ? (
                        <button
                          className="tiny-button"
                          type="button"
                          title="复制"
                          onClick={() => navigator.clipboard?.writeText(attachment.text || '')}
                        >
                          <Copy size={13} />
                        </button>
                      ) : (
                        <button
                          className="tiny-button"
                          type="button"
                          title="打开"
                          onClick={() => attachment.path && bridge.openPath?.(attachment.path)}
                        >
                          <ArrowUpRight size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {message.role === 'assistant' && (
                <button
                  className="bubble-copy"
                  type="button"
                  title="复制回复"
                  disabled={!message.text}
                  onClick={() => onCopyMessage({ ...message, id: messageId })}
                >
                  {copiedMessageId === messageId ? <Check size={13} /> : <Copy size={13} />}
                </button>
              )}
            </motion.div>
          );
        })}
        {thinking && !messages.some((message) => message.streaming) && (
          <motion.div className="bubble assistant thinking" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <Bot size={15} />
            <span>正在想...</span>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="composer">
        <button className="icon-button" type="button" title="语音">
          <Mic size={17} />
        </button>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSend();
          }}
          placeholder="问我、输入命令，或拖文件进来"
        />
        <button className="send-button" type="button" onClick={onSend} title="发送">
          <Send size={17} />
        </button>
      </div>
    </>
  );
}

function ClipboardHistory({ items, onRestore, onStageImage }) {
  return (
    <div className="clipboard-list inline">
      {items.length === 0 && <div className="empty-files">暂无记录</div>}
      {items.map((item) => (
        <div className="clipboard-item" key={item.id}>
          {item.type === 'image' ? <img src={item.preview} alt="" /> : <p>{item.preview}</p>}
          <div className="clipboard-actions">
            <button className="tiny-text-button" type="button" onClick={() => onRestore(item)}>
              复制
            </button>
            {item.type === 'image' && (
              <button className="tiny-text-button" type="button" onClick={() => onStageImage(item)}>
                暂存
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function splitDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { hours, minutes, seconds };
}

function TimeSegment({ label, value, onStep, locked }) {
  return (
    <span className={`time-segment ${locked ? 'locked' : ''}`}>
      <button type="button" disabled={locked} onClick={() => onStep(1)} title="增加">
        <ChevronUp size={13} />
      </button>
      <strong
        onWheel={(event) => {
          if (locked) return;
          event.preventDefault();
          onStep(event.deltaY < 0 ? 1 : -1);
        }}
      >
        {String(value).padStart(2, '0')}
      </strong>
      <button type="button" disabled={locked} onClick={() => onStep(-1)} title="减少">
        <ChevronDown size={13} />
      </button>
      <small>{label}</small>
    </span>
  );
}

function FocusToolPage({
  durationMs,
  setDurationMs,
  endsAt,
  pausedRemaining,
  remaining,
  onStart,
  onTogglePause,
  onCancel
}) {
  const running = Boolean(endsAt);
  const paused = !running && pausedRemaining > 0;
  const locked = running;
  const displayMs = running || paused ? remaining : durationMs;
  const { hours, minutes, seconds } = splitDuration(displayMs);
  const progress = running || paused ? Math.max(0, Math.min(1, displayMs / Math.max(1, durationMs))) : 1;
  const circumference = 678.58;
  const dashOffset = circumference * (1 - progress);
  const adjustDuration = (deltaMs) => setDurationMs(durationMs + deltaMs);

  return (
    <div className="focus-page">
      <div className={`focus-orb ${running ? 'running' : ''} ${paused ? 'paused' : ''}`}>
        <svg className="focus-ring" viewBox="0 0 240 240" aria-hidden="true">
          <defs>
            <linearGradient id="focus-ring-gradient" x1="25%" y1="0%" x2="80%" y2="100%">
              <stop offset="0%" stopColor="#8fe4ff" />
              <stop offset="52%" stopColor="#32c8bd" />
              <stop offset="100%" stopColor="#f5c76b" />
            </linearGradient>
          </defs>
          <circle className="focus-ring-track" cx="120" cy="120" r="108" />
          <motion.circle
            className="focus-ring-progress"
            cx="120"
            cy="120"
            r="108"
            stroke="url(#focus-ring-gradient)"
            strokeDasharray={circumference}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <div className="focus-time-picker">
          <TimeSegment label="时" value={hours} locked={locked} onStep={(step) => adjustDuration(step * 3600000)} />
          <i>:</i>
          <TimeSegment label="分" value={minutes} locked={locked} onStep={(step) => adjustDuration(step * 60000)} />
          <i>:</i>
          <TimeSegment label="秒" value={seconds} locked={locked} onStep={(step) => adjustDuration(step * 1000)} />
        </div>
      </div>

      <div className="focus-controls">
        <button className="focus-action primary" type="button" onClick={onStart}>
          <Play size={16} />
          <span>启动</span>
        </button>
        <button
          className="focus-action"
          type="button"
          disabled={!running && !paused}
          onClick={onTogglePause}
        >
          {running ? <Pause size={16} /> : <Play size={16} />}
          <span>{running ? '暂停' : '继续'}</span>
        </button>
        <button className="focus-action" type="button" onClick={onCancel}>
          <RotateCcw size={16} />
          <span>重置</span>
        </button>
      </div>
    </div>
  );
}

function ToolWorkbench({
  onHandleAction,
  onSelectSection,
  visibleToolIds,
  setVisibleToolIds,
  clipboardItems,
  onRestoreClipboard,
  onStageClipboardImage,
  focusDurationMs,
  setFocusDurationMs,
  focusEndsAt,
  focusPausedRemaining,
  focusRemaining,
  onStartFocus,
  onToggleFocusPause,
  onCancelFocus
}) {
  const [toolPage, setToolPage] = useState('grid');
  const [removingTools, setRemovingTools] = useState(false);
  const selectedTool = quickActions.find((item) => item.action === toolPage);
  const visibleTools = quickActions.filter((item) => visibleToolIds.includes(item.action));
  const removedTools = quickActions.filter((item) => !visibleToolIds.includes(item.action));

  const removeTool = (action) => {
    setVisibleToolIds((current) => current.filter((id) => id !== action));
  };

  const restoreTool = (action) => {
    setVisibleToolIds((current) => {
      if (current.includes(action)) return current;
      return [...current, action];
    });
  };

  if (toolPage === 'more') {
    return (
      <section className="manager-card tool-workbench">
        <div className="card-head">
          <div className="section-title"><Plus size={18} /><span>更多工具</span></div>
          <button className="mini-command" type="button" onClick={() => setToolPage('grid')}>
            <X size={15} />
            <span>返回</span>
          </button>
        </div>
        {removedTools.length === 0 ? (
          <div className="empty-files tool-empty">暂无更多工具</div>
        ) : (
          <div className="tool-grid">
            {removedTools.map((action) => (
              <div
                className="tool-card more-tool-card"
                role="button"
                tabIndex={0}
                key={action.label}
                onClick={() => restoreTool(action.action)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  restoreTool(action.action);
                }}
              >
                <button
                  className="tool-add-button"
                  type="button"
                  title="加回工具箱"
                  onClick={(event) => {
                    event.stopPropagation();
                    restoreTool(action.action);
                  }}
                >
                  <Plus size={15} />
                </button>
                <action.icon size={20} />
                <span>{action.label}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  if (selectedTool && selectedTool.action === 'translate') {
    return (
      <section className="manager-card tool-workbench">
        <div className="card-head">
          <div className="section-title"><selectedTool.icon size={18} /><span>{selectedTool.label}</span></div>
          <button className="mini-command" type="button" onClick={() => setToolPage('grid')}>
            <X size={15} />
            <span>返回</span>
          </button>
        </div>
        <div className="tool-detail">
          <span className="tool-detail-icon"><selectedTool.icon size={28} /></span>
          <strong>{selectedTool.label}</strong>
          <button className="mini-command primary-command" type="button" onClick={() => onHandleAction(selectedTool.action)}>
            <Zap size={15} />
            <span>{selectedTool.action === 'translate' ? '去对话' : selectedTool.action === 'ocr' ? '选择文件' : selectedTool.action === 'downloads' ? '打开目录' : '开始'}</span>
          </button>
          {selectedTool.action === 'translate' && (
            <button className="tiny-text-button" type="button" onClick={() => onSelectSection('chat')}>
              AI 对话
            </button>
          )}
        </div>
      </section>
    );
  }

  if (selectedTool && selectedTool.action === 'clipboard') {
    return (
      <section className="manager-card tool-workbench">
        <div className="card-head">
          <div className="section-title"><Clipboard size={18} /><span>剪贴板</span></div>
          <button className="mini-command" type="button" onClick={() => setToolPage('grid')}>
            <X size={15} />
            <span>返回</span>
          </button>
        </div>
        <ClipboardHistory items={clipboardItems} onRestore={onRestoreClipboard} onStageImage={onStageClipboardImage} />
      </section>
    );
  }

  if (selectedTool && selectedTool.action === 'focus') {
    return (
      <section className="manager-card tool-workbench">
        <div className="card-head">
          <div className="section-title"><selectedTool.icon size={18} /><span>专注</span></div>
          <button className="mini-command" type="button" onClick={() => setToolPage('grid')}>
            <X size={15} />
            <span>返回</span>
          </button>
        </div>
        <FocusToolPage
          durationMs={focusDurationMs}
          setDurationMs={setFocusDurationMs}
          endsAt={focusEndsAt}
          pausedRemaining={focusPausedRemaining}
          remaining={focusRemaining}
          onStart={onStartFocus}
          onTogglePause={onToggleFocusPause}
          onCancel={onCancelFocus}
        />
      </section>
    );
  }

  return (
    <section className="manager-card tool-workbench">
      <div className="card-head">
        <div className="section-title"><Wrench size={18} /><span>小工具箱</span></div>
        <button
          className="mini-command"
          type="button"
          onClick={() => setRemovingTools((current) => !current)}
        >
          {removingTools ? <Check size={15} /> : <Trash2 size={15} />}
          <span>{removingTools ? '确定' : '移除工具'}</span>
        </button>
      </div>
      <div className={`tool-grid ${removingTools ? 'is-removing' : ''}`}>
        {visibleTools.map((action) => (
          <div
            className="tool-card"
            role="button"
            tabIndex={0}
            key={action.label}
            onClick={() => {
              if (removingTools) return;
              if (action.direct) onHandleAction(action.action);
              else if (action.action === 'clipboard') {
                onHandleAction(action.action);
                setToolPage(action.action);
              } else setToolPage(action.action);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              if (removingTools) return;
              if (action.direct) onHandleAction(action.action);
              else if (action.action === 'clipboard') {
                onHandleAction(action.action);
                setToolPage(action.action);
              } else setToolPage(action.action);
            }}
          >
            {removingTools && (
              <button
                className="tool-remove-button"
                type="button"
                title="移除"
                onClick={(event) => {
                  event.stopPropagation();
                  removeTool(action.action);
                }}
              >
                <Trash2 size={14} />
              </button>
            )}
            <action.icon size={20} />
            <span>{action.label}</span>
          </div>
        ))}
        <button className="tool-card more-tool-card" type="button" onClick={() => setToolPage('more')}>
          <Plus size={22} />
          <span>更多</span>
        </button>
      </div>
    </section>
  );
}

function SettingToggle({ icon: Icon, title, detail, checked, onChange }) {
  return (
    <div className="setting-row">
      <span className="setting-icon"><Icon size={18} /></span>
      <span><strong>{title}</strong><small>{detail}</small></span>
      <button
        className={`switch ${checked ? 'on' : ''}`}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

function SettingInput({ icon: Icon, title, detail, value, placeholder, type = 'text', onCommit }) {
  const [draft, setDraft] = useState(value ?? '');

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  const commit = () => {
    const next = type === 'number' ? Number(draft) : String(draft).trim();
    onCommit(next);
  };

  return (
    <div className="setting-row editable-setting-row">
      <span className="setting-icon"><Icon size={18} /></span>
      <span><strong>{title}</strong><small>{detail}</small></span>
      <input
        className="setting-input"
        type={type}
        value={draft}
        placeholder={placeholder}
        step={type === 'number' ? '0.1' : undefined}
        min={type === 'number' ? '0' : undefined}
        max={type === 'number' ? '2' : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </div>
  );
}

function SettingsWorkbench({
  appSettings,
  files,
  onUpdateAppSetting,
  onOpenDataDir,
  onResetWindowPosition,
  onResetToolLayout,
  onClearStagedFiles
}) {
  const ai = appSettings.ai || {};

  return (
    <div className="content-stack">
      <section className="manager-card settings-grid">
        <div className="card-head">
          <div className="section-title"><Zap size={18} /><span>行为设置</span></div>
        </div>
        <SettingToggle
          icon={Zap}
          title="开机自启"
          detail="登录 Windows 后自动启动 Windowsill"
          checked={Boolean(appSettings.launchAtLogin)}
          onChange={(value) => onUpdateAppSetting('launchAtLogin', value)}
        />
        <SettingToggle
          icon={HardDrive}
          title="始终置顶"
          detail="浮岛保持在普通窗口上方"
          checked={Boolean(appSettings.alwaysOnTop)}
          onChange={(value) => onUpdateAppSetting('alwaysOnTop', value)}
        />
        <SettingToggle
          icon={FileArchive}
          title="失焦自动收起"
          detail="点击其他窗口后自动回到浮岛"
          checked={Boolean(appSettings.autoCollapseOnBlur)}
          onChange={(value) => onUpdateAppSetting('autoCollapseOnBlur', value)}
        />
        <SettingInput
          icon={Keyboard}
          title="呼出快捷键"
          detail="修改后立即重新注册全局快捷键"
          value={appSettings.hotkey || 'Alt+Space'}
          placeholder="Alt+Space"
          onCommit={(value) => onUpdateAppSetting('hotkey', value || 'Alt+Space')}
        />
      </section>

      <section className="manager-card settings-grid">
        <div className="card-head">
          <div className="section-title"><SlidersHorizontal size={18} /><span>AI 设置</span></div>
        </div>
        <SettingInput
          icon={Bot}
          title="供应商"
          detail="例如 DeepSeek、OpenAI 或兼容服务名称"
          value={ai.provider || ''}
          placeholder="DeepSeek"
          onCommit={(value) => onUpdateAppSetting('ai', { provider: value })}
        />
        <SettingInput
          icon={Globe2}
          title="Base URL"
          detail="OpenAI 兼容接口地址"
          value={ai.baseUrl || ''}
          placeholder="https://api.deepseek.com/v1"
          onCommit={(value) => onUpdateAppSetting('ai', { baseUrl: value })}
        />
        <SettingInput
          icon={Bot}
          title="模型"
          detail="聊天模型名称"
          value={ai.model || ''}
          placeholder="deepseek-chat"
          onCommit={(value) => onUpdateAppSetting('ai', { model: value })}
        />
        <SettingInput
          icon={KeyRound}
          title="API Key"
          detail="保存在本机用户数据目录"
          value={ai.apiKey || ''}
          placeholder="sk-..."
          onCommit={(value) => onUpdateAppSetting('ai', { apiKey: value })}
        />
        <SettingInput
          icon={SlidersHorizontal}
          title="温度"
          detail="0 到 2，越高越发散"
          type="number"
          value={ai.temperature ?? 0.6}
          placeholder="0.6"
          onCommit={(value) => onUpdateAppSetting('ai', { temperature: value })}
        />
      </section>

      <section className="manager-card settings-grid">
        <div className="card-head">
          <div className="section-title"><HardDrive size={18} /><span>数据与布局</span></div>
        </div>
        <div className="setting-row">
          <span className="setting-icon"><FolderOpen size={18} /></span>
          <span><strong>本地数据目录</strong><small>{appSettings.userData || 'Windowsill 数据目录'}</small></span>
          <button className="mini-command" type="button" onClick={onOpenDataDir}>
            <FolderOpen size={15} />
            <span>打开</span>
          </button>
        </div>
        <div className="setting-row">
          <span className="setting-icon"><RotateCcw size={18} /></span>
          <span><strong>窗口位置</strong><small>把浮岛移回主屏幕默认位置</small></span>
          <button className="mini-command" type="button" onClick={onResetWindowPosition}>
            <RotateCcw size={15} />
            <span>重置</span>
          </button>
        </div>
        <div className="setting-row">
          <span className="setting-icon"><Wrench size={18} /></span>
          <span><strong>工具箱布局</strong><small>恢复所有默认工具</small></span>
          <button className="mini-command" type="button" onClick={onResetToolLayout}>
            <RotateCcw size={15} />
            <span>恢复</span>
          </button>
        </div>
        <div className="setting-row">
          <span className="setting-icon"><Trash2 size={18} /></span>
          <span><strong>暂存区</strong><small>当前 {files.length} 个文件，只清空列表，不删除源文件</small></span>
          <button className="mini-command danger-command" type="button" onClick={onClearStagedFiles}>
            <Trash2 size={15} />
            <span>清空</span>
          </button>
        </div>
      </section>

      <section className="manager-card settings-grid">
        <div className="card-head">
          <div className="section-title"><Info size={18} /><span>关于我们</span></div>
        </div>
        <div className="setting-row">
          <span className="setting-icon"><Sparkles size={18} /></span>
          <span><strong>Windowsill</strong><small>Windows 桌面智能浮岛助手</small></span>
          <span className="soft-tag">v0.1.0</span>
        </div>
        <div className="setting-row">
          <span className="setting-icon"><Globe2 size={18} /></span>
          <span><strong>开源仓库</strong><small>github.com/mornhussakuyo-hub/Windowsill</small></span>
          <button className="mini-command" type="button" onClick={() => bridge.openUrl?.('https://github.com/mornhussakuyo-hub/Windowsill')}>
            <ArrowUpRight size={15} />
            <span>打开</span>
          </button>
        </div>
        <div className="setting-row">
          <span className="setting-icon"><Info size={18} /></span>
          <span><strong>许可证</strong><small>MIT License</small></span>
          <span className="soft-tag">Open Source</span>
        </div>
      </section>
    </div>
  );
}

export function ManagerContent({
  activeSection,
  files,
  messages,
  thinking,
  input,
  setInput,
  shortcutPathInput,
  setShortcutPathInput,
  shortcutNameInput,
  setShortcutNameInput,
  allShortcuts,
  linkUrlInput,
  setLinkUrlInput,
  linkNameInput,
  setLinkNameInput,
  allLinks,
  todos,
  focusDurationMs,
  setFocusDurationMs,
  focusEndsAt,
  focusPausedRemaining,
  focusRemaining,
  clipboardItems,
  visibleToolIds,
  setVisibleToolIds,
  appSettings,
  copiedMessageId,
  onSendMessage,
  onCopyMessage,
  onChooseFiles,
  onFileDragStart,
  onRemoveFile,
  onAddShortcut,
  onRemoveShortcut,
  onRenameShortcut,
  onOpenShortcut,
  onAddLink,
  onRemoveLink,
  onRenameLink,
  onOpenLink,
  onCreateTodo,
  onUpdateTodo,
  onRemoveTodo,
  onStartFocus,
  onToggleFocusPause,
  onCancelFocus,
  onHandleAction,
  onRestoreClipboard,
  onStageClipboardImage,
  onSelectSection,
  onUpdateAppSetting,
  onOpenDataDir,
  onResetWindowPosition,
  onResetToolLayout,
  onClearStagedFiles
}) {
  if (activeSection === 'chat') {
    return (
      <section className="manager-card chat-workbench">
        <div className="card-head">
          <div className="section-title"><MessageSquareText size={18} /><span>AI 对话</span></div>
          <span className="soft-tag">{files.length} 个文件上下文</span>
        </div>
        <MessageList
          messages={messages}
          thinking={thinking}
          input={input}
          setInput={setInput}
          onSend={onSendMessage}
          copiedMessageId={copiedMessageId}
          onCopyMessage={onCopyMessage}
        />
      </section>
    );
  }

  if (activeSection === 'files') {
    return (
      <section className="manager-card file-workbench">
        <div className="card-head">
          <div className="section-title"><FileArchive size={18} /><span>文件暂存区</span></div>
          <button className="mini-command" type="button" onClick={onChooseFiles}>
            <FolderPlus size={15} />
            <span>添加文件</span>
          </button>
        </div>
      
        <FileList files={files} onDragStart={onFileDragStart} onRemove={onRemoveFile} />
      </section>
    );
  }

  if (activeSection === 'todos') {
    return (
      <TodoWorkbench
        todos={todos}
        onCreateTodo={onCreateTodo}
        onUpdateTodo={onUpdateTodo}
        onRemoveTodo={onRemoveTodo}
      />
    );
  }

  if (activeSection === 'dirs') {
    return (
      <section className="manager-card directory-workbench">
        <div className="card-head">
          <div className="section-title"><FolderOpen size={18} /><span>快捷目录跳转</span></div>
        </div>
        <div className="path-adder">
          <input
            value={shortcutNameInput}
            onChange={(event) => setShortcutNameInput(event.target.value)}
            placeholder="快捷目录名称"
          />
          <input
            value={shortcutPathInput}
            onChange={(event) => setShortcutPathInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onAddShortcut();
            }}
            placeholder="D:\\Projects\\Windowsill"
          />
          <button className="send-button" type="button" onClick={onAddShortcut} title="添加">
            <Plus size={17} />
          </button>
        </div>
        <ShortcutList
          items={allShortcuts}
          onRemove={onRemoveShortcut}
          onRename={onRenameShortcut}
          onOpen={onOpenShortcut}
        />
      </section>
    );
  }

  if (activeSection === 'links') {
    return (
      <section className="manager-card directory-workbench">
        <div className="card-head">
          <div className="section-title"><Link2 size={18} /><span>快捷链接</span></div>
        </div>
        <div className="path-adder">
          <input
            value={linkNameInput}
            onChange={(event) => setLinkNameInput(event.target.value)}
            placeholder="链接名称"
          />
          <input
            value={linkUrlInput}
            onChange={(event) => setLinkUrlInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onAddLink();
            }}
            placeholder="https://example.com"
          />
          <button className="send-button" type="button" onClick={onAddLink} title="添加">
            <Plus size={17} />
          </button>
        </div>
        <LinkList
          items={allLinks}
          onRemove={onRemoveLink}
          onRename={onRenameLink}
          onOpen={onOpenLink}
        />
      </section>
    );
  }

  if (activeSection === 'tools') {
    return (
      <div className="content-stack">
        <ToolWorkbench
          onHandleAction={onHandleAction}
          onSelectSection={onSelectSection}
          visibleToolIds={visibleToolIds}
          setVisibleToolIds={setVisibleToolIds}
          clipboardItems={clipboardItems}
          onRestoreClipboard={onRestoreClipboard}
          onStageClipboardImage={onStageClipboardImage}
          focusDurationMs={focusDurationMs}
          setFocusDurationMs={setFocusDurationMs}
          focusEndsAt={focusEndsAt}
          focusPausedRemaining={focusPausedRemaining}
          focusRemaining={focusRemaining}
          onStartFocus={onStartFocus}
          onToggleFocusPause={onToggleFocusPause}
          onCancelFocus={onCancelFocus}
        />
      </div>
    );
  }

  if (activeSection === 'settings') {
    return (
      <SettingsWorkbench
        appSettings={appSettings}
        files={files}
        onUpdateAppSetting={onUpdateAppSetting}
        onOpenDataDir={onOpenDataDir}
        onResetWindowPosition={onResetWindowPosition}
        onResetToolLayout={onResetToolLayout}
        onClearStagedFiles={onClearStagedFiles}
      />
    );
  }

  return (
    <div className="content-stack">
      <section className="manager-hero">
        <div>
          <span className="eyebrow">Windowsill</span>
          <h2>桌面工作入口</h2>
        </div>
        <div className="hero-meter">
          <Sparkles size={24} />
          <strong>{files.length}</strong>
          <span>暂存文件</span>
        </div>
      </section>
      <div className="home-grid">
        <section className="manager-card">
          <div className="card-head">
            <div className="section-title"><FolderOpen size={18} /><span>常用目录</span></div>
            <button className="mini-command" type="button" onClick={() => onSelectSection('dirs')}>
              <Plus size={15} />
              <span>管理</span>
            </button>
          </div>
          <ShortcutList
            items={allShortcuts.slice(0, 4)}
            compact
            onRemove={onRemoveShortcut}
            onRename={onRenameShortcut}
            onOpen={onOpenShortcut}
          />
        </section>
        <section className="manager-card">
          <div className="card-head">
            <div className="section-title"><Zap size={18} /><span>常用功能</span></div>
          </div>
          <div className="tool-grid small">
            {quickActions.slice(0, 4).map((action) => (
              <button className="tool-card" type="button" key={action.label} onClick={() => onHandleAction(action.action)}>
                <action.icon size={19} />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
      <section className="manager-card update-card">
        <div className="section-title"><Sparkles size={18} /><span>更新</span></div>
        <p>暂无更新</p>
      </section>
    </div>
  );
}
