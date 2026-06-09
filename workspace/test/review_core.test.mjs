import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { getKpIdsForScope } from "../lib/state.mjs";
import { buildReviewStartPrompt, listChapters, listKnowledgePoints, resolveReviewTarget } from "../lib/review_engine.mjs";
import { normalizeQuestion, parseChoiceAnswer } from "../lib/review_question.mjs";
import { loadReviewConfig, WORKSPACE_ROOT, PROJECT_ROOT } from "../lib/review_config.mjs";
import { buildCardQueue, loadProfileCard, normalizeCardMarkdown } from "../lib/cards.mjs";
import { listChapterMaterials, loadChapterMaterial, loadExamPoints } from "../lib/review_materials.mjs";
import {
  LEARNING_PROFILE_DIR,
  loadCardProgress,
  loadLearningProfile,
  markCardSeen,
  updateCardPractice,
  updateLearningProfileFromSummary,
  writeSummaryFile,
} from "../lib/state.mjs";
import {
  assertValidProfileShape,
  createDraftProfile,
  createRevisionDraft,
  enableProfile,
  listActiveProfiles,
  listDraftProfiles,
  listProfiles,
  loadProfile,
  writeProfileFile,
} from "../lib/review_profiles.mjs";

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), "utf-8");
}

test("normalizes fenced JSON question output", () => {
  const q = normalizeQuestion(`\`\`\`json
{
  "type": "choice",
  "question_text": "Which one?",
  "options": ["A thing", "B thing"],
  "difficulty": "S-U",
  "knowledge_points": ["kp_demo"]
}
\`\`\``);

  assert.equal(q.type, "choice");
  assert.equal(q.question_text, "Which one?");
  assert.deepEqual(q.options, ["A thing", "B thing"]);
  assert.deepEqual(q.knowledge_points, ["kp_demo"]);
});

test("adds default options for judgment questions", () => {
  const q = normalizeQuestion({
    type: "judgment",
    question_text: "A destructor can be virtual.",
  });

  assert.deepEqual(q.options, ["正确", "错误"]);
});

test("parses choice and multi-choice answers consistently", () => {
  const q = normalizeQuestion({
    type: "multi_choice",
    question_text: "Pick all",
    options: ["A", "B", "C", "D"],
  });

  assert.equal(parseChoiceAnswer("B, D", q), "BD");
  assert.equal(parseChoiceAnswer("D B B", q), "DB");
});

test("lists chapters and knowledge points from the current course index", () => {
  const profile = loadProfile("cpp-oop");
  assert.ok(listChapters(profile).length >= 1);
  assert.ok(listKnowledgePoints("", profile).length >= 1);
});

test("resolves chapter review target to knowledge points", () => {
  const profile = loadProfile("cpp-oop");
  const target = resolveReviewTarget({ mode: "practice", chapterId: "1" }, profile);
  assert.equal(target.scope, "第1章");
  assert.ok(Array.isArray(target.kpIds));
});

test("scope matching returns stable arrays", () => {
  const ids = getKpIdsForScope("1");
  assert.ok(Array.isArray(ids));
});

test("lists active profiles and validates default profile shape", () => {
  const active = listActiveProfiles();
  assert.ok(active.some((profile) => profile.subjectId === "cpp-oop"));
  assert.equal(assertValidProfileShape("cpp-oop"), true);
});

test("profile shape rejects chapters without knowledge_points arrays", () => {
  const subjectId = "bad-index-shape";
  const config = { profilesDirAbs: mkdtempSync(join(tmpdir(), "review-profiles-")) };
  try {
    createDraftProfile({ subjectId, name: "Bad Index", sourceDir: "." }, config);
    writeProfileFile(subjectId, "knowledge_index.json", JSON.stringify({ subject: "Bad", chapters: { "1": { title: "No KPs" } } }, null, 2), config);
    assert.throws(() => assertValidProfileShape(subjectId, config), /knowledge_points array/);
  } finally {
    rmSync(config.profilesDirAbs, { recursive: true, force: true });
  }
});

test("review config resolves paths from the workspace root", () => {
  const config = loadReviewConfig();
  assert.equal(WORKSPACE_ROOT, PROJECT_ROOT);
  assert.equal(config.archiveDirAbs, join(WORKSPACE_ROOT, "archive"));
  assert.equal(config.profilesDirAbs, join(WORKSPACE_ROOT, "review_profiles"));
});

