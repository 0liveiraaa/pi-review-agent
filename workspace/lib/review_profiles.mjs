import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { loadReviewConfig, PROJECT_ROOT } from "./review_config.mjs";

const ALLOWED_SOURCE_EXTENSIONS = new Set([".md", ".txt"]);
const PROFILE_FILE = "profile.json";

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function readJSON(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJSON(path, data) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

function cleanSubjectId(value) {
  const id = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!id) throw new Error("subjectId is required.");
  return id;
}

function safeRelativePath(value) {
  const rel = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel || rel.includes("\0")) throw new Error("Invalid profile path.");
  const parts = rel.split("/");
  if (parts.some((part) => part === ".." || part === "." || part === "")) {
    throw new Error(`Unsafe profile path: ${value}`);
  }
  return rel;
}

function hasPathTraversal(value) {
  return String(value || "").replace(/\\/g, "/").split("/").some((part) => part === "..");
}

function validateProfilePathModel(profile, paths) {
  if (profile.layout === "legacy-bridge") return;
  for (const [key, value] of Object.entries(paths)) {
    if (hasPathTraversal(value)) {
      throw new Error(`Non legacy profile path cannot contain '..': ${key}`);
    }
  }
}

export function getProfilesRoot(config = loadReviewConfig()) {
  return config.profilesDirAbs;
}

export function getProfileDir(subjectId, config = loadReviewConfig()) {
  return join(getProfilesRoot(config), cleanSubjectId(subjectId));
}

export function loadProfile(subjectId, config = loadReviewConfig()) {
  const profilePath = join(getProfileDir(subjectId, config), PROFILE_FILE);
  if (!existsSync(profilePath)) return null;
  const profile = readJSON(profilePath);
  return hydrateProfile(profile, config);
}

export function hydrateProfile(profile, config = loadReviewConfig()) {
  const subjectId = cleanSubjectId(profile.subjectId || profile.id);
  const root = getProfileDir(subjectId, config);
  const paths = {
    subject: profile.paths?.subject || "subject.md",
    knowledgeIndex: profile.paths?.knowledgeIndex || "knowledge_index.json",
    cards: profile.paths?.cards || "cards",
    chapters: profile.paths?.chapters || "chapters",
    examPoints: profile.paths?.examPoints || "exam_points",
    sourceMap: profile.paths?.sourceMap || "source_map.json",
    qualityReport: profile.paths?.qualityReport || "quality_report.md",
  };
  validateProfilePathModel(profile, paths);
  return {
    ...profile,
    subjectId,
    status: profile.status || "draft",
    root,
    paths,
    subjectPath: join(root, paths.subject),
    knowledgeIndexPath: join(root, paths.knowledgeIndex),
    cardsDir: join(root, paths.cards),
    chaptersDir: join(root, paths.chapters),
    examPointsDir: join(root, paths.examPoints),
    sourceMapPath: join(root, paths.sourceMap),
    qualityReportPath: join(root, paths.qualityReport),
  };
}

export function listProfiles(status, config = loadReviewConfig()) {
  const root = getProfilesRoot(config);
  if (!existsSync(root)) return [];
  const profiles = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let profile;
    try {
      profile = loadProfile(entry.name, config);
    } catch {
      continue;
    }
    if (!profile) continue;
    if (status && profile.status !== status) continue;
    profiles.push(profile);
  }
  return profiles.sort((a, b) => String(a.name || a.subjectId).localeCompare(String(b.name || b.subjectId), "zh-Hans-CN"));
}

export function listActiveProfiles(config = loadReviewConfig()) {
  return listProfiles("active", config);
}

export function listDraftProfiles(config = loadReviewConfig()) {
  return listProfiles("draft", config);
}

