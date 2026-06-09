// 状态文件读写 — 与 Python 版本保持 schema 兼容
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadReviewConfig } from "./review_config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const reviewConfig = loadReviewConfig();
export const WORKSPACE = join(__dirname, "..");
export const PROJECT_ROOT = join(WORKSPACE, "..");
export const REFERENCE = join(PROJECT_ROOT, "reference");
export const CARD_DIR = join(REFERENCE, "02-概念卡片");
export const NOTE_DIR = join(REFERENCE, "01-章节笔记");
export const STATE_DIR = reviewConfig.stateDirAbs;
export const DATA_DIR = join(WORKSPACE, "data");
export const ARCHIVE_DIR = reviewConfig.archiveDirAbs;
export const SESSION_ARCHIVE_DIR = join(ARCHIVE_DIR, "sessions");
export const SUMMARY_DIR = join(ARCHIVE_DIR, "summaries");
export const LEARNING_PROFILE_DIR = join(STATE_DIR, "learning_profiles");

const PROGRESS_FILE = join(STATE_DIR, "progress.json");
const WRONG_BOOK_FILE = join(STATE_DIR, "wrong_book.json");
const KNOWLEDGE_CHAINS_FILE = join(STATE_DIR, "knowledge_chains.json");
const KNOWLEDGE_INDEX_FILE = join(DATA_DIR, "knowledge_index.json");
const CARD_PROGRESS_FILE = join(STATE_DIR, "card_progress.json");

const DEFAULT_PROGRESS = {
  current_session: null,
  history: {
    total_questions_answered: 0,
    total_correct: 0,
    total_incorrect: 0,
    chapters_covered: [],
    sessions: [],
  },
};

const DEFAULT_WRONG_BOOK = {
  entries: [],
  error_type_stats: {},
};

const DEFAULT_KNOWLEDGE_CHAINS = {
  chains: [],
  knowledge_points_linked: [],
};

