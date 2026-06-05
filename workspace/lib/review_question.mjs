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

export function buildQuestionPrompt({ mode, scope, chapter, knowledgePoint, difficulty, questionType, courseName }) {
  const typeLine = questionType ? `题型: ${questionType}` : "题型: 根据知识点选择 judgment/choice/multi_choice/short_answer";
  return [
    `请作为 ${courseName} 复习助手开始一次结构化复习回合。`,
    `模式: ${mode}`,
    scope ? `范围: ${scope}` : "",
    chapter ? `章节: ${chapter}` : "",
    knowledgePoint ? `知识点: ${knowledgePoint}` : "",
    `难度: ${difficulty || "S-U"}`,
    typeLine,
    "",
    "流程要求:",
    "1. 先使用 Read 工具读取相关参考资料或历史归档。",
    "2. 生成一道题，并只用 JSON 表示题目对象，字段必须包含 type/question_text/options/correct_answer/knowledge_points/difficulty/explanation_l1。",
    "3. 调用 review_answer 工具展示题目并收集用户答案。",
    "4. 使用 review-grade 的规则判题，输出 Level 1 解析。",
    "5. 讨论完成后调用 review_archive 工具保存结构化复盘。",
    "6. 询问用户是否继续下一题、提高难度、总结或退出。",
  ].filter(Boolean).join("\n");
}
