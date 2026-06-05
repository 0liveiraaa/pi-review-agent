import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
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
} from "../../../workspace/lib/review_engine.mjs";
import { loadReviewConfig } from "../../../workspace/lib/review_config.mjs";
import { normalizeQuestion, parseChoiceAnswer } from "../../../workspace/lib/review_question.mjs";
import {
  generateQuestionId,
  initSession,
  loadProgress,
  timestampNow,
  updateSession,
  writeArchiveFiles,
  updateStateFromArchive,
} from "../../../workspace/lib/state.mjs";

type ReviewSelection = {
  mode: string;
  scope?: string;
  chapterId?: string;
  knowledgePointId?: string;
  knowledgePointLabel?: string;
  difficulty?: string;
  questionType?: string;
};

type AnswerResult = {
  answer: string;
  action: string;
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
  knowledge_points: Type.Optional(Type.Array(Type.String())),
  difficulty: Type.Optional(Type.String()),
  type: Type.Optional(Type.String()),
  discussion_summary: Type.Optional(Type.Any()),
  knowledge_chain_l3: Type.Optional(Type.Array(Type.String())),
  suggestion_next: Type.Optional(Type.String()),
});

async function selectItem(ctx: ExtensionContext, title: string, items: SelectItem[]): Promise<string | null> {
  if (!ctx.hasUI) return items[0]?.value ?? null;
  if (items.length === 0) return null;

  return await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
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
    list.onSelect = (item) => done(item.value);
    list.onCancel = () => done(null);
    container.addChild(list);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel")));
    container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        list.handleInput(data);
        tui.requestRender();
      },
    };
  });
}

async function textInput(ctx: ExtensionContext, title: string, initial = ""): Promise<string | null> {
  if (!ctx.hasUI) return initial || null;
  return await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
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
    editor.onSubmit = (value) => done(value.trim() || null);
    let cache: string[] | undefined;

    return {
      render(width: number) {
        if (cache) return cache;
        cache = [
          theme.fg("accent", "─".repeat(width)),
          theme.fg("accent", theme.bold(title)),
          "",
          ...editor.render(width),
          "",
          theme.fg("dim", "Enter submit • Esc cancel"),
          theme.fg("accent", "─".repeat(width)),
        ].map((line) => truncateToWidth(line, width));
        return cache;
      },
      invalidate() {
        cache = undefined;
      },
      handleInput(data: string) {
        if (matchesKey(data, Key.escape)) {
          done(null);
          return;
        }
        editor.handleInput(data);
        cache = undefined;
        tui.requestRender();
      },
    };
  });
}

async function chooseReviewSelection(ctx: ExtensionContext, args: string): Promise<ReviewSelection | null> {
  const mode = await selectItem(ctx, "选择复习模式", REVIEW_MODES);
  if (!mode) return null;

  const targetKind = await selectItem(ctx, "选择范围来源", [
    { value: "chapter", label: "章节", description: "按课程章节选择。" },
    { value: "knowledge", label: "知识点", description: "按知识点精确练习。" },
    { value: "scope", label: "文本范围", description: "输入章节号、关键词或范围描述。" },
  ]);
  if (!targetKind) return null;

  const selection: ReviewSelection = { mode };
  if (targetKind === "chapter") {
    selection.chapterId = await selectItem(ctx, "选择章节", listChapters()) || undefined;
    if (!selection.chapterId) return null;
  } else if (targetKind === "knowledge") {
    const kp = await selectItem(ctx, "选择知识点", listKnowledgePoints(args).slice(0, 200));
    if (!kp) return null;
    const item = listKnowledgePoints().find((candidate) => candidate.value === kp);
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
  return selection;
}

async function answerQuestion(ctx: ExtensionContext, rawQuestion: unknown): Promise<AnswerResult | null> {
  const q = normalizeQuestion(rawQuestion);
  if (!ctx.hasUI) return { answer: "", action: "cancel" };

  if (q.type === "multi_choice") {
    const prompt = [
      q.question_text,
      "",
      ...q.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`),
      "",
      "输入多个选项字母，例如 AB 或 B,D。",
    ].join("\n");
    const answer = await textInput(ctx, prompt);
    if (!answer) return { answer: "", action: "cancel" };
    return { answer: parseChoiceAnswer(answer, q), action: "answer" };
  }

  if (q.type === "choice" || q.type === "judgment") {
    const options = q.options.map((option, index) => ({
      value: q.type === "judgment" ? option : String.fromCharCode(65 + index),
      label: q.type === "judgment" ? option : `${String.fromCharCode(65 + index)}. ${option}`,
      description: "",
    }));
    const selected = await selectItem(ctx, q.question_text, options);
    if (!selected) return { answer: "", action: "cancel" };
    return { answer: q.type === "choice" ? parseChoiceAnswer(selected, q) : selected, action: "answer" };
  }

  const answer = await textInput(ctx, q.question_text);
  if (!answer) return { answer: "", action: "cancel" };
  return { answer, action: "answer" };
}

function buildArchive(params: any) {
  const q = params.question ? normalizeQuestion(params.question) : null;
  const questionId = q?.question_id || generateQuestionId();
  const archive = {
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
  return archive;
}

function createReviewAutocompleteProvider(current: AutocompleteProvider): AutocompleteProvider {
  return {
    async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
      const line = lines[cursorLine] ?? "";
      const before = line.slice(0, cursorCol);
      const match = before.match(/\/review\s+([^\s]*)$/);
      if (!match) return current.getSuggestions(lines, cursorLine, cursorCol, options);

      const query = match[1] || "";
      const chapterItems = listChapters().map((item) => ({
        value: item.value,
        label: item.label,
        description: item.description,
      }));
      const kpItems = listKnowledgePoints(query).slice(0, 20).map((item) => ({
        value: item.label,
        label: item.label,
        description: item.description,
      }));
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

      const target = resolveReviewTarget(selection);
      initSession(target.scope, target.kpIds);
      const progress = loadProgress();
      const sid = progress.current_session?.session_id || "";
      ctx.ui.setStatus("review", ctx.ui.theme.fg("accent", `review:${config.courseName} ${sid.slice(0, 12)}`));

      const prompt = buildReviewStartPrompt(selection, config);
      pi.sendUserMessage(prompt);
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
      return {
        content: [{ type: "text", text: `User answer: ${result.answer}` }],
        details: result,
      };
    },
    renderCall(args, theme) {
      const q = args.question?.question_text || "Review question";
      return new Text(theme.fg("toolTitle", theme.bold("review_answer ")) + theme.fg("muted", q), 0, 0);
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