test("draft profile write is constrained to the profile directory", () => {
  const subjectId = "test-profile-write";
  const config = { profilesDirAbs: mkdtempSync(join(tmpdir(), "review-profiles-")) };
  try {
    createDraftProfile({ subjectId, name: "测试科目", sourceDir: "reference" }, config);
    const path = writeProfileFile(subjectId, "subject.md", "# 测试科目\n", config);
    assert.ok(path.includes(subjectId));
    assert.throws(() => writeProfileFile(subjectId, "../escape.md", "bad", config), /Unsafe profile path/);
    const draft = listDraftProfiles(config).find((profile) => profile.subjectId === subjectId);
    assert.ok(draft);
  } finally {
    rmSync(config.profilesDirAbs, { recursive: true, force: true });
  }
});

test("enables a draft profile", () => {
  const subjectId = "test-profile-enable";
  const config = { profilesDirAbs: mkdtempSync(join(tmpdir(), "review-profiles-")) };
  try {
    createDraftProfile({ subjectId, name: "启用测试", sourceDir: "reference" }, config);
    writeProfileFile(subjectId, "knowledge_index.json", JSON.stringify({ subject: "启用测试", chapters: {} }, null, 2), config);
    const enabled = enableProfile(subjectId, config);
    assert.equal(enabled.status, "active");
    assert.ok(listActiveProfiles(config).some((profile) => profile.subjectId === subjectId));
  } finally {
    rmSync(config.profilesDirAbs, { recursive: true, force: true });
  }
});

test("active profile creates revision draft and enabling archives original", () => {
  const subjectId = "revision-source";
  const config = { profilesDirAbs: mkdtempSync(join(tmpdir(), "review-profiles-")) };
  try {
    createDraftProfile({ subjectId, name: "Revision Source", sourceDir: "." }, config);
    writeProfileFile(subjectId, "knowledge_index.json", JSON.stringify({ subject: "Revision", chapters: {} }, null, 2), config);
    writeProfileFile(subjectId, "cards/kp_revision.md", "# Revision Card\n", config);
    enableProfile(subjectId, config);

    const draft = createRevisionDraft(subjectId, "修订卡片", config);
    assert.equal(draft.status, "draft");
    assert.equal(draft.revisionOf, subjectId);
    assert.match(draft.subjectId, /^revision-source__draft_/);
    assert.ok(existsSync(join(config.profilesDirAbs, draft.subjectId, "cards", "kp_revision.md")));
    assert.throws(() => writeProfileFile(subjectId, "subject.md", "bad", config), /non-draft/);
    writeProfileFile(draft.subjectId, "subject.md", "# Revision Draft\n", config);

    const enabled = enableProfile(draft.subjectId, config);
    assert.equal(enabled.status, "active");
    assert.equal(loadProfile(subjectId, config).status, "archived");
    assert.ok(listActiveProfiles(config).some((profile) => profile.subjectId === draft.subjectId));
    assert.ok(!listActiveProfiles(config).some((profile) => profile.subjectId === subjectId));
    assert.ok(listProfiles("archived", config).some((profile) => profile.subjectId === subjectId));
  } finally {
    rmSync(config.profilesDirAbs, { recursive: true, force: true });
  }
});

test("revision drafts use the root subject id and daily vN suffix instead of nesting", () => {
  const subjectId = "revision-nesting-source";
  const config = { profilesDirAbs: mkdtempSync(join(tmpdir(), "review-profiles-")) };
  try {
    createDraftProfile({ subjectId, name: "Revision Nesting Source", sourceDir: "." }, config);
    enableProfile(subjectId, config);

    const firstDraft = createRevisionDraft(subjectId, "first revision", config);
    assert.match(firstDraft.subjectId, /^revision-nesting-source__draft_\d{8}$/);
    assert.equal(firstDraft.revisionRoot, subjectId);
    assert.equal(firstDraft.revisionNumber, 1);

    const firstActive = enableProfile(firstDraft.subjectId, config);
    const secondDraft = createRevisionDraft(firstActive.subjectId, "second revision", config);
    assert.match(secondDraft.subjectId, /^revision-nesting-source__draft_\d{8}_v2$/);
    assert.doesNotMatch(secondDraft.subjectId, /__draft_\d{8}__draft_/);
    assert.equal(secondDraft.revisionRoot, subjectId);
    assert.equal(secondDraft.revisionOf, firstActive.subjectId);
    assert.equal(secondDraft.revisionNumber, 2);
  } finally {
    rmSync(config.profilesDirAbs, { recursive: true, force: true });
  }
});

