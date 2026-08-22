import { execSync } from "child_process";
import { resolve } from "path";
import { existsSync, statSync, readdirSync, rmSync } from "fs";

const targetDir = resolve("src-tauri/target");

if (!existsSync(targetDir)) {
  console.log("target directory does not exist, nothing to clean.");
  process.exit(0);
}

function dirSize(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of readdirSync(cur)) {
      const full = resolve(cur, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) stack.push(full);
      else total += stat.size;
    }
  }
  return total;
}

function fmt(mb) {
  return mb > 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

const before = dirSize(targetDir) / 1024 / 1024;
console.log(`Before: ${fmt(before)}`);

let freed = 0;

const cleanDirs = [
  "debug/incremental",
  "release/incremental",
];

for (const sub of cleanDirs) {
  const dir = resolve(targetDir, sub);
  if (existsSync(dir)) {
    const size = dirSize(dir);
    rmSync(dir, { recursive: true, force: true });
    freed += size;
    console.log(`  removed ${sub} (${fmt(size / 1024 / 1024)})`);
  }
}

function removePdbFiles(dir) {
  if (!existsSync(dir)) return 0;
  let removed = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of readdirSync(cur)) {
      const full = resolve(cur, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        stack.push(full);
      } else if (entry.endsWith(".pdb")) {
        removed += stat.size;
        rmSync(full, { force: true });
      }
    }
  }
  return removed;
}

const pdbFreed = removePdbFiles(targetDir) + removePdbFiles(resolve(targetDir, "release"));
if (pdbFreed > 0) {
  freed += pdbFreed;
  console.log(`  removed .pdb files (${fmt(pdbFreed / 1024 / 1024)})`);
}

const after = dirSize(targetDir) / 1024 / 1024;
console.log(`After:  ${fmt(after)}`);
console.log(`Freed:  ${fmt(freed / 1024 / 1024)}`);
