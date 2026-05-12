import {
  Aperture,
  Bot,
  Calculator,
  Clipboard,
  FileArchive,
  FileText,
  FolderOpen,
  House,
  Languages,
  Link2,
  ListTodo,
  NotebookPen,
  Settings,
  TimerReset,
  Wrench
} from 'lucide-react';

export const shellTransitions = {
  dot: {
    width: { duration: 0.28, ease: [0.4, 0, 0.2, 1] },
    height: { duration: 0.28, ease: [0.4, 0, 0.2, 1] },
    opacity: { duration: 0.16 },
    scale: { duration: 0.28, ease: [0.4, 0, 0.2, 1] },
    borderRadius: { duration: 0.18 }
  },
  reveal: {
    opacity: { duration: 0.16 },
    scale: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
    width: { duration: 0.34, delay: 0.14, ease: [0.22, 1, 0.36, 1] },
    height: { duration: 0.34, delay: 0.14, ease: [0.22, 1, 0.36, 1] },
    borderRadius: { duration: 0.24, delay: 0.14, ease: [0.22, 1, 0.36, 1] }
  },
  expanded: {
    width: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
    height: { duration: 0.24, delay: 0.18, ease: [0.22, 1, 0.36, 1] },
    borderRadius: { duration: 0.18, delay: 0.2, ease: [0.22, 1, 0.36, 1] }
  },
  collapsed: {
    height: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
    borderRadius: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
    width: { duration: 0.22, delay: 0.18, ease: [0.22, 1, 0.36, 1] }
  },
  drop: {
    width: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
    height: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
    borderRadius: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
    opacity: { duration: 0.12 },
    scale: { duration: 0.16, ease: [0.22, 1, 0.36, 1] }
  },
  hidden: {
    width: { duration: 0.12, ease: [0.4, 0, 0.2, 1] },
    height: { duration: 0.12, ease: [0.4, 0, 0.2, 1] },
    opacity: { duration: 0.2, delay: 0.06 },
    scale: { duration: 0.16, ease: [0.4, 0, 0.2, 1] },
    borderRadius: { duration: 0.12 }
  }
};

export const quickActions = [
  { icon: Aperture, label: '截图', action: 'screenshot', direct: true },
  { icon: Calculator, label: '计算器', action: 'calculator', direct: true },
  { icon: NotebookPen, label: '记事本', action: 'notepad', direct: true },
  { icon: Languages, label: '翻译', action: 'translate', page: 'translate' },
  { icon: FileText, label: 'OCR', action: 'ocr', direct: true },
  { icon: Clipboard, label: '剪贴板', action: 'clipboard', page: 'clipboard' },
  { icon: TimerReset, label: '专注', action: 'focus', page: 'focus' }
];

export const panelSize = { width: 820, height: 580 };

export const navItems = [
  { id: 'home', label: '首页', icon: House },
  { id: 'chat', label: 'AI 对话', icon: Bot },
  { id: 'todos', label: '待办', icon: ListTodo },
  { id: 'files', label: '暂存区', icon: FileArchive },
  { id: 'dirs', label: '快捷目录', icon: FolderOpen },
  { id: 'links', label: '快捷链接', icon: Link2 },
  { id: 'tools', label: '工具箱', icon: Wrench },
  { id: 'settings', label: '设置', icon: Settings }
];
