import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

function markdownFiles(dir) {
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => join(dir, entry.name));
}

function walkMarkdown(dir) {
  const out = [];
  if (!dir || !existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out;
}

function titleFromMarkdown(path) {
  const content = readFileSync(path, "utf-8");
  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || basename(path, ".md");
  return { title, content };
}

function chapterMatch(path, chapterId) {
  const name = basename(path);
  const escaped = String(chapterId || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^(?:\u7b2c\s*)?${escaped}(?:\s*\u7ae0|[.\\-\\s]|$)`).test(name);
}

export function listChapterMaterials(profile, chapterId = "") {
  const files = walkMarkdown(profile?.chaptersDir);
  return files
    .filter((path) => !chapterId || chapterMatch(path, chapterId))
    .map((path, index) => {
      const { title } = titleFromMarkdown(path);
      return {
        id: String(index + 1),
        title,
        path,
        size: statSync(path).size,
      };
    });
}

export function loadChapterMaterial(profile, { chapterId = "", sectionPath = "" } = {}) {
  const sections = listChapterMaterials(profile, chapterId);
  const selected = sectionPath
    ? sections.find((section) => section.path === sectionPath || basename(section.path) === sectionPath)
    : sections[0];
  if (!selected) return null;
  return { ...selected, content: readFileSync(selected.path, "utf-8") };
}

export function listExamPointFiles(profile, chapterId = "") {
  return markdownFiles(profile?.examPointsDir)
    .filter((path) => !chapterId || chapterMatch(path, chapterId))
    .map((path) => {
      const { title } = titleFromMarkdown(path);
      return { title, path, size: statSync(path).size };
    });
}

export function loadExamPoints(profile, chapterId = "") {
  const files = listExamPointFiles(profile, chapterId);
  if (!files.length) return null;
  return files.map((file) => ({ ...file, content: readFileSync(file.path, "utf-8") }));
}
