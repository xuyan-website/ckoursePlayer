# ckoursePlayer

> 你的本地课程播放器 — 进度真正能记住。

ckoursePlayer 是一款开源桌面应用，专为观看和整理已经下载到本地的课程而设计。没有订阅，没有云端依赖，也没有繁琐配置——只有你自己的文件，被优雅地组织起来，并配上完整的观看进度追踪。它不打扰你，不绑架你的数据，只是安静地帮你把散落的课程变成一座真正可用的私人学习库。

---

## 解决的问题

你从网上下载了一门课程，结果得到一个装着 80 个视频的文件夹：命名混乱，目录层层嵌套，PDF 讲义和字幕文件散落各处。你看了几节课，合上笔记本；三天后回来，却完全想不起上次看到哪里。

普通媒体播放器看不懂“第 4 章 - 第 12 课”这样的课程结构，文件管理器也不会帮你记录观看进度。它们各管各的，却没有任何东西把课程、文件和进度真正串联起来。

**ckoursePlayer** 可以。 它把混乱的文件整理成清晰的课程，把每一次观看都记录下来，让你无论隔了多久回来，都能从上次停下的地方继续。

---

## 功能特性

### ✅ v1 — 核心
- 📁 **智能文件夹导入** — 将 ckoursePlayer 指向任意课程文件夹，它会自动解析结构，检测章节、课时、字幕和其他文件资源
- ▶️ **内置视频播放器** — 原生 HTML5 播放器，支持字幕、时间戳导航，长按倍速播放
- 📊 **进度追踪** — 逐课时完成状态、逐课程进度条、从你停止的精确位置恢复播放
- 📝 **带时间戳的笔记** — 添加绑定到特定时间戳的笔记，并即时跳转回该时间点，甚至跨课时
- 🔖 **书签** — 为课时添加书签，从专属页面快速访问，截图记录让笔记不局限于文字表述、导出笔记便于备份和查看
- 🗂️ **课程库** — 清晰的仪表盘展示所有已导入课程，进度一目了然
- 🎉 **完成庆祝** — 完成课程时的 Canvas 粒子动画
- 🔄 **自动更新** — 应用会检查新版本并提供就地更新
- 📄 **语言丰富** — 提供中文简体和英文两种语言


---

## 技术栈

