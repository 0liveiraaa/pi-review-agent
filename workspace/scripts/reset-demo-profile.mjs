// Reset the demo-review seed profile to release state.
// Usage: npm run reset-demo-profile
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "..");
const profilesDir = resolve(workspaceRoot, "review_profiles");
const legacyDir = resolve(workspaceRoot, "docs/legacy/demo-revisions");
const demoProfilePath = join(profilesDir, "demo-review", "profile.json");

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function copyDirRecursive(source, target) {
  ensureDir(target);
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(sourcePath, targetPath);
    } else if (entry.isFile()) {
      ensureDir(dirname(targetPath));
      copyFileSync(sourcePath, targetPath);
    }
  }
}

const releaseProfile = {
  subjectId: "demo-review",
  name: "学习方法 Demo",
  status: "active",
  createdAt: "2026-06-06T00:00:00.000Z",
  updatedAt: new Date().toISOString(),
  paths: {
    subject: "subject.md",
    knowledgeIndex: "knowledge_index.json",
    cards: "cards",
    chapters: "chapters",
    examPoints: "exam_points",
    sourceMap: "source_map.json",
    qualityReport: "quality_report.md",
  },
};

writeFileSync(demoProfilePath, JSON.stringify(releaseProfile, null, 2) + "\n", "utf-8");
console.log("OK demo-review/profile.json -> active");

if (existsSync(profilesDir)) {
  for (const entry of readdirSync(profilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("demo-review__draft_")) continue;
    const source = join(profilesDir, entry.name);
    const target = join(legacyDir, entry.name);
    copyDirRecursive(source, target);
    rmSync(source, { recursive: true, force: true });
    console.log(`Moved demo draft: ${entry.name} -> docs/legacy/demo-revisions/`);
  }
}

const readmePath = join(legacyDir, "README.md");
if (!existsSync(readmePath)) {
  ensureDir(legacyDir);
  writeFileSync(
    readmePath,
    [
      "# Demo 修订草稿归档",
      "",
      "此目录保存 `/review-fix` 手动验收期间产生的 demo-review 修订草稿。",
      "开源发布态不应把 `demo-review__draft_*` 作为 active profile。",
      "",
    ].join("\n"),
    "utf-8",
  );
}

console.log("OK demo profile reset to release state.");
