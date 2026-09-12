import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { resolve, join } from "path";

const root = resolve(import.meta.dirname, "..");
const conf = JSON.parse(
  readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf-8"),
);
const { version } = conf;

const endpoint = conf.plugins?.updater?.endpoints?.[0];
if (!endpoint) {
  console.error("tauri.conf.json 中未配置 updater endpoint");
  process.exit(1);
}
const match = endpoint.match(/github\.com\/([^/]+)\/([^/]+)\/releases/);
if (!match) {
  console.error(`无法从 endpoint 解析 GitHub owner/repo: ${endpoint}`);
  process.exit(1);
}
const [, owner, repo] = match;
const tag = `v${version}`;
const releaseUrl = (filename) =>
  `https://github.com/${owner}/${repo}/releases/download/${tag}/${filename}`;

const bundleDir = resolve(root, "src-tauri/target/release/bundle");
if (!existsSync(bundleDir)) {
  console.error(`bundle 目录不存在: ${bundleDir}`);
  console.error("请先运行 npm run tauri:build");
  process.exit(1);
}

const platforms = {};

const nsisDir = join(bundleDir, "nsis");
if (existsSync(nsisDir)) {
  const exe = readdirSync(nsisDir).find((f) => f.endsWith("-setup.exe"));
  if (exe) {
    const sigPath = join(nsisDir, `${exe}.sig`);
    if (!existsSync(sigPath)) {
      console.error(`未找到签名文件: ${sigPath}`);
      process.exit(1);
    }
    platforms["windows-x86_64"] = {
      signature: readFileSync(sigPath, "utf-8").trim(),
      url: releaseUrl(exe),
    };
  }
}

const macosDir = join(bundleDir, "macos");
if (existsSync(macosDir)) {
  for (const tar of readdirSync(macosDir).filter((f) =>
    f.endsWith(".app.tar.gz"),
  )) {
    const sigPath = join(macosDir, `${tar}.sig`);
    if (!existsSync(sigPath)) {
      console.error(`未找到签名文件: ${sigPath}`);
      process.exit(1);
    }
    const entry = {
      signature: readFileSync(sigPath, "utf-8").trim(),
      url: releaseUrl(tar),
    };
    if (tar.includes("_universal.")) {
      platforms["darwin-aarch64"] = entry;
      platforms["darwin-x86_64"] = { ...entry };
    } else if (tar.includes("_aarch64.")) {
      platforms["darwin-aarch64"] = entry;
    } else if (tar.includes("_x64.")) {
      platforms["darwin-x86_64"] = entry;
    }
  }
}

if (Object.keys(platforms).length === 0) {
  console.error("未找到任何 updater 产物（NSIS setup.exe 或 macOS .app.tar.gz）");
  process.exit(1);
}

const manifest = {
  version,
  pub_date: new Date().toISOString(),
  platforms,
};

const outPath = join(bundleDir, "latest.json");
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`已生成 ${outPath}`);
for (const [target, info] of Object.entries(platforms)) {
  console.log(`  ${target.padEnd(16)} ${info.url}`);
}
