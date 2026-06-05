// 章节笔记解析 — 扫描 01-章节笔记/
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NOTE_DIR } from "./state.mjs";

/**
 * 获取指定章的所有小节 [{ lesson, title, filePath }]
 */
export function getChapterSections(chapterId) {
  const sections = [];
  if (!existsSync(NOTE_DIR)) return sections;

  const prefix = `${chapterId}.`;
  for (const subdir of readdirSync(NOTE_DIR)) {
    const subPath = join(NOTE_DIR, subdir);
    if (!existsSync(subPath)) continue;
    if (!statSync(subPath).isDirectory()) continue;
    try {
      const files = readdirSync(subPath);
      for (const f of files) {
        if (!f.endsWith(".md") || !f.startsWith(prefix)) continue;
        const fullPath = join(subPath, f);
        const { lesson, title } = parseFrontmatter(fullPath);
        if (lesson) sections.push({ lesson, title, filePath: fullPath });
      }
    } catch { /* skip inaccessible dirs */ }
  }

  sections.sort((a, b) => {
    const [aCh, aSec] = a.lesson.split(".").map(Number);
    const [bCh, bSec] = b.lesson.split(".").map(Number);
    return aCh - bCh || aSec - bSec;
  });
  return sections;
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
