import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { getKpIdsForScope } from "../lib/state.mjs";
import { buildReviewStartPrompt, listChapters, listKnowledgePoints, resolveReviewTarget } from "../lib/review_engine.mjs";
import { normalizeQuestion, parseChoiceAnswer } from "../lib/review_question.mjs";
import { loadReviewConfig, WORKSPACE_ROOT, PROJECT_ROOT } from "../lib/review_config.mjs";
import { loadProfileCard, normalizeCardMarkdown } from "../lib/cards.mjs";
import {
  assertValidProfileShape,
  createDraftProfile,
  enableProfile,
  listActiveProfiles,
  listDraftProfiles,
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

  const cardPrompt = buildReviewStartPrompt({ mode: "card_practice", chapterId: "1", profile }, loadReviewConfig());
  assert.match(cardPrompt, /必须先调用 review_card/);

  const extensionSource = readFileSync(join(WORKSPACE_ROOT, ".pi/extensions/review/index.ts"), "utf-8");
  assert.match(extensionSource, /\/skill:review-core/);
  assert.match(extensionSource, /\/skill:review-init/);
  assert.match(extensionSource, /\/skill:review-fix/);
  assert.match(extensionSource, /injectReviewCore/);
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
---

# 引用

## 定义
引用是对象的别名。

## 常见误区
引用不是可重新绑定的指针。
`);
  assert.equal(structured.id, "kp_ref");
  assert.equal(structured.name, "引用");
  assert.deepEqual(structured.aliases, ["reference"]);
  assert.equal(structured.sections["定义"], "引用是对象的别名。");
  assert.match(structured.sections["常见误区"], /重新绑定/);
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
