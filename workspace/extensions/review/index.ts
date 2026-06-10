import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  Container,
  Editor,
  Key,
  matchesKey,
  SelectList,
  Text,
  truncateToWidth,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  type SelectItem,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";

import {
  REVIEW_MODES,
  buildReviewStartPrompt,
  listChapters,
  listKnowledgePoints,
  resolveReviewTarget,
} from "../../lib/review_engine.mjs";
import { loadReviewConfig } from "../../lib/review_config.mjs";
import { PACKAGE_ROOT } from "../../lib/review_config.mjs";
import { buildCardQueue, loadProfileCard } from "../../lib/cards.mjs";
import { listChapterMaterials, loadChapterMaterial, loadExamPoints } from "../../lib/review_materials.mjs";
import { normalizeQuestion, parseChoiceAnswer } from "../../lib/review_question.mjs";
import {
  createDraftProfile,
  createRevisionDraft,
  enableProfile,
  listActiveProfiles,
  listEditableProfiles,
  loadDraftProfile,
  loadProfile,
  scanSourceFiles,
  writeProfileFile,
} from "../../lib/review_profiles.mjs";
import {
  generateQuestionId,
  initSession,
  endSession,
  loadProgress,
  loadLearningProfile,
  formatLearningProfileForPrompt,
  markCardSeen,
  timestampNow,
  updateSession,
  writeArchiveFiles,
  writeSummaryFile,
  updateStateFromArchive,
  updateLearningProfileFromSummary,
} from "../../lib/state.mjs";

type ReviewSelection = {
  mode: string;
  profile?: any;
  scope?: string;
  chapterId?: string;
  knowledgePointId?: string;
  knowledgePointLabel?: string;
  difficulty?: string;
  learningProfileText?: string;
  questionType?: string;
};

type AnswerResult = {
  answer: string;
  action: string;
};

type CardResult = {
  action: "practice" | "next_card" | "skip" | "exit";
  knowledge_point_id: string;
  card_found: boolean;
  path?: string;
  position?: number;
  total?: number;
};

type MaterialResult = {
  action: "practice" | "next_section" | "skip" | "exit";
  path?: string;
  found: boolean;
};

type TurnActionResult = {
  action: "next_question" | "show_card" | "show_chapter" | "summary" | "exit";
};

const QuestionSchema = Type.Object({
  question_id: Type.Optional(Type.String()),
  knowledge_points: Type.Optional(Type.Array(Type.String())),
  difficulty: Type.Optional(Type.String()),
  type: Type.String(),
  question_text: Type.String(),
  options: Type.Optional(Type.Array(Type.String())),
  correct_answer: Type.Optional(Type.String()),
  explanation_l1: Type.Optional(Type.String()),
  source_basis: Type.Optional(Type.String()),
  related_knowledge_chain: Type.Optional(Type.Array(Type.String())),
});

const ArchiveSchema = Type.Object({
  question: Type.Optional(Type.Any()),
  question_text: Type.Optional(Type.String()),
  user_answer: Type.String(),
  is_correct: Type.Boolean(),
  grading: Type.Optional(Type.String()),
  correct_answer: Type.Optional(Type.String()),
  explanation_l1: Type.Optional(Type.String()),
  source_basis: Type.Optional(Type.String()),
  knowledge_points: Type.Optional(Type.Array(Type.String())),
  difficulty: Type.Optional(Type.String()),
  type: Type.Optional(Type.String()),
  discussion_summary: Type.Optional(Type.Any()),
  knowledge_chain_l3: Type.Optional(Type.Array(Type.String())),
  suggestion_next: Type.Optional(Type.String()),
});

const SummarySchema = Type.Object({
  session_id: Type.Optional(Type.String()),
  subject_id: Type.Optional(Type.String()),
  report: Type.String(),
  scope: Type.Optional(Type.String()),
  total_questions: Type.Optional(Type.Number()),
  correct: Type.Optional(Type.Number()),
  incorrect: Type.Optional(Type.Number()),
  end_session: Type.Optional(Type.Boolean()),
});

const ProfileWriteSchema = Type.Object({
  subject_id: Type.String(),
  path: Type.String(),
  content: Type.String(),
});

const ProfileEnableSchema = Type.Object({
  subject_id: Type.String(),
});

const CardSchema = Type.Object({
  subject_id: Type.String(),
  knowledge_point_id: Type.Optional(Type.String()),
  knowledge_point_name: Type.Optional(Type.String()),
});

const MaterialSchema = Type.Object({
  subject_id: Type.String(),
  chapter_id: Type.Optional(Type.String()),
  section_path: Type.Optional(Type.String()),
});

const TurnActionSchema = Type.Object({
  mode: Type.Optional(Type.String()),
  subject_id: Type.Optional(Type.String()),
  knowledge_point_id: Type.Optional(Type.String()),
  chapter_id: Type.Optional(Type.String()),
});

const REVIEW_PANEL_BODY_LINES = 18;
const REVIEW_INPUT_TITLE_LINES = 8;
const DIFFICULTY_OPTIONS = ["", "S-R", "S-U", "M-U", "M-A", "C-A"];

function clampScroll(scroll: number, totalLines: number, visibleLines: number) {
  return Math.max(0, Math.min(scroll, Math.max(0, totalLines - visibleLines)));
}

function renderWindowedLines(lines: string[], scroll: number, visibleLines = REVIEW_PANEL_BODY_LINES) {
  const safeScroll = clampScroll(scroll, lines.length, visibleLines);
  return {
    safeScroll,
    visible: lines.slice(safeScroll, safeScroll + visibleLines),
    hasOverflow: lines.length > visibleLines,
    total: lines.length,
  };
}

function wrapPlainLine(line: string, width: number) {
  const max = Math.max(20, width - 2);
  const raw = String(line ?? "");
  if (raw.length <= max) return [raw];
  const chunks = [];
  for (let i = 0; i < raw.length; i += max) chunks.push(raw.slice(i, i + max));
  return chunks;
}

function wrapPlainBlock(text: string, width: number) {
  return String(text || "").split(/\r?\n/).flatMap((line) => wrapPlainLine(line, width));
}

