import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

import { getKpIdsForScope } from "../lib/state.mjs";
import { listChapters, listKnowledgePoints, resolveReviewTarget } from "../lib/review_engine.mjs";
import { normalizeQuestion, parseChoiceAnswer } from "../lib/review_question.mjs";
import {
  assertValidProfileShape,
  createDraftProfile,
  enableProfile,
  getProfileDir,
  listActiveProfiles,
  listDraftProfiles,
  loadProfile,
  writeProfileFile,
} from "../lib/review_profiles.mjs";

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

test("draft profile write is constrained to the profile directory", () => {
  const subjectId = `test-${Date.now()}`;
  try {
    createDraftProfile({ subjectId, name: "测试科目", sourceDir: "reference" });
    const path = writeProfileFile(subjectId, "subject.md", "# 测试科目\n");
    assert.ok(path.includes(subjectId));
    assert.throws(() => writeProfileFile(subjectId, "../escape.md", "bad"), /Unsafe profile path/);
    const draft = listDraftProfiles().find((profile) => profile.subjectId === subjectId);
    assert.ok(draft);
  } finally {
    rmSync(getProfileDir(subjectId), { recursive: true, force: true });
  }
});

test("enables a draft profile", () => {
  const subjectId = `enable-${Date.now()}`;
  try {
    createDraftProfile({ subjectId, name: "启用测试", sourceDir: "reference" });
    writeProfileFile(subjectId, "knowledge_index.json", JSON.stringify({ subject: "启用测试", chapters: {} }, null, 2));
    const enabled = enableProfile(subjectId);
    assert.equal(enabled.status, "active");
    assert.ok(listActiveProfiles().some((profile) => profile.subjectId === subjectId));
  } finally {
    rmSync(getProfileDir(subjectId), { recursive: true, force: true });
  }
});