test("revision draft naming strips already nested legacy draft suffixes", () => {
  const badSubjectId = "legacy-nest__draft_20260608__draft_20260608";
  const config = { profilesDirAbs: mkdtempSync(join(tmpdir(), "review-profiles-")) };
  try {
    createDraftProfile({ subjectId: badSubjectId, name: "Legacy Nested Active", sourceDir: "." }, config);
    enableProfile(badSubjectId, config);
    const draft = createRevisionDraft(badSubjectId, "repair legacy nested id", config);
    assert.match(draft.subjectId, /^legacy-nest__draft_\d{8}$/);
    assert.doesNotMatch(draft.subjectId, /__draft_\d{8}__draft_/);
    assert.equal(draft.revisionRoot, "legacy-nest");
    assert.equal(draft.revisionOf, badSubjectId);
  } finally {
    rmSync(config.profilesDirAbs, { recursive: true, force: true });
  }
});

test("writeProfileFile refuses active profiles", () => {
  const subjectId = "test-profile-active-write";
  const config = { profilesDirAbs: mkdtempSync(join(tmpdir(), "review-profiles-")) };
  try {
    createDraftProfile({ subjectId, name: "Active Write", sourceDir: "." }, config);
    enableProfile(subjectId, config);
    assert.throws(() => writeProfileFile(subjectId, "subject.md", "bad", config), /non-draft/);
  } finally {
    rmSync(config.profilesDirAbs, { recursive: true, force: true });
  }
});

test("non legacy profiles cannot use parent directory paths", () => {
  const subjectId = "bad-path-profile";
  const config = { profilesDirAbs: mkdtempSync(join(tmpdir(), "review-profiles-")) };
  try {
    writeJson(join(config.profilesDirAbs, subjectId, "profile.json"), {
      subjectId,
      name: "Bad Path",
      status: "active",
      paths: {
        subject: "subject.md",
        knowledgeIndex: "../data/knowledge_index.json",
        cards: "cards",
        chapters: "chapters",
        examPoints: "exam_points",
        sourceMap: "source_map.json",
        qualityReport: "quality_report.md",
      },
    });
    assert.throws(() => loadProfile(subjectId, config), /Non legacy profile path/);
  } finally {
    rmSync(config.profilesDirAbs, { recursive: true, force: true });
  }
});

test("review prompts force the core skill and command prompts mention init and fix skills", () => {
  const profile = loadProfile("cpp-oop");
  const prompt = buildReviewStartPrompt({ mode: "practice", chapterId: "1", profile }, loadReviewConfig());
  assert.match(prompt, /\/skill:review-core/);
  assert.match(prompt, /\/skill:review-question/);
  assert.match(prompt, /\/skill:review-grade/);
  assert.doesNotMatch(prompt, /必须先调用 review_card/);
  assert.match(prompt, /review_exam_points/);
  assert.match(prompt, /学习者画像/);
  assert.match(prompt, /难度策略: 自动/);

  const manualPrompt = buildReviewStartPrompt({ mode: "practice", chapterId: "1", profile, difficulty: "M-U" }, loadReviewConfig());
  assert.match(manualPrompt, /难度: M-U/);
  assert.match(manualPrompt, /难度策略: 手动/);

  const cardPrompt = buildReviewStartPrompt({ mode: "card_practice", chapterId: "1", profile }, loadReviewConfig());
  assert.match(cardPrompt, /必须先调用 review_card/);

  const chapterPrompt = buildReviewStartPrompt({ mode: "chapter_study", chapterId: "1", profile }, loadReviewConfig());
  assert.match(chapterPrompt, /review_chapter/);

  const extensionSource = readFileSync(join(WORKSPACE_ROOT, "extensions/review/index.ts"), "utf-8");
  assert.match(extensionSource, /\/skill:review-core/);
  assert.match(extensionSource, /\/skill:review-init/);
  assert.match(extensionSource, /\/skill:review-fix/);
  assert.match(extensionSource, /injectReviewCore/);
  assert.doesNotMatch(extensionSource, /increase_difficulty/);
});