function renderTruncatedBlock(text: string, width: number, maxLines = REVIEW_INPUT_TITLE_LINES) {
  const lines = String(text || "").split(/\r?\n/).map((line) => truncateToWidth(line, width));
  if (lines.length <= maxLines) return lines;
  return [
    ...lines.slice(0, Math.max(1, maxLines - 1)),
    truncateToWidth(`... 已省略 ${lines.length - maxLines + 1} 行`, width),
  ];
}

function compactInlineText(text: string, limit = 80) {
  const oneLine = String(text || "").replace(/\s+/g, " ").trim();
  if (oneLine.length <= limit) return oneLine;
  return `${oneLine.slice(0, Math.max(0, limit - 1))}…`;
}

async function showScrollableTextPanel(
  ctx: ExtensionContext,
  title: string,
  body: string,
  footer: string,
): Promise<"continue" | "exit"> {
  if (!ctx.hasUI) return "continue";
  return await ctx.ui.custom<"continue" | "exit">((tui, theme, _kb, done) => {
    let closed = false;
    function finish(value: "continue" | "exit") {
      if (closed) return;
      closed = true;
      done(value);
    }

    let scroll = 0;
    let totalLines = 0;
    let lastWidth = 0;
    let wrappedLines: string[] = [];
    let renderCache: string[] | undefined;

    function ensureWrapped(width: number) {
      if (lastWidth === width && wrappedLines.length > 0) return;
      wrappedLines = [
        theme.fg("accent", theme.bold(title)),
        "",
        ...wrapPlainBlock(body || "（无内容）", width),
      ];
      totalLines = wrappedLines.length;
      scroll = clampScroll(scroll, totalLines, REVIEW_PANEL_BODY_LINES);
      lastWidth = width;
      renderCache = undefined;
    }

    return {
      render(width: number) {
        if (closed) return [];
        ensureWrapped(width);
        if (renderCache) return renderCache;
        const windowed = renderWindowedLines(wrappedLines, scroll);
        const scrollHint = windowed.hasOverflow
          ? ` • J/K 滚动 ${scroll + 1}-${Math.min(scroll + REVIEW_PANEL_BODY_LINES, windowed.total)}/${windowed.total}`
          : "";
        renderCache = [
          theme.fg("accent", "─".repeat(width)),
          ...windowed.visible,
          "",
          theme.fg("dim", `${footer}${scrollHint}`),
          theme.fg("accent", "─".repeat(width)),
        ].map((line) => truncateToWidth(line, width));
        return renderCache;
      },
      invalidate() {
        renderCache = undefined;
      },
      handleInput(data: string) {
        if (closed) return;
        if (matchesKey(data, Key.escape)) {
          finish("exit");
          return;
        }
        if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
          finish("continue");
          return;
        }
        const prevScroll = scroll;
        if (isScrollUp(data)) {
          scroll = clampScroll(scroll - 1, totalLines || 1, REVIEW_PANEL_BODY_LINES);
        } else if (isScrollDown(data)) {
          scroll = clampScroll(scroll + 1, totalLines || 1, REVIEW_PANEL_BODY_LINES);
        }
        if (scroll !== prevScroll) {
          renderCache = undefined;
          tui.requestRender();
        }
      },
    };
  });
}

function isScrollUp(data: string) {
  return data.toLowerCase() === "k" || matchesKey(data, Key.up);
}

function isScrollDown(data: string) {
  return data.toLowerCase() === "j" || matchesKey(data, Key.down);
}

function loadReviewCoreText() {
  const path = join(PACKAGE_ROOT, "skills", "review-core", "SKILL.md");
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

function injectReviewCore(prompt: string, coreText: string) {
  if (!coreText) return prompt;
  return [
    "以下是本次 review 命令强制注入的 review-core 主规则。即使你没有显式加载 /skill:review-core，也必须遵守。",
    "",
    coreText,
    "",
    "以下是本次具体任务:",
    "",
    prompt,
  ].join("\n");
}

async function selectItem(ctx: ExtensionContext, title: string, items: SelectItem[]): Promise<string | null> {
  if (!ctx.hasUI) return items[0]?.value ?? null;
  if (items.length === 0) return null;

  return await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
    let closed = false;
    function finish(value: string | null) {
      if (closed) return;
      closed = true;
      done(value);
    }

    const container = new Container();
    container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
    container.addChild(new Text(theme.fg("accent", theme.bold(title))));

    const list = new SelectList(items, Math.min(items.length, 12), {
      selectedPrefix: (s) => theme.fg("accent", s),
      selectedText: (s) => theme.fg("accent", s),
      description: (s) => theme.fg("muted", s),
      scrollInfo: (s) => theme.fg("dim", s),
      noMatch: (s) => theme.fg("warning", s),
    });
    list.onSelect = (item) => finish(item.value);
    list.onCancel = () => finish(null);
    container.addChild(list);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel")));
    container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        if (closed) return;
        list.handleInput(data);
        if (closed) return;
        tui.requestRender();
      },
    };
  });
}

async function selectOptionWithHeader(
  ctx: ExtensionContext,
  title: string,
  headerLines: string[],
  items: SelectItem[],
): Promise<string | null> {
  if (!ctx.hasUI) return items[0]?.value ?? null;
  if (items.length === 0) return null;

  return await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
    let closed = false;
    function finish(value: string | null) {
      if (closed) return;
      closed = true;
      done(value);
    }

    const container = new Container();
    container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
    container.addChild(new Text(theme.fg("accent", theme.bold(title))));
    if (headerLines.length > 0) {
      container.addChild(new Text(""));
      for (const line of headerLines) {
        container.addChild(new Text(theme.fg("muted", line)));
      }
      container.addChild(new Text(theme.fg("dim", "─".repeat(20))));
    }

    const list = new SelectList(items, Math.min(items.length, 10), {
      selectedPrefix: (s) => theme.fg("accent", s),
      selectedText: (s) => theme.fg("accent", s),
      description: (s) => theme.fg("muted", s),
      scrollInfo: (s) => theme.fg("dim", s),
      noMatch: (s) => theme.fg("warning", s),
    });
    list.onSelect = (item) => finish(item.value);
    list.onCancel = () => finish(null);
    container.addChild(list);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel")));
    container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        if (closed) return;
        list.handleInput(data);
        tui.requestRender();
      },
    };
  });
}

