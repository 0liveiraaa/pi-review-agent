// 状态文件读写 — 与 Python 版本保持 schema 兼容
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const WORKSPACE = join(__dirname, "..");
export const PROJECT_ROOT = join(WORKSPACE, "..");
export const REFERENCE = join(PROJECT_ROOT, "reference");
export const CARD_DIR = join(REFERENCE, "02-概念卡片");
export const NOTE_DIR = join(REFERENCE, "01-章节笔记");
export const STATE_DIR = join(WORKSPACE, "state");
export const DATA_DIR = join(WORKSPACE, "data");
export const ARCHIVE_DIR = join(WORKSPACE, "archive");
export const SESSION_ARCHIVE_DIR = join(ARCHIVE_DIR, "sessions");
export const SUMMARY_DIR = join(ARCHIVE_DIR, "summaries");

const PROGRESS_FILE = join(STATE_DIR, "progress.json");
const WRONG_BOOK_FILE = join(STATE_DIR, "wrong_book.json");
const KNOWLEDGE_CHAINS_FILE = join(STATE_DIR, "knowledge_chains.json");
const KNOWLEDGE_INDEX_FILE = join(DATA_DIR, "knowledge_index.json");

// ─── JSON 读写 ───
export function loadJSON(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function saveJSON(path, data) {
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

// ─── 时间戳 ───
export function timestampNow() {
  return new Date().toISOString();
}

export function dateStr() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

// ─── 进度 ───
export function loadProgress() {
  return loadJSON(PROGRESS_FILE);
}

export function saveProgress(data) {
  saveJSON(PROGRESS_FILE, data);
}

// ─── 会话 ───
export function initSession(scope, kpIds) {
  const progress = loadProgress();
  const session = {
    session_id: `s_${timestampNow().replace(/[:.]/g, "-")}`,
    started: timestampNow(),
    scope,
    mode: "quiz",
    total_questions: 0,
    correct: 0,
    incorrect: 0,
    current_question_index: 0,
    question_sequence: 0,
    covered_knowledge_points: [],
    remaining_knowledge_points: kpIds,
  };
  progress.current_session = session;
  saveProgress(progress);
  return session;
}

export function updateSession(updates) {
  const progress = loadProgress();
  if (progress.current_session) {
    Object.assign(progress.current_session, updates);
    saveProgress(progress);
  }
}

export function endSession() {
  const progress = loadProgress();
  const session = progress.current_session;
  if (!session) return null;

  session.ended = timestampNow();
  progress.history.total_questions_answered += session.total_questions;
  progress.history.total_correct += session.correct;
  progress.history.total_incorrect += session.incorrect;
  const chSet = new Set(progress.history.chapters_covered);
  chSet.add(session.scope);
  progress.history.chapters_covered = [...chSet];
  progress.history.sessions.push({
    session_id: session.session_id,
    date: dateStr(),
    scope: session.scope,
    total_questions: session.total_questions,
    correct: session.correct,
    incorrect: session.incorrect,
  });
  progress.current_session = null;
  saveProgress(progress);
  return session;
}

// ─── 错题本 ───
export function loadWrongBook() {
  return loadJSON(WRONG_BOOK_FILE);
}

export function saveWrongEntry(questionId, knowledgePoints, errorType, errorDetail) {
  const wb = loadWrongBook();
  wb.entries.push({
    question_id: questionId,
    knowledge_points: knowledgePoints,
    error_type: errorType,
    error_detail: errorDetail,
    timestamp: timestampNow(),
  });
  wb.error_type_stats[errorType] = (wb.error_type_stats[errorType] || 0) + 1;
  saveJSON(WRONG_BOOK_FILE, wb);
}

export function getRecentWeaknesses(limit = 3) {
  const wb = loadWrongBook();
  const entries = wb.entries.slice(-limit);
  const kps = new Set();
  for (const e of entries) {
    for (const kp of e.knowledge_points || []) kps.add(kp);
  }
  return [...kps];
}

// ─── 知识链 ───
export function loadKnowledgeChains() {
  return loadJSON(KNOWLEDGE_CHAINS_FILE);
}

export function updateKnowledgeChains(nodes) {
  const chains = loadKnowledgeChains();
  const chainStr = nodes.join(" → ");
  if (!chains.chains.find((c) => c.chain === chainStr)) {
    chains.chains.push({ chain: chainStr, nodes, first_seen: timestampNow() });
  }
  for (const kp of nodes) {
    if (!chains.knowledge_points_linked.includes(kp)) {
      chains.knowledge_points_linked.push(kp);
    }
  }
  saveJSON(KNOWLEDGE_CHAINS_FILE, chains);
}

// ─── 知识点索引 ───
export function loadKnowledgeIndex() {
  return loadJSON(KNOWLEDGE_INDEX_FILE);
}

// ─── 范围匹配 ───
const CN_NUM = {
  "一":"1","二":"2","三":"3","四":"4","五":"5",
  "六":"6","七":"7","八":"8","九":"9","十":"10",
  "十一":"11","十二":"12","十三":"13","十四":"14","十五":"15",
  "十六":"16","十七":"17","十八":"18","十九":"19","二十":"20",
};

export function getKpIdsForScope(scope) {
  const index = loadKnowledgeIndex();
  const kpIds = [];
  const rawKeywords = scope.replace(/、|，/g, ",").split(",").map((s) => s.trim());

  // 预处理: 中文数字/"第X章" → 纯数字
  const keywords = [];
  for (const kw of rawKeywords) {
    keywords.push(kw);
    const m = kw.match(/第\s*(\d+)\s*章/);
    if (m) { keywords.push(m[1]); continue; }
    for (const [cn, num] of Object.entries(CN_NUM)) {
      if (kw.includes(cn)) { keywords.push(kw.replace(cn, num)); break; }
    }
  }

  for (const [chapterId, chapterData] of Object.entries(index.chapters || {})) {
    const chapterTitle = chapterData.title || "";
    for (const kp of chapterData.knowledge_points || []) {
      const searchText = [
        chapterId, `第${chapterId}章`, chapterTitle,
        kp.name, ...(kp.aliases || []), ...(kp.tags || []),
      ].join(" ");

      for (const kw of keywords) {
        if (/^\d+$/.test(kw)) {
          if (kw === chapterId) { kpIds.push(kp.id); break; }
        } else if (searchText.includes(kw)) {
          kpIds.push(kp.id); break;
        }
      }
    }
  }
  return [...new Set(kpIds)];
}

// ─── 知识点选择 ───
export function selectKnowledgePoint(remaining, covered) {
  const index = loadKnowledgeIndex();
  const coveredSet = new Set(covered);
  for (const [, chData] of Object.entries(index.chapters || {})) {
    for (const kp of chData.knowledge_points || []) {
      if (remaining.includes(kp.id) && !coveredSet.has(kp.id)) return kp;
    }
  }
  // 兜底: 全部覆盖则循环
  for (const [, chData] of Object.entries(index.chapters || {})) {
    for (const kp of chData.knowledge_points || []) {
      if (remaining.includes(kp.id)) return kp;
    }
  }
  return null;
}

// ─── 难度 ───
export const DIFFICULTY_LADDER = ["S-R", "S-U", "M-U", "M-A", "C-A"];

export function selectDifficulty(kp, session) {
  let baseline = kp.difficulty_baseline || "S-U";
  if (!DIFFICULTY_LADDER.includes(baseline)) baseline = "S-U";
  let idx = DIFFICULTY_LADDER.indexOf(baseline);

  const total = session.total_questions || 0;
  const correct = session.correct || 0;
  const incorrect = session.incorrect || 0;
  if (total > 0) {
    const acc = correct / total;
    if (total >= 3 && acc >= 0.8) idx = Math.min(idx + 1, DIFFICULTY_LADDER.length - 1);
    else if (incorrect >= 2 && acc < 0.5) idx = Math.max(idx - 1, 0);
  }

  if (session._next_difficulty_up) {
    idx = Math.min(idx + 1, DIFFICULTY_LADDER.length - 1);
    updateSession({ _next_difficulty_up: false });
  }
  return DIFFICULTY_LADDER[idx];
}

export function selectQuestionType(kp) {
  const supported = kp.question_types || ["choice"];
  if (supported.length <= 1) return supported[0];
  const progress = loadProgress();
  const total = progress.history?.total_questions_answered || 0;
  return supported[total % supported.length];
}

// ─── 题目ID ───
export function generateQuestionId() {
  const progress = loadProgress();
  const today = dateStr();
  let max = 0;

  if (existsSync(SESSION_ARCHIVE_DIR)) {
    for (const sessionDir of readdirSync(SESSION_ARCHIVE_DIR, { withFileTypes: true })) {
      if (!sessionDir.isDirectory()) continue;
      const dir = join(SESSION_ARCHIVE_DIR, sessionDir.name);
      for (const file of readdirSync(dir)) {
        const m = file.match(new RegExp(`^q_${today}_(\\d{3})\\.json$`));
        if (m) max = Math.max(max, Number(m[1]));
      }
    }
  }

  const current = progress.current_session;
  const seq = current?.question_sequence || 0;
  const next = Math.max(max, seq) + 1;
  if (current) {
    current.question_sequence = next;
    progress.current_session = current;
    saveProgress(progress);
  }
  return `q_${today}_${String(next).padStart(3, "0")}`;
}

// ─── 错题分类 ───
export function classifyError(archive) {
  const misconception = archive.discussion_summary?.core_misconception || "";
  if (/混淆|分不清|搞混|弄混|混为一谈/.test(misconception)) return "概念混淆";
  if (/遗漏|忘记|忽略|不知道|不了解|没考虑到/.test(misconception)) return "知识遗漏";
  if (/推理|逻辑|推导|判断|分析/.test(misconception)) return "推理错误";
  return "概念混淆";
}

// ─── 归档文件 ───
export function writeArchiveFiles(archive, questionId, sessionId) {
  const sessionDir = join(SESSION_ARCHIVE_DIR, sessionId);
  if (!existsSync(sessionDir)) mkdirSync(sessionDir, { recursive: true });

  // JSON
  saveJSON(join(sessionDir, `${questionId}.json`), archive);

  // MD
  const disc = archive.discussion_summary || {};
  const chain = archive.knowledge_chain_l3 || [];
  const md = [
    "---",
    `question_id: ${questionId}`,
    `knowledge_points: ${(archive.knowledge_points || []).join(", ")}`,
    `difficulty: ${archive.difficulty || ""}`,
    `type: ${archive.type || ""}`,
    `timestamp: ${archive.timestamp || timestampNow()}`,
    `is_correct: ${archive.is_correct || false}`,
    "---",
    "",
    `# 题目归档: ${questionId}`,
    "",
    "## 题目",
    archive.question_text || "",
    "",
    "## 用户答案",
    archive.user_answer || "",
    "",
    "## 正确答案 + 解析",
    archive.correct_answer || "",
    "",
    archive.explanation_l1 || "",
    "",
    "## 讨论总结",
    `### 错误根因\n${disc.core_misconception || "无"}`,
    `### 确认的知识点\n${(disc.clarified_points || []).map((p) => `- ${p}`).join("\n") || "- 无"}`,
    `### 用户自我纠正\n${disc.user_self_correction || "无"}`,
    `### 遗留问题\n${(disc.lingering_questions || []).map((q) => `- ${q}`).join("\n") || "- 无"}`,
    "",
    "## 知识链 (Level 3)",
    chain.length ? chain.join(" → ") : "（无）",
    "",
    "## 后续建议",
    archive.suggestion_next || "继续加油！",
  ].join("\n");

  writeFileSync(join(sessionDir, `${questionId}.md`), md, "utf-8");
  console.log(`  ✅ 已归档 → ${sessionId}/${questionId}`);
}

export function writeSummaryFile(sessionId, report, meta = {}) {
  if (!existsSync(SUMMARY_DIR)) mkdirSync(SUMMARY_DIR, { recursive: true });
  const safeSessionId = sessionId || `s_${Date.now()}`;
  const path = join(SUMMARY_DIR, `${safeSessionId}_总结.md`);
  const frontmatter = [
    "---",
    `session_id: ${safeSessionId}`,
    meta.date ? `date: ${meta.date}` : `date: ${dateStr()}`,
    meta.scope ? `scope: ${String(meta.scope).replace(/\n/g, " ")}` : "",
    meta.total_questions != null ? `total_questions: ${meta.total_questions}` : "",
    meta.correct != null ? `correct: ${meta.correct}` : "",
    meta.incorrect != null ? `incorrect: ${meta.incorrect}` : "",
    "---",
    "",
  ].filter((line) => line !== "").join("\n");
  writeFileSync(path, `${frontmatter}${String(report || "").trim()}\n`, "utf-8");
  return path;
}

export function updateStateFromArchive(archive) {
  const disc = archive.discussion_summary || {};
  const chain = archive.knowledge_chain_l3 || [];
  const isCorrect = archive.is_correct !== false;

  // 错题本
  if (!isCorrect) {
    const errorType = classifyError(archive);
    saveWrongEntry(
      archive.question_id || "",
      archive.knowledge_points || [],
      errorType,
      disc.core_misconception || ""
    );
  }

  // 知识链
  if (chain.length) updateKnowledgeChains(chain);

  // 进度
  const progress = loadProgress();
  const session = progress.current_session;
  if (session) {
    const covered = new Set(session.covered_knowledge_points || []);
    for (const kp of archive.knowledge_points || []) covered.add(kp);
    session.covered_knowledge_points = [...covered];

    const remaining = session.remaining_knowledge_points || [];
    for (const kp of archive.knowledge_points || []) {
      const idx = remaining.indexOf(kp);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    session.remaining_knowledge_points = remaining;
    session.total_questions = (session.total_questions || 0) + 1;
    if (isCorrect) session.correct = (session.correct || 0) + 1;
    else session.incorrect = (session.incorrect || 0) + 1;
    session.last_lingering_question = disc.lingering_questions?.[0] || null;
    progress.current_session = session;
    saveProgress(progress);
  }
}

// ─── 类型名 ───
export function typeName(t) {
  return {
    judgment: "正误判断题",
    choice: "单项选择题",
    multi_choice: "多项选择题",
    short_answer: "简述题",
  }[t] || t;
}

// ─── 正确率 ───
export function calcAccuracy(session) {
  const total = session.total_questions || 0;
  if (total === 0) return 1;
  return (session.correct || 0) / total;
}