test("workspace pi config does not auto-load a global review SYSTEM prompt", () => {
  assert.equal(existsSync(join(WORKSPACE_ROOT, ".pi", "SYSTEM.md")), false);
});

test("normalizes legacy and structured concept cards", () => {
  const legacy = normalizeCardMarkdown(`---
type: concept
name: auto
tags: [概念卡片, cpp]
---

# auto

auto 用于类型推导。
`, { id: "kp_auto", difficulty_baseline: "S-U" }, "auto.md");
  assert.equal(legacy.id, "kp_auto");
  assert.equal(legacy.name, "auto");
  assert.equal(legacy.difficulty, "S-U");
  assert.ok(legacy.raw.includes("类型推导"));

  const structured = normalizeCardMarkdown(`---
id: kp_ref
name: 引用
aliases: [reference]
exam_level: high
chapter: "1"
source: chapters/1.1.md
status: active
---

# 引用

## 定义
引用是对象的别名。

## 常见误区
引用不是可重新绑定的指针。
`);
  assert.equal(structured.id, "kp_ref");
  assert.equal(structured.name, "引用");
  assert.equal(structured.chapter, "1");
  assert.equal(structured.source, "chapters/1.1.md");
  assert.deepEqual(structured.aliases, ["reference"]);
  assert.equal(structured.sections["定义"], "引用是对象的别名。");
  assert.match(structured.sections["常见误区"], /重新绑定/);
});

