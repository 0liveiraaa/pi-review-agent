import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { loadReviewConfig, PACKAGE_ROOT, PROJECT_ROOT } from "./review_config.mjs";

const ALLOWED_SOURCE_EXTENSIONS = new Set([".md", ".txt"]);
const PROFILE_FILE = "profile.json";
const ACTIVE_SLOT = "active";
const DRAFT_SLOT = "draft";
const ARCHIVED_SLOT = "archived";

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

function copyDirRecursive(source, target, options = {}) {
  if (!existsSync(source) || !statSync(source).isDirectory()) {
    throw new Error(`Source profile directory not found: ${source}`);
  }
  ensureDir(target);
  const exclude = new Set(options.exclude || []);
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (exclude.has(entry.name)) continue;
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(sourcePath, targetPath, options);
    } else if (entry.isFile()) {
      ensureDir(dirname(targetPath));
      copyFileSync(sourcePath, targetPath);
    }
  }
}

export function cleanSubjectId(value) {
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

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

export function getRevisionRootSubjectId(profileOrSubjectId, config = loadReviewConfig()) {
  let profile = typeof profileOrSubjectId === "string"
    ? loadProfile(profileOrSubjectId, config)
    : profileOrSubjectId;
  if (!profile) return cleanSubjectId(stripDraftSuffix(profileOrSubjectId));
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

export function getProfilesRoot(config = loadReviewConfig()) {
  seedBundledProfiles(config.profilesDirAbs);
  return config.profilesDirAbs;
}

export function getProfileFamilyRoot(subjectId, config = loadReviewConfig()) {
  return join(getProfilesRoot(config), cleanSubjectId(subjectId));
}

export function getActiveProfileRoot(subjectId, config = loadReviewConfig()) {
  return join(getProfileFamilyRoot(subjectId, config), ACTIVE_SLOT);
}

export function getDraftProfileRoot(subjectId, config = loadReviewConfig()) {
  return join(getProfileFamilyRoot(subjectId, config), DRAFT_SLOT);
}

export function getArchivedProfilesRoot(subjectId, config = loadReviewConfig()) {
  return join(getProfileFamilyRoot(subjectId, config), ARCHIVED_SLOT);
}

function getLegacyProfileRoot(subjectId, config = loadReviewConfig()) {
  return join(getProfilesRoot(config), cleanSubjectId(subjectId));
}

function seedBundledProfiles(targetRoot) {
  const bundledRoot = join(PACKAGE_ROOT, "profiles");
  if (!existsSync(bundledRoot) || !statSync(bundledRoot).isDirectory()) return;
  ensureDir(targetRoot);
  for (const entry of readdirSync(bundledRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = join(bundledRoot, entry.name);
    const familyRoot = join(targetRoot, entry.name);
    const activeTarget = join(familyRoot, ACTIVE_SLOT);
    const legacyTarget = join(targetRoot, entry.name);
    if (existsSync(join(activeTarget, PROFILE_FILE)) || existsSync(join(legacyTarget, PROFILE_FILE))) continue;
    copyDirRecursive(source, activeTarget);
    ensureDir(join(familyRoot, "_user"));
    try {
      const raw = readJSON(join(activeTarget, PROFILE_FILE));
      raw.subjectId = cleanSubjectId(raw.subjectId || entry.name);
      raw.status = "active";
      raw.slot = ACTIVE_SLOT;
      raw.updatedAt = raw.updatedAt || new Date().toISOString();
      writeJSON(join(activeTarget, PROFILE_FILE), raw);
    } catch {
      // Leave copied bundled data as-is; loadProfile will surface shape errors.
    }
  }
}

export function getProfileDir(subjectId, config = loadReviewConfig()) {
  const familyActive = getActiveProfileRoot(subjectId, config);
  if (existsSync(join(familyActive, PROFILE_FILE))) return familyActive;
  const familyDraft = getDraftProfileRoot(subjectId, config);
  if (existsSync(join(familyDraft, PROFILE_FILE))) return familyDraft;
  return getLegacyProfileRoot(subjectId, config);
}

function findProfileRoot(subjectId, config = loadReviewConfig(), preferredSlot = ACTIVE_SLOT) {
  const id = cleanSubjectId(subjectId);
  const slots = preferredSlot === DRAFT_SLOT ? [DRAFT_SLOT, ACTIVE_SLOT] : [ACTIVE_SLOT, DRAFT_SLOT];
  for (const slot of slots) {
    const root = slot === ACTIVE_SLOT ? getActiveProfileRoot(id, config) : getDraftProfileRoot(id, config);
    if (existsSync(join(root, PROFILE_FILE))) return { root, familyRoot: getProfileFamilyRoot(id, config), slot, legacy: false };
  }
  const legacyRoot = getLegacyProfileRoot(id, config);
  if (existsSync(join(legacyRoot, PROFILE_FILE))) return { root: legacyRoot, familyRoot: legacyRoot, slot: "legacy", legacy: true };
  return null;
}

export function loadProfile(subjectId, config = loadReviewConfig()) {
  const found = findProfileRoot(subjectId, config, ACTIVE_SLOT);
  if (!found) return null;
  const profile = readJSON(join(found.root, PROFILE_FILE));
  return hydrateProfile(profile, config, found);
}

export function loadDraftProfile(subjectId, config = loadReviewConfig()) {
  const found = findProfileRoot(subjectId, config, DRAFT_SLOT);
  if (!found || found.slot !== DRAFT_SLOT) return null;
  const profile = readJSON(join(found.root, PROFILE_FILE));
  return hydrateProfile(profile, config, found);
}

export function hydrateProfile(profile, config = loadReviewConfig(), location = null) {
  const subjectId = cleanSubjectId(profile.subjectId || profile.id);
  const found = location || findProfileRoot(subjectId, config, profile.status === "draft" ? DRAFT_SLOT : ACTIVE_SLOT);
  const root = found?.root || getProfileDir(subjectId, config);
  const familyRoot = found?.legacy ? root : (found?.familyRoot || getProfileFamilyRoot(subjectId, config));
  const slot = found?.slot || (profile.status === "draft" ? DRAFT_SLOT : ACTIVE_SLOT);
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
    status: profile.status || (slot === DRAFT_SLOT ? "draft" : "active"),
    slot,
    legacyLayout: Boolean(found?.legacy),
    root,
    familyRoot,
    userRoot: join(familyRoot, "_user"),
    archivedRoot: found?.legacy ? join(root, ARCHIVED_SLOT) : getArchivedProfilesRoot(subjectId, config),
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

function readProfileAt(root, config, location) {
  const profilePath = join(root, PROFILE_FILE);
  if (!existsSync(profilePath)) return null;
  return hydrateProfile(readJSON(profilePath), config, location);
}

export function listProfiles(status, config = loadReviewConfig()) {
  const root = getProfilesRoot(config);
  if (!existsSync(root)) return [];
  const profiles = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const familyRoot = join(root, entry.name);
    const activeRoot = join(familyRoot, ACTIVE_SLOT);
    const draftRoot = join(familyRoot, DRAFT_SLOT);
    const legacyRoot = familyRoot;
    try {
      const active = readProfileAt(activeRoot, config, { root: activeRoot, familyRoot, slot: ACTIVE_SLOT, legacy: false });
      if (active && (!status || active.status === status)) profiles.push(active);
      const draft = readProfileAt(draftRoot, config, { root: draftRoot, familyRoot, slot: DRAFT_SLOT, legacy: false });
      if (draft && (!status || draft.status === status)) profiles.push(draft);
      const legacy = !active && !draft
        ? readProfileAt(legacyRoot, config, { root: legacyRoot, familyRoot: legacyRoot, slot: "legacy", legacy: true })
        : null;
      if (legacy && (!status || legacy.status === status)) profiles.push(legacy);
    } catch {
      continue;
    }
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

function defaultProfile(id, name, sourceDir, status) {
  const now = new Date().toISOString();
  return {
    subjectId: id,
    name: name || id,
    status,
    slot: status === "draft" ? DRAFT_SLOT : ACTIVE_SLOT,
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
}

export function createDraftProfile({ subjectId, name, sourceDir }, config = loadReviewConfig()) {
  const id = cleanSubjectId(subjectId);
  const familyRoot = getProfileFamilyRoot(id, config);
  const activeRoot = getActiveProfileRoot(id, config);
  const draftRoot = getDraftProfileRoot(id, config);
  if (existsSync(join(activeRoot, PROFILE_FILE))) {
    throw new Error(`Profile family already has an active profile: ${id}. Use /review-fix to revise it.`);
  }
  ensureDir(draftRoot);
  ensureDir(join(familyRoot, "_user"));
  for (const subdir of ["cards", "chapters", "exam_points"]) ensureDir(join(draftRoot, subdir));

  const profile = defaultProfile(id, name, sourceDir, "draft");
  writeJSON(join(draftRoot, PROFILE_FILE), profile);
  if (!existsSync(join(draftRoot, "subject.md"))) {
    writeFileSync(join(draftRoot, "subject.md"), `# ${profile.name}\n\n本资料包正在初始化，请通过 /review-init 生成基础资料后启用。\n`, "utf-8");
  }
  if (!existsSync(join(draftRoot, "knowledge_index.json"))) {
    writeJSON(join(draftRoot, "knowledge_index.json"), { subject: profile.name, chapters: {} });
  }
  if (!existsSync(join(draftRoot, "source_map.json"))) writeJSON(join(draftRoot, "source_map.json"), { files: [] });
  if (!existsSync(join(draftRoot, "quality_report.md"))) {
    writeFileSync(join(draftRoot, "quality_report.md"), "# 质量报告\n\n- 待生成。\n", "utf-8");
  }
  return hydrateProfile(profile, config, { root: draftRoot, familyRoot, slot: DRAFT_SLOT, legacy: false });
}

export function writeProfileFile(subjectId, relPath, content, config = loadReviewConfig()) {
  const profile = loadDraftProfile(subjectId, config) || loadProfile(subjectId, config);
  if (!profile) throw new Error(`Profile not found: ${subjectId}`);
  if (profile.status !== "draft" || profile.slot !== DRAFT_SLOT) {
    throw new Error(`Refusing to write non-draft profile: ${subjectId}`);
  }
  const safePath = safeRelativePath(relPath);
  const target = resolve(profile.root, safePath);
  const root = resolve(profile.root);
  if (!(target === root || target.startsWith(root + "\\") || target.startsWith(root + "/"))) {
    throw new Error(`Refusing to write outside profile: ${relPath}`);
  }
  ensureDir(dirname(target));
  writeFileSync(target, String(content ?? ""), "utf-8");

  const raw = readJSON(join(profile.root, PROFILE_FILE));
  raw.updatedAt = new Date().toISOString();
  writeJSON(join(profile.root, PROFILE_FILE), raw);
  return target;
}

function nextArchivedRoot(profile, config) {
  const archiveBase = profile.legacyLayout ? join(profile.root, ARCHIVED_SLOT) : getArchivedProfilesRoot(profile.subjectId, config);
  ensureDir(archiveBase);
  const base = timestampForPath();
  let target = join(archiveBase, base);
  let n = 2;
  while (existsSync(target)) {
    target = join(archiveBase, `${base}_v${n}`);
    n += 1;
  }
  return target;
}

export function enableProfile(subjectId, config = loadReviewConfig()) {
  const draft = loadDraftProfile(subjectId, config);
  if (draft) {
    const active = loadProfile(subjectId, config);
    const now = new Date().toISOString();
    if (active && active.slot === ACTIVE_SLOT) {
      const archivedTarget = nextArchivedRoot(active, config);
      const activeRaw = readJSON(join(active.root, PROFILE_FILE));
      activeRaw.status = "archived";
      activeRaw.slot = ARCHIVED_SLOT;
      activeRaw.archivedAt = now;
      activeRaw.supersededBy = subjectId;
      activeRaw.updatedAt = now;
      writeJSON(join(active.root, PROFILE_FILE), activeRaw);
      ensureDir(dirname(archivedTarget));
      renameSync(active.root, archivedTarget);
    }
    const activeRoot = getActiveProfileRoot(draft.subjectId, config);
    if (existsSync(activeRoot)) rmSync(activeRoot, { recursive: true, force: true });
    ensureDir(dirname(activeRoot));
    renameSync(draft.root, activeRoot);
    const raw = readJSON(join(activeRoot, PROFILE_FILE));
    raw.subjectId = draft.subjectId;
    raw.status = "active";
    raw.slot = ACTIVE_SLOT;
    raw.revisionEnabledAt = now;
    raw.updatedAt = now;
    raw.version = raw.version || timestampForPath();
    writeJSON(join(activeRoot, PROFILE_FILE), raw);
    ensureDir(join(getProfileFamilyRoot(draft.subjectId, config), "_user"));
    return hydrateProfile(raw, config, {
      root: activeRoot,
      familyRoot: getProfileFamilyRoot(draft.subjectId, config),
      slot: ACTIVE_SLOT,
      legacy: false,
    });
  }

  const legacy = loadProfile(subjectId, config);
  if (!legacy) throw new Error(`Profile not found: ${subjectId}`);
  if (legacy.status !== "draft" && legacy.status !== "active") {
    throw new Error(`Cannot enable profile with status ${legacy.status}: ${subjectId}`);
  }
  const raw = readJSON(join(legacy.root, PROFILE_FILE));
  raw.status = "active";
  raw.updatedAt = new Date().toISOString();
  writeJSON(join(legacy.root, PROFILE_FILE), raw);
  return hydrateProfile(raw, config, {
    root: legacy.root,
    familyRoot: legacy.familyRoot,
    slot: legacy.slot,
    legacy: legacy.legacyLayout,
  });
}

export function createRevisionDraft(subjectId, reason = "", config = loadReviewConfig()) {
  const source = loadProfile(subjectId, config);
  if (!source) throw new Error(`Profile not found: ${subjectId}`);
  if (source.status !== "active") throw new Error(`Can only create revision drafts from active profiles: ${subjectId}`);

  if (source.legacyLayout) {
    const rootSubjectId = getRevisionRootSubjectId(source, config);
    const familyRoot = getProfileFamilyRoot(rootSubjectId, config);
    const draftRoot = getDraftProfileRoot(rootSubjectId, config);
    if (existsSync(join(draftRoot, PROFILE_FILE))) {
      return loadDraftProfile(rootSubjectId, config);
    }
    ensureDir(familyRoot);
    copyDirRecursive(source.root, draftRoot, { exclude: ["_user", ARCHIVED_SLOT] });
    const raw = readJSON(join(draftRoot, PROFILE_FILE));
    const now = new Date().toISOString();
    raw.subjectId = rootSubjectId;
    raw.name = raw.name || source.name || rootSubjectId;
    raw.status = "draft";
    raw.slot = DRAFT_SLOT;
    raw.revisionOf = source.subjectId;
    raw.revisionRoot = rootSubjectId;
    raw.revisionCreatedAt = now;
    raw.revisionReason = String(reason || "");
    raw.updatedAt = now;
    delete raw.supersededBy;
    delete raw.supersededAt;
    delete raw.revisionEnabledAt;
    writeJSON(join(draftRoot, PROFILE_FILE), raw);
    ensureDir(join(familyRoot, "_user"));
    return hydrateProfile(raw, config, { root: draftRoot, familyRoot, slot: DRAFT_SLOT, legacy: false });
  }

  const draftRoot = getDraftProfileRoot(source.subjectId, config);
  if (existsSync(join(draftRoot, PROFILE_FILE))) {
    const draft = loadDraftProfile(source.subjectId, config);
    return draft;
  }
  copyDirRecursive(source.root, draftRoot, { exclude: ["_user"] });
  const raw = readJSON(join(draftRoot, PROFILE_FILE));
  const now = new Date().toISOString();
  raw.subjectId = source.subjectId;
  raw.name = source.name || source.subjectId;
  raw.status = "draft";
  raw.slot = DRAFT_SLOT;
  raw.revisionOf = source.subjectId;
  raw.revisionRoot = source.subjectId;
  raw.revision = Number(source.revision || 0) + 1;
  raw.revisionCreatedAt = now;
  raw.revisionReason = String(reason || "");
  raw.updatedAt = now;
  delete raw.supersededBy;
  delete raw.supersededAt;
  delete raw.revisionEnabledAt;
  writeJSON(join(draftRoot, PROFILE_FILE), raw);
  return hydrateProfile(raw, config, { root: draftRoot, familyRoot: source.familyRoot, slot: DRAFT_SLOT, legacy: false });
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
        const ext = extname(entry.name).toLowerCase();
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

/**
 * Audit a profile family (dry-run only).
 * Returns a diagnostics object without modifying anything.
 */
export function auditProfileFamily(subjectId, config = loadReviewConfig()) {
  const id = cleanSubjectId(subjectId);
  const familyRoot = getProfileFamilyRoot(id, config);
  const issues = [];
  const summary = { familyRoot, subjectId: id };

  if (!existsSync(familyRoot)) {
    return { familyRoot, subjectId: id, issues: [{ severity: "error", message: `Profile family not found: ${familyRoot}` }], summary };
  }

  // Collect family structure
  const activeRoot = join(familyRoot, ACTIVE_SLOT);
  const draftRoot = join(familyRoot, DRAFT_SLOT);
  const archivedRoot = join(familyRoot, ARCHIVED_SLOT);
  const userRoot = join(familyRoot, "_user");

  const activeProfile = existsSync(join(activeRoot, PROFILE_FILE)) ? readJSON(join(activeRoot, PROFILE_FILE)) : null;
  const draftProfile = existsSync(join(draftRoot, PROFILE_FILE)) ? readJSON(join(draftRoot, PROFILE_FILE)) : null;
  const legacyProfile = !activeProfile && !draftProfile && existsSync(join(familyRoot, PROFILE_FILE))
    ? readJSON(join(familyRoot, PROFILE_FILE)) : null;

  const archivedEntries = existsSync(archivedRoot)
    ? readdirSync(archivedRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];

  summary.active = Boolean(activeProfile);
  summary.draft = Boolean(draftProfile);
  summary.legacy = Boolean(legacyProfile);
  summary.archivedCount = archivedEntries.length;
  summary.userFiles = existsSync(userRoot) ? readdirSync(userRoot).length : 0;

  // ── Check each profile for legacy fields ──
  const profilesToCheck = [
    { label: "active", data: activeProfile, root: activeRoot },
    { label: "draft", data: draftProfile, root: draftRoot },
    { label: "legacy", data: legacyProfile, root: familyRoot },
  ];

  for (const { label, data } of profilesToCheck) {
    if (!data) continue;

    // Old revisionNumber (should be "revision")
    if (data.revisionNumber !== undefined) {
      issues.push({ severity: "warning", slot: label, field: "revisionNumber", message: `Legacy field "revisionNumber"=${data.revisionNumber} (use "revision" instead)` });
    }

    // legacySubjectId
    if (data.legacySubjectId) {
      issues.push({ severity: "warning", slot: label, field: "legacySubjectId", message: `Legacy field "legacySubjectId"="${data.legacySubjectId}"` });
    }

    // Nested __draft_ chains in subjectId
    const rawId = data.subjectId || "";
    const draftMatches = rawId.match(/__draft_\d{8}(?:__draft_\d{8})+/i);
    if (draftMatches) {
      issues.push({ severity: "warning", slot: label, field: "subjectId", message: `Nested __draft_ chain in subjectId: "${rawId}" (${draftMatches[0]})` });
    }

    // legacy slot value
    if (data.slot === "legacy") {
      issues.push({ severity: "info", slot: label, field: "slot", message: "Legacy layout profile (no active/draft slot structure)" });
    }

    // revision field wrong type
    if (data.revision !== undefined && typeof data.revision !== "number") {
      issues.push({ severity: "warning", slot: label, field: "revision", message: `"revision" has wrong type: ${typeof data.revision}` });
    }

    // supersededBy present but no supersededAt
    if (data.supersededBy && !data.supersededAt) {
      issues.push({ severity: "info", slot: label, field: "supersededBy", message: `Has "supersededBy" but no "supersededAt" timestamp` });
    }
  }

  // ── Check archived inflation ──
  if (archivedEntries.length > 3) {
    issues.push({ severity: "warning", slot: "archived", field: "count", message: `Archived inflated: ${archivedEntries.length} entries (consider pruning old versions)` });
  }

  // Check for nested __draft_ chains in archived dir names
  for (const entry of archivedEntries) {
    if (entry.match(/__draft_\d{8}(?:__draft_\d{8})+/i)) {
      issues.push({ severity: "warning", slot: "archived", field: "entry", message: `Archived directory has nested __draft_ chain: "${entry}"` });
    }
  }

  // ── Check orphan directories at family root ──
  const reserved = new Set([ACTIVE_SLOT, DRAFT_SLOT, ARCHIVED_SLOT, "_user"]);
  if (existsSync(familyRoot)) {
    for (const entry of readdirSync(familyRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || reserved.has(entry.name) || entry.name.startsWith("_")) continue;
      // Check if it looks like a stray card/chapter/exam_points dir
      if (entry.name.startsWith("cards") || entry.name.startsWith("chapters") || entry.name.startsWith("exam_points")) {
        issues.push({ severity: "info", slot: "family-root", field: "stray-dir", message: `Orphan directory at family root: "${entry.name}" (not inside active/draft slot)` });
      } else if (!["profile.json", "subject.md", "knowledge_index.json", "source_map.json", "quality_report.md"].includes(entry.name)) {
        issues.push({ severity: "info", slot: "family-root", field: "stray-dir", message: `Unexpected directory at family root: "${entry.name}"` });
      }
    }
  }

  // ── Extra files directly at family root that are not profile files ──
  if (existsSync(familyRoot)) {
    for (const entry of readdirSync(familyRoot, { withFileTypes: true })) {
      if (entry.isFile() && !reserved.has(entry.name) && !entry.name.startsWith(".") &&
          !["profile.json", "subject.md", "knowledge_index.json", "source_map.json", "quality_report.md"].includes(entry.name)) {
        issues.push({ severity: "info", slot: "family-root", field: "stray-file", message: `Unexpected file at family root: "${entry.name}"` });
      }
    }
  }

  // ── Orphan _nt directories inside active slot ──
  if (activeProfile) {
    for (const suffix of ["_nt", "_old", "_bak", "_legacy"]) {
      for (const base of ["cards", "chapters", "exam_points"]) {
        const dir = join(activeRoot, base + suffix);
        if (existsSync(dir)) {
          const count = readdirSync(dir).length;
          issues.push({ severity: "info", slot: "active", field: "stray-subdir", message: `Stray "${base}${suffix}/" in active slot (${count} files) — not referenced by profile paths` });
        }
      }
    }
  }

  // Sort issues by severity
  const severityOrder = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9));
  summary.issueCount = issues.length;
  summary.warningCount = issues.filter((i) => i.severity === "warning").length;
  summary.infoCount = issues.filter((i) => i.severity === "info").length;

  return { issues, summary };
}

/**
 * Plan a dry-run prune for a profile family.
 * Reports what would be kept vs cleaned, without making changes.
 */
export function planPruneFamily(subjectId, config = loadReviewConfig()) {
  const id = cleanSubjectId(subjectId);
  const audit = auditProfileFamily(subjectId, config);
  const familyRoot = getProfileFamilyRoot(id, config);
  const prunePlan = { subjectId: id, familyRoot, keep: [], clean: [], reasons: [] };

  // Keep active always
  const activeRoot = getActiveProfileRoot(id, config);
  if (existsSync(join(activeRoot, PROFILE_FILE))) {
    prunePlan.keep.push({ path: activeRoot, reason: "Current active profile" });
  }

  // Keep current draft
  const draftRoot = getDraftProfileRoot(id, config);
  if (existsSync(join(draftRoot, PROFILE_FILE))) {
    prunePlan.keep.push({ path: draftRoot, reason: "Current draft profile (in progress)" });
  }

  // Archived: keep latest 3, flag older for pruning
  const archivedRoot = getArchivedProfilesRoot(id, config);
  if (existsSync(archivedRoot)) {
    const archivedDirs = readdirSync(archivedRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({ name: d.name, path: join(archivedRoot, d.name) }))
      .sort((a, b) => a.name.localeCompare(b.name)); // chronological sort

    // Keep latest 3, suggest cleaning older ones
    const toKeep = archivedDirs.slice(-3);
    const toClean = archivedDirs.slice(0, -3);
    for (const entry of toKeep) {
      prunePlan.keep.push({ path: entry.path, reason: `Archived version (${entry.name}) — latest 3 kept` });
    }
    for (const entry of toClean) {
      prunePlan.clean.push({ path: entry.path, reason: `Old archived version (${entry.name}) — eligible for cleanup` });
    }

    // Flag archived dirs with nested __draft_ chains
    for (const entry of archivedDirs) {
      if (entry.name.match(/__draft_\d{8}(?:__draft_\d{8})+/i)) {
        prunePlan.reasons.push({ path: entry.path, reason: `Nested __draft_ chain in directory name: "${entry.name}" — consider pruning` });
      }
    }
  }

  // Stray family-root directories (old legacy artifacts)
  const reserved = new Set([ACTIVE_SLOT, DRAFT_SLOT, ARCHIVED_SLOT, "_user"]);
  if (existsSync(familyRoot)) {
    for (const entry of readdirSync(familyRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || reserved.has(entry.name) || entry.name.startsWith("_")) continue;
      const fullPath = join(familyRoot, entry.name);
      if (entry.name.startsWith("cards") || entry.name.startsWith("chapters") || entry.name.startsWith("exam_points")) {
        prunePlan.clean.push({ path: fullPath, reason: `Stray "${entry.name}" at family root — likely old artifact` });
      }
    }
  }

  // Stray _nt / _old dirs inside active slot
  const activeRootPath = getActiveProfileRoot(id, config);
  if (existsSync(activeRootPath)) {
    for (const suffix of ["_nt", "_old", "_bak", "_legacy"]) {
      for (const base of ["cards", "chapters", "exam_points"]) {
        const dir = join(activeRootPath, base + suffix);
        if (existsSync(dir)) {
          prunePlan.clean.push({ path: dir, reason: `Stray "${base}${suffix}/" inside active slot — not referenced by profile` });
        }
      }
    }
  }

  // Legacy loose files at family root (profile.json, subject.md etc outside slots)
  if (existsSync(familyRoot)) {
    const legacyRootFile = join(familyRoot, PROFILE_FILE);
    if (existsSync(legacyRootFile) && !existsSync(join(activeRoot, PROFILE_FILE)) && !existsSync(join(draftRoot, PROFILE_FILE))) {
      prunePlan.keep.push({ path: legacyRootFile, reason: "Legacy profile at family root (only profile file)" });
    } else if (existsSync(legacyRootFile)) {
      // If slotted profiles exist too, the root profile.json is likely a leftover
      prunePlan.clean.push({ path: legacyRootFile, reason: "Legacy profile.json at family root (slotted profiles exist)" });
    }
  }

  prunePlan.summary = {
    keep: prunePlan.keep.length,
    clean: prunePlan.clean.length,
    reasons: prunePlan.reasons.length,
  };

  return { audit, prunePlan };
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