async function textInput(ctx: ExtensionContext, title: string, initial = ""): Promise<string | null> {
  if (!ctx.hasUI) return initial || null;
  return await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
    let closed = false;
    function finish(value: string | null) {
      if (closed) return;
      closed = true;
      done(value);
    }

    const editor = new Editor(tui, {
      borderColor: (s) => theme.fg("accent", s),
      selectList: {
        selectedPrefix: (s) => theme.fg("accent", s),
        selectedText: (s) => theme.fg("accent", s),
        description: (s) => theme.fg("muted", s),
        scrollInfo: (s) => theme.fg("dim", s),
        noMatch: (s) => theme.fg("warning", s),
      },
    });
    editor.setText(initial);
    editor.onSubmit = (value) => finish(value.trim() || null);
    let renderCache: string[] | undefined;

    return {
      render(width: number) {
        if (closed) return [];
        if (renderCache) return renderCache;
        renderCache = [
          theme.fg("accent", "─".repeat(width)),
          ...renderTruncatedBlock(title, width).map((line, index) => (
            index === 0 ? theme.fg("accent", theme.bold(line)) : theme.fg("muted", line)
          )),
          "",
          ...editor.render(width),
          "",
          theme.fg("dim", "Enter submit • Esc cancel"),
          theme.fg("accent", "─".repeat(width)),
        ].map((line) => truncateToWidth(line, width));
        return renderCache;
      },
      invalidate() {
        renderCache = undefined;
      },
      handleInput(data: string) {
        if (closed) return;
        if (matchesKey(data, Key.escape)) {
          finish(null);
          return;
        }
        editor.handleInput(data);
        if (closed) return;
        renderCache = undefined;
      },
    };
  });
}

async function chooseReviewSelection(ctx: ExtensionContext, args: string): Promise<ReviewSelection | null> {
  const profiles = listActiveProfiles();
  if (profiles.length === 0) {
    ctx.ui.notify("No active review profiles. Run /review-init first.", "warning");
    return null;
  }

  const profileId = await selectItem(ctx, "选择复习科目", profiles.map((profile) => ({
    value: profile.subjectId,
    label: profile.name || profile.subjectId,
    description: `${profile.subjectId} | ${profile.status}`,
  })));
  if (!profileId) return null;
  const profile = loadProfile(profileId);
  const lp = loadLearningProfile(profile?.subjectId || profileId, { profileRoot: profile?.familyRoot || profile?.root });
  const learningProfileText = formatLearningProfileForPrompt(lp);
  const hasProfileHistory = lp?.updated_at != null && (lp.recent_sessions || []).length > 0;
  if (hasProfileHistory) {
    const accuracy = typeof lp.accuracy === "number" ? `${Math.round(lp.accuracy * 100)}%` : "未知";
    const weak = (lp.weak_points || []).slice(0, 3).join("、") || "暂无记录";
    ctx.ui.notify(`📊 学习画像: 正确率 ${accuracy}，薄弱点 ${weak}`, "info");
  }

  const mode = await selectItem(ctx, "选择复习模式", REVIEW_MODES);
  if (!mode) return null;

  const targetKind = await selectItem(ctx, "选择范围来源", [
    { value: "chapter", label: "章节", description: "按课程章节选择。" },
    { value: "knowledge", label: "知识点", description: "按知识点精确练习。" },
    { value: "scope", label: "文本范围", description: "输入章节号、关键词或范围描述。" },
  ]);
  if (!targetKind) return null;

  const selection: ReviewSelection = { mode, profile, learningProfileText };
  if (targetKind === "chapter") {
    selection.chapterId = await selectItem(ctx, "选择章节", listChapters(profile)) || undefined;
    if (!selection.chapterId) return null;
  } else if (targetKind === "knowledge") {
    const kp = await selectItem(ctx, "选择知识点", listKnowledgePoints(args, profile).slice(0, 200));
    if (!kp) return null;
    const item = listKnowledgePoints("", profile).find((candidate) => candidate.value === kp);
    selection.knowledgePointId = kp;
    selection.knowledgePointLabel = item?.label || kp;
  } else {
    selection.scope = await textInput(ctx, "输入复习范围", args.trim()) || undefined;
    if (!selection.scope) return null;
  }

  const type = await selectItem(ctx, "选择题型", [
    { value: "", label: "自动选择", description: "根据知识点配置轮换题型。" },
    { value: "choice", label: "单项选择", description: "选项中选择一个答案。" },
    { value: "multi_choice", label: "多项选择", description: "可选择多个答案。" },
    { value: "judgment", label: "正误判断", description: "正确/错误二选一。" },
    { value: "short_answer", label: "简述题", description: "输入文字答案。" },
  ]);
  selection.questionType = type || undefined;
  const difficulty = await selectItem(ctx, "选择难度", [
    { value: "", label: "自动", description: "根据知识点基线和当前 session 表现选择。" },
    { value: "S-R", label: "S-R 记忆识别", description: "直接记忆或术语识别。" },
    { value: "S-U", label: "S-U 单概念理解", description: "理解并区分一个概念。" },
    { value: "M-U", label: "M-U 多概念理解", description: "比较或连接 2-3 个概念。" },
    { value: "M-A", label: "M-A 综合分析", description: "用多个概念分析场景。" },
    { value: "C-A", label: "C-A 复杂分析", description: "形成完整分析链。" },
  ]);
  if (difficulty == null) return null;
  selection.difficulty = DIFFICULTY_OPTIONS.includes(difficulty) && difficulty ? difficulty : undefined;
  return selection;
}

async function chooseEditableProfile(ctx: ExtensionContext): Promise<any | null> {
  const profiles = listEditableProfiles();
  if (profiles.length === 0) {
    ctx.ui.notify("No review profiles. Run /review-init first.", "warning");
    return null;
  }
  const id = await selectItem(ctx, "选择要修订的资料包", profiles.map((profile) => ({
    value: `${profile.subjectId}::${profile.slot || profile.status}`,
    label: profile.name || profile.subjectId,
    description: `${profile.subjectId} | ${profile.status}${profile.status === "active" ? "（将创建修订草稿）" : ""}`,
  })));
  if (!id) return null;
  const [subjectId, slot] = id.split("::");
  return slot === "draft" ? loadDraftProfile(subjectId) : loadProfile(subjectId);
}