test("card queue prefers unseen weak low-confidence cards", () => {
  const dir = mkdtempSync(join(tmpdir(), "review-cards-"));
  try {
    writeFileSync(join(dir, "a.md"), "# A\n", "utf-8");
    writeFileSync(join(dir, "b.md"), "# B\n", "utf-8");
    const profile = { cardsDir: dir };
    const queue = buildCardQueue(profile, [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ]);
    assert.equal(queue[0].id, "a");
    assert.equal(queue[0].card_position, 1);
    assert.equal(queue[0].card_total, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("card progress records seen and practice statistics", () => {
  const progressPath = join(WORKSPACE_ROOT, "state", "card_progress.json");
  const hadFile = existsSync(progressPath);
  const original = hadFile ? readFileSync(progressPath, "utf-8") : null;
  try {
    const before = loadCardProgress();
    markCardSeen("unit_test_card");
    updateCardPractice(["unit_test_card"], true);
    const after = loadCardProgress();
    assert.ok((after.cards.unit_test_card.seen_count || 0) >= (before.cards.unit_test_card?.seen_count || 0) + 1);
    assert.ok((after.cards.unit_test_card.practice_count || 0) >= (before.cards.unit_test_card?.practice_count || 0) + 1);
  } finally {
    if (hadFile) writeFileSync(progressPath, original, "utf-8");
    else rmSync(progressPath, { force: true });
  }
});

test("summary updates subject learning profile", () => {
  const subjectId = "unit-learning-profile";
  const profilePath = join(LEARNING_PROFILE_DIR, `${subjectId}.json`);
  const hadFile = existsSync(profilePath);
  const original = hadFile ? readFileSync(profilePath, "utf-8") : null;
  try {
    updateLearningProfileFromSummary(subjectId, {
      session_id: "s_unit_learning",
      report: "薄弱点：主动回忆容易遗漏。\n下一步建议：优先复习错题相关卡片。\n遗留问题：如何安排间隔复习？",
      scope: "第1章",
      total_questions: 2,
      correct: 1,
      incorrect: 1,
      summary_path: "archive/summaries/s_unit_learning_总结.md",
    });
    const profile = loadLearningProfile(subjectId);
    assert.equal(profile.subject_id, subjectId);
    assert.equal(profile.recent_sessions[0].session_id, "s_unit_learning");
    assert.equal(profile.accuracy, 0.5);
    assert.ok(profile.weak_points.some((item) => item.includes("主动回忆")));
    assert.ok(profile.next_suggestions.some((item) => item.includes("优先复习")));
  } finally {
    if (hadFile) writeFileSync(profilePath, original, "utf-8");
    else rmSync(profilePath, { force: true });
  }
});

test("summary and learning profile are written to profile private _user directory when profileRoot is provided", () => {
  const subjectId = "unit-private-memory";
  const profileRoot = mkdtempSync(join(tmpdir(), "review-profile-private-"));
  try {
    const summaryPath = writeSummaryFile("s_private_memory", "本次总结内容", {
      profileRoot,
      subject_id: subjectId,
      profile_id: subjectId,
      scope: "chapter 1",
      total_questions: 2,
      correct: 2,
      incorrect: 0,
    });
    assert.ok(summaryPath.startsWith(join(profileRoot, "_user", "summaries")));
    const summaryText = readFileSync(summaryPath, "utf-8");
    assert.match(summaryText, /subject_id: unit-private-memory/);
    assert.match(summaryText, /profile_id: unit-private-memory/);

    updateLearningProfileFromSummary(subjectId, {
      session_id: "s_private_memory",
      report: "下一步建议：继续复习章节卡片。",
      scope: "chapter 1",
      total_questions: 2,
      correct: 2,
      incorrect: 0,
      summary_path: "_user/summaries/s_private_memory_总结.md",
    }, { profileRoot });

    const privateProfilePath = join(profileRoot, "_user", "learning_profile.json");
    assert.ok(existsSync(privateProfilePath));
    const profile = loadLearningProfile(subjectId, { profileRoot });
    assert.equal(profile.subject_id, subjectId);
    assert.equal(profile.recent_sessions[0].session_id, "s_private_memory");
    assert.equal(profile.recent_sessions[0].summary_path, "_user/summaries/s_private_memory_总结.md");
  } finally {
    rmSync(profileRoot, { recursive: true, force: true });
  }
});

test("demo profile is active and supports cards, chapters, and exam points", () => {
  const profile = loadProfile("demo-review");
  assert.equal(profile.status, "active");
  assert.equal(assertValidProfileShape("demo-review"), true);
  assert.ok(listActiveProfiles().some((item) => item.subjectId === "demo-review"));
  assert.ok(loadProfileCard(profile, { id: "active_recall", name: "主动回忆" }));
  assert.ok(listChapterMaterials(profile, "1").length >= 1);
  assert.ok(loadChapterMaterial(profile, { chapterId: "1" })?.content.includes("主动回忆"));
  assert.ok(loadExamPoints(profile, "1")?.[0]?.content.includes("考点清单"));
});

test("demo-review seed profile is always active in release state", () => {
  const demo = loadProfile("demo-review");
  assert.equal(demo.status, "active", "demo-review must be active for release");
  assert.ok(!demo.supersededBy, "demo-review must not have supersededBy");
  assert.ok(!demo.supersededAt, "demo-review must not have supersededAt");
  assert.ok(!demo.revisionOf, "demo-review must not be a revision draft");
});

test("bundled profiles are seeded into an empty user data profile root", () => {
  const profilesDirAbs = mkdtempSync(join(tmpdir(), "review-profile-store-"));
  const config = { profilesDirAbs };
  try {
    const active = listActiveProfiles(config);
    assert.ok(active.some((profile) => profile.subjectId === "demo-review"));
    assert.ok(active.some((profile) => profile.subjectId === "cpp-oop"));
    assert.ok(existsSync(join(profilesDirAbs, "demo-review", "profile.json")));
    assert.ok(existsSync(join(profilesDirAbs, "cpp-oop", "profile.json")));
    assert.equal(assertValidProfileShape("cpp-oop", config), true);
  } finally {
    rmSync(profilesDirAbs, { recursive: true, force: true });
  }
});

test("loads profile cards by id, name, alias, and fuzzy file matches", () => {
  const dir = mkdtempSync(join(tmpdir(), "review-cards-"));
  try {
    writeFileSync(join(dir, "kp_id.md"), "# By ID\n", "utf-8");
    writeFileSync(join(dir, "知识点名称.md"), "# By Name\n", "utf-8");
    writeFileSync(join(dir, "alias-name.md"), "# By Alias\n", "utf-8");
    writeFileSync(join(dir, "prefix-fuzzy-target.md"), "# By Fuzzy\n", "utf-8");
    const profile = { cardsDir: dir };

    assert.equal(loadProfileCard(profile, { id: "kp_id", name: "Other" }).title, "By ID");
    assert.equal(loadProfileCard(profile, { id: "missing", name: "知识点名称" }).title, "By Name");
    assert.equal(loadProfileCard(profile, { id: "missing2", name: "Other", aliases: ["alias-name"] }).title, "By Alias");
    assert.equal(loadProfileCard(profile, { id: "missing3", name: "fuzzy-target" }).title, "By Fuzzy");
    assert.equal(loadProfileCard(profile, { id: "none", name: "none" }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
