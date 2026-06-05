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
  createDraftProfile,
  enableProfile,
  listActiveProfiles,
  listDraftProfiles,
  loadProfile,
  scanSourceFiles,
  writeProfileFile,
} from "../../../workspace/lib/review_profiles.mjs";
import {
  generateQuestionId,
  initSession,
  endSession,
  loadProgress,
  timestampNow,
  updateSession,
  writeArchiveFiles,
  writeSummaryFile,
  updateStateFromArchive,
} from "../../../workspace/lib/state.mjs";

type ReviewSelection = {
  mode: string;
  profile?: any;
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

const SummarySchema = Type.Object({
  session_id: Type.Optional(Type.String()),
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

  const mode = await selectItem(ctx, "选择复习模式", REVIEW_MODES);
  if (!mode) return null;

  const targetKind = await selectItem(ctx, "选择范围来源", [
    { value: "chapter", label: "章节", description: "按课程章节选择。" },
    { value: "knowledge", label: "知识点", description: "按知识点精确练习。" },
    { value: "scope", label: "文本范围", description: "输入章节号、关键词或范围描述。" },
  ]);
  if (!targetKind) return null;

  const selection: ReviewSelection = { mode, profile };
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
  return selection;
}

async function chooseDraftProfile(ctx: ExtensionContext): Promise<any | null> {
  const drafts = listDraftProfiles();
  if (drafts.length === 0) {
    ctx.ui.notify("No draft review profiles. Run /review-init first.", "warning");
    return null;
  }
  const id = await selectItem(ctx, "选择要修订的 draft", drafts.map((profile) => ({
    value: profile.subjectId,
    label: profile.name || profile.subjectId,
    description: profile.subjectId,
  })));
  return id ? loadProfile(id) : null;
}

function buildInitPrompt(profile: any, sourceFiles: Array<{ path: string; size: number }>) {
  return [
    "请初始化一个跨科目复习资料包 draft。",
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
  return [
    "请修订一个跨科目复习资料包 draft。",
    `subjectId: ${profile.subjectId}`,
    `科目名称: ${profile.name}`,
    `profile 根目录: ${profile.root}`,
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
      initSession(target.scope, target.kpIds);
      const progress = loadProgress();
      const sid = progress.current_session?.session_id || "";
      const courseName = selection.profile?.name || config.courseName;
      ctx.ui.setStatus("review", ctx.ui.theme.fg("accent", `review:${courseName} ${sid.slice(0, 12)}`));

      const prompt = buildReviewStartPrompt(selection, { ...config, courseName });
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
      const sourceDir = await textInput(ctx, "输入源资料文件夹", args.trim() || "reference");
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
      pi.sendUserMessage(buildInitPrompt(profile, sourceFiles));
    },
  });

  pi.registerCommand("review-fix", {
    description: "Revise a draft review profile with natural-language feedback",
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Agent is busy. Start fix after the current turn finishes.", "warning");
        return;
      }
      const profile = await chooseDraftProfile(ctx);
      if (!profile) return;
      const feedback = await textInput(ctx, "输入修订反馈（如：第2章切太碎了；确认启用）");
      if (!feedback) return;
      pi.sendUserMessage(buildFixPrompt(profile, feedback));
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

  pi.registerTool({
    name: "review_summary",
    label: "Review Summary",
    description: "Save the final review session summary report to workspace/archive/summaries.",
    parameters: SummarySchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const progress = loadProgress();
      const active = progress.current_session;
      const sessionId = params.session_id || active?.session_id || `s_${Date.now()}`;
      const path = writeSummaryFile(sessionId, params.report, {
        scope: params.scope || active?.scope,
        total_questions: params.total_questions ?? active?.total_questions,
        correct: params.correct ?? active?.correct,
        incorrect: params.incorrect ?? active?.incorrect,
      });
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
      const profile = loadProfile(params.subject_id);
      if (!profile) return { content: [{ type: "text", text: `Profile not found: ${params.subject_id}` }] };
      if (profile.status !== "draft") {
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