function getProfileKnowledgePoints(profile: any): any[] {
  if (!profile?.knowledgeIndexPath || !existsSync(profile.knowledgeIndexPath)) return [];
  const index = JSON.parse(readFileSync(profile.knowledgeIndexPath, "utf-8"));
  const out: any[] = [];
  for (const [chapterId, chapter] of Object.entries<any>(index.chapters || {})) {
    for (const kp of chapter.knowledge_points || []) out.push({ ...kp, chapter: kp.chapter || chapterId });
  }
  return out;
}

function findKnowledgePoint(profile: any, id?: string, name?: string): any | null {
  const query = String(id || name || "").trim().toLowerCase();
  if (!query) return null;
  return getProfileKnowledgePoints(profile).find((kp) => {
    const values = [kp.id, kp.name, ...(Array.isArray(kp.aliases) ? kp.aliases : [])]
      .map((value) => String(value || "").trim().toLowerCase());
    return values.includes(query) || values.some((value) => value.includes(query) || query.includes(value));
  }) || null;
}

function renderCardLines(card: any, width: number, theme: any) {
  const lines = [];
  const position = card.position && card.total ? ` ${card.position}/${card.total}` : "";
  lines.push(theme.fg("accent", theme.bold(`概念卡片${position}: ${card.name || card.title || card.id || "未命名"}`)));
  const meta = [
    card.id ? `ID ${card.id}` : "",
    card.difficulty ? `难度 ${card.difficulty}` : "",
    card.chapter ? `章节 ${card.chapter}` : "",
    card.examLevel ? `重要性 ${card.examLevel}` : "",
    card.tags?.length ? `标签 ${card.tags.join("、")}` : "",
  ].filter(Boolean).join(" | ");
  if (meta) lines.push(theme.fg("muted", meta));
  if (card.path) lines.push(theme.fg("dim", card.path));
  lines.push("");

  const preferred = ["定义", "📖 定义", "关键要点", "🔑 关键要点", "代码示例", "推导", "常见误区", "⚠️ 常见误区", "关联"];
  const used = new Set();
  for (const key of preferred) {
    if (!card.sections?.[key]) continue;
    used.add(key);
    lines.push(theme.fg("accent", theme.bold(key.replace(/^[^\p{L}\p{N}]+/u, ""))));
    lines.push(...wrapPlainBlock(String(card.sections[key]), width));
    lines.push("");
  }

  if (!used.size) {
    lines.push(...wrapPlainBlock(String(card.raw || ""), width));
    lines.push("");
  }

  return lines.map((line) => truncateToWidth(line, width));
}

async function showReviewCard(ctx: ExtensionContext, card: any, kp: any): Promise<CardResult> {
  markCardSeen(kp?.id || "");
  if (!ctx.hasUI) return { action: "practice", knowledge_point_id: kp?.id || "", card_found: Boolean(card), path: card?.path, position: kp?.card_position, total: kp?.card_total };
  const cardResultBase = { knowledge_point_id: kp?.id || "", card_found: Boolean(card), path: card?.path, position: kp?.card_position, total: kp?.card_total };
  return await ctx.ui.custom<CardResult>((tui, theme, _kb, done) => {
    let closed = false;
    function finish(value: CardResult) {
      if (closed) return;
      closed = true;
      done(value);
    }

    let scroll = 0;
    let totalLines = 0;
    let lastWidth = 0;
    let wrappedLines: string[] = [];
    let renderCache: string[] | undefined;

    function ensureWrapped(width: number) {
      if (lastWidth === width && wrappedLines.length > 0) return;
      wrappedLines = card
        ? renderCardLines(card, width, theme)
        : [theme.fg("warning", `未找到卡片: ${kp?.name || kp?.id || "未知知识点"}`)];
      totalLines = wrappedLines.length;
      scroll = clampScroll(scroll, totalLines, REVIEW_PANEL_BODY_LINES);
      lastWidth = width;
      renderCache = undefined;
    }

    function resultFor(action: CardResult["action"]): CardResult {
      return { action, ...cardResultBase };
    }

    return {
      render(width: number) {
        if (closed) return [];
        ensureWrapped(width);
        if (renderCache) return renderCache;
        const windowed = renderWindowedLines(wrappedLines, scroll);
        const scrollHint = windowed.hasOverflow
          ? ` • J/K 滚动 ${scroll + 1}-${Math.min(scroll + REVIEW_PANEL_BODY_LINES, windowed.total)}/${windowed.total}`
          : "";
        renderCache = [
          theme.fg("accent", "─".repeat(width)),
          ...windowed.visible,
          theme.fg("dim", `Enter 出题 • N 下一张 • S 跳过 • Esc 退出${scrollHint}`),
          theme.fg("accent", "─".repeat(width)),
        ].map((line) => truncateToWidth(line, width));
        return renderCache;
      },
      invalidate() {
        renderCache = undefined;
      },
      handleInput(data: string) {
        if (closed) return;
        if (matchesKey(data, Key.escape)) {
          finish(resultFor("exit"));
          return;
        }
        const lower = data.toLowerCase();
        if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
          finish(resultFor("practice"));
          return;
        }
        if (lower === "n") {
          finish(resultFor("next_card"));
          return;
        }
        if (lower === "s") {
          finish(resultFor("skip"));
          return;
        }
        const prevScroll = scroll;
        if (isScrollUp(data)) {
          scroll = clampScroll(scroll - 1, totalLines || 1, REVIEW_PANEL_BODY_LINES);
        } else if (isScrollDown(data)) {
          scroll = clampScroll(scroll + 1, totalLines || 1, REVIEW_PANEL_BODY_LINES);
        }
        if (scroll !== prevScroll) {
          renderCache = undefined;
          tui.requestRender();
        }
      },
    };
  });
}

function renderMarkdownPanel(title: string, body: string, width: number, theme: any) {
  return [
    theme.fg("accent", theme.bold(title)),
    "",
    ...wrapPlainBlock(body || "", width),
  ].map((line) => truncateToWidth(line, width));
}

