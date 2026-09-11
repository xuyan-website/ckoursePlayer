# 发布与自动更新

桌面应用使用 [`tauri-plugin-updater`](https://v2.tauri.app/plugin/updater/) 从 GitHub Releases 拉取新版本。

## 一次性设置

### 1. 生成签名密钥对

Tauri 对每个更新进行签名，以便已安装的应用可以验证它。你只需为项目做这**一次**。

```bash
npm run tauri signer generate -- -w ~/.tauri/ckoursePlayer.key
```

你会被提示输入密码。这将创建：

- `~/.tauri/ckoursePlayer.key` — **私钥**（保密，切勿提交）
- `~/.tauri/ckoursePlayer.key.pub` — **公钥**

### 2. 将公钥接入应用

复制 `~/.tauri/ckoursePlayer.key.pub` 的内容，粘贴到 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey` 中，替换 `REPLACE_WITH_PUBLIC_KEY_FROM_TAURI_SIGNER_GENERATE` 占位符。

提交该更改。

### 3. 添加 GitHub Actions 密钥

向仓库添加两个密钥（Settings → Secrets and variables → Actions）：

- `TAURI_SIGNING_PRIVATE_KEY` — `~/.tauri/ckoursePlayer.key` 的内容
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — 你选择的密码

## 发布新版本

1. 在 `package.json` 和 `src-tauri/tauri.conf.json` 中更新版本号（如果单独管理版本，也更新 `src-tauri/Cargo.toml`）。
可以运行scripts/sync-version.mjs同步更新软件版本号,用法:
- node scripts/sync-version.mjs x.y.z — 设置新版本号，同步写入三个文件
- node scripts/sync-version.mjs — 以 package.json 当前版本号为准，同步到另外两个文件
```bash
   node scripts/sync-version.mjs x.y.z
```
```bash
   node scripts/sync-version.mjs
```
    
    
2. 提交、打 tag、推送：
   ```bash
   git commit -am "release vX.Y.Z"
   git tag vX.Y.Z
   git push && git push --tags
   ```
3. `Build & Release` 工作流构建 macOS + Windows，签名更新产物，并起草 GitHub Release，包含：
   - 平台安装包（`.dmg`、`.msi`、`.exe`）
   - `latest.json`（应用轮询的更新清单）
   - `.sig` 签名文件
4. 在 GitHub 上审查草稿 release，然后**发布**它。发布后 `https://github.com/xuyan-website/ckoursePlayer/releases/latest/download/latest.json` 将可解析，这是应用检查的端点。

## 客户端如何更新

- 启动时，应用静默轮询该端点（启动后 1.5 秒）。
- 如果发现新版本，会出现 toast 提示，设置中的**更新**部分会显示 `Install vX.Y.Z` 按钮。
- 点击后下载 + 验证签名 + 安装 + 重启应用。

## 手动检查

用户可以随时点击设置中的**检查更新**按钮。

## 故障排除

- **安装时出现"signature error"**：`tauri.conf.json` 中的公钥与签名用的私钥不匹配。重新生成，或重新粘贴公钥。
- **发布后未检测到更新**：确保 release 已**发布**（非草稿），且 `latest.json` 中的 `version` 大于已安装应用的版本（semver 比较）。
- **缺少 `createUpdaterArtifacts: true`**：没有它，`tauri-action` 不会生成 `latest.json`。