export function createDraftProfile({ subjectId, name, sourceDir }, config = loadReviewConfig()) {
  const id = cleanSubjectId(subjectId);
  const root = getProfileDir(id, config);
  ensureDir(root);
  for (const subdir of ["cards", "chapters", "exam_points"]) ensureDir(join(root, subdir));

  const now = new Date().toISOString();
  const profile = {
    subjectId: id,
    name: name || id,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    sourceDir: sourceDir ? relative(PROJECT_ROOT, resolve(PROJECT_ROOT, sourceDir)).replace(/\\/g, "/") : "",
    paths: {
      subject: "subject.md",
      knowledgeIndex: "knowledge_index.json",
      cards: "cards",
      chapters: "chapters",
      examPoints: "exam_points",
      sourceMap: "source_map.json",
      qualityReport: "quality_report.md",
    },
  };
  writeJSON(join(root, PROFILE_FILE), profile);
  if (!existsSync(join(root, "subject.md"))) {
    writeFileSync(join(root, "subject.md"), `# ${profile.name}\n\n本资料包仍处于 draft 状态，请通过 /review-fix 复核后启用。\n`, "utf-8");
  }
  if (!existsSync(join(root, "knowledge_index.json"))) {
    writeJSON(join(root, "knowledge_index.json"), { subject: profile.name, chapters: {} });
  }
  if (!existsSync(join(root, "source_map.json"))) writeJSON(join(root, "source_map.json"), { files: [] });
  if (!existsSync(join(root, "quality_report.md"))) {
    writeFileSync(join(root, "quality_report.md"), "# 质量报告\n\n- 待生成。\n", "utf-8");
  }
  return hydrateProfile(profile, config);
}

export function writeProfileFile(subjectId, relPath, content, config = loadReviewConfig()) {
  const profile = loadProfile(subjectId, config);
  if (!profile) throw new Error(`Profile not found: ${subjectId}`);
  if (profile.status !== "draft") throw new Error(`Refusing to write non-draft profile: ${subjectId}`);
  const safePath = safeRelativePath(relPath);
  const target = resolve(profile.root, safePath);
  const root = resolve(profile.root);
  if (!(target === root || target.startsWith(root + "\\" ) || target.startsWith(root + "/"))) {
    throw new Error(`Refusing to write outside profile: ${relPath}`);
  }
  ensureDir(dirname(target));
  writeFileSync(target, String(content ?? ""), "utf-8");

  const raw = readJSON(join(profile.root, PROFILE_FILE));
  raw.updatedAt = new Date().toISOString();
  writeJSON(join(profile.root, PROFILE_FILE), raw);
  return target;
}

export function enableProfile(subjectId, config = loadReviewConfig()) {
  const profile = loadProfile(subjectId, config);
  if (!profile) throw new Error(`Profile not found: ${subjectId}`);
  const raw = readJSON(join(profile.root, PROFILE_FILE));
  raw.status = "active";
  raw.updatedAt = new Date().toISOString();
  writeJSON(join(profile.root, PROFILE_FILE), raw);
  return hydrateProfile(raw, config);
}

export function scanSourceFiles(sourceDir, limit = 80) {
  const base = resolve(PROJECT_ROOT, sourceDir || ".");
  if (!existsSync(base) || !statSync(base).isDirectory()) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (out.length >= limit) return;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(full);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        const ext = lower.slice(lower.lastIndexOf("."));
        if (ALLOWED_SOURCE_EXTENSIONS.has(ext)) {
          out.push({
            path: relative(PROJECT_ROOT, full).replace(/\\/g, "/"),
            size: statSync(full).size,
          });
        }
      }
    }
  };
  walk(base);
  return out;
}

export function assertValidProfileShape(subjectId, config = loadReviewConfig()) {
  const profile = loadProfile(subjectId, config);
  if (!profile) throw new Error(`Profile not found: ${subjectId}`);
  const required = [profile.subjectPath, profile.knowledgeIndexPath, profile.sourceMapPath, profile.qualityReportPath];
  for (const path of required) {
    if (!existsSync(path)) throw new Error(`Profile file missing: ${path}`);
  }
  const index = readJSON(profile.knowledgeIndexPath);
  if (!index || typeof index !== "object" || !index.chapters || typeof index.chapters !== "object") {
    throw new Error("knowledge_index.json must contain a chapters object.");
  }
  return true;
}
