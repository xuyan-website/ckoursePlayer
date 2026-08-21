import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import ffprobePkg from "ffprobe-static";

// ffmpeg-static uses `module.exports = path`; ffprobe-static uses `exports.path`.
const ffprobeStatic = ffprobePkg.path;

const binariesDir = join(process.cwd(), "src-tauri", "binaries");
mkdirSync(binariesDir, { recursive: true });

const targets = {
  win32: {
    ffmpeg: "ffmpeg-x86_64-pc-windows-msvc.exe",
    ffprobe: "ffprobe-x86_64-pc-windows-msvc.exe",
  },
  darwin: {
    ffmpeg: "ffmpeg-universal-apple-darwin",
    ffprobe: "ffprobe-universal-apple-darwin",
  },
  linux: {
    ffmpeg: "ffmpeg",
    ffprobe: "ffprobe",
  },
};

const names = targets[process.platform];
if (!names) {
  console.error(`sync-binaries: unsupported platform ${process.platform}`);
  process.exit(1);
}

function sync(src, destName) {
  if (!src || !existsSync(src)) {
    console.error(`sync-binaries: source not found: ${src}`);
    process.exit(1);
  }
  const dest = join(binariesDir, destName);
  copyFileSync(src, dest);
  const mb = (statSync(dest).size / 1e6).toFixed(1);
  console.log(`sync-binaries: ${destName} (${mb} MB)`);
}

sync(ffmpegStatic, names.ffmpeg);
sync(ffprobeStatic, names.ffprobe);