async function showMaterialPanel(ctx: ExtensionContext, title: string, body: string, path = ""): Promise<MaterialResult> {
  if (!ctx.hasUI) return { action: "practice", path, found: Boolean(body) };
  const panelFooter = "Enter 出题 • N 下一节 • S 跳过 • Esc 退出";
  return await ctx.ui.custom<MaterialResult>((tui, theme, _kb, done) => {
    let closed = false;
    function finish(value: MaterialResult) {
      if (closed) return;
      closed = true;
      done(value);
    }

    let scroll = 0;
    let totalLines = 0;
    let lastWidth = 0;
    let wrappedLines: string[] = [];
    let renderCache: string[] | undefined;

    function ensureWrapped(width: number) {
      if (lastWidth === width && wrappedLines.length > 0) return;
      wrappedLines = body
        ? renderMarkdownPanel(title, body, width, theme)
        : [theme.fg("warning", `${title}: 未找到内容`)];
      totalLines = wrappedLines.length;
      scroll = clampScroll(scroll, totalLines, REVIEW_PANEL_BODY_LINES);
      lastWidth = width;
      renderCache = undefined;
    }

    function resultFor(action: MaterialResult["action"]): MaterialResult {
      return { action, path, found: Boolean(body) };
    }

    return {
      render(width: number) {
        if (closed) return [];
        ensureWrapped(width);
        if (renderCache) return renderCache;
        const windowed = renderWindowedLines(wrappedLines, scroll);
        const scrollHint = windowed.hasOverflow
          ? ` • J/K 滚动 ${scroll + 1}-${Math.min(scroll + REVIEW_PANEL_BODY_LINES, windowed.total)}/${windowed.total}`
          : "";
        renderCache = [
          theme.fg("accent", "─".repeat(width)),
          ...windowed.visible,
          "",
          theme.fg("dim", `${panelFooter}${scrollHint}`),
          theme.fg("accent", "─".repeat(width)),
        ].map((line) => truncateToWidth(line, width));
        return renderCache;
      },
      invalidate() {
        renderCache = undefined;
      },
      handleInput(data: string) {
        if (closed) return;
        if (matchesKey(data, Key.escape)) {
          finish(resultFor("exit"));
          return;
        }
        const lower = data.toLowerCase();
        if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
          finish(resultFor("practice"));
          return;
        }
        if (lower === "n") {
          finish(resultFor("next_section"));
          return;
        }
        if (lower === "s") {
          finish(resultFor("skip"));
          return;
        }
        const prevScroll = scroll;
        if (isScrollUp(data)) {
          scroll = clampScroll(scroll - 1, totalLines || 1, REVIEW_PANEL_BODY_LINES);
        } else if (isScrollDown(data)) {
          scroll = clampScroll(scroll + 1, totalLines || 1, REVIEW_PANEL_BODY_LINES);
        }
        if (scroll !== prevScroll) {
          renderCache = undefined;
          tui.requestRender();
        }
      },
    };
  });
}

async function chooseTurnAction(ctx: ExtensionContext): Promise<TurnActionResult> {
  const value = await selectItem(ctx, "下一步", [
    { value: "next_question", label: "下一题", description: "继续当前范围。" },
    { value: "show_card", label: "看卡片", description: "查看当前知识点卡片。" },
    { value: "show_chapter", label: "看章节", description: "查看当前章节材料。" },
    { value: "summary", label: "总结", description: "生成会话总结。" },
    { value: "exit", label: "退出", description: "结束本次复习。" },
  ]);
  return { action: (value || "exit") as TurnActionResult["action"] };
}

function buildInitPrompt(profile: any, sourceFiles: Array<{ path: string; size: number }>) {
  return [
    "请先使用 /skill:review-core 理解复习助手主规则，再使用 /skill:review-init 初始化一个跨科目复习资料包 draft。",
    `subjectId: ${profile.subjectId}`,
    `科目名称: ${profile.name}`,
    `profile 根目录: ${profile.root}`,
    "",
    "只处理 Markdown / txt 源文件。请先使用 Read 工具阅读必要源文件，然后调用 review_profile_write 写入资料包文件。",
    "",
    "必须生成或更新这些文件:",
    "- subject.md",
    "- knowledge_index.json",
    "- cards/{知识点名}.md",
    "- chapters/{章节}/{小节}.md",
    "- exam_points/{章节}.md",
    "- source_map.json",
    "- quality_report.md",
    "",
    "knowledge_index.json 必须包含 chapters object。profile 保持 draft，不要启用，除非用户后续明确确认。",
    "",
    "可用源文件:",
    ...sourceFiles.map((file) => `- ${file.path} (${file.size} bytes)`),
  ].join("\n");
}

function buildFixPrompt(profile: any, feedback: string) {
  const revisionLine = profile.revisionOf
    ? `这是 ${profile.revisionOf} 的修订草稿。不要直接修改原 active 资料包。`
    : "";
  return [
    "请先使用 /skill:review-core 理解复习助手主规则，再使用 /skill:review-fix 修订一个跨科目复习资料包 draft。",
    `subjectId: ${profile.subjectId}`,
    `科目名称: ${profile.name}`,
    `profile 状态: ${profile.status}`,
    `profile 根目录: ${profile.root}`,
    revisionLine,
    "",
    "用户反馈:",
    feedback,
    "",
    "请读取 profile.json、subject.md、knowledge_index.json、source_map.json、quality_report.md 和相关资料文件。",
    "根据反馈调用 review_profile_write 修订 draft，并重写 quality_report.md。",
    "如果用户明确要求启用或确认可用，再调用 review_profile_enable；否则保持 draft。",
  ].join("\n");
}

