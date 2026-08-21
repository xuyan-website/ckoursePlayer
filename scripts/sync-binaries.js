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

// Also place runtime-named copies in target/debug so the running dev app finds
// the real binaries. Tauri's externalBin copy to target/debug is unreliable in
// dev mode, so we do it ourselves.
const runtimeNames = {
  win32: { ffmpeg: "ffmpeg.exe", ffprobe: "ffprobe.exe" },
  darwin: { ffmpeg: "ffmpeg", ffprobe: "ffprobe" },
  linux: { ffmpeg: "ffmpeg", ffprobe: "ffprobe" },
};
const rn = runtimeNames[process.platform];
const targetDebug = join(process.cwd(), "src-tauri", "target", "debug");
mkdirSync(targetDebug, { recursive: true });
for (const [bin, src] of [["ffmpeg", ffmpegStatic], ["ffprobe", ffprobeStatic]]) {
  const dest = join(targetDebug, rn[bin]);
  try {
    copyFileSync(src, dest);
    console.log(`sync-binaries: target/debug/${rn[bin]}`);
  } catch (e) {
    console.warn(`sync-binaries: could not update target/debug/${rn[bin]} (${e.code})`);
  }
}
