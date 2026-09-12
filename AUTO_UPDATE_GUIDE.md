# 自动更新配置与操作指南

本文档详细说明 ckoursePlayer 桌面应用**自动更新功能**的配置方式和手动操作步骤。

---

## 一、机制概述

应用使用 [Tauri v2 Updater 插件](https://v2.tauri.app/plugin/updater/) 实现自动更新。更新流程：

```
应用启动 → 1.5s 后静默检查更新 → 请求 endpoint → 发现新版本 → 提示用户
→ 用户点击安装 → 下载安装包 + 验证签名 + 安装 → 重启应用
```

### 三层协作架构

| 层 | 文件 | 作用 |
|---|---|---|
| **Rust 端** | `src-tauri/src/lib.rs:18` | 注册 `tauri_plugin_updater` + `tauri_plugin_process` 插件 |
| **配置** | `src-tauri/tauri.conf.json` | endpoint URL、公钥、`createUpdaterArtifacts` |
| **前端** | `src/hooks/useUpdater.ts` | 调用 `check()` 检查、`downloadAndInstall()` 安装、`relaunch()` 重启 |

### 关键配置项（已配好，无需改动）

```jsonc
// src-tauri/tauri.conf.json
{
  "bundle": {
    "createUpdaterArtifacts": true          // 构建时生成 .sig 签名（latest.json 需 npm run tauri:updater 单独生成）
  },
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/xuyan-website/ckoursePlayer/releases/latest/download/latest.json"
      ],
      "pubkey": "dW50cnVzdGVk...（minisign 公钥，base64）"
    }
  }
}
```

- **endpoint**：GitHub Releases 的 `latest.json` 更新清单（`/releases/latest/download/` 会自动重定向到最新 Release）
- **pubkey**：用于验证安装包签名的公钥（必须与签名私钥配对）
- **createUpdaterArtifacts**：`true` 表示 `tauri build` 时生成更新产物

---

## 二、前置条件

| 条件 | 说明 |
|---|---|
| GitHub 仓库 | `https://github.com/xuyan-website/ckoursePlayer` |
| Tauri CLI | 已安装（`@tauri-apps/cli`） |
| Rust 工具链 | stable（`rustup default stable`） |
| Node.js | 22+ |
| 签名密钥对 | `.tauri/signing-key`（私钥）+ `.tauri/signing-key.pub`（公钥） |

---

## 三、一次性配置（首次设置）

> 以下配置大部分**已经完成**。如果你是首次克隆项目，按顺序检查每一步。

### 步骤 1：确认签名密钥对

自动更新要求安装包有签名，应用用公钥验证。密钥对**只需生成一次**。

**检查现有密钥：**

```bash
# 确认密钥文件存在
ls -la .tauri/signing-key .tauri/signing-key.pub
```

**如果不存在，生成新密钥对：**

```bash
npx tauri signer generate -w .tauri/signing-key --ci -f
```

- `.tauri/signing-key` — **私钥**（绝对保密，已 gitignore，切勿提交）
- `.tauri/signing-key.pub` — **公钥**

**验证公钥与配置匹配：**

```bash
# 公钥文件内容应与 tauri.conf.json 中的 pubkey 一致
cat .tauri/signing-key.pub
node -e "console.log(require('./src-tauri/tauri.conf.json').plugins.updater.pubkey)"
```

> 如果两者不一致，本地构建的安装包将无法通过已安装应用的签名验证。
> 解决：将 `.tauri/signing-key.pub` 的内容粘贴到 `tauri.conf.json` 的 `plugins.updater.pubkey`。

### 步骤 2：确认 updater 插件已安装

**Rust 依赖**（`src-tauri/Cargo.toml:24-25`）：

```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"    # 安装后重启应用
```

**前端依赖**（`package.json`）：

```bash
# 已在 dependencies 中，无需手动安装
# "@tauri-apps/plugin-updater": "^2.10.1"
# "@tauri-apps/plugin-process": "^2.3.1"
```

**Rust 插件注册**（`src-tauri/src/lib.rs:18-19`）：

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
.plugin(tauri_plugin_process::init())
```

**权限配置**（`src-tauri/capabilities/default.json:11-13`）：

```json
"updater:default",
"process:default",
"process:allow-restart"
```

> 以上四项均已配置完成。如果从零搭建新项目，用 `npx tauri add updater` 自动添加。

### 步骤 3：配置 GitHub Actions Secrets

在 GitHub 仓库页面：**Settings → Secrets and variables → Actions → New repository secret**

| Secret 名称 | 值 | 必需 |
|---|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | `.tauri/signing-key` 文件的**完整内容** | ✅ |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 生成密钥时设置的密码（`--ci` 模式为空字符串） | ✅ |
| `APPLE_CERTIFICATE` | Apple 开发者证书（base64） | 仅 macOS 公证 |
| `APPLE_CERTIFICATE_PASSWORD` | 证书导出密码 | 仅 macOS 公证 |
| `APPLE_SIGNING_IDENTITY` | 签名身份标识 | 仅 macOS 公证 |
| `APPLE_ID` | Apple ID 邮箱 | 仅 macOS 公证 |
| `APPLE_PASSWORD` | App 专用密码 | 仅 macOS 公证 |
| `APPLE_TEAM_ID` | Apple 团队 ID | 仅 macOS 公证 |
| `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` | PostHog 项目 Token | 可选 |
| `VITE_PUBLIC_POSTHOG_HOST` | PostHog 主机地址 | 可选 |

**获取私钥内容的方法：**

```bash
# 在终端输出私钥内容，复制粘贴到 GitHub Secret
cat .tauri/signing-key
```

> ⚠️ **安全警告**：私钥绝对不能提交到 Git 仓库。`.tauri/` 已在 `.gitignore` 中。

---

## 四、发布新版本（完整流程）

### 步骤 1：更新版本号

三种方式任选其一：

**方式 A — 使用 release 脚本（推荐）：**

```bash
bash scripts/release.sh x.y.z
```

脚本会自动：版本号写入 `package.json` + `tauri.conf.json` + `Cargo.toml` → commit → 打 tag `vx.y.z` → 推送到 Gitee（origin）

**方式 B — 使用版本同步工具：**

```bash
# 设置新版本号，同步写入三个文件
node scripts/sync-version.mjs x.y.z

# 然后手动提交
git add -A
git commit -m "release v1.2.0"
git tag v1.2.0
```

**方式 C — 手动修改：**

同时修改以下三处版本号为 `x.y.z`：
- `package.json` → `"version": "x.y.z"`
- `src-tauri/tauri.conf.json` → `"version": "x.y.z"`
- `src-tauri/Cargo.toml` → `version = "x.y.z"`

### 步骤 2：提交、打 tag、推送到 GitHub

```bash
git add -A
git commit -m "release v1.2.0"
git tag v1.2.0

# 推送到 GitHub（触发 CI 构建的前提）
git push github main
git push github v1.2.0
```

> `release.sh` 默认推送到 origin（Gitee）。**必须额外推送到 github remote** 才能让 GitHub Actions 使用最新代码。



## 五、本地构建与手动发布

适用场景：本地构建带签名安装包并手动上传到 GitHub Release，绕过 CI。适合快速测试或 CI 不可用时。

### 步骤 1：本地构建安装包

若签名密钥设有密码，先注入密码环境变量（无密码密钥可跳过）：

```bash
# PowerShell
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD="你的密码"
# Git Bash / WSL
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="你的密码"
```

执行构建：

```bash
npm run tauri:build
```

`scripts/build.mjs` 会读取 `.tauri/signing-key` 私钥，注入 `TAURI_SIGNING_PRIVATE_KEY`（及密码）环境变量后执行 `npx tauri build`，生成安装包 + `.sig` 签名到 `src-tauri/target/release/bundle/`。

> `tauri build` 只生成安装包和 `.sig` 签名文件，**不生成 `latest.json`**（`createUpdaterArtifacts: true` 仅控制 `.sig` 生成）。

**产物位置：**

| 平台 | 路径 |
|---|---|
| Windows NSIS | `bundle/nsis/ckoursePlayer_x.y.z_x64-setup.exe` + `.sig` |
| Windows MSI | `bundle/msi/ckoursePlayer_x.y.z_x64_en-US.msi` + `.sig` |
| macOS | `bundle/macos/ckoursePlayer_x.y.z_{universal\|aarch64\|x64}.app.tar.gz` + `.sig` |

### 步骤 2：生成更新清单 latest.json

```bash
npm run tauri:updater
```

`scripts/generate-updater-json.mjs` 读取已生成的 `.sig` 和版本号，输出 `bundle/latest.json`：

- Windows NSIS 产物存在 → 添加 `windows-x86_64` 条目
- macOS universal 产物存在 → 同时添加 `darwin-aarch64` + `darwin-x86_64`（指向同一产物）
- macOS 单架构产物 → 添加对应 `darwin-aarch64` 或 `darwin-x86_64`
- 缺失平台的产物自动跳过

> 单机只能扫描当前机器的 `bundle/` 目录，因此 Windows 上跑出来只含 `windows-x86_64`，macOS 上只含 `darwin-*`。要生成同时含两平台的 `latest.json`，需靠 CI 或手动合并两份产物。

### 步骤 3：在 GitHub 创建 Release

1. 打开 <https://github.com/xuyan-website/ckoursePlayer/releases/new>
2. **Choose a tag** → 输入 `vx.y.z`（与版本号一致）→ 选择 **Create new tag vx.y.z on publish**
3. **Release title** 填 `ckoursePlayer vx.y.z`
4. （可选）填写 Release notes

### 步骤 4：上传资产

将以下文件拖入 Release 页面的 assets 区域（位于 `src-tauri/target/release/bundle/` 下）：

| 文件 | 必需 | 说明 |
|---|---|---|
| `nsis/ckoursePlayer_x.y.z_x64-setup.exe` | ✅ | Windows 安装包 |
| `latest.json` | ✅ | 更新清单（含 signature 字段） |
| `msi/ckoursePlayer_x.y.z_x64_en-US.msi` | 可选 | Windows MSI 安装包 |
| `macos/*.app.tar.gz` | macOS 需 | macOS 更新包 |

> `.sig` 签名文件的内容已内嵌进 `latest.json` 的 `signature` 字段，无需单独上传。

### 步骤 5：发布 Release

点击页面底部绿色 **Publish release** 按钮。

> ⚠️ **必须发布，不能停留在草稿**。草稿 Release 的 `releases/latest/download/` 快捷方式不生效，应用无法检测到更新。

### 步骤 6：验证 endpoint 可访问

```bash
curl -sL https://github.com/xuyan-website/ckoursePlayer/releases/latest/download/latest.json
```

应返回包含 `version`、`platforms` 的 JSON。

> 本地构建的签名密钥必须与已发布版本使用的密钥一致，否则旧版本无法验证新包签名。**推荐用 CI 构建**保证密钥一致与跨平台覆盖。

---

## 六、验证自动更新功能

### 在应用内验证

1. 安装旧版本应用（如当前 1.1.1）
2. 发布新版本（如 x.y.z）并发布 GitHub Release
3. 启动旧版本应用 → 1.5 秒后自动检查更新
4. 顶部出现更新横幅：`Update available v1.2.0`
5. 点击 **Install** → 下载 + 安装 + 自动重启
6. 重启后版本变为 x.y.z

### 手动检查更新

打开应用 → **设置** → **更新** 区域 → 点击 **检查更新** 按钮

### 检查更新状态

设置页更新区域显示：
- 当前版本号
- 可用新版本号（如有）
- Release notes
- 下载进度（安装时）

---

## 七、latest.json 格式参考

CI 构建自动生成的 `latest.json` 格式：

```json
{
  "version": "x.y.z",
  "notes": "See the assets for download links.",
  "pub_date": "2026-09-11T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "dW50cnVzdGVk...（.sig 文件内容）",
      "url": "https://github.com/xuyan-website/ckoursePlayer/releases/download/v1.2.0/ckoursePlayer_1.2.0_x64-setup.exe"
    },
    "darwin-aarch64": {
      "signature": "dW50cnVzdGVk...",
      "url": "https://github.com/xuyan-website/ckoursePlayer/releases/download/v1.2.0/ckoursePlayer_1.2.0_universal.app.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "dW50cnVzdGVk...",
      "url": "https://github.com/xuyan-website/ckoursePlayer/releases/download/v1.2.0/ckoursePlayer_1.2.0_universal.app.tar.gz"
    }
  }
}
```

- `version`：新版本号（semver，应用会与本地版本比较）
- `platforms.{target}.url`：该平台安装包下载地址
- `platforms.{target}.signature`：对应 `.sig` 签名文件的**内容**（不是 URL）

---

## 八、故障排除

| 问题 | 原因 | 解决 |
|---|---|---|
| 安装时报 `signature error` | 公钥与签名私钥不配对 | 确认 `.tauri/signing-key.pub` 内容 = `tauri.conf.json` 的 `pubkey` |
| 发布后未检测到更新 | Release 仍是草稿 | 在 GitHub Releases 页面**发布**（取消 Draft） |
| 发布后未检测到更新 | `latest.json` 的 version ≤ 已安装版本 | 确认版本号递增（semver 比较） |
| CI 构建失败 | `TAURI_SIGNING_PRIVATE_KEY` Secret 未配置 | 在 GitHub Settings → Secrets 添加 |
| CI 构建失败 | 未推送到 GitHub remote | `git push github main && git push github v1.2.0` |
| macOS 安装包未签名 | 未配置 Apple 证书 Secrets | 配置 Apple 相关 Secrets，或在 `tauri.conf.json` 设 `signingIdentity: null`（不签名不公证） |
| `latest.json` 未生成 | `createUpdaterArtifacts` 未设为 `true` | 确认 `tauri.conf.json` 中 `bundle.createUpdaterArtifacts: true` |
| endpoint 404 | tag 名与 `latest.json` 中的不匹配 | 确认 GitHub Release 的 tag = `vX.Y.Z` 格式 |

---

## 九、配置文件速查

| 文件 | 关键配置 | 行号 |
|---|---|---|
| `src-tauri/tauri.conf.json` | `endpoints`、`pubkey`、`createUpdaterArtifacts` | 62-71 |
| `src-tauri/Cargo.toml` | `tauri-plugin-updater = "2"` | 24 |
| `src-tauri/src/lib.rs` | `.plugin(tauri_plugin_updater::Builder::new().build())` | 18 |
| `src-tauri/capabilities/default.json` | `"updater:default"` | 11 |
| `package.json` | `"@tauri-apps/plugin-updater": "^2.10.1"` | 28 |
| `.github/workflows/build.yml` | tauri-action 构建配置 | 47-67 |
| `scripts/build.mjs` | 本地构建签名脚本 | - |
| `scripts/release.sh` | 版本 bump + tag + push 脚本 | - |
| `.tauri/signing-key` | 签名私钥（gitignore） | - |
| `.tauri/signing-key.pub` | 签名公钥 | - |

---

## 十、快速发布清单（Cheatsheet）

```
# 1.提交软件更改
# 2.设置版本更新

bash scripts/release.sh x.y.z

3、手动打包

npm run tauri:build

4、生成latest.json文件

npm run tauri:updater

5、github网页创建Release并发布
```
