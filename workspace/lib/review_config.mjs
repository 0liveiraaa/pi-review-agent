import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = resolve(__dirname, "..");
export const WORKSPACE_ROOT = PACKAGE_ROOT;
export const PROJECT_ROOT = PACKAGE_ROOT;

/**
 * Resolve the user-writable data directory.
 *
 * Priority:
 *   1. PI_REVIEW_DATA env — explicit override
 *   2. PI_PROJECT_DIR env — set by pi-agent for project-local runs
 *   3. PACKAGE_ROOT — local dev (workspace/)
 *   4. ~/.pi/agent/review-data/ — global fallback (pi install path)
 */
export function resolveDataRoot() {
  if (process.env.PI_REVIEW_DATA) {
    return resolve(process.env.PI_REVIEW_DATA);
  }
  if (process.env.PI_PROJECT_DIR) {
    return resolve(process.env.PI_PROJECT_DIR);
  }
  const agentDir = join(homedir(), ".pi", "agent");
  // If running from a pi install path, use global data dir
  if (PACKAGE_ROOT.startsWith(agentDir)) {
    return join(agentDir, "review-data");
  }
  // Local dev: use the workspace directory itself
  return PACKAGE_ROOT;
}

export const DATA_ROOT = resolveDataRoot();

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function abs(path, base = PACKAGE_ROOT) {
  return resolve(base, path);
}

const DEFAULT_CONFIG = {
  courseName: "Pi Review 复习助手",
  profile: "demo-review",
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

export function loadReviewConfig() {
  // Try DATA_ROOT first (for user overrides), then PACKAGE_ROOT (package default)
  let fileConfig = {};
  for (const root of [DATA_ROOT, PACKAGE_ROOT]) {
    const configPath = join(root, "review.config.json");
    if (existsSync(configPath)) {
      fileConfig = JSON.parse(readFileSync(configPath, "utf-8"));
      break;
    }
  }
  const config = { ...DEFAULT_CONFIG, ...fileConfig };

  // Resolve resource paths relative to PACKAGE_ROOT (read-only) or DATA_ROOT (writable)
  const profilesDirAbsFunc = () => {
    const dataProfiles = join(DATA_ROOT, config.profilesDir);
    ensureDir(dataProfiles);
    return dataProfiles;
  };

  return {
    ...config,
    packageRoot: PACKAGE_ROOT,
    projectRoot: PROJECT_ROOT,
    workspaceRoot: WORKSPACE_ROOT,
    dataRoot: DATA_ROOT,
    referenceRootAbs: abs(config.referenceRoot, PACKAGE_ROOT),
    chapterNotesDirAbs: abs(config.chapterNotesDir, PACKAGE_ROOT),
    conceptCardsDirAbs: abs(config.conceptCardsDir, PACKAGE_ROOT),
    knowledgeIndexAbs: abs(config.knowledgeIndex, PACKAGE_ROOT),
    archiveDirAbs: abs(config.archiveDir, DATA_ROOT),
    stateDirAbs: abs(config.stateDir, DATA_ROOT),
    profilesDirAbs: profilesDirAbsFunc(),
  };
}