async function answerQuestion(ctx: ExtensionContext, rawQuestion: unknown): Promise<AnswerResult | null> {
  const q = normalizeQuestion(rawQuestion);
  if (!ctx.hasUI) return { answer: "", action: "cancel" };
  const questionBody = [
    q.question_text,
    "",
    ...q.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`),
  ].join("\n");
  const viewed = await showScrollableTextPanel(ctx, "题目", questionBody, "Enter 作答 • Esc 取消");
  if (viewed === "exit") return { answer: "", action: "cancel" };

  if (q.type === "multi_choice") {
    const answer = await textInput(ctx, "输入多个选项字母，例如 AB 或 B,D。");
    if (!answer) return { answer: "", action: "cancel" };
    return { answer: parseChoiceAnswer(answer, q), action: "answer" };
  }

  if (q.type === "choice" || q.type === "judgment") {
    const options = q.options.map((option, index) => ({
      value: q.type === "judgment" ? option : String.fromCharCode(65 + index),
      label: q.type === "judgment" ? option : `${String.fromCharCode(65 + index)}. ${option}`,
      description: "",
    }));
    const headerLines = q.question_text.split("\n").slice(0, 3).filter(Boolean);
    const selected = await selectOptionWithHeader(ctx, "选择答案", headerLines, options);
    if (!selected) return { answer: "", action: "cancel" };
    return { answer: q.type === "choice" ? parseChoiceAnswer(selected, q) : selected, action: "answer" };
  }

  const answer = await textInput(ctx, "输入你的答案。也可以输入“提示”或“追问：...”让 agent 在判题前继续帮助你。");
  if (!answer) return { answer: "", action: "cancel" };
  if (/^提示$|^hint$/i.test(answer)) return { answer: "", action: "hint" };
  if (/^追问[:：]/.test(answer) || /^discuss[:：]/i.test(answer)) return { answer, action: "discuss" };
  return { answer, action: "answer" };
}

function buildArchive(params: any) {
  const q = params.question ? normalizeQuestion(params.question) : null;
  const questionId = q?.question_id || generateQuestionId();
  return {
    question_id: questionId,
    knowledge_points: params.knowledge_points || q?.knowledge_points || [],
    difficulty: params.difficulty || q?.difficulty || "S-U",
    type: params.type || q?.type || "choice",
    timestamp: timestampNow(),
    question_text: params.question_text || q?.question_text || "",
    options: q?.options || [],
    user_answer: params.user_answer,
    correct_answer: params.correct_answer || q?.correct_answer || params.grading || "",
    explanation_l1: params.explanation_l1 || q?.explanation_l1 || params.grading || "",
    source_basis: params.source_basis || q?.source_basis || "",
    is_correct: params.is_correct,
    discussion_summary: params.discussion_summary || {
      core_misconception: params.is_correct ? "无" : "需要复盘本题错误根因",
      clarified_points: [],
      user_self_correction: null,
      lingering_questions: [],
    },
    knowledge_chain_l3: params.knowledge_chain_l3 || q?.related_knowledge_chain || [],
    suggestion_next: params.suggestion_next || "继续按当前范围复习。",
  };
}

function createReviewAutocompleteProvider(current: AutocompleteProvider): AutocompleteProvider {
  return {
    async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
      const line = lines[cursorLine] ?? "";
      const before = line.slice(0, cursorCol);
      const match = before.match(/\/review\s+([^\s]*)$/);
      if (!match) return current.getSuggestions(lines, cursorLine, cursorCol, options);

      const query = match[1] || "";
      const active = listActiveProfiles()[0];
      const chapterItems = active ? listChapters(active).map((item) => ({
        value: item.value,
        label: item.label,
        description: item.description,
      })) : [];
      const kpItems = active ? listKnowledgePoints(query, active).slice(0, 20).map((item) => ({
        value: item.label,
        label: item.label,
        description: item.description,
      })) : [];
      return {
        items: [...chapterItems, ...kpItems].slice(0, 30),
        prefix: query,
      };
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}

export default function reviewExtension(pi: ExtensionAPI): void {
  const config = loadReviewConfig();
  const reviewCoreText = loadReviewCoreText();

  pi.registerCommand("review", {
    description: "Start the course review assistant",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Agent is busy. Start review after the current turn finishes.", "warning");
        return;
      }

      const selection = await chooseReviewSelection(ctx, args);
      if (!selection) {
        ctx.ui.notify("Review cancelled", "info");
        return;
      }

      const target = resolveReviewTarget(selection, selection.profile);
      initSession(target.scope, target.kpIds, {
        mode: selection.mode,
        profile_id: selection.profile?.subjectId || "",
        difficulty_policy: selection.difficulty || "auto",
        question_type_policy: selection.questionType || "auto",
      });
      const progress = loadProgress();
      const sid = progress.current_session?.session_id || "";
      const courseName = selection.profile?.name || config.courseName;
      ctx.ui.setStatus("review", ctx.ui.theme.fg("accent", `review:${courseName} ${sid.slice(0, 12)}`));

      const prompt = injectReviewCore(buildReviewStartPrompt(selection, { ...config, courseName }), reviewCoreText);
      pi.sendUserMessage(prompt);
    },
  });

  pi.registerCommand("review-init", {
    description: "Create a draft review profile from Markdown/text notes",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Agent is busy. Start init after the current turn finishes.", "warning");
        return;
      }
      const sourceDir = await textInput(ctx, "输入源资料文件夹", args.trim() || "../reference");
      if (!sourceDir) return;
      const subjectId = await textInput(ctx, "输入 subjectId（英文/数字/短横线）");
      if (!subjectId) return;
      const name = await textInput(ctx, "输入科目名称", subjectId);
      if (!name) return;

      const profile = createDraftProfile({ subjectId, name, sourceDir });
      let sourceFiles: Array<{ path: string; size: number }> = [];
      try {
        sourceFiles = scanSourceFiles(sourceDir, 120);
      } catch (err: any) {
        ctx.ui.notify(err.message || String(err), "error");
        return;
      }
      ctx.ui.notify(`Draft profile created: ${profile.subjectId}`, "info");
      pi.sendUserMessage(injectReviewCore(buildInitPrompt(profile, sourceFiles), reviewCoreText));
    },
  });

  pi.registerCommand("review-fix", {
    description: "Revise a draft profile, or create a safe revision draft from an active profile",
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Agent is busy. Start fix after the current turn finishes.", "warning");
        return;
      }
      let profile = await chooseEditableProfile(ctx);
      if (!profile) return;
      const feedback = await textInput(ctx, "输入修订反馈（如：第2章切太碎了；确认启用）");
      if (!feedback) return;
      if (profile.status === "active") {
        try {
          profile = createRevisionDraft(profile.subjectId, feedback);
        } catch (err: any) {
          ctx.ui.notify(`Failed to create revision draft: ${err?.message || String(err)}`, "error");
          return;
        }
        ctx.ui.notify(`Created revision draft: ${profile.subjectId}`, "info");
      }
      pi.sendUserMessage(injectReviewCore(buildFixPrompt(profile, feedback), reviewCoreText));
    },
  });

  pi.registerTool({
    name: "review_card",
    label: "Review Card",
    description: "Render a concept card from the selected review profile before card-practice questions.",
    parameters: CardSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const profile = loadProfile(params.subject_id);
      if (!profile) {
        return {
          content: [{ type: "text", text: `Profile not found: ${params.subject_id}` }],
          details: { action: "skip", knowledge_point_id: params.knowledge_point_id || "", card_found: false },
        };
      }
      const kp = findKnowledgePoint(profile, params.knowledge_point_id, params.knowledge_point_name);
      if (!kp) {
        return {
          content: [{ type: "text", text: `Knowledge point not found: ${params.knowledge_point_id || params.knowledge_point_name || ""}` }],
          details: { action: "skip", knowledge_point_id: params.knowledge_point_id || "", card_found: false },
        };
      }
      const queue = buildCardQueue(profile, getProfileKnowledgePoints(profile));
      const queued = queue.find((item) => item.id === kp.id) || { ...kp, card_position: 1, card_total: 1 };
      const card = loadProfileCard(profile, queued);
      const result = await showReviewCard(ctx, card, queued);
      if (!card) {
        result.path = `${profile.cardsDir}/${queued.id || queued.name}.md`;
      }
      const cardActionText: Record<string, string> = {
        practice: "User chose to practice this card. Generate one question and call review_answer.",
        next_card: "User chose next card. Select the next related knowledge point and call review_card again. Do NOT generate a question yet.",
        skip: "User skipped this card. Choose another target or ask the user what to do next.",
        exit: "User exited card review. Ask whether to generate a session summary or stop.",
      };
      return {
        content: [{ type: "text", text: `review_card: ${cardActionText[result.action] || result.action}` }],
        details: result,
      };
    },
    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("review_card ")) + theme.fg("muted", args.knowledge_point_id || args.knowledge_point_name || ""), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as CardResult | undefined;
      return new Text(theme.fg(details?.card_found ? "success" : "warning", `card ${details?.action || "handled"}`), 0, 0);
    },
  });

  pi.registerTool({
    name: "review_exam_points",
    label: "Review Exam Points",
    description: "Render chapter exam-point summaries before direct practice questions.",
    parameters: MaterialSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const profile = loadProfile(params.subject_id);
      if (!profile) {
        return {
          content: [{ type: "text", text: `Profile not found: ${params.subject_id}` }],
          details: { action: "skip", found: false },
        };
      }
      const docs = loadExamPoints(profile, params.chapter_id || "");
      const body = docs?.map((doc: any) => doc.content).join("\n\n---\n\n") || "";
      const path = docs?.map((doc: any) => doc.path).join("; ");
      const result = await showMaterialPanel(ctx, `考点总结 ${params.chapter_id || ""}`.trim(), body, path);
      const examPointsActionText: Record<string, string> = {
        practice: "User viewed exam points and chose to practice. Generate a question and call review_answer.",
        skip: "User skipped exam points. Choose another target or ask the user.",
        exit: "User exited. Ask whether to generate a session summary or stop.",
      };
      return {
        content: [{ type: "text", text: `review_exam_points: ${examPointsActionText[result.action] || result.action}` }],
        details: result,
      };
    },
    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("review_exam_points ")) + theme.fg("muted", `${args.subject_id || ""} ${args.chapter_id || ""}`), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as MaterialResult | undefined;
      return new Text(theme.fg(details?.found ? "success" : "warning", `exam points ${details?.action || "handled"}`), 0, 0);
    },
  });

  pi.registerTool({
    name: "review_chapter",
    label: "Review Chapter",
    description: "Render normalized chapter or section notes before chapter-study questions.",
    parameters: MaterialSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const profile = loadProfile(params.subject_id);
      if (!profile) {
        return {
          content: [{ type: "text", text: `Profile not found: ${params.subject_id}` }],
          details: { action: "skip", found: false },
        };
      }
      const sections = listChapterMaterials(profile, params.chapter_id || "");
      const selectedPath = params.section_path || (sections.length > 1 && ctx.hasUI
        ? await selectItem(ctx, "选择章节小节", [
            { value: "", label: "按顺序学习", description: "从第一小节开始。" },
            ...sections.map((section: any) => ({
              value: section.path,
              label: section.title,
              description: section.path,
            })),
          ])
        : "");
      const material = loadChapterMaterial(profile, { chapterId: params.chapter_id || "", sectionPath: selectedPath || "" });
      const result = await showMaterialPanel(ctx, material?.title || `章节材料 ${params.chapter_id || ""}`.trim(), material?.content || "", material?.path);
      const chapterActionText: Record<string, string> = {
        practice: "User viewed chapter material and chose to practice. Generate a question and call review_answer.",
        next_section: "User chose next section. Select the next section and call review_chapter again. Do NOT generate a question yet.",
        skip: "User skipped this section. Choose another target or ask the user.",
        exit: "User exited chapter study. Ask whether to generate a session summary or stop.",
      };
      return {
        content: [{ type: "text", text: `review_chapter: ${chapterActionText[result.action] || result.action}` }],
        details: result,
      };
    },
    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("review_chapter ")) + theme.fg("muted", `${args.subject_id || ""} ${args.chapter_id || ""}`), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as MaterialResult | undefined;
      return new Text(theme.fg(details?.found ? "success" : "warning", `chapter ${details?.action || "handled"}`), 0, 0);
    },
  });

  pi.registerTool({
    name: "review_turn_action",
    label: "Review Turn Action",
    description: "Show a unified post-question action menu for all review modes.",
    parameters: TurnActionSchema,
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const result = await chooseTurnAction(ctx);
      return {
        content: [{ type: "text", text: `review_turn_action action=${result.action}` }],
        details: result,
      };
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("review_turn_action")), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as TurnActionResult | undefined;
      return new Text(theme.fg("success", `next action: ${details?.action || "exit"}`), 0, 0);
    },
  });

  pi.registerTool({
    name: "review_answer",
    label: "Review Answer",
    description: "Render a structured review question in the TUI and collect the user's answer.",
    parameters: Type.Object({ question: QuestionSchema }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await answerQuestion(ctx, params.question);
      if (!result || result.action === "cancel") {
        return {
          content: [{ type: "text", text: "User cancelled the question." }],
          details: { answer: "", action: "cancel" },
        };
      }
      if (result.action !== "answer") {
        return {
          content: [{ type: "text", text: `User requested ${result.action}: ${result.answer}` }],
          details: result,
        };
      }
      return {
        content: [{ type: "text", text: `User answer: ${result.answer}` }],
        details: result,
      };
    },
    renderCall(args, theme) {
      const question = args.question || {};
      const meta = [
        question.type || "question",
        question.difficulty,
        Array.isArray(question.knowledge_points) && question.knowledge_points.length
          ? `kp:${question.knowledge_points.slice(0, 3).join(",")}`
          : "",
      ].filter(Boolean).join(" ");
      const summary = compactInlineText(question.question_text || "Review question", 64);
      return new Text(
        theme.fg("toolTitle", theme.bold("review_answer ")) + theme.fg("muted", `${meta} ${summary}`.trim()),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as AnswerResult | undefined;
      return new Text(theme.fg("success", `answer: ${details?.answer || "(cancelled)"}`), 0, 0);
    },
  });

  pi.registerTool({
    name: "review_archive",
    label: "Review Archive",
    description: "Archive a graded review question and update progress, wrong-book, and knowledge-chain state.",
    parameters: ArchiveSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const progress = loadProgress();
      if (!progress.current_session) {
        const q = params.question ? normalizeQuestion(params.question) : null;
        initSession("adhoc-review", q?.knowledge_points || []);
      }
      const archive = buildArchive(params);
      const sid = loadProgress().current_session?.session_id || `s_${Date.now()}`;
      writeArchiveFiles(archive, archive.question_id, sid);
      updateStateFromArchive(archive);
      updateSession({ last_action: "archived" });
      return {
        content: [{ type: "text", text: `Archived ${archive.question_id} in ${sid}` }],
        details: archive,
      };
    },
    renderCall(args, theme) {
      const label = args.question?.question_text || args.question_text || "archive review question";
      return new Text(theme.fg("toolTitle", theme.bold("review_archive ")) + theme.fg("muted", label), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as { question_id?: string } | undefined;
      return new Text(theme.fg("success", `archived ${details?.question_id || ""}`), 0, 0);
    },
  });

  pi.registerTool({
    name: "review_summary",
    label: "Review Summary",
    description: "Save the final review session summary report to the selected profile's private _user/summaries directory.",
    parameters: SummarySchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const progress = loadProgress();
      const active = progress.current_session;
      const sessionId = params.session_id || active?.session_id || `s_${Date.now()}`;
      const subjectId = params.subject_id || active?.profile_id || "default";
      const summaryProfile = subjectId ? loadProfile(subjectId) : null;
      const profileRoot = summaryProfile?.familyRoot || summaryProfile?.root;
      const path = writeSummaryFile(sessionId, params.report, {
        subject_id: subjectId,
        profile_id: subjectId,
        profileRoot,
        scope: params.scope || active?.scope,
        total_questions: params.total_questions ?? active?.total_questions,
        correct: params.correct ?? active?.correct,
        incorrect: params.incorrect ?? active?.incorrect,
      });
      updateLearningProfileFromSummary(subjectId, {
        session_id: sessionId,
        report: params.report,
        scope: params.scope || active?.scope,
        total_questions: params.total_questions ?? active?.total_questions,
        correct: params.correct ?? active?.correct,
        incorrect: params.incorrect ?? active?.incorrect,
        summary_path: profileRoot ? relative(profileRoot, path).replace(/\\/g, "/") : path,
      }, { profileRoot });
      updateSession({ last_action: "summary_saved", summary_path: path });
      if (params.end_session && active?.session_id === sessionId) {
        endSession();
      }
      return {
        content: [{ type: "text", text: `Saved review summary: ${path}` }],
        details: { path, session_id: sessionId },
      };
    },
    renderCall(args, theme) {
      const label = args.scope || args.session_id || "review summary";
      return new Text(theme.fg("toolTitle", theme.bold("review_summary ")) + theme.fg("muted", label), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as { path?: string } | undefined;
      return new Text(theme.fg("success", `summary saved ${details?.path || ""}`), 0, 0);
    },
  });

  pi.registerTool({
    name: "review_profile_write",
    label: "Review Profile Write",
    description: "Safely write a file inside a draft review profile directory.",
    parameters: ProfileWriteSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const profile = loadDraftProfile(params.subject_id) || loadProfile(params.subject_id);
      if (!profile) return { content: [{ type: "text", text: `Profile not found: ${params.subject_id}` }] };
      if (profile.status !== "draft" || profile.slot !== "draft") {
        return { content: [{ type: "text", text: `Refusing to write non-draft profile: ${params.subject_id}` }] };
      }
      const path = writeProfileFile(params.subject_id, params.path, params.content);
      return {
        content: [{ type: "text", text: `Wrote profile file: ${path}` }],
        details: { path, subject_id: params.subject_id },
      };
    },
    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("review_profile_write ")) + theme.fg("muted", `${args.subject_id}/${args.path}`), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as { path?: string } | undefined;
      return new Text(theme.fg("success", `profile file ${details?.path || "handled"}`), 0, 0);
    },
  });

  pi.registerTool({
    name: "review_profile_enable",
    label: "Review Profile Enable",
    description: "Enable a reviewed draft profile so /review can use it.",
    parameters: ProfileEnableSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const profile = enableProfile(params.subject_id);
      return {
        content: [{ type: "text", text: `Enabled review profile: ${profile.subjectId}` }],
        details: { subject_id: profile.subjectId, status: profile.status },
      };
    },
    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("review_profile_enable ")) + theme.fg("muted", args.subject_id), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as { subject_id?: string } | undefined;
      return new Text(theme.fg("success", `enabled ${details?.subject_id || ""}`), 0, 0);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.addAutocompleteProvider((current) => createReviewAutocompleteProvider(current));
    ctx.ui.setStatus("review", undefined);
  });

  pi.on("turn_start", async () => {
    const session = loadProgress().current_session;
    if (session) {
      pi.appendEntry("review-state", {
        course: config.courseName,
        session_id: session.session_id,
        scope: session.scope,
        total_questions: session.total_questions || 0,
        correct: session.correct || 0,
      });
    }
  });
}
