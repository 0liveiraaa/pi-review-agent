// 章节笔记解析 — 扫描 01-章节笔记/
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { NOTE_DIR } from "./state.mjs";

/**
 * 获取指定章的所有小节 [{ lesson, title, filePath }]
 */
export function getChapterSections(chapterId) {
  return getChapterSectionsFromDir(chapterId, NOTE_DIR);
}

export function getChapterSectionsFromDir(chapterId, noteDir = NOTE_DIR) {
  const sections = [];
  if (!existsSync(noteDir)) return sections;

  const chapter = String(chapterId || "").trim();
  const prefix = `${chapter}.`;
  for (const fullPath of findChapterMarkdownFiles(noteDir, prefix)) {
    const parsed = parseFrontmatter(fullPath);
    const fallback = parseChapterFilename(fullPath, prefix);
    const lesson = parsed.lesson || fallback.lesson;
    const title = parsed.title || fallback.title;
    if (lesson) sections.push({ lesson, title, filePath: fullPath });
  }

  sections.sort((a, b) => {
    const [aCh, aSec] = a.lesson.split(".").map(Number);
    const [bCh, bSec] = b.lesson.split(".").map(Number);
    return aCh - bCh || aSec - bSec;
  });
  return sections;
}

function findChapterMarkdownFiles(dir, prefix) {
  const out = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...findChapterMarkdownFiles(fullPath, prefix));
      } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name.startsWith(prefix)) {
        out.push(fullPath);
      }
    }
  } catch {
    // Skip inaccessible directories; callers treat missing sections as empty.
  }
  return out;
}

function parseChapterFilename(filePath, prefix) {
  const stem = basename(filePath, ".md");
  if (!stem.startsWith(prefix)) return { lesson: "", title: "" };
  const match = stem.match(/^(\d+(?:\.\d+)+)\s*(.*)$/);
  if (!match) return { lesson: "", title: "" };
  return {
    lesson: match[1],
    title: match[2]?.trim() || stem,
  };
}

function parseFrontmatter(filePath) {
  try {
    const content = readFileSync(filePath, "utf-8");
    if (!content.startsWith("---")) return { lesson: "", title: "" };

    const parts = content.split("---", 3);
    if (parts.length < 3) return { lesson: "", title: "" };

    let lesson = "", title = "";
    for (const line of parts[1].trim().split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("lesson:")) lesson = trimmed.split(":")[1].trim();
      else if (trimmed.startsWith("title:")) title = trimmed.split(":")[1].trim();
    }
    return { lesson, title };
  } catch {
    return { lesson: "", title: "" };
  }
}

/**
 * 提取小节的 本节核心 / 考点整理 / 速记
 */
export function extractSectionBrief(filePath) {
  try {
    let body = readFileSync(filePath, "utf-8");
    if (body.startsWith("---")) {
      const parts = body.split("---", 3);
      if (parts.length >= 3) body = parts[2];
    }
    return {
      core: extractSection(body, "本节核心"),
      examPoints: extractSection(body, "本节考点整理"),
      quickSummary: extractSection(body, "本节速记"),
    };
  } catch {
    return { core: "", examPoints: "", quickSummary: "" };
  }
}

function extractSection(text, heading) {
  const pattern = new RegExp(`##\\s+${escapeRegex(heading)}\\s*\\n([\\s\\S]+?)(?=\\n##\\s|$)`, "i");
  const m = text.match(pattern);
  return m ? m[1].trim() : "";
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
