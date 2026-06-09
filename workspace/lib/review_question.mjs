export const QUESTION_TYPES = ["judgment", "choice", "multi_choice", "short_answer"];
export const DIFFICULTIES = ["S-R", "S-U", "M-U", "M-A", "C-A"];

export function extractJsonObject(text) {
  if (!text) return null;
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function normalizeQuestion(input) {
  const q = typeof input === "string" ? extractJsonObject(input) : input;
  if (!q || typeof q !== "object") {
    throw new Error("Question must be a JSON object.");
  }

  const type = q.type === "multi-choice" ? "multi_choice" : q.type;
  if (!QUESTION_TYPES.includes(type)) {
    throw new Error(`Unsupported question type: ${q.type}`);
  }

  const options = Array.isArray(q.options) ? q.options.map(String).filter(Boolean) : [];
  if ((type === "choice" || type === "multi_choice") && options.length < 2) {
    throw new Error(`${type} requires at least two options.`);
  }
  if (type === "judgment" && options.length === 0) {
    options.push("正确", "错误");
  }

  const difficulty = DIFFICULTIES.includes(q.difficulty) ? q.difficulty : "S-U";
  return {
    question_id: String(q.question_id || ""),
    knowledge_points: Array.isArray(q.knowledge_points) ? q.knowledge_points.map(String) : [],
    difficulty,
    type,
    question_text: String(q.question_text || q.question || ""),
    options,
    correct_answer: q.correct_answer == null ? "" : String(q.correct_answer),
    explanation_l1: String(q.explanation_l1 || ""),
    source_basis: String(q.source_basis || ""),
    related_knowledge_chain: Array.isArray(q.related_knowledge_chain)
      ? q.related_knowledge_chain.map(String)
      : [],
  };
}

export function parseChoiceAnswer(raw, question) {
  const text = String(raw || "").trim();
  if (!text) return "";
  if (question.type !== "choice" && question.type !== "multi_choice") return text;

  const max = question.options.length;
  const letters = text
    .toUpperCase()
    .replace(/[\s,，、;；]/g, "")
    .split("")
    .filter((c) => c >= "A" && c <= "Z")
    .filter((c) => c.charCodeAt(0) - 64 <= max);
  return [...new Set(letters)].join("");
}

export function buildQuestionPrompt({
  mode,
  scope,
  chapter,
  knowledgePoint,
  difficulty,
  difficultyPolicy,
  questionType,
  learningProfile,
  courseName,
  subjectPath,
  knowledgeIndexPath,
  cardsDir,
  chaptersDir,
  examPointsDir,
}) {
  const typeLine = questionType ? `题型: ${questionType}` : "题型: 根据知识点选择 judgment/choice/multi_choice/short_answer";
  const cardPracticeLines = mode === "card_practice"
    ? [
        "模式 1 强制要求:",
        "1. 出题前必须先调用 review_card 工具展示当前知识点卡片。",
        "2. 只有 review_card 返回 action=\"practice\" 后，才生成题目并调用 review_answer。",
        "3. 如果 review_card 返回 next_card/skip/exit，按返回动作处理，不要直接出题。",
        "",
      ]
    : [];
  const practiceLines = mode === "practice"
    ? [
        "模式 2 强制要求:",
        "1. 如果本次范围包含章节，出题前先调用 review_exam_points 展示考点总结。",
        "2. review_exam_points 返回 action=\"practice\" 后，才生成题目并调用 review_answer。",
        "3. 直接练习模式不要主动展示卡片，除非用户在题后动作里选择看卡片。",
        "",
      ]
    : [];
  const chapterStudyLines = mode === "chapter_study"
    ? [
        "模式 3 强制要求:",
        "1. 出题前必须先调用 review_chapter 展示当前章节或小节材料。",
        "2. 只有 review_chapter 返回 action=\"practice\" 后，才生成题目并调用 review_answer。",
        "3. 如果 review_chapter 返回 next_section/skip/exit，按返回动作处理，不要直接出题。",
        "",
      ]
    : [];
  return [
    "请先使用 /skill:review-core 读取复习助手主规则。",
    "本回合通常需要按阶段参考 /skill:review-question、/skill:review-grade、/skill:review-discuss、/skill:review-summary。",
    "",
    `请作为 ${courseName} 复习助手开始一次结构化复习回合。`,
    `模式: ${mode}`,
    scope ? `范围: ${scope}` : "",
    chapter ? `章节: ${chapter}` : "",
    knowledgePoint ? `知识点: ${knowledgePoint}` : "",
    `难度: ${difficulty || "S-U"}`,
    difficultyPolicy ? `难度策略: ${difficultyPolicy === "auto" ? "自动" : "手动"}` : "",
    typeLine,
    "",
    "学习者画像:",
    learningProfile || "暂无该科目的历史学习画像。请按当前资料和用户选择开始，不要臆造历史薄弱点。",
    "",
    "当前科目资料包:",
    subjectPath ? `- 科目元描述: ${subjectPath}` : "",
    knowledgeIndexPath ? `- 知识点索引: ${knowledgeIndexPath}` : "",
    cardsDir ? `- 概念卡片目录: ${cardsDir}` : "",
    chaptersDir ? `- 章节材料目录: ${chaptersDir}` : "",
    examPointsDir ? `- 考点总结目录: ${examPointsDir}` : "",
    "",
    ...cardPracticeLines,
    ...practiceLines,
    ...chapterStudyLines,
    "流程要求:",
    "1. 先使用 Read 工具读取科目元描述和相关参考资料或历史归档。",
    "2. 生成一道题，并把结构化 Question JSON 直接作为 review_answer 工具参数；不要先在主对话区可见输出完整题目 JSON 或长题干。",
    "3. Question JSON 字段必须包含 type/question_text/options/correct_answer/knowledge_points/difficulty/explanation_l1/source_basis。",
    "4. 调用 review_answer 工具展示题目并收集用户答案；如果用户在答题中请求提示或追问，先回应其请求，不要直接判题。",
    "5. 使用 review-grade 的规则判题，输出 Level 1 解析。",
    "6. 讨论完成后调用 review_archive 工具保存结构化复盘。",
    "7. review_archive 完成后必须调用 review_turn_action 工具，获取下一步续航动作。",
    "8. 如果用户要求总结或结束本次复习，必须调用 review_summary 工具保存会话总结报告。",
  ].filter(Boolean).join("\n");
}
