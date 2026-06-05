// 知识卡片加载 — 从 reference/02-概念卡片/ 读取 MD
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CARD_DIR } from "./state.mjs";

/**
 * 从 reference/02-概念卡片/ 读取知识点卡片
 * 精确匹配 → 模糊匹配 → null
 */
export function loadConceptCard(kpName) {
  // 1. 精确匹配
  const exactPath = join(CARD_DIR, `${kpName}.md`);
  if (existsSync(exactPath)) {
    return stripFrontmatter(readFileSync(exactPath, "utf-8"));
  }

  // 2. 模糊匹配: 双向匹配
  if (existsSync(CARD_DIR)) {
    for (const f of readdirSync(CARD_DIR)) {
      if (!f.endsWith(".md")) continue;
      const stem = f.slice(0, -3);  // 去掉 .md
      if (kpName.includes(stem) || stem.includes(kpName)) {
        return stripFrontmatter(readFileSync(join(CARD_DIR, f), "utf-8"));
      }
    }
  }

  return null;
}

function stripFrontmatter(content) {
  if (content.startsWith("---")) {
    const parts = content.split("---", 3);
    if (parts.length >= 3) return parts[2].trim();
  }
  return content.trim();
}
