import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { CARD_DIR, getRecentWeaknesses, loadCardProgress } from "./state.mjs";

function parseFrontmatter(content) {
  if (!content.startsWith("---")) return { data: {}, body: content.trim() };
  const end = content.indexOf("\n---", 3);
  if (end < 0) return { data: {}, body: content.trim() };
  const raw = content.slice(3, end).trim();
  const body = content.slice(end + 4).trim();
  const data = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value.slice(1, -1).split(",").map((part) => part.trim()).filter(Boolean);
    } else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return { data, body };
}

function parseSections(body) {
  const sections = {};
  let current = "raw";
  const lines = [];
  const flush = () => {
    const text = lines.join("\n").trim();
    if (text) sections[current] = text;
    lines.length = 0;
  };

  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      flush();
      current = match[1].trim();
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function isMarkdownFile(file) {
  return file.toLowerCase().endsWith(".md");
}

function listCardFiles(cardsDir) {
  if (!cardsDir || !existsSync(cardsDir)) return [];
  return readdirSync(cardsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isMarkdownFile(entry.name))
    .map((entry) => join(cardsDir, entry.name));
}

function findCardPath(cardsDir, kp = {}) {
  const files = listCardFiles(cardsDir);
  if (files.length === 0) return null;

  const candidates = [
    kp.id,
    kp.name,
    ...(Array.isArray(kp.aliases) ? kp.aliases : []),
  ].map(String).filter(Boolean);

  for (const candidate of candidates) {
    const exact = join(cardsDir, `${candidate}.md`);
    if (existsSync(exact)) return exact;
  }

  const normalized = new Set(candidates.map(normalizeName));
  for (const file of files) {
    const stem = normalizeName(basename(file, ".md"));
    if (normalized.has(stem)) return file;
  }

  for (const file of files) {
    const stem = normalizeName(basename(file, ".md"));
    for (const candidate of normalized) {
      if (candidate && (stem.includes(candidate) || candidate.includes(stem))) return file;
    }
  }

  return null;
}

export function normalizeCardMarkdown(content, kp = {}, path = "") {
  const { data, body } = parseFrontmatter(content || "");
  const titleMatch = body.match(/^#\s+(.+)$/m);
  const title = titleMatch?.[1]?.trim() || data.name || kp.name || kp.id || basename(path, ".md");
  const sections = parseSections(body.replace(/^#\s+.+$/m, "").trim());
  const aliases = [
    ...(Array.isArray(data.aliases) ? data.aliases : []),
    ...(Array.isArray(kp.aliases) ? kp.aliases : []),
  ].filter(Boolean);
  const tags = [
    ...(Array.isArray(data.tags) ? data.tags : []),
    ...(Array.isArray(kp.tags) ? kp.tags : []),
  ].filter(Boolean);

  return {
    id: String(data.id || kp.id || ""),
    name: String(data.name || kp.name || title),
    aliases: [...new Set(aliases.map(String))],
    difficulty: String(data.difficulty || kp.difficulty_baseline || ""),
    examLevel: String(data.exam_level || kp.exam_level || ""),
    chapter: String(data.chapter || kp.chapter || ""),
    source: String(data.source || ""),
    status: String(data.status || kp.status || "active"),
    tags: [...new Set(tags.map(String))],
    path,
    title,
    sections,
    raw: body.trim(),
  };
}

export function loadProfileCard(profile, kp = {}) {
  const cardsDir = profile?.cardsDir || CARD_DIR;
  const path = findCardPath(cardsDir, kp);
  if (!path) return null;
  const content = readFileSync(path, "utf-8");
  return normalizeCardMarkdown(content, kp, path);
}

export function loadConceptCard(kpName) {
  const card = loadProfileCard({ cardsDir: CARD_DIR }, { name: kpName });
  return card?.raw || null;
}

export function buildCardQueue(profile, knowledgePoints = []) {
  const progress = loadCardProgress();
  const weak = new Set(getRecentWeaknesses(20));
  return [...knowledgePoints]
    .filter((kp) => kp && kp.status !== "removed")
    .map((kp, index) => {
      const state = progress.cards?.[kp.id] || {};
      const confidenceRank = { low: 0, medium: 1, high: 2 }[state.confidence || "low"] ?? 0;
      const card = loadProfileCard(profile, kp);
      return {
        ...kp,
        queue_index: index,
        card_found: Boolean(card),
        seen_count: state.seen_count || 0,
        practice_count: state.practice_count || 0,
        correct_count: state.correct_count || 0,
        confidence: state.confidence || "low",
        _score: [
          state.seen_count ? 1 : 0,
          weak.has(kp.id) ? 0 : 1,
          confidenceRank,
          index,
        ],
      };
    })
    .sort((a, b) => {
      for (let i = 0; i < a._score.length; i += 1) {
        if (a._score[i] !== b._score[i]) return a._score[i] - b._score[i];
      }
      return 0;
    })
    .map(({ _score, ...kp }, index, arr) => ({ ...kp, card_position: index + 1, card_total: arr.length }));
}
