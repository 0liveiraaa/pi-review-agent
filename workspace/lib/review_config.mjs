import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const WORKSPACE_ROOT = resolve(__dirname, "..");
export const PROJECT_ROOT = WORKSPACE_ROOT;

const DEFAULT_CONFIG = {
  courseName: "C++ 面向对象程序设计",
  profile: "cpp-oop",
  referenceRoot: "../reference",
  chapterNotesDir: "../reference/01-章节笔记",
  conceptCardsDir: "../reference/02-概念卡片",
  knowledgeIndex: "data/knowledge_index.json",
  archiveDir: "archive",
  stateDir: "state",
  profilesDir: "review_profiles",
  defaultMode: "practice",
  defaultDifficulty: "S-U",
  difficultyLadder: ["S-R", "S-U", "M-U", "M-A", "C-A"],
  questionTypes: ["judgment", "choice", "multi_choice", "short_answer"],
};

function abs(path) {
  return resolve(PROJECT_ROOT, path);
}

export function loadReviewConfig() {
  const configPath = join(WORKSPACE_ROOT, ".pi", "review.config.json");
  const fileConfig = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, "utf-8"))
    : {};
  const config = { ...DEFAULT_CONFIG, ...fileConfig };
  return {
    ...config,
    projectRoot: PROJECT_ROOT,
    workspaceRoot: WORKSPACE_ROOT,
    referenceRootAbs: abs(config.referenceRoot),
    chapterNotesDirAbs: abs(config.chapterNotesDir),
    conceptCardsDirAbs: abs(config.conceptCardsDir),
    knowledgeIndexAbs: abs(config.knowledgeIndex),
    archiveDirAbs: abs(config.archiveDir),
    stateDirAbs: abs(config.stateDir),
    profilesDirAbs: abs(config.profilesDir),
  };
}
