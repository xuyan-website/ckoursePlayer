#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  pkg: resolve(ROOT, "package.json"),
  tauri: resolve(ROOT, "src-tauri", "tauri.conf.json"),
  cargo: resolve(ROOT, "src-tauri", "Cargo.toml"),
};
const SEMVER_RE = /^\d+\.\d+\.\d+([-+].+)?$/;

function readJSON(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeIfChanged(path, next) {
  const prev = readFileSync(path, "utf8");
  if (prev !== next) writeFileSync(path, next);
}

function detectEOL(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function setJSONVersion(path, version) {
  const raw = readFileSync(path, "utf8");
  const data = JSON.parse(raw);
  if (data.version === version) return;
  data.version = version;
  const eol = detectEOL(raw);
  const next = JSON.stringify(data, null, 2).replace(/\n/g, eol) + eol;
  writeIfChanged(path, next);
}

function setCargoVersion(path, version) {
  const text = readFileSync(path, "utf8");
  let found = null;
  text.replace(
    /(\[package\][\s\S]*?version\s*=\s*")([^"]*)(")/,
    (_m, _pre, old) => {
      found = old;
      return _m;
    },
  );
  if (found === null) {
    throw new Error(`未在 ${path} 的 [package] 段中找到 version 字段`);
  }
  if (found === version) return;
  const next = text.replace(
    /(\[package\][\s\S]*?version\s*=\s*")([^"]*)(")/,
    (_m, pre, _old, post) => pre + version + post,
  );
  writeIfChanged(path, next);
}

function setAll(version) {
  setJSONVersion(FILES.pkg, version);
  setJSONVersion(FILES.tauri, version);
  setCargoVersion(FILES.cargo, version);
}

const arg = process.argv[2];

if (arg === "--help" || arg === "-h") {
  console.log(`用法:
  node scripts/sync-version.mjs <version>   设置新版本号并同步到三个文件
  node scripts/sync-version.mjs             以 package.json 当前版本号同步其他文件

示例:
  node scripts/sync-version.mjs 1.2.0`);
  process.exit(0);
}

if (arg) {
  if (!SEMVER_RE.test(arg)) {
    console.error(`错误: '${arg}' 不是合法的 semver 版本号`);
    process.exit(1);
  }
  setAll(arg);
  console.log(`已同步更新版本号为 ${arg}（package.json / tauri.conf.json / Cargo.toml）`);
} else {
  const version = readJSON(FILES.pkg).version;
  setJSONVersion(FILES.tauri, version);
  setCargoVersion(FILES.cargo, version);
  console.log(`已以 package.json 为准，同步版本号 ${version} 到 tauri.conf.json / Cargo.toml`);
}
