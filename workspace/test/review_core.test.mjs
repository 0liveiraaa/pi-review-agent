import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { getKpIdsForScope } from "../lib/state.mjs";
import { buildReviewStartPrompt, listChapters, listKnowledgePoints, resolveReviewTarget } from "../lib/review_engine.mjs";
import { normalizeQuestion, parseChoiceAnswer } from "../lib/review_question.mjs";
import { loadReviewConfig, WORKSPACE_ROOT, PROJECT_ROOT } from "../lib/review_config.mjs";
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

  const extensionSource = readFileSync(join(WORKSPACE_ROOT, ".pi/extensions/review/index.ts"), "utf-8");
  assert.match(extensionSource, /\/skill:review-core/);
  assert.match(extensionSource, /\/skill:review-init/);
  assert.match(extensionSource, /\/skill:review-fix/);
});

test("workspace pi config does not auto-load a global review SYSTEM prompt", () => {
  assert.equal(existsSync(join(WORKSPACE_ROOT, ".pi", "SYSTEM.md")), false);
});
