import { loadKnowledgeIndex, getKpIdsForScope, selectDifficulty, selectQuestionType, loadProgress } from "./state.mjs";
import { getChapterSections } from "./chapters.mjs";
import { buildQuestionPrompt } from "./review_question.mjs";

export const REVIEW_MODES = [
  {
    value: "card_practice",
    label: "概念卡片 + 练习",
    description: "先复习概念卡片，再进入同一套答题流程。",
  },
  {
    value: "practice",
    label: "直接练习",
    description: "按章节、知识点或关键词直接出题。",
  },
  {
    value: "chapter_study",
    label: "章节笔记学习",
    description: "按章节笔记逐小节学习并出题。",
  },
];

export const POST_TURN_ACTIONS = [
  { value: "next", label: "下一题", description: "继续当前范围。" },
  { value: "skip", label: "跳过", description: "不归档当前题，继续下一个知识点。" },
  { value: "hint", label: "提示", description: "让 agent 给出方向，不直接公布答案。" },
  { value: "harder", label: "提高难度", description: "下一题提升一个难度等级。" },
  { value: "summary", label: "总结", description: "生成本次复习总结。" },
  { value: "exit", label: "退出", description: "结束当前复习。" },
];

export function listChapters() {
  const index = loadKnowledgeIndex();
  return Object.entries(index.chapters || {}).map(([id, ch]) => ({
    value: id,
    label: `第 ${id} 章 ${ch.title || ""}`.trim(),
    description: `${(ch.knowledge_points || []).length} 个知识点`,
  }));
}

export function listKnowledgePoints(scope = "") {
  const index = loadKnowledgeIndex();
  const ids = scope ? new Set(getKpIdsForScope(scope)) : null;
  const items = [];
  for (const [chapterId, chapter] of Object.entries(index.chapters || {})) {
    for (const kp of chapter.knowledge_points || []) {
      if (ids && !ids.has(kp.id)) continue;
      items.push({
        value: kp.id,
        label: kp.name,
        description: `第 ${chapterId} 章 ${chapter.title || ""} | ${kp.id}`,
      });
    }
  }
  return items;
}

export function resolveReviewTarget({ mode, scope, chapterId, knowledgePointId }) {
  if (knowledgePointId) {
    const kp = listKnowledgePoints().find((item) => item.value === knowledgePointId);
    return { scope: kp?.label || knowledgePointId, kpIds: [knowledgePointId], chapter: chapterId || "" };
  }
  if (chapterId) {
    const sections = getChapterSections(chapterId);
    return {
      scope: `第${chapterId}章`,
      kpIds: getKpIdsForScope(chapterId),
      chapter: chapterId,
      sections,
    };
  }
  const resolvedScope = scope?.trim() || "全书";
  return {
    scope: resolvedScope,
    kpIds: getKpIdsForScope(resolvedScope),
    chapter: "",
    sections: mode === "chapter_study" ? getChapterSections(resolvedScope) : [],
  };
}

export function buildReviewStartPrompt(selection, config) {
  const target = resolveReviewTarget(selection);
  const progress = loadProgress();
  const session = progress.current_session || {};
  const difficulty = selection.difficulty || selectDifficulty({ difficulty_baseline: config.defaultDifficulty }, session);
  const qType = selection.questionType || selectQuestionType({ question_types: ["choice", "judgment", "short_answer"] });

  return buildQuestionPrompt({
    mode: selection.mode,
    scope: target.scope,
    chapter: target.chapter,
    knowledgePoint: selection.knowledgePointLabel || "",
    difficulty,
    questionType: qType,
    courseName: config.courseName,
  });
}
