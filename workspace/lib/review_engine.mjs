import { readFileSync } from "node:fs";
import { loadKnowledgeIndex, getKpIdsForScope, selectDifficulty, selectQuestionType, loadProgress } from "./state.mjs";
import { getChapterSections, getChapterSectionsFromDir } from "./chapters.mjs";
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

function getProfileIndex(profile) {
  if (!profile?.knowledgeIndexPath) return loadKnowledgeIndex();
  return JSON.parse(readFileSync(profile.knowledgeIndexPath, "utf-8"));
}

function getKpIdsForScopeInIndex(scope, index) {
  if (!index || !scope) return [];
  const kpIds = [];
  const rawKeywords = String(scope).replace(/、|，/g, ",").split(",").map((s) => s.trim()).filter(Boolean);
  const keywords = [];
  const cnNum = {
    "一": "1", "二": "2", "三": "3", "四": "4", "五": "5",
    "六": "6", "七": "7", "八": "8", "九": "9", "十": "10",
    "十一": "11", "十二": "12", "十三": "13", "十四": "14", "十五": "15",
    "十六": "16", "十七": "17", "十八": "18", "十九": "19", "二十": "20",
  };
  for (const kw of rawKeywords) {
    keywords.push(kw);
    const m = kw.match(/第\s*(\d+)\s*章/);
    if (m) keywords.push(m[1]);
    for (const [cn, num] of Object.entries(cnNum)) {
      if (kw.includes(cn)) {
        keywords.push(kw.replace(cn, num));
        break;
      }
    }
  }

  for (const [chapterId, chapterData] of Object.entries(index.chapters || {})) {
    const chapterTitle = chapterData.title || "";
    for (const kp of chapterData.knowledge_points || []) {
      const searchText = [
        chapterId,
        `第${chapterId}章`,
        chapterTitle,
        kp.name,
        ...(kp.aliases || []),
        ...(kp.tags || []),
      ].join(" ");
      for (const kw of keywords) {
        if (/^\d+$/.test(kw)) {
          if (kw === chapterId) {
            kpIds.push(kp.id);
            break;
          }
        } else if (searchText.includes(kw)) {
          kpIds.push(kp.id);
          break;
        }
      }
    }
  }
  return [...new Set(kpIds)];
}

function getKpIds(scope, profile) {
  if (!profile) return getKpIdsForScope(scope);
  return getKpIdsForScopeInIndex(scope, getProfileIndex(profile));
}

export function listChapters(profile) {
  const index = getProfileIndex(profile);
  return Object.entries(index.chapters || {}).map(([id, ch]) => ({
    value: id,
    label: `第 ${id} 章 ${ch.title || ""}`.trim(),
    description: `${(ch.knowledge_points || []).length} 个知识点`,
  }));
}

export function listKnowledgePoints(scope = "", profile) {
  const index = getProfileIndex(profile);
  const ids = scope ? new Set(getKpIds(scope, profile)) : null;
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

export function resolveReviewTarget({ mode, scope, chapterId, knowledgePointId }, profile) {
  if (knowledgePointId) {
    const kp = listKnowledgePoints("", profile).find((item) => item.value === knowledgePointId);
    return { scope: kp?.label || knowledgePointId, kpIds: [knowledgePointId], chapter: chapterId || "" };
  }
  if (chapterId) {
    const sections = profile?.chaptersDir
      ? getChapterSectionsFromDir(chapterId, profile.chaptersDir)
      : getChapterSections(chapterId);
    return {
      scope: `第${chapterId}章`,
      kpIds: getKpIds(chapterId, profile),
      chapter: chapterId,
      sections,
    };
  }
  const resolvedScope = scope?.trim() || "全书";
  return {
    scope: resolvedScope,
    kpIds: getKpIds(resolvedScope, profile),
    chapter: "",
    sections: mode === "chapter_study"
      ? (profile?.chaptersDir ? getChapterSectionsFromDir(resolvedScope, profile.chaptersDir) : getChapterSections(resolvedScope))
      : [],
  };
}

export function buildReviewStartPrompt(selection, config) {
  const target = resolveReviewTarget(selection, selection.profile);
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
    subjectPath: selection.profile?.subjectPath,
    knowledgeIndexPath: selection.profile?.knowledgeIndexPath,
    cardsDir: selection.profile?.cardsDir,
    chaptersDir: selection.profile?.chaptersDir,
    examPointsDir: selection.profile?.examPointsDir,
  });
}
