// Reset demo-review seed profile to release state.
// Usage: npm run reset-demo-profile
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "..");
const profilesDir = resolve(workspaceRoot, "review_profiles");
const legacyDir = resolve(workspaceRoot, "docs/legacy/demo-revisions");
const demoProfilePath = join(profilesDir, "demo-review", "profile.json");

// 1. Restore demo-review/profile.json to release state
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
console.log("✅ demo-review/profile.json → active");

// 2. Move any demo-review__draft_* out of review_profiles/
if (existsSync(profilesDir)) {
  for (const entry of readdirSync(profilesDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith("demo-review__draft_")) {
      const src = join(profilesDir, entry.name);
      const dst = join(legacyDir, entry.name);
      mkdirSync(legacyDir, { recursive: true });
      cpSync(src, dst, { recursive: true });
      rmSync(src, { recursive: true, force: true });
      console.log(`📦 Moved demo draft: ${entry.name} → docs/legacy/demo-revisions/`);
    }
  }
}

// 3. Write legacy README if missing
const readmePath = join(legacyDir, "README.md");
if (!existsSync(readmePath)) {
  writeFileSync(readmePath, [
    "# Demo 修订草稿归档",
    "",
    "此目录包含 `/review-fix` 手动验收期间产生的 demo-review 修订草稿。",
    "开源发布时不应将 `demo-review__draft_*` 作为 active profile。",
  ].join("\n"), "utf-8");
}

console.log("✅ Demo profile reset to release state.");
