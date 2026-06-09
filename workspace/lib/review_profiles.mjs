import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { loadReviewConfig, PACKAGE_ROOT, PROJECT_ROOT } from "./review_config.mjs";

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

function copyDirRecursive(source, target) {
  if (!existsSync(source) || !statSync(source).isDirectory()) {
    throw new Error(`Source profile directory not found: ${source}`);
  }
  ensureDir(target);
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(sourcePath, targetPath);
    } else if (entry.isFile()) {
      ensureDir(dirname(targetPath));
      copyFileSync(sourcePath, targetPath);
    }
  }
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

function stripDraftSuffix(subjectId) {
  let id = String(subjectId || "");
  let next = id.replace(/__draft_\d{8}(?:_v\d+)?$/i, "");
  while (next !== id) {
    id = next;
    next = id.replace(/__draft_\d{8}(?:_v\d+)?$/i, "");
  }
  return id;
}

export function getRevisionRootSubjectId(profileOrSubjectId, config = loadReviewConfig()) {
  let profile = typeof profileOrSubjectId === "string"
    ? loadProfile(profileOrSubjectId, config)
    : profileOrSubjectId;
  if (!profile) return stripDraftSuffix(profileOrSubjectId);
  if (profile.revisionRoot) return cleanSubjectId(stripDraftSuffix(profile.revisionRoot));

  const seen = new Set();
  while (profile?.revisionOf && !seen.has(profile.subjectId)) {
    seen.add(profile.subjectId);
    const parent = loadProfile(profile.revisionOf, config);
    if (!parent) break;
    profile = parent;
    if (profile.revisionRoot) return cleanSubjectId(stripDraftSuffix(profile.revisionRoot));
  }

  return cleanSubjectId(stripDraftSuffix(profile?.subjectId || profileOrSubjectId));
}

function nextRevisionDraftId(rootSubjectId, stamp, config) {
  let revisionNumber = 1;
  let draftId = cleanSubjectId(`${rootSubjectId}__draft_${stamp}`);
  while (existsSync(getProfileDir(draftId, config))) {
    revisionNumber += 1;
    draftId = cleanSubjectId(`${rootSubjectId}__draft_${stamp}_v${revisionNumber}`);
  }
  return { draftId, revisionNumber };
}

export function getProfilesRoot(config = loadReviewConfig()) {
  seedBundledProfiles(config.profilesDirAbs);
  return config.profilesDirAbs;
}

function seedBundledProfiles(targetRoot) {
  const bundledRoot = join(PACKAGE_ROOT, "profiles");
  if (!existsSync(bundledRoot) || !statSync(bundledRoot).isDirectory()) return;
  ensureDir(targetRoot);
  for (const entry of readdirSync(bundledRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = join(bundledRoot, entry.name);
    const target = join(targetRoot, entry.name);
    if (existsSync(join(target, PROFILE_FILE))) continue;
    copyDirRecursive(source, target);
  }
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

export function listEditableProfiles(config = loadReviewConfig()) {
  return listProfiles(null, config).filter((profile) => profile.status === "draft" || profile.status === "active");
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
  if (profile.status !== "draft" && profile.status !== "active") {
    throw new Error(`Cannot enable profile with status ${profile.status}: ${subjectId}`);
  }
  const raw = readJSON(join(profile.root, PROFILE_FILE));
  if (raw.revisionOf) {
    const original = loadProfile(raw.revisionOf, config);
    if (original) {
      const originalRaw = readJSON(join(original.root, PROFILE_FILE));
      originalRaw.status = "archived";
      originalRaw.supersededBy = profile.subjectId;
      originalRaw.supersededAt = new Date().toISOString();
      originalRaw.updatedAt = originalRaw.supersededAt;
      writeJSON(join(original.root, PROFILE_FILE), originalRaw);
    }
    raw.revisionEnabledAt = new Date().toISOString();
  }
  raw.status = "active";
  raw.updatedAt = new Date().toISOString();
  writeJSON(join(profile.root, PROFILE_FILE), raw);
  return hydrateProfile(raw, config);
}

export function createRevisionDraft(subjectId, reason = "", config = loadReviewConfig()) {
  const source = loadProfile(subjectId, config);
  if (!source) throw new Error(`Profile not found: ${subjectId}`);
  if (source.status !== "active") throw new Error(`Can only create revision drafts from active profiles: ${subjectId}`);

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const revisionRoot = getRevisionRootSubjectId(source, config);
  const { draftId, revisionNumber } = nextRevisionDraftId(revisionRoot, stamp, config);

  const targetRoot = getProfileDir(draftId, config);
  copyDirRecursive(source.root, targetRoot);
  const raw = readJSON(join(targetRoot, PROFILE_FILE));
  const now = new Date().toISOString();
  raw.subjectId = draftId;
  raw.name = `${source.name || source.subjectId} 修订版`;
  raw.status = "draft";
  raw.revisionOf = source.subjectId;
  raw.revisionRoot = revisionRoot;
  raw.revisionNumber = revisionNumber;
  raw.revisionCreatedAt = now;
  raw.revisionReason = String(reason || "");
  raw.updatedAt = now;
  delete raw.supersededBy;
  delete raw.supersededAt;
  delete raw.revisionEnabledAt;
  writeJSON(join(targetRoot, PROFILE_FILE), raw);
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
  for (const [chapterId, chapter] of Object.entries(index.chapters)) {
    if (!Array.isArray(chapter?.knowledge_points)) {
      throw new Error(`knowledge_index.json chapter ${chapterId} must contain a knowledge_points array.`);
    }
  }
  return true;
}