// ─── JSON 读写 ───
export function loadJSON(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function saveJSON(path, data) {
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

function ensureJSON(path, fallback) {
  if (!existsSync(path)) saveJSON(path, fallback);
  return loadJSON(path);
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
  return ensureJSON(PROGRESS_FILE, DEFAULT_PROGRESS);
}

export function saveProgress(data) {
  saveJSON(PROGRESS_FILE, data);
}

// ─── 会话 ───
export function initSession(scope, kpIds, meta = {}) {
  const progress = loadProgress();
  const session = {
    session_id: `s_${timestampNow().replace(/[:.]/g, "-")}`,
    started: timestampNow(),
    scope,
    mode: meta.mode || "quiz",
    profile_id: meta.profile_id || meta.subject_id || "",
    difficulty_policy: meta.difficulty_policy || "auto",
    question_type_policy: meta.question_type_policy || "auto",
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
  return ensureJSON(WRONG_BOOK_FILE, DEFAULT_WRONG_BOOK);
}

export function loadCardProgress() {
  return ensureJSON(CARD_PROGRESS_FILE, { cards: {} });
}

export function saveCardProgress(data) {
  saveJSON(CARD_PROGRESS_FILE, data);
}

function confidenceFor(entry) {
  const practice = entry.practice_count || 0;
  if (practice === 0) return entry.seen_count >= 2 ? "medium" : "low";
  const accuracy = (entry.correct_count || 0) / practice;
  if (practice >= 3 && accuracy >= 0.8) return "high";
  if (accuracy >= 0.5) return "medium";
  return "low";
}

export function markCardSeen(knowledgePointId) {
  if (!knowledgePointId) return null;
  const progress = loadCardProgress();
  const entry = progress.cards[knowledgePointId] || {
    seen_count: 0,
    practice_count: 0,
    correct_count: 0,
    confidence: "low",
  };
  entry.seen_count = (entry.seen_count || 0) + 1;
  entry.last_seen_at = timestampNow();
  entry.confidence = confidenceFor(entry);
  progress.cards[knowledgePointId] = entry;
  saveCardProgress(progress);
  return entry;
}

export function updateCardPractice(knowledgePointIds = [], isCorrect = false) {
  const progress = loadCardProgress();
  for (const kp of knowledgePointIds || []) {
    if (!kp) continue;
    const entry = progress.cards[kp] || {
      seen_count: 0,
      practice_count: 0,
      correct_count: 0,
      confidence: "low",
    };
    entry.practice_count = (entry.practice_count || 0) + 1;
    if (isCorrect) entry.correct_count = (entry.correct_count || 0) + 1;
    entry.last_practiced_at = timestampNow();
    entry.confidence = confidenceFor(entry);
    progress.cards[kp] = entry;
  }
  saveCardProgress(progress);
  return progress;
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

// ─── 学习画像 ───
function safeSubjectId(subjectId) {
  return String(subjectId || "default").replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function learningProfilePath(subjectId) {
  return join(LEARNING_PROFILE_DIR, `${safeSubjectId(subjectId)}.json`);
}

function profileUserDir(profileRoot) {
  return profileRoot ? join(profileRoot, "_user") : "";
}

function profileLearningProfilePath(profileRoot) {
  return profileRoot ? join(profileUserDir(profileRoot), "learning_profile.json") : "";
}

function profileSummaryDir(profileRoot) {
  return profileRoot ? join(profileUserDir(profileRoot), "summaries") : "";
}

function defaultLearningProfile(subjectId) {
  return {
    subject_id: subjectId || "default",
    recent_sessions: [],
    accuracy: null,
    weak_points: [],
    error_types: {},
    lingering_questions: [],
    next_suggestions: [],
    updated_at: null,
  };
}

function uniqueRecent(items, limit = 8) {
  return [...new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean))].slice(0, limit);
}

function extractReportLines(report, patterns, limit = 5) {
  const lines = String(report || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*#\s]+/, "").trim())
    .filter(Boolean);
  return uniqueRecent(lines.filter((line) => patterns.some((pattern) => pattern.test(line))), limit);
}

export function loadLearningProfile(subjectId, options = {}) {
  const privatePath = profileLearningProfilePath(options.profileRoot);
  if (privatePath && existsSync(privatePath)) {
    return { ...defaultLearningProfile(subjectId), ...loadJSON(privatePath) };
  }
  const path = learningProfilePath(subjectId);
  if (!existsSync(path)) return defaultLearningProfile(subjectId);
  return { ...defaultLearningProfile(subjectId), ...loadJSON(path) };
}

export function saveLearningProfile(subjectId, profile, options = {}) {
  const next = { ...defaultLearningProfile(subjectId), ...profile, subject_id: subjectId || profile.subject_id || "default" };
  const privatePath = profileLearningProfilePath(options.profileRoot);
  saveJSON(privatePath || learningProfilePath(subjectId), next);
  return next;
}

export function updateLearningProfileFromSummary(subjectId, summary = {}, options = {}) {
  const sid = subjectId || "default";
  const current = loadLearningProfile(sid, options);
  const report = String(summary.report || "");
  const total = Number(summary.total_questions ?? 0);
  const correct = Number(summary.correct ?? 0);
  const incorrect = Number(summary.incorrect ?? 0);
  const sessionEntry = {
    session_id: summary.session_id || `s_${Date.now()}`,
    date: dateStr(),
    scope: summary.scope || "",
    total_questions: total,
    correct,
    incorrect,
    summary_path: summary.summary_path || "",
  };

  const recentSessions = [
    sessionEntry,
    ...(current.recent_sessions || []).filter((item) => item.session_id !== sessionEntry.session_id),
  ].slice(0, 10);
  const answered = recentSessions.reduce((sum, item) => sum + Number(item.total_questions || 0), 0);
  const correctTotal = recentSessions.reduce((sum, item) => sum + Number(item.correct || 0), 0);
  const wrongBook = loadWrongBook();
  const recentWrong = wrongBook.entries.slice(-20);
  const weakPoints = uniqueRecent([
    ...recentWrong.flatMap((entry) => entry.knowledge_points || []),
    ...extractReportLines(report, [/薄弱|错误|混淆|遗漏|待复习|不熟/], 5),
  ], 10);
  const lingering = uniqueRecent([
    ...(current.lingering_questions || []),
    ...extractReportLines(report, [/遗留|疑问|问题|追问/], 5),
  ], 8);
  const suggestions = uniqueRecent([
    ...extractReportLines(report, [/建议|下一步|下次|继续|优先/], 6),
    ...(current.next_suggestions || []),
  ], 8);

  return saveLearningProfile(sid, {
    ...current,
    recent_sessions: recentSessions,
    accuracy: answered > 0 ? correctTotal / answered : current.accuracy,
    weak_points: weakPoints,
    error_types: wrongBook.error_type_stats || {},
    lingering_questions: lingering,
    next_suggestions: suggestions,
    updated_at: timestampNow(),
  }, options);
}

export function formatLearningProfileForPrompt(profile) {
  if (!profile?.updated_at || !(profile.recent_sessions || []).length) {
    return "暂无该科目的历史学习画像。请按当前资料和用户选择开始，不要臆造历史薄弱点。";
  }
  const accuracy = typeof profile.accuracy === "number" ? `${Math.round(profile.accuracy * 100)}%` : "未知";
  const recent = (profile.recent_sessions || []).slice(0, 3)
    .map((item) => `- ${item.date || ""} ${item.scope || ""}: ${item.correct || 0}/${item.total_questions || 0}`)
    .join("\n") || "- 无";
  const weak = (profile.weak_points || []).slice(0, 8).join("、") || "暂无";
  const lingering = (profile.lingering_questions || []).slice(0, 5).join("；") || "暂无";
  const suggestions = (profile.next_suggestions || []).slice(0, 5).join("；") || "暂无";
  return [
    `最近综合正确率: ${accuracy}`,
    "最近会话:",
    recent,
    `薄弱点: ${weak}`,
    `遗留问题: ${lingering}`,
    `下次建议: ${suggestions}`,
  ].join("\n");
}

// ─── 知识链 ───
export function loadKnowledgeChains() {
  return ensureJSON(KNOWLEDGE_CHAINS_FILE, DEFAULT_KNOWLEDGE_CHAINS);
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
    "## 出题依据",
    archive.source_basis || "（未记录）",
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
  const summaryDir = profileSummaryDir(meta.profileRoot) || SUMMARY_DIR;
  if (!existsSync(summaryDir)) mkdirSync(summaryDir, { recursive: true });
  const safeSessionId = sessionId || `s_${Date.now()}`;
  const path = join(summaryDir, `${safeSessionId}_总结.md`);
  const frontmatter = [
    "---",
    `session_id: ${safeSessionId}`,
    meta.subject_id ? `subject_id: ${meta.subject_id}` : "",
    meta.profile_id ? `profile_id: ${meta.profile_id}` : "",
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

  updateCardPractice(archive.knowledge_points || [], isCorrect);

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
