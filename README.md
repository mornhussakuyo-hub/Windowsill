# Windowsill

Windowsill 是一个为 Windows 桌面设计的智能浮岛助手。它平时以一个小型胶囊悬浮在桌面上，可以通过点击或 `Alt + Space` 展开为工作面板，用来聊天、暂存文件、处理剪贴板、OCR、截图、记录待办、管理快捷目录和快捷链接。

这个项目目前是桌面效率工具原型，重点是轻量、顺手、好看，以及尽量贴近 Windows 原生使用习惯。

## 功能

- **智能浮岛**：可展开、隐藏、拖动位置，并记住位置。
- **AI 对话**：支持 OpenAI 兼容接口，可配置 DeepSeek 等模型。
- **Agent 工具能力**：AI 可以读取暂存区文件、剪贴板内容，并调度本地 OCR。
- **文件暂存区**：拖入文件暂存，支持打开、定位、移除和原生拖出。
- **截图**：调用 Windows 系统截图能力，截图结果进入暂存区。
- **OCR**：使用 Windows 自带 `Windows.Media.Ocr`，不依赖模型 OCR。
- **剪贴板历史**：保存最近文本和图片剪贴板内容。
- **快捷目录**：添加、命名、排序和打开常用目录。
- **快捷链接**：添加网页链接，并用系统默认浏览器打开。
- **待办事项**：支持创建、编辑、删除，并按火速 / 一般 / 悠闲排序。
- **工具箱**：截图、计算器、记事本、翻译、OCR、剪贴板、专注计时等工具可自定义显示。
- **设置页**：支持开机自启、置顶、失焦自动收起、重置窗口位置、恢复工具箱布局等。

## 安装

从 GitHub Releases 下载 `Windowsill-Setup-0.1.0.exe`，运行安装即可。安装器支持选择安装位置、创建桌面快捷方式和安装后启动。

## 开发

```bash
npm install
npm run dev
```

构建 Windows 安装包：

```bash
npm run build
```

构建产物会输出到 `release/`。

## AI 配置

复制 `.env.example` 为 `.env`，然后填写 OpenAI 兼容接口配置：

```env
WINDOWSILL_AI_KEY=你的 key
WINDOWSILL_AI_MODEL=deepseek-chat
WINDOWSILL_AI_BASE_URL=https://api.deepseek.com/v1
```

修改 `.env` 后需要重启应用。

## 本地能力说明

- OCR 走 Windows 自带 OCR 引擎，本机处理。
- 截图走 Windows 系统截图入口。
- 计算器打开 `calc.exe`。
- 记事本打开 `notepad.exe`。
- 快捷链接使用系统默认浏览器打开。

## 项目结构

```text
electron/        Electron 主进程、preload、Agent 和本地功能
src/             React 前端界面
src/components/ 主要 UI 组件
src/styles/     拆分后的样式文件
build/          安装器说明和应用图标
```

## 许可证

MIT License. See [LICENSE](LICENSE).