| 层级 | 技术 |
|---|---|
| 桌面框架 | [Tauri 2](https://tauri.app/) |
| 前端 | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| 路由 | [React Router 7](https://reactrouter.com/) |
| 样式 | [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/) |
| 图标 | [Phosphor Icons](https://phosphoricons.com/) |
| 图表 | [Recharts](https://recharts.org/) |
| 分析 | [PostHog](https://posthog.com/)（可选，通过环境变量配置） |
| 后端 | [Rust](https://www.rust-lang.org/) |
| 数据库 | SQLite via [rusqlite](https://github.com/rusqlite/rusqlite)（内嵌） |
| 云存储 | [Google Drive API](https://developers.google.com/drive)（可选，自带凭据） |
| 凭据存储 | OS 钥匙串 via [keyring](https://github.com/hwchen/keyring-rs) |
| 构建工具 | [Vite](https://vite.dev/) |

---

## 下载

macOS 和 Windows 的预构建安装包可在 [Releases 页面](https://github.com/xuyan-website/ckoursePlayer/releases) 获取。

---

## 从源码构建

### 前置条件

- [Rust](https://rustup.rs/)（最新稳定版）
- [Node.js](https://nodejs.org/)（v20+）
- Tauri 平台工具链 — 参见 [Tauri 前置条件](https://tauri.app/start/prerequisites/)

### 开发

```bash
# 克隆仓库
git clone https://gitee.com/xuyan-website/ckoursePlayer.git
cd ckoursePlayer

# 安装前端依赖
npm install

# 以开发模式运行（macOS / Windows / Linux）
npm run tauri dev

# 构建生产版本（生成当前操作系统的安装包）
npm run tauri:build
```

#### 平台特定的构建目标

**macOS** — 构建通用二进制文件（Apple Silicon + Intel）：

```bash
rustup target add x86_64-apple-darwin  # 一次性设置
npm run tauri build -- --target universal-apple-darwin
```

输出：`.dmg` 和 `.app` 位于 `src-tauri/target/universal-apple-darwin/release/bundle/`。

**Windows** — 构建 MSI 和 NSIS 安装包：

```powershell
npm run tauri:build
```

输出：`.msi` 和 `.exe` 位于 `src-tauri\target\release\bundle\`。

**Linux** — 构建 `.deb` / `.AppImage`：

```bash
npm run tauri build
```

输出：`.deb` 和 `.AppImage` 位于 `src-tauri/target/release/bundle/`。

### 环境变量（可选）

PostHog 分析默认禁用，除非你在项目根目录的 `.env` 文件中设置以下变量。不设置则以分析关闭状态运行应用。

```bash
VITE_PUBLIC_POSTHOG_PROJECT_TOKEN=your_token
VITE_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

---

## Google Drive 设置

Drive 支持是**自带凭据模式**：你创建一个个人 Google Cloud 项目，将其凭据粘贴到 ckoursePlayer 的设置中。应用不附带任何凭据，也不向 ckoursePlayer 服务器发送任何内容 — 凭据存储在你的 OS 钥匙串中，应用直接与 Google 通信。

这是有意为之。读取课程文件夹需要受限的 `drive.readonly` 范围，这对于共享的已发布应用需要年度第三方安全评估。使用你自己的项目 — 保持在"测试"模式 — 可以完全规避这一点，并使你的文件保留在你自己的账号下。

应用内置交互式引导（**设置 → Google Drive → 设置指南**），直接链接到每个控制台页面。简短版本：

1. [创建 Google Cloud 项目](https://console.cloud.google.com/projectcreate)。
2. 启用 [Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com) 和 [Picker API](https://console.cloud.google.com/apis/library/picker.googleapis.com)。
3. 配置 OAuth 同意屏幕，并将你自己的 Google 账号添加为测试用户。
4. 创建 **OAuth 客户端 ID**（应用类型：*Web application*）。
5. 创建 **API 密钥** — 这用于驱动文件夹选择器。
6. 将客户端 ID、客户端密钥和 API 密钥粘贴到 ckoursePlayer 的设置中，然后点击连接。

OAuth 通过随机端口上的一次性 `http://127.0.0.1` 监听器完成，因此无需提前注册重定向 URI。

---

## 项目结构

```
ckoursePlayer/
├── src/                      # React 前端
│   ├── components/
│   │   ├── app-shell/        # 布局、侧边栏、导航
│   │   ├── course-detail/    # 视频播放器、笔记、章节
│   │   ├── dashboard/        # 课程卡片、统计、空状态
│   │   ├── ui/               # 共享 UI 基础组件
│   │   ├── DriveSetupGuide.tsx  # 交互式 Google Cloud 引导
│   │   ├── ErrorBoundary.tsx
│   │   └── UpdateBanner.tsx
│   ├── pages/                # 路由页面（Dashboard、CourseDetail、Notes、
│   │                         #   Bookmarks、Progress、ImportCourse、Settings）
│   ├── hooks/                # 自定义 React hooks
│   ├── lib/                  # Store、工具函数、常量
│   ├── assets/               # Lottie 动画、图标
│   └── types/                # TypeScript 类型定义
├── src-tauri/                # Rust 后端
│   ├── src/
│   │   ├── main.rs           # Tauri 入口点
│   │   ├── lib.rs            # Tauri 应用设置
│   │   ├── db.rs             # SQLite schema 和查询
│   │   ├── parser.rs         # 课程文件夹解析器（本地 + Drive）
│   │   ├── subtitle.rs       # 字幕文件处理
│   │   ├── google.rs         # Google OAuth、Drive API、token 刷新
│   │   ├── drive_protocol.rs # drive:// 处理器 — 流式播放 Drive 媒体
│   │   ├── video_protocol.rs # video:// 处理器 — 流式播放本地媒体
│   │   └── commands/         # courses.rs, lessons.rs, notes.rs,
│   │                         #   settings.rs, drive.rs
│   └── tauri.conf.json       # Tauri 配置
└── public/                   # 静态资源
```

---


---

## 许可证

MIT — 可自由使用、修改和分发。

---

## 链接

- 🐛 Issues: [gitee.com/xuyan-website/ckoursePlayer/issues](https://gitee.com/xuyan-website/ckoursePlayer/issues)
- 📦 Releases: [github.com/xuyan-website/ckoursePlayer/releases](https://github.com/xuyan-website/ckoursePlayer/releases)
